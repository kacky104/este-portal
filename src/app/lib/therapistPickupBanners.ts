import { createPublicClient } from '@/app/lib/supabase/public';

// トップ＋全エリアページのサロン一覧中（20枚目直下）に表示する「セラピストピックアップ枠」。
// 公開ページ専用のため anon（createPublicClient）で読む＝cookie を触らないので ISR（revalidate）が有効。
// RLS の公開SELECT（is_active=true）で守られるが、多重防御としてクエリ側でも .eq('is_active', true) を明示する。
//
// リンク解決の優先順位：link_url があればそれ、無ければ（従来互換で）linkable な therapist_id から
// /therapist/{id}、どちらも無ければ非リンク。link_url 運用へ移行したため therapist_id は任意（nullable）。
// 非公開（anon の RLS で therapists が返らない）セラピストはリンクを張らず画像のみにフォールバックする。
// ※ therapists.id は integer。
export type TherapistPickupBanner = {
  id: string;
  imageUrl: string;   // admin アップロード画像
  altText: string;
  linkUrl: string | null;       // 手動入力のリンク先URL（相対 /... または https:// 絶対）。優先。
  therapistId: number | null;   // 旧運用の紐づけ（link_url が無いときのフォールバック元）
  linkable: boolean;            // therapist_id が anon 取得可（公開中）＝ /therapist/{id} を張れる
};

export async function fetchActiveTherapistPickupBanners(): Promise<TherapistPickupBanner[]> {
  const supabase = createPublicClient();

  const { data: bannerRows } = await supabase
    .from('therapist_pickup_banners')
    .select('id, image_url, alt_text, therapist_id, link_url, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // image_url は NOT NULL 前提だが、防御的に空URLは除外（未設定行で表示が割れないように）。
  const banners = (bannerRows ?? [])
    .map((r) => ({
      id: String(r.id),
      imageUrl: (r.image_url as string | null) ?? '',
      altText: (r.alt_text as string | null) ?? '',
      linkUrl: ((r.link_url as string | null) ?? '').trim() || null,
      therapistId: r.therapist_id != null ? Number(r.therapist_id) : null,
    }))
    .filter((b) => b.imageUrl !== '');

  if (banners.length === 0) return [];

  // link_url が無い（従来運用）行のフォールバック用に、紐づくセラピストが anon で取得できるものだけ
  // リンク有効にする（非公開はリンクなし画像のみ）。link_url 運用の行では therapist_id は不要。
  const therapistIds = [...new Set(
    banners.map((b) => b.therapistId).filter((id): id is number => id != null),
  )];
  let linkableSet = new Set<number>();
  if (therapistIds.length > 0) {
    const { data: therapistData } = await supabase
      .from('therapists')
      .select('id')
      .in('id', therapistIds);
    linkableSet = new Set((therapistData ?? []).map((t) => Number(t.id)));
  }

  // display_order の順を維持（表示側でランダム1枚を抽選する）。
  return banners.map((b) => ({
    id: b.id,
    imageUrl: b.imageUrl,
    altText: b.altText,
    linkUrl: b.linkUrl,
    therapistId: b.therapistId,
    linkable: b.therapistId != null && linkableSet.has(b.therapistId),
  }));
}
