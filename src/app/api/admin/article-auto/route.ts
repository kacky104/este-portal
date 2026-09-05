import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { postOneArticle } from '@/app/lib/media/articlePost';
import { shouldPostArticle, ARTICLE_POSTS_PER_DAY_DEFAULT } from '@/lib/articleRotation';
import { dayKeyJST } from '@/lib/announceAuto';

// ── 新着情報を自動で出す周（第166便・2026-09-05）────────────────────────────
//   POST /api/admin/article-auto        (Authorization: Bearer <CRON_SECRET>)
//     apply=1 … 実際に出す ／ 付けなければ【数えるだけ】（★ 第43便の作法）
//
// ★★★ この周がすること: 出すと決めた店舗について、中継ジョブを1件積むだけ。
//   ★ 実際に駅ちかへ投げるのは VPS の周。
//
// ★★★ 元栓は3つ。★ どれか1つでも閉じていれば何も起きない。
//   ① salon_article_settings.auto_enabled = true   （店舗様が入れる。★ 既定 false）
//   ② posts_per_day > 0                            （★ 「出さない」なら出さない）
//   ③ 「自動で回す」に印の付いたテンプレートが1本以上
//
// ★★ 判断そのものは src/lib/articleRotation.ts（純粋関数）が持つ。★ ここはDBと配線だけ。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROVIDER = 'ekichika';

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const url = new URL(req.url);
  const apply = url.searchParams.get('apply') === '1';
  const now = new Date();
  const svc = createServiceClient();

  // ★ 元栓①が入っている枠だけ
  const { data: settings, error: sErr } = await svc
    .from('salon_article_settings')
    .select('salon_id, slot, posts_per_day, rotation_index, last_try_day, last_try_count, salons!inner(id, is_hidden)')
    .eq('provider', PROVIDER)
    .eq('auto_enabled', true)
    .eq('salons.is_hidden', false);
  if (sErr) return NextResponse.json({ ok: false, error: sErr.message }, { status: 500 });

  const posted: string[] = [];
  const skipped: Array<{ salonId: number; why: string }> = [];
  const failed: Array<{ salonId: number; why: string }> = [];

  for (const row of settings ?? []) {
    const salonId = Number(row.salon_id);
    const slot = Number(row.slot ?? 1);

    // ★ 元栓③: 「自動で回す」に印の付いた本数。★ 行は取らない（数えるだけ）
    const { count, error: cErr } = await svc
      .from('salon_article_templates')
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', slot)
      .eq('is_active', true);
    // ★★ 数えられなかったときは【何もしない】。★ 0件と混ぜない（作法3-5）
    if (cErr) { failed.push({ salonId, why: '本数を数えられなかった: ' + cErr.message.slice(0, 120) }); continue; }

    const judged = shouldPostArticle({
      now,
      salonId,
      timesPerDay: Number(row.posts_per_day ?? ARTICLE_POSTS_PER_DAY_DEFAULT),
      targetCount: count ?? null,
      // ★★★ 「出そうとした回数」で判定する（★ 送れた本数ではない・第166便）。
      //   ★ ここを送れた本数にすると、送れなかった日に延々と撃ち続ける。
      postedToday: todayTry(row, now),
      rotationIndex: row.rotation_index === null || row.rotation_index === undefined
        ? null : Number(row.rotation_index),
    });

    if (!judged.post) { skipped.push({ salonId, why: judged.reason }); continue; }
    if (!apply) { posted.push(`${salonId}#${judged.index}(${judged.nth}本目)`); continue; }

    // ★★ 順番の位置の1本だけを取り出す（★ 全件は読まない）。
    //   ★ 並びは sort_order 昇順 → id 昇順で固定。★ ここがぶれると順番が飛ぶ
    const { data: picked, error: pErr } = await svc
      .from('salon_article_templates')
      .select('id')
      .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', slot)
      .eq('is_active', true)
      .order('sort_order', { ascending: true })
      .order('id', { ascending: true })
      .range(judged.index, judged.index);
    if (pErr) { failed.push({ salonId, why: pErr.message.slice(0, 120) }); continue; }
    const pick = (picked ?? [])[0];
    // ★ 数えた直後に店舗様が消した／印を外した、が起こりうる。★ 黙って飛ばさず数える
    if (!pick) { failed.push({ salonId, why: '順番の位置の文章が見つかりません（数えた直後に変わった可能性）' }); continue; }

    const r = await postOneArticle({
      salonId, slot, templateId: Number(pick.id),
      intent: 'article_auto',
      actor: 'system',
    });
    if (!r.ok) { failed.push({ salonId, why: r.error.slice(0, 160) }); continue; }

    // ★★ 位置は【積めたら進める】。★ 送れなくても次の文章へ進む。
    //   ★ 同じ文章を延々と再試行しない（★ 1日の回数で止まる仕掛けは try 側が持っている）
    const next = (judged.index + 1) % Math.max(1, count ?? 1);
    const { error: uErr } = await svc
      .from('salon_article_settings')
      .update({ rotation_index: next, updated_at: new Date().toISOString() })
      .eq('salon_id', salonId).eq('provider', PROVIDER).eq('slot', slot);
    if (uErr) console.error('[article-auto] 位置を進められなかった', salonId, uErr.message);

    posted.push(`${salonId}#${judged.index}(${judged.nth}本目)`);
  }

  return NextResponse.json({
    ok: true,
    apply,
    at: now.toISOString(),
    targets: (settings ?? []).length,
    posted,
    skipped,
    failed,
  });
}

/**
 * 今日（営業日）の試行回数。★ 区切りが変わっていれば0から数え直す。
 * ★★ 区切りの物差しは `dayKeyJST`（朝6時）1本。★ ここで別の計算を書かない
 */
function todayTry(row: { last_try_day?: string | null; last_try_count?: number | null }, now: Date): number {
  const key = dayKeyJST(now);
  if (key === null) return 0;   // ★ 区切りが出せないなら0（★ 出さない側へ倒す）
  return String(row.last_try_day ?? '') === key ? Math.max(0, Number(row.last_try_count ?? 0)) : 0;
}
