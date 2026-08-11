// 公式HPの写メ日記・口コミ一覧ページ用のデータ取得（2026-08-11 マルチページ化 第2弾）。
//
// トップページの埋め込み（iframe）とは別に、/diary・/voice はHPが自分で一覧を描く。
// 取得条件は埋め込み（/embed/salon/[id]/diary・reviews）と同じに揃える:
//   - 日記: 在籍セラピスト（is_active）のみ・画像がある日記のみ・新しい順
//   - 口コミ: 承認済みのみ（lib/reviews.ts の取得関数をそのまま使う）
//
// ★ デモ店（slug='demo'）だけは全店ぶんを出す。
//   デモ用サロンには日記も口コミも無いため、自店だけだと空のサンプルサイトになってしまう。
//   営業で見せるサンプルとして「実際に動いている画面」を見せるのが目的（非表示店は除外）。
//   実店舗の公式HPは必ず自店のぶんだけ。

import { createPublicClient } from '@/app/lib/supabase/public';
import { getAllApprovedReviews, getSalonApprovedReviews, type ApprovedReview } from '@/app/lib/reviews';

export const HP_DIARY_PAGE_LIMIT = 36; // 3列×12段ぶん。続きはフクエス本体へ
export const HP_VOICE_PAGE_LIMIT = 30;

export type HpDiaryItem = {
  id:            string;
  image:         string;
  title:         string;
  therapistName: string;
  /** 全店モード（デモ）のときだけ入る所属店名 */
  salonName?:    string;
};

type DiaryRow = {
  id: number | string;
  images: string[] | null;
  title: string | null;
  therapists: { name: string | null; is_active?: boolean } | { name: string | null }[] | null;
  salons?: { name: string | null; is_hidden?: boolean } | { name: string | null }[] | null;
};

/**
 * 写メ日記の一覧。allSalons=true（デモ）なら全店・falseなら自店のみ。
 * 画像なし日記はサムネイルにできないため除外（多めに取得して間引く。埋め込みと同じ作法）。
 */
export async function fetchHpDiaryItems(salonId: number, allSalons: boolean): Promise<HpDiaryItem[]> {
  const supabase = createPublicClient();
  let query = supabase
    .from('diary_posts')
    .select(
      allSalons
        ? 'id, images, title, therapists!inner(name, is_active), salons!inner(name, is_hidden)'
        : 'id, images, title, therapists!inner(name, is_active)',
    )
    .eq('therapists.is_active', true)
    .order('created_at', { ascending: false })
    .limit(HP_DIARY_PAGE_LIMIT * 3);
  query = allSalons ? query.eq('salons.is_hidden', false) : query.eq('salon_id', salonId);

  const { data } = await query;
  return ((data ?? []) as unknown as DiaryRow[])
    .map((r) => {
      const t = Array.isArray(r.therapists) ? r.therapists[0] : r.therapists;
      const s = Array.isArray(r.salons) ? r.salons[0] : r.salons;
      return {
        id:            String(r.id),
        image:         (r.images ?? [])[0] ?? '',
        title:         r.title ?? '',
        therapistName: t?.name ?? '',
        ...(allSalons && s?.name ? { salonName: s.name } : {}),
      };
    })
    .filter((e) => e.image !== '')
    .slice(0, HP_DIARY_PAGE_LIMIT);
}

/**
 * 口コミの一覧（承認済み・新しい順）。allSalons=true（デモ）なら全店・falseなら自店のみ。
 * 全店モードは salonName 付き（lib/reviews.ts の getAllApprovedReviews がそのまま返す）。
 */
export async function fetchHpReviews(salonId: number, allSalons: boolean): Promise<ApprovedReview[]> {
  const reviews = allSalons
    ? await getAllApprovedReviews(HP_VOICE_PAGE_LIMIT)
    : await getSalonApprovedReviews(salonId);
  return reviews.slice(0, HP_VOICE_PAGE_LIMIT);
}
