import Link from 'next/link';
import type { Metadata } from 'next';

// フクエスワーク プライバシーポリシー（フクエス本体プライバシーポリシーの特則）。
// fukuX版 /x/privacy と同じ「特則」構成。ヘッダー・フッターは /jobs レイアウトを継承。
export const metadata: Metadata = {
  title: 'フクエスワークプライバシーポリシー',
  description: '福岡メンズエステのセラピスト求人サイト「フクエスワーク」における個人情報の取り扱い（フクエスプライバシーポリシーの特則）です。',
  alternates: { canonical: '/jobs/privacy' },
};

const H2 = 'text-base font-bold text-slate-800 mt-6 mb-2';
const P = 'text-sm text-slate-600 leading-relaxed';
const OL = 'list-decimal pl-5 space-y-1.5 text-sm text-slate-600 leading-relaxed';
const UL = 'list-disc pl-5 space-y-1 text-sm text-slate-600 leading-relaxed';
const A = 'hover:underline';
const ACCENT = { color: '#059669' };

export default function JobsPrivacyPage() {
  return (
    <main className="max-w-3xl mx-auto px-4">
      <div className="my-6 p-6 rounded-2xl bg-white border shadow-sm" style={{ borderColor: '#D6EFE0' }}>
        <h1 className="text-xl font-bold text-slate-900 mb-4">フクエスワークプライバシーポリシー</h1>

        <p className={P}>
          フクエス運営事務局（以下「当事務局」）は、求人情報サービス「フクエスワーク」（以下「本サービス」）における個人情報等の取り扱いについて、
          <Link href="/privacy" className={A} style={ACCENT}>フクエスプライバシーポリシー</Link>
          （以下「本体ポリシー」）の特則として、以下のとおり定めます。ここに定めのない事項は本体ポリシーに従います。
        </p>

        <h2 className={H2}>1. 本サービスで取得する情報</h2>
        <p className={`${P} mb-2`}>
          当事務局は、本体ポリシーに定める情報のほか、本サービスの提供にあたり以下の情報を取得します。
        </p>
        <ul className={UL}>
          <li>応募フォームに入力された情報（お名前、電話番号、年齢（任意）、メッセージ（任意）、応募先求人・店舗）</li>
          <li>応募日時等、応募に関する記録</li>
        </ul>

        <h2 className={H2}>2. 利用目的</h2>
        <p className={`${P} mb-2`}>
          本サービスで取得した情報は、本体ポリシーに定める目的のほか、以下の目的で利用します。
        </p>
        <ol className={OL}>
          <li>応募内容を応募先店舗へ取り次ぐため</li>
          <li>応募に関する確認・連絡のため</li>
          <li>いたずら応募・なりすまし等の不正利用の防止のため</li>
        </ol>

        <h2 className={H2}>3. 応募情報の店舗への提供</h2>
        <ol className={OL}>
          <li>応募フォームに入力された情報は、<span className="font-bold text-slate-800">応募先店舗に提供されます</span>。応募後の連絡（電話等）は店舗から直接行われます。</li>
          <li>店舗に提供された応募情報は、当該店舗の責任において管理されます。応募後の取り扱いについては応募先店舗にお問い合わせください。</li>
          <li>前各号のほか、当事務局が応募情報を第三者に提供する場合は、本体ポリシーの定めに従います。</li>
        </ol>

        <h2 className={H2}>4. 応募情報の保管</h2>
        <p className={P}>
          当事務局は、応募情報を取次ぎ・不正防止等の目的に必要な期間に限り保管し、不要となった情報は適切な方法で削除します。
        </p>

        <h2 className={H2}>5. お問い合わせ窓口</h2>
        <p className={P}>
          本サービスにおける個人情報の取り扱いに関するお問い合わせ先：
        </p>
        <p className={`${P} mt-1`}>
          フクエス運営事務局<br />
          メール：<a href="mailto:info@fukues.com" className={A} style={ACCENT}>info@fukues.com</a>
        </p>

        <div className="mt-8 text-xs text-slate-400 leading-relaxed">
          <p>制定日：2026年7月12日</p>
          <p>フクエス運営事務局</p>
        </div>

        <div className="mt-4 pt-4 border-t text-xs" style={{ borderColor: '#D6EFE0' }}>
          <Link href="/jobs/terms" className={A} style={ACCENT}>フクエスワーク利用規約</Link>
          <span className="mx-2 text-slate-300">｜</span>
          <Link href="/privacy" className={A} style={ACCENT}>フクエスプライバシーポリシー（本体）</Link>
        </div>
      </div>
    </main>
  );
}
