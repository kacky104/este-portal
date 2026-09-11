import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import {
  shouldAutoPost,
  announceFingerprint,
  autoPostTimeLabel,
} from '@/lib/announceAuto';

// ── 求人の新着情報（work_news）の自動配信の周（第274便・2026-09-11・カッキーさんの指示）──
//   POST /api/admin/work-news-auto  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean }
//
// ★★★ フクエス側のお知らせの周（announce-auto）と【同じ作り】。
//   ★ 判定は src/lib/announceAuto.ts の shouldAutoPost をそのまま使う（2つの判定を持たない）。
//   ★ ここは【DBを読んで渡し、結果のとおりに書く】だけ。判断をこのファイルに書かない。
//
// ★★ この周が見るのは【「自動で回す」に印の付いた新着情報がある店】だけ。
//   印は既定 false なので、誰も付けていないあいだは対象0件。
//   ★ crontab に足しても、店舗が印を付けるまで何も起きない。
//
// ★★ apply 既定 false（試し打ち）。何件やるつもりかだけ返す。★ 最初は apply なしで数を見ること。
//
// ★★★ 出すとは「求人ページの新着で上へ出す」こと ＝ published_at を進めること。
//   ★ 出す先は /jobs/<求人ID> の新着情報タブ。★ 店舗が非表示／求人が非公開なら出さない
//     （出しても誰にも見えないのに、順番だけ進むのは戻せない損）。
//
// ★ 1日1回・店舗ごとに時刻がばらけているので、周は細かくてよい。
//   crontab（VPS・10分ごと）:
//   */10 * * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/work-news-auto -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Target = { id: string; title: string | null; content: string | null };

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body なしでも動く */ }
  const apply = body.apply === true;

  const svc = createServiceClient();
  const now = new Date();

  // ★ 「自動で回す」印の付いた、公開中の新着情報を持つ店だけを見る。★ 非表示の店は外す。
  const { data: rows, error } = await svc
    .from('work_news')
    .select('salon_id, salons!inner(id, is_hidden)')
    .eq('auto_rotate', true)
    .eq('is_published', true)
    .eq('salons.is_hidden', false);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const candidateIds = Array.from(new Set((rows ?? []).map((r) => Number(r.salon_id)))).sort((a, b) => a - b);

  // ★★ 求人が【公開中】の店だけに絞る。★ 新着情報の出し先は求人ページなので、
  //   求人が非公開／未作成の店に出しても誰にも見えない（順番だけ進む＝戻せない損）。
  const publishedSalonIds = new Set<number>();
  if (candidateIds.length > 0) {
    const { data: jobs, error: jobErr } = await svc
      .from('salon_jobs')
      .select('salon_id')
      .in('salon_id', candidateIds)
      .eq('is_active', true);
    // ★★ 読めなかったときは【何もしない】。0件と混ぜない。
    if (jobErr) return NextResponse.json({ ok: false, error: jobErr.message }, { status: 500 });
    for (const j of jobs ?? []) publishedSalonIds.add(Number(j.salon_id));
  }
  const salonIds = candidateIds.filter((id) => publishedSalonIds.has(id));

  const posted: string[] = [];
  const skipped: Array<{ salonId: number; why: string }> = [];
  const failed: Array<{ salonId: number; why: string }> = [];

  // ★ 求人が非公開だった店は、黙って消さずに理由として数える（画面から見て分かるように）。
  for (const id of candidateIds) {
    if (!publishedSalonIds.has(id)) skipped.push({ salonId: id, why: '求人が非公開（または未作成）' });
  }

  for (const salonId of salonIds) {
    // ★ まず本数だけ数える（行は取らない）。★ 上限は無い
    const { count, error: cntErr } = await svc
      .from('work_news')
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('auto_rotate', true)
      .eq('is_published', true);
    // ★★ 数えられなかったときは【何もしない】。0件と混ぜない
    if (cntErr) { failed.push({ salonId, why: cntErr.message.slice(0, 200) }); continue; }
    const targetCount = count ?? 0;

    const { data: state, error: stErr } = await svc
      .from('salon_work_news_state')
      .select('last_auto_day, rotation_index, last_manual_at')
      .eq('salon_id', salonId)
      .maybeSingle();
    // ★★ 状態が読めなかったときは【何もしない】。読めていないのを「無い」と混ぜない
    if (stErr) { failed.push({ salonId, why: stErr.message.slice(0, 200) }); continue; }

    const judged = shouldAutoPost({
      now,
      salonId,
      autoTargetCount: targetCount,
      lastAutoDay: (state?.last_auto_day as string | null) ?? null,
      lastManualAt: (state?.last_manual_at as string | null) ?? null,
      rotationIndex: (state?.rotation_index as number | null) ?? null,
    });

    if (!judged.post) { skipped.push({ salonId, why: judged.reason }); continue; }
    if (!apply) { posted.push(`${salonId}#${judged.index}`); continue; }

    // ★★ 順番の位置の1本だけを取り出す（全件は読まない）。
    //   ★ 並びは created_at 昇順 → id 昇順で固定する。ここがぶれると順番が飛ぶ。
    const { data: picked, error: pickErr } = await svc
      .from('work_news')
      .select('id, title, content')
      .eq('salon_id', salonId)
      .eq('auto_rotate', true)
      .eq('is_published', true)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(judged.index, judged.index);
    if (pickErr) { failed.push({ salonId, why: pickErr.message.slice(0, 200) }); continue; }
    const pick = ((picked ?? []) as Target[])[0];
    // ★ 数えた直後に店舗が消した／非公開にした、が起こりうる。そのときは黙って飛ばさず数える
    if (!pick) { failed.push({ salonId, why: '順番の位置の新着情報が見つかりません（数えた直後に変わった可能性）' }); continue; }

    // ★ 出す＝求人ページの新着で上へ出す（published_at を進める）
    const { error: upErr } = await svc
      .from('work_news')
      .update({ published_at: now.toISOString() })
      .eq('id', pick.id)
      .eq('salon_id', salonId);
    if (upErr) { failed.push({ salonId, why: upErr.message.slice(0, 200) }); continue; }

    // ★★ 出したあとに順番を進める。★ 出せていないのに進めない（出す前に進めると1本飛ぶ）
    const { error: stateErr } = await svc
      .from('salon_work_news_state')
      .upsert({
        salon_id: salonId,
        last_auto_day: judged.dayKey,
        rotation_index: judged.index,
        last_bump_at: now.toISOString(),
        last_bump_fingerprint: announceFingerprint(pick.title, pick.content),
        updated_at: now.toISOString(),
      }, { onConflict: 'salon_id' });
    // ★★★ ここで失敗したら、次の周でもう一度出てしまう（1日1回が破れる）。★ 黙らない
    if (stateErr) { failed.push({ salonId, why: '出しましたが記録に失敗: ' + stateErr.message.slice(0, 150) }); continue; }

    posted.push(`${salonId}#${judged.index}`);
  }

  // ★ 出したときだけ、見えている場所を作り直す。
  //   ★ 実URLの revalidatePath は効かない。雛形指定にすること
  if (apply && posted.length > 0) {
    revalidatePath('/jobs/[id]', 'page');
    revalidatePath('/jobs/[id]/news/[page]', 'page');
  }

  return NextResponse.json({
    ok: true,
    apply,
    salons: salonIds.length,
    posted: posted.length,
    failed: failed.length,
    detail: {
      posted, failed, skipped,
      // ★ 参考：この周が見た店の自動時刻（保存していないので、ここで計算して見せる）
      times: salonIds.map((id) => ({ salonId: id, at: autoPostTimeLabel(id) })),
    },
  });
}
