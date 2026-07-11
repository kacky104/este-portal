import Link from 'next/link';
import type { Metadata } from 'next';

// fukuX プライバシーポリシー（フクエス本体プライバシーポリシーの特則）。静的コンテンツのみ・データ取得なし。
// レイアウト（XHeader・x-bg・テーマ）は /x レイアウトを継承。
export const metadata: Metadata = {
  title: 'fukuXプライバシーポリシー｜fukuX(フクエックス)',
  description: '福岡メンズエステ専用SNS「fukuX(フクエックス)」における個人情報の取り扱い（フクエスプライバシーポリシーの特則）です。',
  alternates: { canonical: '/x/privacy' },
};

// 見出し・本文のスタイルはテーマ変数（x-theme.css）参照＝グラデ/白テーマ両対応。
const H2 = 'text-base font-bold text-[color:var(--x-text-primary)] mt-6 mb-2';
const P = 'text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const OL = 'list-decimal pl-5 space-y-1.5 text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const UL = 'list-disc pl-5 space-y-1 text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const A = 'text-[color:var(--x-accent)] hover:underline';

export default function XPrivacyPage() {
  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-bold text-[color:var(--x-text-primary)] mb-4">fukuXプライバシーポリシー</h1>

      <p className={P}>
        フクエス運営事務局（以下「当事務局」）は、SNSサービス「fukuX（フクエックス）」（以下「fukuX」）における個人情報等の取り扱いについて、
        <Link href="/privacy" className={A}>フクエスプライバシーポリシー</Link>
        （以下「本体ポリシー」）の特則として、以下のとおり定めます。ここに定めのない事項は本体ポリシーに従います。
      </p>

      <h2 className={H2}>1. fukuXで取得する情報</h2>
      <p className={`${P} mb-2`}>
        当事務局は、本体ポリシーに定める情報のほか、fukuXの提供にあたり以下の情報を取得します。
      </p>
      <ul className={UL}>
        <li>アカウント情報（ハンドル、表示名、自己紹介、アバター画像、ヘッダー画像、アカウント種別、地域、出勤スケジュール等）</li>
        <li>投稿・ストーリー・画像等の投稿内容</li>
        <li>フォロー、スキ（いいね）、リポスト、保存等の利用状況</li>
        <li>DM・求人オファーで送受信されるメッセージの内容</li>
        <li>所属申請・承認に関する情報（セラピストと店舗の所属関係）</li>
      </ul>

      <h2 className={H2}>2. 情報の公開範囲</h2>
      <ol className={OL}>
        <li>プロフィール（アバター・自己紹介・地域・所属等）、投稿、フォロー・フォロワーの関係、スキ等の反応は、fukuX上で公開され、ログインしていない方や検索エンジンからも閲覧できます。公開を望まない情報は登録・投稿しないでください。</li>
        <li>ストーリーは投稿から24時間で公開終了となります。ただし、閲覧者による保存（スクリーンショット等）を防止することはできません。</li>
        <li>DM・求人オファーの内容は、送受信の当事者のみが閲覧できます。ただし、利用規約違反が疑われる場合、法令に基づく場合等には、当事務局が必要な範囲で内容を確認することがあります。</li>
      </ol>

      <h2 className={H2}>3. 利用目的の追加</h2>
      <p className={`${P} mb-2`}>
        fukuXで取得した情報は、本体ポリシーに定める目的のほか、以下の目的で利用します。
      </p>
      <ol className={OL}>
        <li>タイムライン・プロフィール・通知等、fukuXの各機能の提供のため</li>
        <li>フォロー関係・利用状況に基づく表示内容の調整のため</li>
        <li>
          利用規約（<Link href="/x/terms" className={A}>fukuX利用規約</Link>を含む）に違反する行為への対応、不正利用の防止のため
        </li>
      </ol>

      <h2 className={H2}>4. 削除後のデータについて</h2>
      <p className={P}>
        投稿・ストーリー・アカウントを削除した場合でも、バックアップ等の技術的な理由により、システム上のデータが一定期間残ることがあります。また、削除前に第三者により複製・保存された内容について、当事務局は責任を負いません。
      </p>

      <h2 className={H2}>5. お問い合わせ窓口</h2>
      <p className={P}>
        fukuXにおける個人情報の取り扱いに関するお問い合わせ先：
      </p>
      <p className={`${P} mt-1`}>
        フクエス運営事務局<br />
        メール：<a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
      </p>

      <div className="mt-8 text-xs text-[color:var(--x-text-muted)] leading-relaxed">
        <p>制定日：2026年7月11日</p>
        <p>フクエス運営事務局</p>
      </div>

      <div className="mt-4 pt-4 border-t border-[color:var(--x-border)] text-xs">
        <Link href="/x/terms" className={A}>fukuX利用規約</Link>
        <span className="mx-2 text-[color:var(--x-text-muted)]">｜</span>
        <Link href="/privacy" className={A}>フクエスプライバシーポリシー（本体）</Link>
      </div>
    </div>
  );
}
