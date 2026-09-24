import { NextResponse } from 'next/server';
import { createDraftsCore } from '@/app/lib/billing/createDrafts';
import { billingMonthForIssueDay } from '@/lib/billing';
import { jstTodayYmd } from '@/app/lib/salonStats';

// ── 請求書の下書きを毎月1日に作る周（第816便・2026-09-25）────────────────
//   POST /api/admin/billing-drafts  (Authorization: Bearer <CRON_SECRET>)
//   body: { month?: 'YYYY-MM-01' }  ★ 省略すると【来月分】（日本時間・前月に前払い）
// ★ 作るのは【下書き】だけ。★ 店舗には何も届かない（発行はカッキーさんが管理画面で押す）
// ★ 同じ月に2回呼んでも二重には作らない（取り消し以外の請求書がある店は飛ばす）
//   crontab（VPS）: 毎月1日 朝6時5分（日本時間）
//   5 6 1 * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/billing-drafts -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  let body: { month?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body なしでも動く */ }
  // ★ 第822便: 前月に前払い。★ 10月1日に呼ばれたら【11月分】の下書きを作る
  const month = typeof body.month === 'string' ? body.month : billingMonthForIssueDay(jstTodayYmd());
  const r = await createDraftsCore(month);
  console.log('[billing-drafts]', month, JSON.stringify(r));
  return NextResponse.json({ month, ...r }, { status: r.ok ? 200 : 500 });
}
