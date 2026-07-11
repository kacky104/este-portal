import Link from 'next/link';
import type { Metadata } from 'next';

// fukuX 利用規約（フクエス本体利用規約の特則）。静的コンテンツのみ・データ取得なし。
// レイアウト（XHeader・x-bg・テーマ）は /x レイアウトを継承。
export const metadata: Metadata = {
  title: 'fukuX利用規約｜fukuX(フクエックス)',
  description: '福岡メンズエステ専用SNS「fukuX(フクエックス)」の利用規約（フクエス利用規約の特則）です。',
  alternates: { canonical: '/x/terms' },
};

// 見出し・本文のスタイルはテーマ変数（x-theme.css）参照＝グラデ/白テーマ両対応。
const H2 = 'text-base font-bold text-[color:var(--x-text-primary)] mt-6 mb-2';
const P = 'text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const OL = 'list-decimal pl-5 space-y-1.5 text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const A = 'text-[color:var(--x-accent)] hover:underline';

export default function XTermsPage() {
  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-bold text-[color:var(--x-text-primary)] mb-4">fukuX利用規約</h1>

      <p className={P}>
        本規約（以下「fukuX特則」）は、フクエス運営事務局（以下「当事務局」）が提供するSNSサービス「fukuX（フクエックス）」（以下「fukuX」）の利用条件を、
        <Link href="/terms" className={A}>フクエス利用規約</Link>
        （以下「本体規約」）の特則として定めるものです。ユーザーは、fukuXを利用することにより、fukuX特則および本体規約に同意したものとみなします。
      </p>

      <h2 className={H2}>第1条（適用）</h2>
      <ol className={OL}>
        <li>fukuXの利用には、本体規約およびfukuX特則が適用されます。</li>
        <li>fukuX特則と本体規約の内容が異なる場合、fukuXの利用に関してはfukuX特則が優先して適用されます。</li>
      </ol>

      <h2 className={H2}>第2条（サービス内容）</h2>
      <p className={P}>
        fukuXは、福岡のメンズエステに関する情報交流を目的としたSNSです。投稿・画像の共有、ストーリー、フォロー、スキ（いいね）、リポスト、保存、ダイレクトメッセージ（以下「DM」）、求人オファー等の機能を提供します。機能の内容は予告なく追加・変更されることがあります。
      </p>

      <h2 className={H2}>第3条（アカウント種別）</h2>
      <ol className={OL}>
        <li>fukuXのアカウントには「ユーザー」「セラピスト」「お店」「運営」の種別があります。登録時には事実に基づいた種別を選択するものとし、虚偽の種別での登録を禁止します。</li>
        <li>「お店」アカウントの掲載および認証バッジの付与は、当事務局の審査・承認によります。当事務局は、審査基準および結果の理由を開示する義務を負いません。</li>
        <li>認証バッジは、当事務局が必要と判断した場合、事前の通知なく取り消すことがあります。</li>
      </ol>

      <h2 className={H2}>第4条（所属関係）</h2>
      <ol className={OL}>
        <li>セラピストアカウントは、実際に在籍する店舗に対してのみ所属申請を行うことができます。虚偽の所属申請・承認を禁止します。</li>
        <li>所属関係は、退店等の実態に合わせて速やかに解除するものとします。</li>
      </ol>

      <h2 className={H2}>第5条（投稿コンテンツ）</h2>
      <ol className={OL}>
        <li>投稿・ストーリー・画像等の投稿コンテンツの取り扱い（著作権の帰属、当事務局への利用許諾、削除等）は、本体規約第6条に従います。</li>
        <li>ストーリーは、投稿から24時間経過後に自動的に公開終了となります。ただし、システム上のデータが直ちに消去されることを保証するものではありません。</li>
        <li>他人が撮影・作成した画像等を、権利者の許諾なく投稿してはなりません。</li>
      </ol>

      <h2 className={H2}>第6条（禁止事項）</h2>
      <p className={`${P} mb-2`}>
        ユーザーは、本体規約第5条に定める行為のほか、fukuXの利用にあたり以下の行為をしてはなりません。
      </p>
      <ol className={OL}>
        <li>他人（実在の店舗・セラピスト・第三者）になりすます行為</li>
        <li>規定外のサービスを求め、勧誘し、またはこれを示唆・助長する投稿やDM等の送信</li>
        <li>売春・買春その他法令に違反する行為の勧誘・あっせんにつながる利用</li>
        <li>出会い・交際等、fukuXの趣旨を逸脱した目的での利用</li>
        <li>無差別なフォロー・スキ・DM送信等のスパム行為、および無関係な宣伝・広告行為</li>
        <li>他のユーザーのプロフィール画像・投稿画像等を無断で転載・加工する行為</li>
        <li>DM・オファー等の非公開のやり取りを、相手の同意なく公開する行為</li>
      </ol>

      <h2 className={H2}>第7条（DM・求人オファー）</h2>
      <ol className={OL}>
        <li>DMおよび求人オファーは、ユーザー間の私的な通信です。その内容についてユーザー間で生じた紛争は当事者間で解決するものとし、当事務局は責任を負いません。</li>
        <li>当事務局は通信の秘密に配慮しますが、fukuX特則・本体規約への違反が疑われる場合、法令に基づく場合等には、必要な範囲でDM等の内容を確認することがあります。</li>
        <li>求人オファーは店舗からセラピストへの連絡機能であり、雇用条件等の合意は当事者間の責任で行うものとします。</li>
      </ol>

      <h2 className={H2}>第8条（投稿の削除・アカウントの凍結等）</h2>
      <p className={P}>
        当事務局は、ユーザーがfukuX特則または本体規約に違反した場合、事前の通知なく、投稿の削除、認証・承認の取消し、アカウントの凍結（非表示化）または削除の措置をとることができます。
      </p>

      <h2 className={H2}>第9条（免責）</h2>
      <p className={P}>
        fukuXに投稿される情報は各ユーザーが自らの責任で発信するものであり、当事務局はその正確性・最新性・適法性を保証しません。出勤情報・料金等は必ず各店舗に直接ご確認ください。
      </p>

      <h2 className={H2}>第10条（本体規約の準用）</h2>
      <p className={P}>
        fukuX特則に定めのない事項（利用資格、アカウント管理、サービスの変更・停止、規約の変更、準拠法・裁判管轄等）は、本体規約の定めに従います。
      </p>

      <div className="mt-8 text-xs text-[color:var(--x-text-muted)] leading-relaxed">
        <p>制定日：2026年7月11日</p>
        <p>フクエス運営事務局</p>
      </div>

      <div className="mt-4 pt-4 border-t border-[color:var(--x-border)] text-xs">
        <Link href="/x/privacy" className={A}>fukuXプライバシーポリシー</Link>
        <span className="mx-2 text-[color:var(--x-text-muted)]">｜</span>
        <Link href="/terms" className={A}>フクエス利用規約（本体）</Link>
      </div>
    </div>
  );
}
