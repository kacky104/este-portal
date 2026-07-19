// 週間アクセスランキングの取得（公開ページ用・createPublicClient＝anon/cookieレスでISRが効く）。
// 週の起点は「月曜（JST）」。DB側 increment_page_view と同じ月曜起点を JS でも算出して整合させる。
// 順位付けには「実アクセス数 + ranking_bonus（管理者が設定する毎週の下駄）」を使う。
// ★公開ページには数値は出さない（順位のみ表示）。views は内部の並べ替え用で、返り値には含めない。
import { createPublicClient } from '@/app/lib/supabase/public';

export type SalonRankItem = {
  rank: number;
  id: number;
  name: string;
  area: string | null;
  area2: string | null;
};

export type TherapistRankItem = {
  rank: number;
  id: number;
  name: string;
  salonId: number | null;
  salonName: string;
  area: string | null;
  profileImageUrl: string | null;
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

// 店舗の週間ランキング（実アクセス + 下駄。非表示店舗は除外。合計0は非表示）。
export async function fetchSalonWeeklyRanking(limit = 30): Promise<SalonRankItem[]> {
  const supabase = createPublicClient();
  const week = currentWeekStartJST();

  const { data: rows } = await supabase
    .from('page_view_weekly')
    .select('item_id, views')
    .eq('item_type', 'salon')
    .eq('week_start', week);
  const viewMap = new Map<number, number>();
  ((rows ?? []) as Array<{ item_id: number; views: number }>).forEach((r) =>
    viewMap.set(Number(r.item_id), Number(r.views)),
  );

  // 下駄(>0)が付いた店舗は、実アクセスが無くても候補に含める。
  const { data: bonusIdRows } = await supabase
    .from('salons')
    .select('id')
    .eq('is_hidden', false)
    .gt('ranking_bonus', 0);
  const bonusIds = ((bonusIdRows ?? []) as Array<{ id: number }>).map((r) => Number(r.id));

  const candidateIds = [...new Set<number>([...viewMap.keys(), ...bonusIds])];
  if (candidateIds.length === 0) return [];

  const { data: salonRows } = await supabase
    .from('salons')
    .select('id, name, area, area2, ranking_bonus, is_hidden')
    .in('id', candidateIds)
    .eq('is_hidden', false);

  return ((salonRows ?? []) as Array<{
    id: number;
    name: string | null;
    area: string | null;
    area2: string | null;
    ranking_bonus: number | null;
  }>)
    .map((s) => {
      const effective = (viewMap.get(Number(s.id)) ?? 0) + Number(s.ranking_bonus ?? 0);
      return {
        id: Number(s.id),
        name: s.name ?? '',
        area: s.area ?? null,
        area2: s.area2 ?? null,
        _score: effective,
      };
    })
    .filter((x) => x._score > 0)
    .sort((a, b) => b._score - a._score || a.id - b.id)
    .slice(0, limit)
    .map((x, i) => ({ rank: i + 1, id: x.id, name: x.name, area: x.area, area2: x.area2 }));
}

// セラピストの週間ランキング（実アクセス + 下駄。退店/非表示店舗所属は除外。合計0は非表示）。
export async function fetchTherapistWeeklyRanking(limit = 30): Promise<TherapistRankItem[]> {
  const supabase = createPublicClient();
  const week = currentWeekStartJST();

  const { data: rows } = await supabase
    .from('page_view_weekly')
    .select('item_id, views')
    .eq('item_type', 'therapist')
    .eq('week_start', week);
  const viewMap = new Map<number, number>();
  ((rows ?? []) as Array<{ item_id: number; views: number }>).forEach((r) =>
    viewMap.set(Number(r.item_id), Number(r.views)),
  );

  const { data: bonusIdRows } = await supabase
    .from('therapists')
    .select('id')
    .eq('is_active', true)
    .gt('ranking_bonus', 0);
  const bonusIds = ((bonusIdRows ?? []) as Array<{ id: number }>).map((r) => Number(r.id));

  const candidateIds = [...new Set<number>([...viewMap.keys(), ...bonusIds])];
  if (candidateIds.length === 0) return [];

  const { data: tRows } = await supabase
    .from('therapists')
    .select('id, name, area, salon_id, profile_image_url, ranking_bonus, is_active, salons!inner(id, name, is_hidden)')
    .in('id', candidateIds)
    .eq('is_active', true)
    .eq('salons.is_hidden', false);

  type TRow = {
    id: number;
    name: string | null;
    area: string | null;
    salon_id: number | null;
    profile_image_url: string | null;
    ranking_bonus: number | null;
    salons: { id: number; name: string | null; is_hidden: boolean } | null;
  };

  return ((tRows ?? []) as unknown as TRow[])
    .map((t) => {
      const effective = (viewMap.get(Number(t.id)) ?? 0) + Number(t.ranking_bonus ?? 0);
      return {
        id: Number(t.id),
        name: t.name ?? '',
        salonId: t.salon_id != null ? Number(t.salon_id) : null,
        salonName: t.salons?.name ?? '',
        area: t.area ?? null,
        profileImageUrl: t.profile_image_url ?? null,
        _score: effective,
      };
    })
    .filter((x) => x._score > 0)
    .sort((a, b) => b._score - a._score || a.id - b.id)
    .slice(0, limit)
    .map((x, i) => ({
      rank: i + 1,
      id: x.id,
      name: x.name,
      salonId: x.salonId,
      salonName: x.salonName,
      area: x.area,
      profileImageUrl: x.profileImageUrl,
    }));
}
