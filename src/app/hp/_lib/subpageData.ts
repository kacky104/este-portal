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
import { createServiceClient } from '@/app/lib/supabase/service';
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

// ── セラピスト個別ページの写メ日記（2026-08-20 第25便）──────
//
// その子の日記だけを新しい順で取る。表示条件は店の /diary と同じ「画像がある日記のみ」
// （サムネイルにできないため。多めに取得して間引く作法も fetchHpDiaryItems と同じ）。
// 「全部見る」の行き先はフクエス本体の /therapist/{id}/diary。

export const HP_THERAPIST_DIARY_LIMIT = 6; // 3列×2段ぶん。続きは本体へ
export const HP_THERAPIST_VOICE_LIMIT = 3; // 口コミは最新3件。続きは本体へ

export async function fetchHpTherapistDiaryItems(therapistId: string): Promise<HpDiaryItem[]> {
  const supabase = createPublicClient();
  const { data } = await supabase
    .from('diary_posts')
    .select('id, images, title')
    .eq('therapist_id', Number(therapistId))
    .order('created_at', { ascending: false })
    .limit(HP_THERAPIST_DIARY_LIMIT * 3);
  return ((data ?? []) as { id: number | string; images: string[] | null; title: string | null }[])
    .map((r) => ({
      id:            String(r.id),
      image:         (r.images ?? [])[0] ?? '',
      title:         r.title ?? '',
      therapistName: '', // 本人のページなので名前は出さない（呼び出し側も使わない）
    }))
    .filter((e) => e.image !== '')
    .slice(0, HP_THERAPIST_DIARY_LIMIT);
}

// ── セラピスト個別ページ（2026-08-20 第25便）────────────────
//
// HpPageData の therapists には一覧用の項目しか無い（プロフィール文と複数写真が無い）。
// 個別ページで足りないその2つだけをここで追加取得する。
//
// ★ 呼び出し前に「そのセラピストが data.therapists に居るか」を必ず確認すること
//   （page.tsx がやっている）。ここで id を直接引くため、確認せずに呼ぶと
//   URLに数字以外を入れられたとき Postgres の型エラー＝500 になり得る。
// ★ demo=true はデモ店（slug='demo'）専用。デモ用サロンは is_hidden=true のため
//   anon では引けない可能性があり、data.ts と同じ作法で service_role に切り替える。

export type HpTherapistDetail = {
  /** プロフィール文（無ければ空文字） */
  profileText: string;
  /** 写真（profile_images 優先・無ければメイン写真1枚・それも無ければ空配列） */
  images: string[];
};

export async function fetchHpTherapistDetail(
  salonId: number,
  therapistId: string,
  opts?: { demo?: boolean },
): Promise<HpTherapistDetail | null> {
  const supabase = opts?.demo ? createServiceClient() : createPublicClient();
  const { data, error } = await supabase
    .from('therapists')
    .select('id, salon_id, is_active, profile_text, profile_images, profile_image_url')
    .eq('id', therapistId)
    .maybeSingle();
  // ★ エラーは握りつぶさず投げる（data.ts と同じ理由。null で返すと 404 が
  //   ISRキャッシュに焼き付き、原因を直しても最大10分 404 のままになる）。
  if (error) throw new Error(`therapists の取得に失敗: ${error.message}`);
  if (!data) return null;
  // 他店のセラピスト・退店済みは404にする（URLの id を差し替えられても他店の情報は出さない）
  if (Number(data.salon_id) !== salonId || data.is_active === false) return null;

  const extra = Array.isArray(data.profile_images)
    ? (data.profile_images as unknown[]).map((u) => String(u ?? '')).filter((u) => u !== '')
    : [];
  const main = (data.profile_image_url as string | null) ?? null;
  const images = extra.length > 0 ? extra : main ? [main] : [];
  return {
    profileText: ((data.profile_text as string | null) ?? '').trim(),
    images,
  };
}
