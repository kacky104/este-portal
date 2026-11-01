import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { buildHpMetadata, HP_NOT_PUBLIC_METADATA } from '@/app/hp/_lib/meta';
import { HpContactView, isHpContactOpen } from '@/app/hp/_templates/subpages';

// お問い合わせページ（第1717便・2026-11-02・カッキーさん）。
//
// - URL: 独自ドメインなら /contact、暫定URLなら /hp/{slug}/contact
// - 出る条件: status=live × blocks.contact.on（店舗が ホームページ管理 → お問い合わせ で ON にし、通知先メールを入れた店）。
//   ★ multipage は見ない（1ページ構成でも出す）。
// - フォームの送信は actions/hpContact.ts（service_role で hp_contacts に控えを残し、通知先へ Resend で送る）。
// - ページ自体はサーバーが描く（本文＝案内文とフォーム）ので index 可・sitemap にも載せる。
// - ★ ページの中身は _templates/subpages.tsx（他の下層ページと同じ場所）。

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpContactOpen(data)) return HP_NOT_PUBLIC_METADATA;
  const { salon } = data;
  return buildHpMetadata(data, slug, {
    title: `お問い合わせ｜${salon.name}`,
    description: `${salon.name}（${salon.area}）へのお問い合わせフォームです。施術内容・求人・ご予約などお気軽にお問い合わせください。`,
    path: '/contact',
  });
}

export default async function HpContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await fetchHpPageData(slug);
  if (!data || !isHpContactOpen(data)) notFound();
  return <HpContactView data={data} />;
}
