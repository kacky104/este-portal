import { createPublicClient } from '@/app/lib/supabase/public';
import { getBusinessDateJST } from '@/lib/dutyStatus';

// トップのサロン一覧中（15枚目直下）に表示する「おすすめサロンバナー」。公開ページ専用のため anon
// （createPublicClient）で読む＝cookie を触らないので ISR（revalidate）が有効。RLS の公開SELECT
// （is_active=true）で守られるが、多重防御としてクエリ側でも .eq('is_active', true) を明示する。
//
// 各バナーは salon_id 必須（DBの NOT NULL）。表示側でピックアップと同一のオーバーレイ
// （サロン名・セラピスト丸アイコン・地域バッジ・詳細ボタン）を重ねるため、紐づくサロン情報を併せて取得する。
// 非公開（is_hidden=true）サロンは anon の RLS で salons が返らない → salonName='' のままにして
// 表示側で「画像のみ（オーバーレイなし）」にフォールバックさせる（落とさない）。
export type RecommendedSalonBanner = {
  id: string;
  imageUrl: string;   // admin アップロード画像（オーバーレイの背景）
  altText: string;
  salonId: number;
  // ── オーバーレイ用（サロンが公開中＝anon 取得可のときのみ埋まる。空なら画像のみフォールバック） ──
  salonName: string;
  area: string;
  therapistImages: string[];
};

export async function fetchActiveRecommendedSalonBanners(): Promise<RecommendedSalonBanner[]> {
  const supabase = createPublicClient();
  const todayJST = getBusinessDateJST();

  const { data: bannerRows } = await supabase
    .from('recommended_salon_banners')
    .select('id, image_url, alt_text, salon_id, display_order')
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  // image_url は NOT NULL 前提だが、防御的に空URLは除外（未設定行で公開スライダーが割れないように）。
  const banners = (bannerRows ?? [])
    .map((r) => ({
      id: String(r.id),
      imageUrl: (r.image_url as string | null) ?? '',
      altText: (r.alt_text as string | null) ?? '',
      salonId: Number(r.salon_id),
    }))
    .filter((b) => b.imageUrl !== '');

  if (banners.length === 0) return [];

  const salonIds = [...new Set(banners.map((b) => b.salonId))];

  const [{ data: salonData }, { data: therapistData }] = await Promise.all([
    supabase.from('salons').select('id, name, area').in('id', salonIds),
    supabase
      .from('therapists')
      .select('id, salon_id, profile_image_url')
      .in('salon_id', salonIds)
      .not('profile_image_url', 'is', null),
  ]);

  // 本日出勤セット（出勤中セラピストのサムネイルを前に並べるため。ピックアップと同ロジック）。
  const therapistIds = (therapistData ?? []).map((t) => t.id);
  let onDutySet = new Set<unknown>();
  if (therapistIds.length > 0) {
    const { data: schedData } = await supabase
      .from('therapist_schedules')
      .select('therapist_id')
      .in('therapist_id', therapistIds)
      .eq('schedule_date', todayJST)
      .eq('is_active', true);
    onDutySet = new Set((schedData ?? []).map((r) => r.therapist_id));
  }

  const salonInfoMap = Object.fromEntries((salonData ?? []).map((s) => [s.id as number, s]));

  const therapistImagesFor = (salonId: number): string[] =>
    [...(therapistData ?? []).filter((t) => (t.salon_id as number) === salonId)]
      .sort((a, b) => (onDutySet.has(a.id) ? 0 : 1) - (onDutySet.has(b.id) ? 0 : 1))
      .map((t) => t.profile_image_url as string | null)
      .filter((u): u is string => Boolean(u))
      .slice(0, 4);

  // display_order の順を維持（表示側でのシャッフルは行わない＝admin の並び順を尊重）。
  return banners.map((b) => {
    const s = salonInfoMap[b.salonId];
    // サロンが anon で取得不可（非公開）＝salonName='' のまま → 表示側で画像のみにフォールバック。
    return {
      id: b.id,
      imageUrl: b.imageUrl,
      altText: b.altText,
      salonId: b.salonId,
      salonName: s ? ((s.name as string) ?? '') : '',
      area: s ? ((s.area as string) ?? '') : '',
      therapistImages: s ? therapistImagesFor(b.salonId) : [],
    };
  });
}
