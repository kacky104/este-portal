import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { HP_DEMO_SLUG } from '@/app/lib/hpSite';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import {
  buildDemoScheduleRows,
  shouldReseedDemoSchedule,
  DEMO_SCHEDULE_DAYS,
  DEMO_SCHEDULE_MIN_REMAIN_DAYS,
} from '@/lib/hpDemoSchedule';

// ── サンプル店舗（デモ）の出勤を切らさない周（第295便・2026-09-12・カッキーさんの指示）──
//   POST /api/admin/hp-demo-schedule  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean }
//
// ★★★ やること: デモ店の出勤の【最終日】を見て、今日から7日を切っていたら14日分を作り直す。
//   ★ 足りていれば何もしない。★ 毎日叩いても、実際に書くのは7日に1回だけ。
//   ★ 書き方は upsert（therapist_id + schedule_date）＝上書き。★ 行は増えない。
//
// ★★ 判定と行の組み立ては src/lib/hpDemoSchedule.ts（純粋関数）。
//   ★ 運営が /admin で押す「出勤を14日分作り直す」と【同じもの】を使う。2つの作り方を持たない。
//
// ★★ apply 既定 false（試し打ち）。★ 何をするつもりかだけ返す。
//   ★ 最初は apply なしで、remainDays と reseed を見ること。
//
// ★ crontab（VPS・1日1回・朝6:10 JST = 21:10 UTC）:
//   10 21 * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/hp-demo-schedule -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body なしでも動く */ }
  const apply = body.apply === true;

  const svc = createServiceClient();
  const today = getBusinessDateJST();

  // 1) デモ店を探す。★ 無ければ【何もしない】で ok を返す（★ エラーではない・まだ作っていないだけ）。
  const { data: siteRow, error: siteErr } = await svc
    .from('salon_sites')
    .select('salon_id')
    .eq('slug', HP_DEMO_SLUG)
    .maybeSingle();
  if (siteErr) return NextResponse.json({ ok: false, error: siteErr.message }, { status: 500 });
  if (!siteRow) return NextResponse.json({ ok: true, apply, today, note: 'サンプル店舗がまだありません', reseed: false });
  const salonId = Number(siteRow.salon_id);

  // 2) セラピスト。★ 0人なら出勤の作りようが無い（★ 黙って0件にしない・理由を返す）。
  const { data: thRows, error: thErr } = await svc
    .from('therapists')
    .select('id')
    .eq('salon_id', salonId);
  if (thErr) return NextResponse.json({ ok: false, error: thErr.message }, { status: 500 });
  const ids = (thRows ?? []).map((r) => String(r.id));
  if (ids.length === 0) {
    return NextResponse.json({ ok: true, apply, today, salonId, note: 'サンプル店舗にセラピストがいません', reseed: false });
  }

  // 3) いま入っている出勤の最終日。★ 1行だけ読む（降順の先頭）。
  const { data: lastRows, error: lastErr } = await svc
    .from('therapist_schedules')
    .select('schedule_date')
    .in('therapist_id', ids)
    .order('schedule_date', { ascending: false })
    .limit(1);
  // ★★ 読めなかったときは【何もしない】。★ 0件（=まだ無い）と混ぜない。
  if (lastErr) return NextResponse.json({ ok: false, error: lastErr.message }, { status: 500 });
  const lastDate = lastRows && lastRows.length > 0 ? String(lastRows[0].schedule_date) : null;

  const judged = shouldReseedDemoSchedule(today, lastDate);

  const base = {
    ok: true as const,
    apply,
    today,
    salonId,
    therapists: ids.length,
    lastDate,
    remainDays: judged.remainDays,
    minRemainDays: DEMO_SCHEDULE_MIN_REMAIN_DAYS,
    reseed: judged.reseed,
    reason: judged.reason,
  };

  if (!judged.reseed) return NextResponse.json({ ...base, wrote: 0 });

  const rows = buildDemoScheduleRows(ids, today, DEMO_SCHEDULE_DAYS);
  if (rows.length === 0) {
    return NextResponse.json({ ...base, wrote: 0, error: '出勤の行を組み立てられませんでした' }, { status: 500 });
  }
  if (!apply) return NextResponse.json({ ...base, wrote: 0, wouldWrite: rows.length });

  const { error: upErr } = await svc
    .from('therapist_schedules')
    .upsert(rows, { onConflict: 'therapist_id,schedule_date' });
  if (upErr) return NextResponse.json({ ...base, wrote: 0, error: upErr.message }, { status: 500 });

  return NextResponse.json({ ...base, wrote: rows.length, newLastDate: rows[rows.length - 1].schedule_date });
}
