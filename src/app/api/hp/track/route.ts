import { NextResponse, type NextRequest } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { hpSiteKeyColumn, isHpDomainKey, normalizeHpSiteKey } from '@/app/lib/hpSite';
import { HP_STAT_EVENTS, isBotUA, jstDayHour, normalizeHpPath, normalizeHpSource, type HpStatEvent } from '@/lib/hpStats';

// ★ 第1792便（カッキーさん・2026-11-08）: 公式HPのアクセス解析の受け口（計測は src/app/hp/_lib/trackScript.ts）。
//   ★ 公式HPの各ページから sendBeacon で届く。★ 何があっても 204 を返す（お客様の画面を止めない・エラーで中身を教えない）。
//   ★ サイトの指定（k）から店を引く（★ 画面から来た salon_id は信用しない）。公開中（live）のサイトだけ数える。
//   ★ 数は表 hp_stats に「日 × 切り口 × 値」で足すだけ（関数 hp_stat_add・1回の呼び出し）。生の記録は持たない。

type Row = { dim: 'src' | 'first' | 'page' | 'hour' | 'device'; key: string; pv?: number; sessions?: number; users?: number; new_users?: number; tel?: number; line?: number; contact?: number; book?: number; ek_therapist?: number; ek_schedule?: number; ek_diary?: number; ek_review?: number };

// サイトの指定 → 店の番号（10分覚える。公式HPの数は少ないので小さい）
const siteCache = new Map<string, { salonId: number | null; at: number }>();
const SITE_TTL = 10 * 60_000;

async function salonOfSite(key: string): Promise<number | null> {
  const hit = siteCache.get(key);
  if (hit && Date.now() - hit.at < SITE_TTL) return hit.salonId;
  const svc = createServiceClient();
  const { data } = await svc.from('salon_sites').select('salon_id, status').eq(hpSiteKeyColumn(key), key).maybeSingle();
  const salonId = data && data.status === 'live' ? Number(data.salon_id) : null;
  if (siteCache.size > 500) siteCache.clear();
  siteCache.set(key, { salonId, at: Date.now() });
  return salonId;
}

const empty = () => new NextResponse(null, { status: 204 });
const flag = (v: unknown) => (v === 1 || v === '1' || v === true ? 1 : 0);

export async function POST(req: NextRequest) {
  try {
    if (isBotUA(req.headers.get('user-agent') ?? '')) return empty();
    const text = (await req.text()).slice(0, 2000);
    const b = JSON.parse(text) as Record<string, unknown>;
    const key = normalizeHpSiteKey(String(b.k ?? '')).slice(0, 120);
    const t = String(b.t ?? '') as HpStatEvent;
    if (!key || !(HP_STAT_EVENTS as readonly string[]).includes(t)) return empty();
    const salonId = await salonOfSite(key);
    if (salonId == null) return empty();

    const basePath = isHpDomainKey(key) ? '' : `/hp/${key}`;
    const page = normalizeHpPath(String(b.p ?? '/'), basePath);
    const src = normalizeHpSource(String(b.s ?? ''));
    const first = normalizeHpSource(String(b.f ?? b.s ?? ''));
    const device = b.d === 'pc' ? 'pc' : 'sp';
    const { day, hour } = jstDayHour(Date.now());
    const h = String(hour);

    let rows: Row[];
    if (t === 'pv') {
      const ns = flag(b.ns), u = flag(b.u), nu = flag(b.nu);
      rows = [
        { dim: 'src', key: src, pv: 1, sessions: ns, users: u, new_users: nu },
        { dim: 'page', key: page, pv: 1 },
        { dim: 'hour', key: h, pv: 1 },
        { dim: 'device', key: device, pv: 1, sessions: ns, users: u, new_users: nu },
      ];
    } else {
      const v = { [t]: 1 } as Partial<Row>;
      rows = [
        { dim: 'src', key: src, ...v },
        { dim: 'first', key: first, ...v },
        { dim: 'page', key: page, ...v },
        { dim: 'hour', key: h, ...v },
      ];
    }
    const svc = createServiceClient();
    const { error } = await svc.rpc('hp_stat_add', { p_salon_id: salonId, p_day: day, p_rows: rows });
    if (error) console.error('[hp-track] 数えられなかった', salonId, error.message);
  } catch {
    // 形のおかしい送信は黙って捨てる
  }
  return empty();
}
