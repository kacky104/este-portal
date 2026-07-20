// 週間アクセスランキングの取得（公開ページ用・createPublicClient＝anon/cookieレスでISRが効く）。
// 週の起点は「月曜（JST）」。DB側 increment_page_view と同じ月曜起点を JS でも算出して整合させる。
// 順位付けには「実アクセス数 + ranking_bonus（管理者が設定する毎週の下駄）」を使う。
// ★公開ページには数値は出さない（順位のみ表示）。views は内部の並べ替え用で、返り値には含めない。
import { createPublicClient } from '@/app/lib/supabase/public';
import { sanitizeBadges } from '@/lib/therapistBadges';
import { getBusinessDateJST } from '@/lib/dutyStatus';

export type SalonRankItem = {
  rank: number;
  id: number;
  name: string;
  area: string | null;
  area2: string | null;
  dispatchType: 'none' | 'available' | 'only';
};

export type TherapistRankItem = {
  rank: number;
  id: number;
  name: string;
  salonId: number | null;
  salonName: string;
  area: string | null;
  profileImageUrl: string | null;
  bodyType: string | null;
  featureBadges: string[];
  catchphrase: string | null;
  isAvailableNow: boolean;
  availableUntil: string | null;
  isAvailableNowCast: boolean;
  availableUntilCast: string | null;
  todayIsActive: boolean;
  todayStart: string | null;
  todayEnd: string | null;
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

// 前週（先週）の月曜 'YYYY-MM-DD'。順位変動（前回比）の比較用。
export function previousWeekStartJST(): string {
  const [y, m, d] = currentWeekStartJST().split('-').map(Number);
  const base = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  base.setUTCDate(base.getUTCDate() - 7);
  const yy = base.getUTCFullYear();
  const mm = String(base.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(base.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

// 前週の順位マップ（種別ごとに entity_id(文字列) → 前週順位）。
// page_view_weekly は週ごとの行を保持しているため、先週の week_start でその場で再計算する。
// 前週にランク外/データ無しの対象はマップに含まれない（＝表示側で「NEW」扱い）。
// 大きめ limit で全順位を取り、トップ表示外の対象でも正確な前週順位を得る。
export type PrevRankMaps = {
  overall: Record<string, number>;
  salon: Record<string, number>;
  therapist: Record<string, number>;
};
export async function fetchPreviousRankMaps(): Promise<PrevRankMaps> {
  const week = previousWeekStartJST();
  const [overall, salon, therapist] = await Promise.all([
    fetchOverallWeeklyRanking(9999, week),
    fetchSalonWeeklyRanking(9999, week),
    fetchTherapistWeeklyRanking(9999, week),
  ]);
  const toMap = (arr: Array<{ id: number; rank: number }>): Record<string, number> => {
    const m: Record<string, number> = {};
    arr.forEach((x) => { m[String(x.id)] = x.rank; });
    return m;
  };
  return { overall: toMap(overall), salon: toMap(salon), therapist: toMap(therapist) };
}

// 店舗の週間ランキング（実アクセス + 下駄。非表示店舗は除外。合計0は非表示）。
export async function fetchSalonWeeklyRanking(limit = 30, week: string = currentWeekStartJST()): Promise<SalonRankItem[]> {
  const supabase = createPublicClient();

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
    .select('id, name, area, area2, ranking_bonus, is_hidden, dispatch_type')
    .in('id', candidateIds)
    .eq('is_hidden', false);

  return ((salonRows ?? []) as Array<{
    id: number;
    name: string | null;
    area: string | null;
    area2: string | null;
    ranking_bonus: number | null;
    dispatch_type: 'none' | 'available' | 'only' | null;
  }>)
    .map((s) => {
      const effective = (viewMap.get(Number(s.id)) ?? 0) + Number(s.ranking_bonus ?? 0);
      return {
        id: Number(s.id),
        name: s.name ?? '',
        area: s.area ?? null,
        area2: s.area2 ?? null,
        dispatchType: (s.dispatch_type ?? 'none') as 'none' | 'available' | 'only',
        _score: effective,
      };
    })
    .filter((x) => x._score > 0)
    .sort((a, b) => b._score - a._score || a.id - b.id)
    .slice(0, limit)
    .map((x, i) => ({ rank: i + 1, id: x.id, name: x.name, area: x.area, area2: x.area2, dispatchType: x.dispatchType }));
}

// セラピストの週間ランキング（実アクセス + 下駄。退店/非表示店舗所属は除外。合計0は非表示）。
export async function fetchTherapistWeeklyRanking(limit = 30, week: string = currentWeekStartJST()): Promise<TherapistRankItem[]> {
  const supabase = createPublicClient();

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
    .select('id, name, area, salon_id, profile_image_url, body_type, feature_badges, catchphrase, is_available_now, available_until, is_available_now_cast, available_until_cast, ranking_bonus, is_active, salons!inner(id, name, is_hidden)')
    .in('id', candidateIds)
    .eq('is_active', true)
    .eq('salons.is_hidden', false);

  type TRow = {
    id: number;
    name: string | null;
    area: string | null;
    salon_id: number | null;
    profile_image_url: string | null;
    body_type: string | null;
    feature_badges: unknown;
    catchphrase: string | null;
    is_available_now: boolean | null;
    available_until: string | null;
    is_available_now_cast: boolean | null;
    available_until_cast: string | null;
    ranking_bonus: number | null;
    salons: { id: number; name: string | null; is_hidden: boolean } | null;
  };

  const scored = ((tRows ?? []) as unknown as TRow[])
    .map((t) => {
      const effective = (viewMap.get(Number(t.id)) ?? 0) + Number(t.ranking_bonus ?? 0);
      return {
        id: Number(t.id),
        name: t.name ?? '',
        salonId: t.salon_id != null ? Number(t.salon_id) : null,
        salonName: t.salons?.name ?? '',
        area: t.area ?? null,
        profileImageUrl: t.profile_image_url ?? null,
        bodyType: t.body_type ?? null,
        featureBadges: sanitizeBadges(t.feature_badges),
        catchphrase: t.catchphrase ?? null,
        isAvailableNow: Boolean(t.is_available_now),
        availableUntil: (t.available_until as string | null) ?? null,
        isAvailableNowCast: Boolean(t.is_available_now_cast),
        availableUntilCast: (t.available_until_cast as string | null) ?? null,
        _score: effective,
      };
    })
    .filter((x) => x._score > 0)
    .sort((a, b) => b._score - a._score || a.id - b.id)
    .slice(0, limit);

  // 本日の出勤スケジュール（出勤バッジ用）。上位のみ取得。
  const today = getBusinessDateJST();
  const { data: schedRows } = await supabase
    .from('therapist_schedules')
    .select('therapist_id, is_active, start_time, end_time')
    .in('therapist_id', scored.map((x) => x.id))
    .eq('schedule_date', today);
  const schedMap = new Map<number, { active: boolean; start: string | null; end: string | null }>();
  ((schedRows ?? []) as Array<{ therapist_id: number; is_active: boolean; start_time: string | null; end_time: string | null }>).forEach((r) => {
    schedMap.set(Number(r.therapist_id), {
      active: Boolean(r.is_active),
      start: r.start_time ? String(r.start_time).slice(0, 5) : null,
      end: r.end_time ? String(r.end_time).slice(0, 5) : null,
    });
  });

  return scored.map((x, i) => {
    const sch = schedMap.get(x.id);
    return {
      rank: i + 1,
      id: x.id,
      name: x.name,
      salonId: x.salonId,
      salonName: x.salonName,
      area: x.area,
      profileImageUrl: x.profileImageUrl,
      bodyType: x.bodyType,
      featureBadges: x.featureBadges,
      catchphrase: x.catchphrase,
      isAvailableNow: x.isAvailableNow,
      availableUntil: x.availableUntil,
      isAvailableNowCast: x.isAvailableNowCast,
      availableUntilCast: x.availableUntilCast,
      todayIsActive: sch?.active ?? false,
      todayStart: sch?.start ?? null,
      todayEnd: sch?.end ?? null,
    };
  });
}

// 週間ランキングページのヒーロー（ヘッダー）画像URL。未設定は null。
export async function fetchRankingHero(): Promise<string | null> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('ranking_hero')
    .select('image_url')
    .eq('id', 1)
    .maybeSingle();
  return ((data?.image_url as string | null) ?? null) || null;
}

// 総合ランキング（店舗ベース）：店舗自身のアクセス + その店舗に所属する在籍セラピスト全員のアクセスを合算。
// スコア = 店舗(実アクセス+下駄) + Σ 所属セラピスト(実アクセス+下駄)。非表示店舗・退店セラピストは除外。合計0は非表示。
// 表示形状は店舗ランキングと同じ SalonRankItem。
export async function fetchOverallWeeklyRanking(limit = 10, week: string = currentWeekStartJST()): Promise<SalonRankItem[]> {
  const supabase = createPublicClient();

  // 店舗の週間アクセス
  const { data: sViewRows } = await supabase
    .from('page_view_weekly')
    .select('item_id, views')
    .eq('item_type', 'salon')
    .eq('week_start', week);
  const salonViews = new Map<number, number>();
  ((sViewRows ?? []) as Array<{ item_id: number; views: number }>).forEach((r) =>
    salonViews.set(Number(r.item_id), Number(r.views)),
  );

  // セラピストの週間アクセス
  const { data: tViewRows } = await supabase
    .from('page_view_weekly')
    .select('item_id, views')
    .eq('item_type', 'therapist')
    .eq('week_start', week);
  const therapistViews = new Map<number, number>();
  ((tViewRows ?? []) as Array<{ item_id: number; views: number }>).forEach((r) =>
    therapistViews.set(Number(r.item_id), Number(r.views)),
  );

  // 非表示でない店舗
  const { data: salonRows } = await supabase
    .from('salons')
    .select('id, name, area, area2, ranking_bonus, dispatch_type')
    .eq('is_hidden', false);
  type S = { id: number; name: string | null; area: string | null; area2: string | null; ranking_bonus: number | null; dispatch_type: 'none' | 'available' | 'only' | null };
  const salons = (salonRows ?? []) as S[];

  // 在籍セラピスト（非表示店舗所属は除外）を店舗ごとに合算
  const { data: tRows } = await supabase
    .from('therapists')
    .select('id, salon_id, ranking_bonus, is_active, salons!inner(is_hidden)')
    .eq('is_active', true)
    .eq('salons.is_hidden', false);
  type T = { id: number; salon_id: number | null; ranking_bonus: number | null };
  const therapistContribBySalon = new Map<number, number>();
  ((tRows ?? []) as unknown as T[]).forEach((t) => {
    const sid = t.salon_id != null ? Number(t.salon_id) : null;
    if (sid == null) return;
    const contrib = (therapistViews.get(Number(t.id)) ?? 0) + Number(t.ranking_bonus ?? 0);
    therapistContribBySalon.set(sid, (therapistContribBySalon.get(sid) ?? 0) + contrib);
  });

  return salons
    .map((s) => {
      const id = Number(s.id);
      const score =
        (salonViews.get(id) ?? 0) + Number(s.ranking_bonus ?? 0) + (therapistContribBySalon.get(id) ?? 0);
      return { id, name: s.name ?? '', area: s.area ?? null, area2: s.area2 ?? null, dispatchType: (s.dispatch_type ?? 'none') as 'none' | 'available' | 'only', _score: score };
    })
    .filter((x) => x._score > 0)
    .sort((a, b) => b._score - a._score || a.id - b.id)
    .slice(0, limit)
    .map((x, i) => ({ rank: i + 1, id: x.id, name: x.name, area: x.area, area2: x.area2, dispatchType: x.dispatchType }));
}

// テーマ壁紙（theme_wallpapers）を theme_key → 画像URL のマップで返す。未設定キーは含まれない。
// ランキングはタブでテーマが変わるため、必要なテーマ分をまとめて取得してクライアントに渡す。
export async function fetchThemeWallpapers(): Promise<Record<string, string>> {
  const supabase = createPublicClient();
  const { data } = await supabase.from('theme_wallpapers').select('theme_key, image_url');
  const map: Record<string, string> = {};
  ((data ?? []) as Array<{ theme_key: string; image_url: string }>).forEach((r) => {
    if (r.theme_key && r.image_url) map[r.theme_key] = r.image_url;
  });
  return map;
}

// タブ別ヒーロー画像URL（総合／店舗／セラピスト）。未設定は null。
export type RankingHeroes = { overall: string | null; salon: string | null; therapist: string | null };
export async function fetchRankingHeroes(): Promise<RankingHeroes> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('ranking_hero')
    .select('hero_overall, hero_salon, hero_therapist')
    .eq('id', 1)
    .maybeSingle();
  const pick = (v: unknown): string | null => ((v as string | null) ?? null) || null;
  return {
    overall: pick(data?.hero_overall),
    salon: pick(data?.hero_salon),
    therapist: pick(data?.hero_therapist),
  };
}


// 総合ランキング各順位のショーケース用データを一括取得（クライアント個別fetchを避け高速化）。
// therapists は所属全員を返し、ランダム選抜はクライアント側で行う（開くたびランダムを維持）。
export type ShowcaseCard = { id: string; name: string; age: string | null; img: string | null; isNew: boolean };
export type ShowcaseSalonData = {
  therapists: ShowcaseCard[];
  catchphrase: string;
  price: string;
  hours: string;
  closedDays: string;
  image: string;
};
export async function fetchOverallShowcaseData(salonIds: number[]): Promise<Record<number, ShowcaseSalonData>> {
  const byId: Record<number, ShowcaseSalonData> = {};
  salonIds.forEach((id) => { byId[id] = { therapists: [], catchphrase: '', price: '', hours: '', closedDays: '', image: '' }; });
  if (salonIds.length === 0) return byId;
  const supabase = createPublicClient();
  const [tRes, sRes, imgRes] = await Promise.all([
    supabase.from('therapists').select('id, salon_id, name, age, profile_image_url, is_new_face').in('salon_id', salonIds),
    supabase.from('salons').select('id, catchphrase, price, hours, closed_days').in('id', salonIds),
    supabase.from('salon_images').select('salon_id, image_url, display_order').in('salon_id', salonIds).order('display_order', { ascending: true }),
  ]);
  ((tRes.data ?? []) as Array<{ id: number; salon_id: number | null; name: string | null; age: string | null; profile_image_url: string | null; is_new_face: boolean | null }>).forEach((t) => {
    const sid = t.salon_id != null ? Number(t.salon_id) : null;
    if (sid == null || !byId[sid]) return;
    byId[sid].therapists.push({ id: String(t.id), name: t.name ?? '', age: t.age ?? null, img: t.profile_image_url ?? null, isNew: Boolean(t.is_new_face) });
  });
  ((sRes.data ?? []) as Array<{ id: number; catchphrase: string | null; price: string | null; hours: string | null; closed_days: string | null }>).forEach((s2) => {
    const id = Number(s2.id);
    if (!byId[id]) return;
    byId[id].catchphrase = (s2.catchphrase ?? '') || '';
    byId[id].price = (s2.price ?? '') || '';
    byId[id].hours = (s2.hours ?? '') || '';
    byId[id].closedDays = (s2.closed_days ?? '') || '';
  });
  // 店舗ヘッダー画像（salon_images）：display_order 昇順の1枚目を採用。
  ((imgRes.data ?? []) as Array<{ salon_id: number; image_url: string | null }>).forEach((r) => {
    const id = Number(r.salon_id);
    if (!byId[id] || byId[id].image) return;
    byId[id].image = (r.image_url ?? '') || '';
  });
  return byId;
}
