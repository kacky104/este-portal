import { notFound } from 'next/navigation';
import { getXContext } from '../xProfile';
import { fetchOfferTherapists } from '../xOffers';
import { XOffers } from './XOffers';

// 閲覧者（認証済みshop・official）依存＋ログインゲートのため動的レンダリング。
export const dynamic = 'force-dynamic';

const OFFERS_DISABLED = true;

// ログインゲートありだが明示的に noindex,nofollow。sitemap 追加不要。
export const metadata = {
  title: 'オファー｜fukuX',
  robots: { index: false, follow: false },
};

export default async function XOffersPage() {
  // ★ 第1649便（2026-10-24・カッキーさん）: fukuX の求人オファー機能をなくした。ページは誰が開いても 404。
  //   中身（下）は戻すときのために残してある。
  if (OFFERS_DISABLED) notFound();
  const { profile } = await getXContext();

  // 閲覧ゲート: 認証済みshop または official のみ。それ以外（user/therapist/未認証shop/未ログイン）は notFound。
  const canView =
    !!profile && (profile.kind === 'official' || (profile.kind === 'shop' && profile.is_verified));
  if (!canView) notFound();

  const therapists = await fetchOfferTherapists();

  return <XOffers therapists={therapists} />;
}
