import { NextResponse } from 'next/server';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';
import { gscQuery, jstDateMinus } from '@/lib/gsc';
import { periods, diffRows, buildReport } from '@/lib/gscWeekly';

// ── サーチコンソールの週次レポート（第1532便・2026-10-17・カッキーさん）──────────────────
//   GET /api/cron/gsc-weekly  (Authorization: Bearer <CRON_SECRET>)
//
// ★ Vercel の定期実行（vercel.json・毎週月曜 00:00 UTC ＝ 09:00 日本時間）から動く。
// ★ 直近 7 日（今日−3 日まで）と、その前の 7 日を比べて、運営（カッキーさん）に 1 通メール。
// ★ DB には何も書かない・読まない。Google の API（無料・読むだけ）とメールだけ。
// ★ ?dry=1 で、メールを送らずに JSON で返す（動作確認用）。
//   ★ 第1533便: dry=1 のときだけ、運営（ADMIN_UUID）でログインしたブラウザからも開ける（CRON_SECRET を手元に出さずに確認するため）。
//     メールを実際に送る本番実行は今までどおり CRON_SECRET だけ。
// ★ 鍵（GSC_SERVICE_ACCOUNT_JSON）が無いときは何もしない（エラーにせず note を返す）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const dry = new URL(req.url).searchParams.get('dry') === '1';
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  const byCron = req.headers.get('authorization') === `Bearer ${secret}`;
  let byAdmin = false;
  if (!byCron && dry) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    byAdmin = user?.id === ADMIN_UUID;
  }
  if (!byCron && !byAdmin)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  if (!process.env.GSC_SERVICE_ACCOUNT_JSON) {
    return NextResponse.json({ ok: true, note: 'GSC_SERVICE_ACCOUNT_JSON が未設定。何もしていない' });
  }

  const { cur, prev } = periods(jstDateMinus(3));

  try {
    const [qCur, qPrev, pCur, pPrev] = await Promise.all([
      gscQuery({ startDate: cur.start, endDate: cur.end, dimensions: ['query'], rowLimit: 2000 }),
      gscQuery({ startDate: prev.start, endDate: prev.end, dimensions: ['query'], rowLimit: 2000 }),
      gscQuery({ startDate: cur.start, endDate: cur.end, dimensions: ['page'], rowLimit: 2000 }),
      gscQuery({ startDate: prev.start, endDate: prev.end, dimensions: ['page'], rowLimit: 2000 }),
    ]);
    const queries = diffRows(qCur, qPrev);
    const pages = diffRows(pCur, pPrev);
    const report = buildReport({ cur, prev, queries, pages, siteLabel: 'fukues.com' });

    if (dry) {
      return NextResponse.json({ ok: true, dry: true, cur, prev, counts: { queries: queries.length, pages: pages.length }, subject: report.subject, body: report.lines.join('\n') });
    }
    await notifyAdmin(report.subject, report.lines);
    return NextResponse.json({ ok: true, cur, prev, counts: { queries: queries.length, pages: pages.length } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[gsc-weekly]', msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
