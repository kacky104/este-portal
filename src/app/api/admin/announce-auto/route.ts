import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import {
  shouldAutoPost,
  announceFingerprint,
  autoPostTimeLabel,
} from '@/lib/announceAuto';

// ── お知らせの自動配信の周（第69便・設計メモ 追記37 §192）────────────────
//   POST /api/admin/announce-auto  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean }
//
// ★★★ この周が見るのは【「自動で回す」に印の付いたお知らせがある店】だけ。
//   印は既定 false なので、誰も付けていないあいだは対象0件。
//   ★ crontab に足しても、店舗が印を付けるまで何も起きない。
//
// ★★ apply 既定 false（試し打ち）。何件やるつもりかだけ返す。
//   media-auto-push・relay-purge・取り込みと同じ作法。★ 最初は apply なしで数を見ること。
//
// ★★★ 出すとは「フクエスの新着で上へ出す」こと ＝ published_at を進めること。
//   ★ 駅ちか /admin/articles/ への書き込みは、まだこの周ではしない（§195 の5）。
//     やっていないことを、やったように数えない。
//
// ★ 判定は src/lib/announceAuto.ts の shouldAutoPost（純粋関数・自己点検あり）。
//   ここは【DBを読んで渡し、結果のとおりに書く】だけ。判断をこのファイルに書かない。
//
// ★ 1日1回・店舗ごとに時刻がばらけているので、周は細かくてよい（30分ごとでは粗すぎる）。
//   crontab（VPS・10分ごと）:
//   */10 * * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/announce-auto -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ★★★ 本数の上限は【無い】（第70便・カッキーさんの確認から）。
//   第69便は古い順に先頭200本だけ読んで、その中から1本を選んでいた。
//   ★ 201本目以降に印を付けても、画面は何も言わないのに回ってこない——**無言で消える形**だった。
//   → 全件を読むのをやめ、【件数を数えて、順番の位置の1本だけを取り出す】形に変えた。
//     読む行は常に1行。上限を持つ理由そのものが消えた（＋ むしろ軽くなった）。
//   ★ 上限で押させない代わりに、画面に周期を出す（rotationCycleMessage）。
//     「10本付けると10日に1回」と数字で言えば、店舗が自分で減らす判断ができる。

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

  // ★ 「自動で回す」印の付いた、公開中のお知らせを持つ店だけを見る。
  //   ★ 非表示の店は外す。出しても表に現れないのに順番だけ進むのは、戻せない損
  const { data: rows, error } = await svc
    .from('announcements')
    .select('salon_id, salons!inner(id, is_hidden)')
    .eq('auto_rotate', true)
    .eq('is_published', true)
    .eq('salons.is_hidden', false);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const salonIds = Array.from(new Set((rows ?? []).map((r) => Number(r.salon_id)))).sort((a, b) => a - b);

  const posted: string[] = [];
  const skipped: Array<{ salonId: number; why: string }> = [];
  const failed: Array<{ salonId: number; why: string }> = [];

  for (const salonId of salonIds) {
    // ★ まず本数だけ数える（行は取らない）。★ 上限は無い
    const { count, error: cntErr } = await svc
      .from('announcements')
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('auto_rotate', true)
      .eq('is_published', true);
    // ★★ 数えられなかったときは【何もしない】。0件と混ぜない（作法3-5）
    if (cntErr) { failed.push({ salonId, why: cntErr.message.slice(0, 200) }); continue; }
    const targetCount = count ?? 0;

    const { data: state, error: stErr } = await svc
      .from('salon_announce_state')
      .select('last_auto_day, rotation_index, last_manual_at')
      .eq('salon_id', salonId)
      .maybeSingle();
    // ★★ 状態が読めなかったときは【何もしない】。0件でも「まだ無い」でもなく、読めていない。
    //   ここで null として進めると、その日の手動を見落として1日2回になる
    if (stErr) { failed.push({ salonId, why: stErr.message.slice(0, 200) }); continue; }

    const judged = shouldAutoPost({
      now,
      salonId,
      // ★ 数えられた件数を渡す。数えられていない場合はここへ来ていない（上で continue）
      autoTargetCount: targetCount,
      lastAutoDay: (state?.last_auto_day as string | null) ?? null,
      lastManualAt: (state?.last_manual_at as string | null) ?? null,
      rotationIndex: (state?.rotation_index as number | null) ?? null,
    });

    if (!judged.post) { skipped.push({ salonId, why: judged.reason }); continue; }
    if (!apply) { posted.push(`${salonId}#${judged.index}`); continue; }

    // ★★ 順番の位置の1本だけを取り出す（全件は読まない）。
    //   ★ 並びは created_at 昇順 → id 昇順で固定する。ここがぶれると順番が飛ぶ。
    //   ★ judged.index は nextRotationIndex で本数の範囲に収まっている
    const { data: picked, error: pickErr } = await svc
      .from('announcements')
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
    if (!pick) { failed.push({ salonId, why: '順番の位置のお知らせが見つかりません（数えた直後に変わった可能性）' }); continue; }

    // ★ 出す＝新着で上へ出す（published_at を進める）。トリガは service role を通す
    const { error: upErr } = await svc
      .from('announcements')
      .update({ published_at: now.toISOString() })
      .eq('id', pick.id)
      .eq('salon_id', salonId);
    if (upErr) { failed.push({ salonId, why: upErr.message.slice(0, 200) }); continue; }

    // ★★ 出したあとに順番を進める。★ 出せていないのに進めない（出す前に進めると1本飛ぶ）
    // ★ フクエスTOPの並びを動かしたので、守り3の起点も更新する。
    //   これをしないと、自動の直後に同じ本文を手で押し直したときに30分が効かない
    const { error: stateErr } = await svc
      .from('salon_announce_state')
      .upsert({
        salon_id: salonId,
        last_auto_day: judged.dayKey,
        rotation_index: judged.index,
        last_bump_at: now.toISOString(),
        last_bump_fingerprint: announceFingerprint(pick.title, pick.content),
        updated_at: now.toISOString(),
      }, { onConflict: 'salon_id' });
    // ★★★ ここで失敗したら、次の周でもう一度出てしまう（1日1回が破れる）。
    //   ★ 黙らない。失敗として数える
    if (stateErr) { failed.push({ salonId, why: '出しましたが記録に失敗: ' + stateErr.message.slice(0, 150) }); continue; }

    posted.push(`${salonId}#${judged.index}`);
  }

  // ★ 出したときだけ、見えている場所を作り直す。
  //   ★ 実URLの revalidatePath は効かない（第25便）。雛形指定にすること
  if (apply && posted.length > 0) {
    revalidatePath('/');
    revalidatePath('/news');
    revalidatePath('/salon/[id]', 'layout');
    revalidatePath('/hp/[slug]', 'layout');
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
