import { DiaryEmbed, MAX_ITEMS } from './DiaryEmbed';
import type { Metadata } from 'next';

// 契約店舗の公式サイトに iframe で貼る「写メ日記」埋め込みウィジェット（2026-08-06 新設）。
//
// - 3列×4段＝最大12件のサムネイルグリッド。クリックでフクエスの日記詳細
//   （/diary/[id]?from=salon）を新しいタブで開く。
// - 埋め込み先のデザインがバラバラなため白基調ニュートラル（サイトのピンクはリンク程度）。
// - ヘッダー/フッターなどサイト共通UIは載せない軽量ページ。リンクは必ず絶対URL＋
//   target="_blank"（iframe 内で相対リンクを踏むと枠の中でフクエスが開いてしまうため）。
// - 画像なし日記（テキストのみ）はサムネイルにできないため除外（多めに取得して間引く）。
// - 退店セラピスト（is_active=false）の日記は出さない（店舗の公式サイトに載る前提のため。
//   本体の /salon/[id]/diary は退店分も出す仕様なので、あえて非対称にしている）。
// - 埋め込みタグの発行は mypage の「運営事務局 → 公式サイトに貼る」（EmbedCodePanel）。
// - iframe 許可（frame-ancestors）は next.config.ts の headers() で /embed/ 配下のみ全ドメイン許可。

export const revalidate = 600;
export async function generateStaticParams() {
  return [];
}

// 検索結果に断片ページが出ないよう noindex（本体の /salon/[id]/diary が正規ページ）。
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

export default async function EmbedSalonDiaryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DiaryEmbed id={id} max={MAX_ITEMS} />;
}
