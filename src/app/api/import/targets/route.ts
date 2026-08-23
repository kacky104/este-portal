import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';

// ── 外部媒体取り込み: 取得対象の一覧を返す（第28便）──────────────────────
// 中継役VPS（住宅系IPで駅ちかに到達できる）が毎時これを叩き、
// 返ってきた店舗ぶんだけ駅ちかのHTMLを取得して /api/import/ingest へ送る。
//   GET /api/import/targets  (Authorization: Bearer <CRON_SECRET>)
// VPS側の使い方:
//   1) このリストを受け取る
//   2) 各 shopUrl を取得 → 正規表現 /\/{externalId}\/(\d+)\// で個人ページIDを抽出
//   3) 各個人ページ（shopUrl + castId + '/'）を取得
//   4) POST /api/import/ingest { sourceId, todayISO, casts:[{castId, html}] }
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('salon_import_sources')
    .select('id, salon_id, provider, external_id, shop_url, import_schedule, import_profile, create_missing')
    .eq('is_enabled', true)
    .order('id');

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const targets = (data ?? []).map((s) => ({
    sourceId: s.id,
    salonId: s.salon_id,
    provider: s.provider,
    externalId: s.external_id,
    shopUrl: s.shop_url,
    importSchedule: s.import_schedule,
    importProfile: s.import_profile,
    createMissing: s.create_missing,
  }));

  return NextResponse.json({ ok: true, count: targets.length, targets });
}
