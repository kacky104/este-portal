// セラピストの既定画像を【読む】側（第217便・2026-09-08）。
// ★ 決め方は src/lib/therapistPlaceholder.ts（純粋・番人あり）。ここはDBから表を引いて当てるだけ。
//
// ★ どのクライアントでも動く（anon の公開クライアント／ブラウザのクライアント）。
//   ★ salons.therapist_placeholder_url と page_heroes は anon で select できる公開テーブル。
// ★ 失敗しても【黙って既定画像なし】に倒す（★ 一覧が丸ごと落ちるより、写真が無い子が
//   今までどおり「画像なし」で出るほうがまし）。
import type { SupabaseClient } from '@supabase/supabase-js';
import { pickWithTable, THERAPIST_PLACEHOLDER_KEY, type PlaceholderTable } from '@/lib/therapistPlaceholder';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

// ★ 第1085便（2026-10-01）: ブラウザでは引いた結果を使い回す。
//   本番実測で TOP を開くと、出勤中スクロール（TherapistScroller）と店舗カード（useSalonTherapists）が
//   それぞれ page_heroes・salons を引いて 2回ずつ（計4回）になっていた。
//   ★ 運営の既定画像（page_heroes）は1本の問い合わせを共有（同時実行も1本）。店舗の既定画像は店舗IDごとに覚え、足りない分だけ引く。
//   ★ 10分で捨てる（TOP の ISR 600 と同じ鮮度・/admin や /mypage で変えても次の読み込みで反映）。
//   ★ サーバー（window 無し）では使わない＝リクエスト間で混ざらない。
const BROWSER_CACHE_TTL_MS = 10 * 60 * 1000;
let adminCache: { value: string | null; at: number } | null = null;
let adminInflight: Promise<string | null> | null = null;
const salonCache = new Map<number, { value: string | null; at: number }>();

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

async function loadAdminPlaceholder(supabase: AnyClient): Promise<string | null> {
  const now = Date.now();
  if (isBrowser()) {
    if (adminCache && now - adminCache.at < BROWSER_CACHE_TTL_MS) return adminCache.value;
    if (adminInflight) return adminInflight;
  }
  const job = (async () => {
    const res = await supabase.from('page_heroes').select('image_url').eq('page_key', THERAPIST_PLACEHOLDER_KEY).maybeSingle();
    const value = res.error ? null : ((res.data?.image_url as string | null) ?? null);
    // ★ 読めなかった（error）ときは覚えない＝次の機会にもう一度引く
    if (isBrowser() && !res.error) adminCache = { value, at: Date.now() };
    return value;
  })();
  if (isBrowser()) {
    adminInflight = job;
    job.finally(() => { if (adminInflight === job) adminInflight = null; }).catch(() => {});
  }
  return job;
}

async function loadSalonPlaceholders(supabase: AnyClient, ids: number[]): Promise<Map<number, string | null>> {
  const bySalon = new Map<number, string | null>();
  if (ids.length === 0) return bySalon;
  const now = Date.now();
  const missing: number[] = [];
  for (const id of ids) {
    const hit = isBrowser() ? salonCache.get(id) : undefined;
    if (hit && now - hit.at < BROWSER_CACHE_TTL_MS) bySalon.set(id, hit.value);
    else missing.push(id);
  }
  if (missing.length === 0) return bySalon;
  const res = await supabase.from('salons').select('id, therapist_placeholder_url').in('id', missing);
  if (!res.error) {
    const seen = new Set<number>();
    for (const r of (res.data ?? []) as Array<{ id: number; therapist_placeholder_url: string | null }>) {
      const id = Number(r.id);
      const value = r.therapist_placeholder_url ?? null;
      bySalon.set(id, value);
      seen.add(id);
      if (isBrowser()) salonCache.set(id, { value, at: Date.now() });
    }
    // ★ 行が無かった店舗（非表示など）も「無し」で覚えて、引き直さない
    if (isBrowser()) for (const id of missing) if (!seen.has(id)) salonCache.set(id, { value: null, at: Date.now() });
  }
  return bySalon;
}

/**
 * 既定画像の表を引く（運営1つ＋店舗ごと）。★ 2クエリ（ブラウザでは覚えている分を引かない）。★ salonIds が空でも運営の分は引く。
 */
export async function loadTherapistPlaceholders(
  supabase: AnyClient,
  salonIds: ReadonlyArray<number | string | null | undefined>,
): Promise<PlaceholderTable> {
  const ids = [...new Set(salonIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))];
  try {
    const [admin, bySalon] = await Promise.all([loadAdminPlaceholder(supabase), loadSalonPlaceholders(supabase, ids)]);
    return { admin, bySalon };
  } catch {
    return { admin: null, bySalon: new Map() };
  }
}

/**
 * 行の配列に既定画像を当てる。★ 元の行は変えず、set で作った新しい行を返す。
 *   fillTherapistImages(supabase, rows, {
 *     salonId: (r) => r.salon_id,
 *     image:   (r) => r.profile_image_url,
 *     set:     (r, url) => ({ ...r, profile_image_url: url }),
 *   })
 */
export async function fillTherapistImages<T>(
  supabase: AnyClient,
  rows: ReadonlyArray<T>,
  opts: {
    salonId: (row: T) => number | string | null | undefined;
    image: (row: T) => string | null | undefined;
    set: (row: T, url: string | null) => T;
  },
): Promise<T[]> {
  if (rows.length === 0) return [];
  // ★ 全員に写真があれば表を引かない（★ 無駄な2クエリを省く）
  if (rows.every((r) => ((opts.image(r) ?? '').trim() !== ''))) return [...rows];
  const table = await loadTherapistPlaceholders(supabase, rows.map(opts.salonId));
  return rows.map((r) => {
    const sid = opts.salonId(r);
    const url = pickWithTable(opts.image(r), sid == null ? null : Number(sid), table);
    return opts.set(r, url);
  });
}

/** 1人だけ決める（個別ページ用）。 */
export async function resolveTherapistImage(
  supabase: AnyClient,
  photo: string | null | undefined,
  salonId: number | string | null | undefined,
): Promise<string | null> {
  if ((photo ?? '').trim() !== '') return (photo as string).trim();
  const table = await loadTherapistPlaceholders(supabase, [salonId]);
  return pickWithTable(photo, salonId == null ? null : Number(salonId), table);
}
