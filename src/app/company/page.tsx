import type { Metadata } from 'next';
import { Logo } from '@/app/components/Logo';
import { SiteFooter } from '@/app/components/SiteFooter';

// 運営会社（2026-10-23・Twilio の事業者審査で「会社名とサイトの関連付け」を示すためのページ）。
// サイト内からはリンクしない・noindex・sitemap に入れない。審査が通った後も消さずに置いておく
// （承認後の見直しで会社名が見つからないと番号停止のおそれがあるため）。
export const metadata: Metadata = {
  title: '運営会社｜フクエス',
  robots: { index: false, follow: false },
  alternates: { canonical: '/company' },
};

const ROWS: { label: string; value: React.ReactNode }[] = [
  { label: '会社名', value: 'うさぎのひとやすみ合同会社' },
  { label: '法人番号', value: '8290003017410' },
  { label: '運営サイト', value: 'フクエス（https://fukues.com）／フクエスワーク（https://fukues.com/jobs）／fukuX（https://fukues.com/x）' },
  {
    label: 'メール',
    value: (
      <a href="mailto:info@fukues.com" className="text-pink-600 hover:underline">
        info@fukues.com
      </a>
    ),
  },
];

export default function CompanyPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center">
          <Logo />
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-900 mb-6">運営会社</h1>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-slate-100">
              {ROWS.map((r) => (
                <tr key={r.label}>
                  <th className="w-32 bg-slate-50 px-4 py-3 text-left font-medium text-slate-500 align-top">{r.label}</th>
                  <td className="px-4 py-3 text-slate-700 break-all">{r.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-6 text-xs text-slate-500 leading-relaxed">
          Operated by うさぎのひとやすみ合同会社 (Corporate Number: 8290003017410). Contact: info@fukues.com
        </p>
      </main>

      <SiteFooter inner="max-w-3xl" />
    </div>
  );
}
