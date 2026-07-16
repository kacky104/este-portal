import Link from 'next/link';
import type { Metadata } from 'next';

// フクエスワーク利用規約（フクエス本体利用規約の特則）。fukuX版 /x/terms と同じ「特則」構成。
// ヘッダー・フッターは /jobs レイアウトを継承。静的コンテンツのみ・データ取得なし。
const SITE_URL = 'https://fukues.com';
const PAGE_TITLE = 'フクエスワーク利用規約';
const PAGE_DESC = '福岡メンズエステのセラピスト求人サイト「フクエスワーク」の利用規約（フクエス利用規約の特則）です。';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: '/jobs/terms' },
  // openGraph/twitter を未定義のままだと layout のもの（og:title=ブランド名・og:url=/jobs）を丸ごと継承し、
  // シェア時にトップ扱いになるため、このページの title/url を明示する。
  // Next の metadata は浅いマージ＝layout の同キーを丸ごと上書きするため、画像・card 等もここで明示する。
  openGraph: {
    title: `${PAGE_TITLE}｜フクエスワーク`,
    description: PAGE_DESC,
    url: `${SITE_URL}/jobs/terms`,
    siteName: 'フクエスワーク',
    type: 'website',
    images: [{ url: `${SITE_URL}/ogp-fukuwork.png` }],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${PAGE_TITLE}｜フクエスワーク`,
    description: PAGE_DESC,
    images: [`${SITE_URL}/ogp-fukuwork.png`],
  },
};

const H2 = 'text-base font-bold text-slate-800 mt-6 mb-2';
const P = 'text-sm text-slate-600 leading-relaxed';
const OL = 'list-decimal pl-5 space-y-1.5 text-sm text-slate-600 leading-relaxed';
const A = 'hover:underline';
const ACCENT = { color: '#059669' };

export default function JobsTermsPage() {
  return (
    <main className="max-w-3xl mx-auto px-4">
      <div className="my-6 p-6 rounded-2xl bg-white border shadow-sm" style={{ borderColor: '#D6EFE0' }}>
        <h1 className="text-xl font-bold text-slate-900 mb-4">フクエスワーク利用規約</h1>

        <p className={P}>
          本規約（以下「ワーク特則」）は、フクエス運営事務局（以下「当事務局」）が提供する求人情報サービス「フクエスワーク」（以下「本サービス」）の利用条件を、
          <Link href="/terms" className={A} style={ACCENT}>フクエス利用規約</Link>
          （以下「本体規約」）の特則として定めるものです。ユーザーは、本サービスを利用することにより、ワーク特則および本体規約に同意したものとみなします。
        </p>

        <h2 className={H2}>第1条（適用）</h2>
        <ol className={OL}>
          <li>本サービスの利用には、本体規約およびワーク特則が適用されます。</li>
          <li>ワーク特則と本体規約の内容が異なる場合、本サービスの利用に関してはワーク特則が優先して適用されます。</li>
        </ol>

        <h2 className={H2}>第2条（サービス内容）</h2>
        <ol className={OL}>
          <li>本サービスは、福岡のメンズエステに関する求人情報の掲載・閲覧、応募フォームによる掲載店舗への連絡の取次ぎ、およびコラム等の情報提供を行うものです。</li>
          <li>本サービスは求人情報の掲載および取次ぎを行うものであり、当事務局は職業安定法上の職業紹介事業を行うものではなく、雇用契約・業務委託契約等の当事者またはあっせん者となるものではありません。</li>
        </ol>

        <h2 className={H2}>第3条（応募）</h2>
        <ol className={OL}>
          <li>応募フォームの送信は、応募内容を応募先店舗へ取り次ぐものです。応募後の連絡、面接、採用条件の協議・合意は、応募者と店舗との間で直接行われるものとします。</li>
          <li>応募にあたっては、氏名・年齢・連絡先等について真実かつ正確な情報を入力するものとします。</li>
          <li>本サービスからの応募は18歳以上（高校生を除く）の方に限ります。年齢等の応募資格の最終確認は各店舗が行います。</li>
          <li>応募の撤回・辞退をする場合は、応募先店舗へ速やかに連絡するものとします。</li>
        </ol>

        <h2 className={H2}>第4条（求人情報の内容）</h2>
        <ol className={OL}>
          <li>掲載される求人情報（給与例・待遇・勤務条件等）は各店舗の責任で提供されるものであり、当事務局はその正確性・最新性を保証しません。</li>
          <li>給与例・収入例は実績や条件に基づく一例であり、収入を保証するものではありません。実際の条件は必ず面接時等に店舗へ直接ご確認ください。</li>
        </ol>

        <h2 className={H2}>第5条（禁止事項）</h2>
        <p className={`${P} mb-2`}>
          ユーザーは、本体規約第5条に定める行為のほか、本サービスの利用にあたり以下の行為をしてはなりません。
        </p>
        <ol className={OL}>
          <li>虚偽の情報による応募、他人になりすました応募、いたずら目的の応募</li>
          <li>採用・就業の意思がないにもかかわらず、店舗の情報収集等を目的として応募する行為</li>
          <li>掲載店舗・応募者・第三者への誹謗中傷、迷惑行為</li>
          <li>掲載店舗の従業員の引き抜き、他サービスへの勧誘等、本サービスの趣旨を逸脱した目的での利用</li>
          <li>求人情報・掲載内容の無断転載・複製</li>
        </ol>

        <h2 className={H2}>第6条（免責）</h2>
        <ol className={OL}>
          <li>応募・面接・採用・就業に関して応募者と店舗との間で生じた紛争は、当事者間で解決するものとし、当事務局は責任を負いません。</li>
          <li>当事務局は、応募が店舗により閲覧されること、店舗から応募者へ連絡がなされること、および採用に至ることを保証しません。</li>
        </ol>

        <h2 className={H2}>第7条（本体規約の準用）</h2>
        <p className={P}>
          ワーク特則に定めのない事項（利用資格、サービスの変更・停止、規約の変更、準拠法・裁判管轄等）は、本体規約の定めに従います。
        </p>

        <div className="mt-8 text-xs text-slate-400 leading-relaxed">
          <p>制定日：2026年7月12日</p>
          <p>フクエス運営事務局</p>
        </div>

        <div className="mt-4 pt-4 border-t text-xs" style={{ borderColor: '#D6EFE0' }}>
          <Link href="/jobs/privacy" className={A} style={ACCENT}>フクエスワークプライバシーポリシー</Link>
          <span className="mx-2 text-slate-300">｜</span>
          <Link href="/terms" className={A} style={ACCENT}>フクエス利用規約（本体）</Link>
        </div>
      </div>
    </main>
  );
}
