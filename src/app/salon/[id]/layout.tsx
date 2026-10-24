import { createPublicClient } from '@/app/lib/supabase/public';
import { SalonSubpageCtaBar } from './SalonCtaBar';
import { isSalonBookable } from './salonBookable';

// ★ 第1625便: 店舗詳細から繋がるページ（セラピスト一覧・料金・出勤・口コミ・写メ日記・お知らせ…）にも
//   画面下の追従バナー（ネット予約・電話をする・LINE予約）を出す。
//   ・店舗詳細そのもの・ネット予約・口コミ投稿のページでは SalonSubpageCtaBar 側で出さない。
//   ・無料掲載・非表示・存在しない店舗はバナーを出さない（ページ本体の 404 などはそのまま）。
//   ・読むだけ（列追加なし）。ISR は各ページの revalidate に従う。
export default async function SalonLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const salonId = Number(id);
  let bar: React.ReactNode = null;

  if (Number.isInteger(salonId) && salonId > 0) {
    const supabase = createPublicClient();
    const { data: row } = await supabase
      .from('salons')
      .select('phone, line_url, booking_enabled, booking_courses, listing_plan, is_hidden')
      .eq('id', salonId)
      .maybeSingle();
    if (row && !row.is_hidden && row.listing_plan !== 'free') {
      bar = (
        <SalonSubpageCtaBar
          salonId={salonId}
          phone={(row.phone as string | null) || null}
          lineUrl={(row.line_url as string | null) || null}
          bookable={isSalonBookable(row.booking_enabled, row.booking_courses)}
        />
      );
    }
  }

  return (
    <>
      {children}
      {bar}
    </>
  );
}
