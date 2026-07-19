// 週間アクセスランキングの取得（公開ページ用・createPublicClient＝anon/cookieレスでISRが効く）。
// 週の起点は「月曜（JST）」。DB側 increment_page_view と同じ月曜起点を JS でも算出して整合させる。
import { createPublicClient } from '@/app/lib/supabase/public';

export type SalonRankItem = {
  rank: number;
  id: number;
  name: string;
  area: string | null;
  area2: string | null;
  views: number;
};

export type TherapistRankItem = {
  rank: number;
  id: number;
  name: string;
  salonId: number | null;
  salonName: string;
  area: string | null;
  profileImageUrl: string | null;
  views: number;
};

// 現在時刻(JST)が属する週の「月曜」の 'YYYY-MM-DD'。
// Postgres の date_trunc('week') は月曜起点なので RPC 側と一致する。
export function currentWeekStartJST(): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const y = Number(parts.find((p) => p.type === 'year')!.value);
  const m = Number(parts.find((p) => p.type === 'month')!.value);
  const d = Number(parts.find((p) => p.type === 'day')!.value);
  // JSTに時差のあるDSTは無いので、当該日を UTC正午扱いで曜日を得ればズレない。
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const dow = base.getUTCDay(); // 0=日..6=土
  const backToMonday = dow === 0 ? 6 : dow - 1;
  base.setUTCDate(base.getUTCDate() - backToMonday);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// 今週の期間ラベル（例: "7月13日(月) 〜 7月19日(日)"）。見出し表示用。
export function currentWeekLabelJST(): string {
  const start = currentWeekStartJST(); // 'YYYY-MM-DD'（月曜）
  const [y, m, d] = start.split('-').map(Number);
  const startDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + 6); // 日曜
  const fmt = (dt: Date) => `${dt.getUTCMonth() + 1}月${dt.getUTCDate()}日`;
  return `${fmt(startDate)}(月) 〜 ${fmt(endDate)}(日)`;
}

// 店舗の週間アクセスTop（非表示店舗は除外）。
export async function fetchSalonWeeklyRanking(limit = 30): Promise<SalonRankItem[]> {
  const supabase = createPublicClient();
  const week = currentWeekStartJST();

  const { data: rows } = await supabase
    .from('page_view_weekly')
    .select('item_id, views')
    .eq('item_type', 'salon')
    .eq('week_start', week);

  const viewRows = (rows ?? []) as Array<{ item_id: number; views: number }>;
  if (viewRows.length === 0) return [];

  const ids = [...new Set(viewRows.map((r) => Number(r.item_id)))];
  const { data: salonRows } = await supabase
    .from('salons')
    .select('id, name, area, area2, is_hidden')
    .in('id', ids)
    .eq('is_hidden', false);

  const salonMap = new Map<number, { name: string; area: string | null; area2: string | null }>();
  (salonRows ?? []).forEach((s) => {
    salonMap.set(Number(s.id), {
      name: (s.name as string) ?? '',
      area: (s.area as string | null) ?? null,
      area2: (s.area2 as string | null) ?? null,
    });
  });

  return viewRows
    .map((r) => {
      const s = salonMap.get(Number(r.item_id));
      if (!s) return null; // 非表示 or 存在しない店舗は除外
      return {
        id: Number(r.item_id),
        name: s.name,
        area: s.area,
        area2: s.area2,
        views: Number(r.views),
      };
    })
    .filter((x): x is Omit<SalonRankItem, 'rank'> => x !== null)
    .sort((a, b) => b.views - a.views || a.id - b.id)
    .slice(0, limit)
    .map((x, i) => ({ rank: i + 1, ...x }));
}

// セラピストの週間アクセスTop（is_active＝在籍中・非表示店舗所属は除外）。
export async function fetchTherapistWeeklyRanking(limit = 30): Promise<TherapistRankItem[]> {
  const supabase = createPublicClient();
  const week = currentWeekStartJST();

  const { data: rows } = await supabase
    .from('page_view_weekly')
    .select('item_id, views')
    .eq('item_type', 'therapist')
    .eq('week_start', week);

  const viewRows = (rows ?? []) as Array<{ item_id: number; views: number }>;
  if (viewRows.length === 0) return [];

  const ids = [...new Set(viewRows.map((r) => Number(r.item_id)))];
  const { data: tRows } = await supabase
    .from('therapists')
    .select('id, name, area, salon_id, profile_image_url, is_active, salons!inner(id, name, is_hidden)')
    .in('id', ids)
    .eq('is_active', true)
    .eq('salons.is_hidden', false);

  type TRow = {
    id: number;
    name: string | null;
    area: string | null;
    salon_id: number | null;
    profile_image_url: string | null;
    salons: { id: number; name: string | null; is_hidden: boolean } | null;
  };

  const tMap = new Map<number, TRow>();
  ((tRows ?? []) as unknown as TRow[]).forEach((t) => tMap.set(Number(t.id), t));

  return viewRows
    .map((r) => {
      const t = tMap.get(Number(r.item_id));
      if (!t) return null; // 退店・非表示店舗所属・存在しないセラピストは除外
      return {
        id: Number(r.item_id),
        name: t.name ?? '',
        salonId: t.salon_id != null ? Number(t.salon_id) : null,
        salonName: t.salons?.name ?? '',
        area: t.area ?? null,
        profileImageUrl: t.profile_image_url ?? null,
        views: Number(r.views),
      };
    })
    .filter((x): x is Omit<TherapistRankItem, 'rank'> => x !== null)
    .sort((a, b) => b.views - a.views || a.id - b.id)
    .slice(0, limit)
    .map((x, i) => ({ rank: i + 1, ...x }));
}
