import { NextResponse } from 'next/server';
import { notifyAdmin } from '@/app/lib/notifyAdmin';
import { syncBankDeposits } from '@/app/lib/billing/bankDeposits';
import { mfConfigured } from '@/app/lib/billing/mfApi';

// ── 楽天口座の入金明細を読む（第1437便・2026-10-13・カッキーさん）──────────────────
//   GET /api/cron/bank-deposits  (Authorization: Bearer <CRON_SECRET>)
// ★ Vercel の定期実行（vercel.json・毎日 00:00 UTC ＝ 9:00 日本時間＝催促の見回り 10:00 より前）。
// ★ マネーフォワードから直近14日の入金を読み、新しい明細に請求書の候補を付けて bank_deposits に足す。入金済みにはしない。
// ★ 新しい入金（候補）があった日だけ、運営にメールで知らせる。読めなかった日も知らせる。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  if (!mfConfigured()) return NextResponse.json({ ok: true, note: 'MF_API_KEY が無い。何もしていない' });

  const r = await syncBankDeposits();
  if (!r.ok) {
    await notifyAdmin('【フクエス】入金明細を読めませんでした（マネーフォワード）', [r.error, '', '管理画面の請求書 → ② 入金待ち の「今すぐ読む」でもう一度試せます。']);
    return NextResponse.json(r, { status: 500 });
  }
  if (r.pending > 0) {
    await notifyAdmin(`【フクエス】楽天口座に新しい入金が ${r.pending}件あります`, [
      '管理画面の請求書 → ② 入金待ち の「入金の候補」で、どの請求書の入金かを決めてください。',
      'https://fukues.com/admin/billing',
    ]);
  }
  return NextResponse.json(r);
}
