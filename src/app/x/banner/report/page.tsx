import Link from 'next/link';
import type { Metadata } from 'next';
import { XBannerReportForm } from './XBannerReportForm';

// リンクバナー設置報告フォーム。未ログインでも送信可（送信は Server Action 経由・service_role で保存）。
// 入力フォームのため検索インデックス対象外（案内は /x/banner が担う）。
export const metadata: Metadata = {
  title: 'リンクバナー設置のご報告｜fukuX(フクエックス)',
  robots: { index: false, follow: false },
};

export default function XBannerReportPage() {
  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-bold text-[color:var(--x-text-primary)] mb-4">リンクバナー設置のご報告</h1>

      <p className="text-sm text-[color:var(--x-text-secondary)] leading-relaxed mb-1">
        貴サイトへの
        <Link href="/x/banner" className="text-[color:var(--x-accent)] hover:underline">リンクバナー</Link>
        設置ありがとうございます。下記フォームからご報告ください。運営が設置を確認のうえ、特典（fukuXはお店カード画像の追加枠）を開放し、ご記入のメールアドレスへご連絡します。
      </p>
      <p className="text-xs text-[color:var(--x-text-muted)] leading-relaxed mb-5">
        確認には数日いただく場合があります。
      </p>

      <XBannerReportForm />
    </div>
  );
}
