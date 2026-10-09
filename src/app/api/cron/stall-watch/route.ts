import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { collectStallOverview } from '@/app/lib/media/stallOverview';
import { planStallAlerts, STALL_DIGEST_META_KEY, type StallKnownRow } from '@/lib/stallDigest';

// ── 連携の止まりを、運営にメールで知らせる（第1341便・2026-10-09）──────────────────
//   GET /api/cron/stall-watch  (Authorization: Bearer <CRON_SECRET>)
//
// ★ Vercel の定期実行（vercel.json の crons・30分ごと）から動く。VPS の crontab には入れない
//   （VPS が止まっていても、「取り込みが止まった」は拾えるように）。
// ★ 何を止まりと呼ぶか・いつ知らせるかは lib/stallDigest.ts（planStallAlerts）。集め方は app/lib/media/stallOverview.ts。
// ★ ?dry=1 を付けると、決めた中身を返すだけ（メールを出さない・DB に書かない）。
// ★ 表が無い（追加SQL_第1341便がまだ）ときは、何も知らせない。
// ★ 覚えている行が読めないときは 500 を返すだけ（読めないまま進むと、全部を「新しい」と数えて、毎回メールが出る）。
//
// ★ 順番: メールを出してから、表に書く。
//   書けなかったときは、次の回でもう一度メールが出る（知らせが漏れるより、重なるほうを選ぶ）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const svc = createServiceClient();

  const { data, error } = await svc.from('ops_stall_alerts').select('key, first_seen_at, seen_count, alerted_at');
  if (error) {
    if (error.code === '42P01' || error.code === 'PGRST205') {
      return NextResponse.json({ ok: true, note: '表 ops_stall_alerts が無い（追加SQL_第1341便がまだ）。何も知らせていない' });
    }
    console.error('[stall-watch] 覚えている行を読めなかった', error.message);
    return NextResponse.json({ ok: false, error: '覚えている行を読めなかった: ' + error.message }, { status: 500 });
  }
  const all = (data ?? []) as Array<{ key: string; first_seen_at: string; seen_count: number | null; alerted_at: string | null }>;
  const meta = all.find((r) => r.key === STALL_DIGEST_META_KEY) ?? null;
  const known: StallKnownRow[] = all
    .filter((r) => r.key !== STALL_DIGEST_META_KEY)
    .map((r) => ({ key: String(r.key), firstSeenAt: String(r.first_seen_at), seenCount: Number(r.seen_count ?? 0), alertedAt: r.alerted_at ?? null }));

  const now = new Date();
  const nowIso = now.toISOString();
  let overview;
  try {
    overview = await collectStallOverview(svc, now);
  } catch (e) {
    return NextResponse.json({ ok: false, error: '集めている途中で落ちた: ' + (e instanceof Error ? e.message : '理由不明') }, { status: 500 });
  }

  const plan = planStallAlerts({ overview, known, lastDigestAt: meta?.alerted_at ?? null, nowIso });
  const summary = {
    note: plan.note,
    mails: plan.mails.map((m) => m.kind),
    items: overview.items.length,
    errors: overview.errors.length,
  };
  if (dry) {
    return NextResponse.json({ ok: true, dry: true, ...summary, upserts: plan.upserts.length, deleteKeys: plan.deleteKeys, digestAt: plan.digestAt });
  }

  for (const m of plan.mails) await notifyAdmin(m.subject, m.lines);

  const writeErrors: string[] = [];
  if (plan.upserts.length > 0) {
    const { error: upErr } = await svc.from('ops_stall_alerts').upsert(plan.upserts, { onConflict: 'key' });
    if (upErr) writeErrors.push('止まっているものを書けなかった: ' + upErr.message);
  }
  if (plan.deleteKeys.length > 0) {
    const { error: delErr } = await svc.from('ops_stall_alerts').delete().in('key', plan.deleteKeys);
    if (delErr) writeErrors.push('直ったものを消せなかった: ' + delErr.message);
  }
  if (plan.digestAt) {
    const { error: mErr } = await svc.from('ops_stall_alerts').upsert(
      { key: STALL_DIGEST_META_KEY, watch: 'meta', last_seen_at: plan.digestAt, seen_count: 0, alerted_at: plan.digestAt },
      { onConflict: 'key' },
    );
    if (mErr) writeErrors.push('毎朝のまとめの印を書けなかった: ' + mErr.message);
  }
  if (writeErrors.length > 0) console.error('[stall-watch] 書けなかった（次の回でもう一度メールが出ることがある）', writeErrors.join(' / '));

  return NextResponse.json({ ok: writeErrors.length === 0, ...summary, ...(writeErrors.length > 0 ? { error: writeErrors.join(' / ') } : {}) });
}
