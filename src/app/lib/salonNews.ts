import type { SupabaseClient } from '@supabase/supabase-js';
import { pickOnePerSalon, ONE_PER_SALON_FETCH_MULTIPLIER } from '@/lib/announceAuto';

// トップ「サロン新着情報」ブロック／/news 一覧の共通取得。
// announcements（公開のみ）を published_at 降順で取り、salons!inner で非表示サロン分を除外する
// （anon RLS でも不可視だが、therapist_schedules と同様に表示条件を明文化する二重防御）。
export type SalonNewsItem = {
  id: string;
  salonId: number;
  salonName: string;
  title: string;
  imageUrl: string | null;
  publishedAt: string; // ISO
};

/**
 * @param onePerSalon 同じ店を1件だけにする（守り1・設計メモ 追記37 §191）。
 *
 * ★★★ TOPの新着ブロックだけ true にする。
 *   TOPが1店で埋まるのは「同じ店が何枠でも取れる」×「並びが更新時刻だけ」が
 *   同時に成り立つときだけ。★ 犯人は自動更新ではない——手作業でも同じことは起きる。
 *   1店舗1件にすれば **構造的に埋まらない**。
 * ★ /news（一覧）は false のまま。あちらは履歴を見に行く場所で、
 *   間引くと「書いたのに出ていない」に見える。埋まって困る場所とは役割が違う。
 */
export async function fetchLatestSalonNews(
  supabase: SupabaseClient,
  limit: number,
  onePerSalon = false,
): Promise<SalonNewsItem[]> {
  // ★ 間引く前提のときは多めに読む。5件しか読まないと、1店が5件続いていたとき1件しか出せない。
  //   ★ それでも「必ず5店ぶん埋まる」ことは保証しない。足りなければ空けたまま出す（§210）。
  const fetchLimit = onePerSalon ? limit * ONE_PER_SALON_FETCH_MULTIPLIER : limit;
  const { data } = await supabase
    .from('announcements')
    .select('id, salon_id, title, image_url, published_at, salons!inner(id, name, is_hidden)')
    .eq('is_published', true)
    .eq('salons.is_hidden', false)
    .order('published_at', { ascending: false })
    .limit(fetchLimit);

  const items = (data ?? []).map((r) => {
    // to-one リレーションはオブジェクトで返るが、型上は配列になり得るため両対応で name を取る。
    const salonRel = r.salons as { name?: string } | Array<{ name?: string }> | null;
    const salonName = Array.isArray(salonRel) ? (salonRel[0]?.name ?? '') : (salonRel?.name ?? '');
    return {
      id: String(r.id),
      salonId: Number(r.salon_id),
      salonName,
      title: (r.title as string) ?? '',
      imageUrl: (r.image_url as string | null) ?? null,
      publishedAt: (r.published_at as string) ?? '',
    };
  });

  // ★ 並べ替えない。新しい順のまま、同じ店の2件目以降を落とすだけ。
  return onePerSalon ? pickOnePerSalon(items, limit) : items;
}
