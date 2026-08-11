import type { Metadata } from 'next';
import { HpTemplate } from '@/app/hp/_templates/HpTemplate';
import { buildHpPreview, HpPreviewFrame } from './previewShared';

// デザインの【実物プレビュー】（2026-08-09 → 2026-08-11 下層ページ対応）。
//
// /hp/{key}/preview/{template}/{color} で、その店の実データ（セラピスト・出勤・料金 …）が
// 入った公開ページを、指定のひな形×カラーでそのまま描画する。DBには何も書かない。
// 掲載データから中身が自動で埋まるうちの方式だからできる芸当で、ここが vootec との差。
//
// 用途は2つ:
//  1. デモ（key = HP_DEMO_SLUG）… デザイン一覧（/hp/templates）から誰でも見られる。
//     運営が用意したサンプル店舗で全パターンを見せ、契約店舗と会話でデザインを決める。
//  2. 契約店舗の実データでの確認 … 管理画面と同じ認可（運営/オーナー/HP管理者）。
//     運営が設定を確定する前の最終確認に使う。第三者には 404。
//     draft の店でも本人はプレビューできる（公開ページの status ゲートは通らない）。
//
// ★ 下層ページ（/therapist など）へのリンクもプレビューの中に閉じる。
//   認可・データ組み立て・バナーは previewShared.tsx に集約（同フォルダの [page] と共用）。
// - force-dynamic: ログイン判定に cookie を読むため。ISR には乗せない（公開ページ側は従来どおり）。
// - 店舗ドメイン経由でも proxy.ts の rewrite でそのまま届く（/preview/... → /hp/{ドメイン}/preview/...）。

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'デザインプレビュー',
  robots: { index: false, follow: false },
};

export default async function HpPreviewPage({
  params,
}: {
  params: Promise<{ slug: string; template: string; color: string }>;
}) {
  const { slug, template, color } = await params;
  const { data, backHref, backLabel, bannerText } = await buildHpPreview(slug, template, color);

  return (
    <HpPreviewFrame bannerText={bannerText} backHref={backHref} backLabel={backLabel}>
      <HpTemplate data={data} />
    </HpPreviewFrame>
  );
}
