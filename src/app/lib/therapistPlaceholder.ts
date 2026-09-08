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

/**
 * 既定画像の表を引く（運営1つ＋店舗ごと）。★ 2クエリ。★ salonIds が空でも運営の分は引く。
 */
export async function loadTherapistPlaceholders(
  supabase: AnyClient,
  salonIds: ReadonlyArray<number | string | null | undefined>,
): Promise<PlaceholderTable> {
  const ids = [...new Set(salonIds.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0))];
  try {
    const [adminRes, salonRes] = await Promise.all([
      supabase.from('page_heroes').select('image_url').eq('page_key', THERAPIST_PLACEHOLDER_KEY).maybeSingle(),
      ids.length > 0
        ? supabase.from('salons').select('id, therapist_placeholder_url').in('id', ids)
        : Promise.resolve({ data: [] as Array<{ id: number; therapist_placeholder_url: string | null }>, error: null }),
    ]);
    const admin = adminRes.error ? null : ((adminRes.data?.image_url as string | null) ?? null);
    const bySalon = new Map<number, string | null>();
    if (!salonRes.error) {
      for (const r of (salonRes.data ?? []) as Array<{ id: number; therapist_placeholder_url: string | null }>) {
        bySalon.set(Number(r.id), r.therapist_placeholder_url ?? null);
      }
    }
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
