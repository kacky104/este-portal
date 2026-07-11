import Link from 'next/link';
import type { Metadata } from 'next';

// 一般ユーザー向け使い方ガイド。静的コンテンツのみ・データ取得なし。
// ユーザー種別は「見る・応援する」専用（投稿・ストーリー投稿は不可）である点を明るいトーンで説明する。
// 数値は実装の定数と一致: @ID=3〜20字 / 表示名30字 / ストーリー24時間。
// フォローは therapist/shop/official に対してのみ可（ユーザー同士は不可）＝「推しをフォロー」の表現に留める。
export const metadata: Metadata = {
  title: 'ユーザー向け使い方ガイド｜fukuX(フクエックス)',
  description:
    '福岡メンズエステ専用SNS「fukuX(フクエックス)」のユーザー向け使い方ガイド。登録から推しセラピスト・お店の見つけ方、フォロー・スキ・保存・通知の使い方まで、初めての方にもわかりやすく説明します。',
  alternates: { canonical: '/x/guide/user' },
};

const H2 = 'text-base font-bold text-[color:var(--x-text-primary)] mt-8 mb-2';
const P = 'text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const OL = 'list-decimal pl-5 space-y-1.5 text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const UL = 'list-disc pl-5 space-y-1 text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const A = 'text-[color:var(--x-accent)] hover:underline';
const NOTE = 'text-xs text-[color:var(--x-text-muted)] leading-relaxed mt-1.5';

function Step({ n, title }: { n: number; title: string }) {
  return (
    <h2 className={`${H2} flex items-center gap-2`}>
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-white text-xs font-black flex-shrink-0"
        style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
      >
        {n}
      </span>
      {title}
    </h2>
  );
}

export default function XUserGuidePage() {
  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-bold text-[color:var(--x-text-primary)] mb-4">ユーザー向け使い方ガイド</h1>

      <p className={P}>
        fukuX（フクエックス）は、福岡のメンズエステ専用SNSです。セラピストやお店の最新投稿・出勤情報をタイムラインでチェックして、お気に入り（推し）を見つけて応援できます。利用は無料。登録しなくても閲覧できますが、登録するとフォロー・スキ・保存などの応援機能が使えるようになります。
      </p>

      <Step n={1} title="アカウントを登録する" />
      <ol className={OL}>
        <li>
          <Link href="/x/signup" className={A}>新規登録ページ</Link>
          で、メールアドレスとパスワード（8文字以上）を入力して登録します。
        </li>
        <li>ログイン後の「アカウントを開設」で、種別は<span className="font-bold">「ユーザー」</span>を選びます。</li>
        <li>@ID（英数字とアンダースコア、3〜20文字・あとから変更不可）と表示名（30文字まで）を決めて完了です。</li>
      </ol>
      <p className={NOTE}>
        ※本名の登録は不要です。メールアドレスは他のユーザーに公開されません。ニックネームで気軽に始められます。
      </p>

      <Step n={2} title="タイムラインの見方" />
      <ul className={UL}>
        <li><span className="font-bold">おすすめ</span>：fukuX全体の投稿が流れるメインのタイムラインです。</li>
        <li><span className="font-bold">フォロー中</span>：あなたがフォローした相手の投稿だけが流れます。</li>
        <li><span className="font-bold">お店</span>：登録店舗の一覧です。カードをタップするとお店のプロフィールへ移動します。</li>
      </ul>

      <Step n={3} title="推しを見つける" />
      <ul className={UL}>
        <li>右上の🔍から、名前や@IDでセラピスト・お店を検索できます。</li>
        <li>投稿の「#ハッシュタグ」をタップすると、同じタグの投稿を一覧できます。</li>
        <li>「お店」タブから気になるお店を見つけて、所属セラピストをチェックするのもおすすめです。</li>
      </ul>

      <Step n={4} title="フォロー・応援機能を使う" />
      <ul className={UL}>
        <li><span className="font-bold">フォロー</span>：プロフィールの「フォロー」ボタンで、投稿を「フォロー中」タブで追えるようになります。</li>
        <li><span className="font-bold">投稿通知</span>：フォロー中に表示されるベルをオンにすると、その人の新しい投稿を通知でお知らせします。</li>
        <li><span className="font-bold">スキ</span>：投稿のハートで「いいね」を送れます。あなたのスキが推しの励みになります。</li>
        <li><span className="font-bold">リポスト・保存</span>：気に入った投稿を再共有したり、あとで見返せるように保存できます（保存した投稿はメニューの「保存した投稿」から）。</li>
      </ul>
      <p className={NOTE}>※ユーザー種別は「見る・応援する」専用です。投稿やストーリーの発信はセラピスト・お店のアカウントで行われます。</p>

      <Step n={5} title="ストーリーを見る" />
      <p className={P}>
        タイムライン上部のストーリーバーに、セラピスト・お店の24時間限定の投稿が並びます（閲覧にはログインが必要です）。「今日出勤しています」などのリアルタイムな情報をチェックできます。
      </p>

      <Step n={6} title="出勤情報をチェックする" />
      <p className={P}>
        セラピストのプロフィールには、7日分の出勤スケジュールが表示されることがあります（フクエス掲載店の所属セラピストの場合）。気になるセラピストの出勤日をチェックしてみてください。
      </p>

      <Step n={7} title="DM（ダイレクトメッセージ）" />
      <ul className={UL}>
        <li>フォローしている相手とは、プロフィールのメッセージボタンからDMでやり取りできます（相手の設定によっては送れない場合があります）。</li>
        <li>DMを受け取りたくない場合は、設定の「DM受付オフ」をオンにできます。</li>
      </ul>

      <Step n={8} title="通知・テーマ切替" />
      <ul className={UL}>
        <li>画面右上のベルに、スキした投稿への反応や新着投稿などの通知が届きます。封筒アイコンにはDMの未読件数が表示されます。</li>
        <li>メニュー下部の切替で、背景を「グラデーション⇄白」のお好みのテーマに変更できます。</li>
      </ul>

      <h2 className={H2}>守っていただきたいこと</h2>
      <ul className={UL}>
        <li>18歳未満の方は利用できません。</li>
        <li>セラピスト・お店・他のユーザーへの誹謗中傷、いやがらせはおやめください。</li>
        <li>規定外のサービスを求めるDM等の送信は禁止です。</li>
        <li>投稿画像の無断転載・スクリーンショットの拡散はおやめください。</li>
      </ul>
      <p className={NOTE}>
        詳しくは
        <Link href="/x/terms" className={A}>fukuX利用規約</Link>
        ・
        <Link href="/x/privacy" className={A}>fukuXプライバシーポリシー</Link>
        をご覧ください。
      </p>

      <h2 className={H2}>困ったときは</h2>
      <p className={P}>
        フクエス運営事務局（
        <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
        ）までお気軽にご連絡ください。
      </p>
    </div>
  );
}
