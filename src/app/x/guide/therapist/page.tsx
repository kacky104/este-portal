import Link from 'next/link';
import type { Metadata } from 'next';

// セラピスト向け使い方ガイド。静的コンテンツのみ・データ取得なし。
// SNSに不慣れな方も読める「登録→開設→プロフィール→所属→投稿…」のステップ形式。
// 機能仕様と齟齬が出ないよう、数値（文字数・枚数等）は実装の定数に合わせている:
//   @ID=3〜20字（OnboardingForm）/ 表示名=30字・自己紹介=160字（XSettingsForm）/
//   投稿=500字・画像4枚（XComposer）/ オファーPR文=300字 / ストーリー=24時間・所属セラピスト限定
export const metadata: Metadata = {
  title: 'セラピスト向け使い方ガイド｜fukuX(フクエックス)',
  description:
    '福岡メンズエステ専用SNS「fukuX(フクエックス)」のセラピスト向け使い方ガイド。登録からプロフィール設定、お店への所属、投稿・ストーリー・出勤スケジュール・求人オファーの受け取り方まで、初めての方にもわかりやすく説明します。',
  alternates: { canonical: '/x/guide/therapist' },
};

const H2 = 'text-base font-bold text-[color:var(--x-text-primary)] mt-8 mb-2';
const P = 'text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const OL = 'list-decimal pl-5 space-y-1.5 text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const UL = 'list-disc pl-5 space-y-1 text-sm text-[color:var(--x-text-secondary)] leading-relaxed';
const A = 'text-[color:var(--x-accent)] hover:underline';
const NOTE = 'text-xs text-[color:var(--x-text-muted)] leading-relaxed mt-1.5';

// STEP見出しのバッジ。
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

export default function XTherapistGuidePage() {
  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-bold text-[color:var(--x-text-primary)] mb-4">セラピスト向け使い方ガイド</h1>

      <p className={P}>
        fukuX（フクエックス）は、福岡のメンズエステ専用SNSです。セラピストのあなたが投稿やストーリーでお客様とつながり、出勤情報やお店の情報を届けられます。利用は無料。このガイドでは、登録から日々の使い方までを順番に説明します。
      </p>
      <p className={`${P} mt-2`}>
        fukuXでは、運営に承認されたお店と、お店に所属しているセラピストを優遇して表示しています。<span className="font-bold text-[color:var(--x-text-primary)]">お店への所属が圧倒的に有利</span>です（くわしくはSTEP4）。
      </p>

      <Step n={1} title="アカウントを登録する" />
      <ol className={OL}>
        <li>
          <Link href="/x/signup" className={A}>新規登録ページ</Link>
          で、メールアドレスとパスワード（8文字以上）を入力して登録します。
        </li>
        <li>登録したメールアドレスとパスワードでログインします。</li>
      </ol>
      <p className={NOTE}>※メールアドレスは他のユーザーに公開されません。</p>

      <Step n={2} title="アカウントを開設する（種別・@ID・表示名）" />
      <ol className={OL}>
        <li>ログイン後の「アカウントを開設」で、種別は<span className="font-bold">「セラピスト」</span>を選びます。</li>
        <li>
          <span className="font-bold">@ID</span>（英数字とアンダースコア、3〜20文字）を決めます。
          <span className="font-bold">あとから変更できない</span>ので、源氏名など分かりやすいものがおすすめです。
        </li>
        <li>表示名（30文字まで・あとから変更可）とアバター画像（任意）を設定して開設完了です。</li>
      </ol>

      <Step n={3} title="プロフィールを整える" />
      <p className={P}>
        左上の自分のアイコン →「マイプロフィール」→ 編集（または設定）から、いつでも変更できます。
      </p>
      <ul className={`${UL} mt-2`}>
        <li>アバター画像・ヘッダー画像（横長にクロップされます）</li>
        <li>自己紹介（160文字まで）・外部リンク（お店のホームページ等）</li>
        <li>年齢・スリーサイズ（すべて任意。入力したものだけプロフィールに表示されます）</li>
      </ul>
      <p className={NOTE}>※写真は自分に権利があるもの（お店から許可を得たもの）だけを使ってください。</p>

      <Step n={4} title="お店に所属する（所属すると断然有利！）" />
      <p className={P}>
        所属申請を送れるのは、<span className="font-bold text-[color:var(--x-text-primary)]">フクエス運営の審査で承認されたお店だけ</span>です。fukuXでは、なりすましでないことが確認・承認されたお店と、お店に所属しているセラピストを優遇して表示しています。ぜひお店に所属してfukuXをご利用ください。
      </p>
      <p className={`${P} mt-2`}>
        所属はお店側からの申請で成立します。流れは次のとおりです。
      </p>
      <ol className={`${OL} mt-2`}>
        <li>自分の<span className="font-bold">@ID</span>を在籍するお店に伝えます。</li>
        <li>お店が@IDを検索して所属申請を送ります。</li>
        <li>あなたのタイムライン上部に「所属申請が届いています」バナーが表示されるので、内容を確認して<span className="font-bold">承認</span>します。</li>
      </ol>
      <ul className={`${UL} mt-2`}>
        <li>承認すると、プロフィールに「◯◯所属」バッジが表示されます。</li>
        <li>退店したときは、設定の「所属を解除する」から解除してください（お店側からも解除できます）。</li>
        <li>実際に在籍しているお店以外への所属は禁止です。</li>
      </ul>
      {/* 所属×投稿のメリット訴求（赤バッジ→おすすめ露出アップ）。ガイドの最重要アピールポイント。 */}
      <div className="mt-3 rounded-2xl border border-rose-300/60 bg-[color:var(--x-inset)] p-4">
        <p className="text-sm font-bold text-rose-400 mb-1">🔴 赤いバッジを目指そう</p>
        <p className={P}>
          お店に所属して投稿をがんばると、<span className="font-bold text-[color:var(--x-text-primary)]">認証の赤いバッジ</span>が表示されるようになります。バッジが表示されると、おすすめタイムラインにあなたの投稿が表示される確率が<span className="font-bold text-[color:var(--x-text-primary)]">大幅にアップ</span>します。お客様の目に留まるチャンスが大きく増えるので、まずはお店に所属して投稿を続けてみてください。
        </p>
      </div>

      <Step n={5} title="投稿してみよう" />
      <ul className={UL}>
        <li>画面右下の「＋」ボタンから投稿できます。本文は500文字まで、画像は4枚まで（JPEG・PNG・WebP、各5MB以下）。</li>
        <li>「#ハッシュタグ」を付けると、同じタグの投稿から見つけてもらいやすくなります。</li>
        <li>ほかの人の投稿には、スキ（いいね）・リポスト（自分のフォロワーへの再共有）・保存ができます。</li>
      </ul>

      <Step n={6} title="ストーリー（24時間で消える投稿）" />
      <ul className={UL}>
        <li>お店に所属しているセラピストだけが投稿できます（タイムライン上部のストーリーバーの「＋」から）。</li>
        <li>投稿から24時間で自動的に見えなくなります。「今日出勤しています」等の気軽な発信に便利です。</li>
      </ul>

      <Step n={7} title="出勤スケジュールの表示" />
      <p className={P}>
        お店に所属していると、フクエス本体の出勤情報と連動して、あなたのプロフィールに7日分の出勤スケジュールが自動で表示されます。fukuX側での設定は不要です（出勤情報はお店がフクエスで登録します）。
      </p>

      <Step n={8} title="求人オファーを受け取る（未所属の方向け）" />
      <p className={P}>
        お店に所属していない間は、お店からの求人スカウト（オファー）を受け取れます。
      </p>
      <ul className={`${UL} mt-2`}>
        <li>設定の「オファー受付」をオンにして、PR文（300文字まで）と希望エリアを設定します。</li>
        <li>オンにすると、認証済みのお店・運営だけが見られるオファー一覧に表示され、フォローされていなくてもメッセージを受け取れます。</li>
        <li>一般のユーザーには表示されません。所属が決まると自動で一覧から外れます。</li>
      </ul>

      <Step n={9} title="DM（ダイレクトメッセージ）" />
      <ul className={UL}>
        <li>どちらか一方がフォローしている相手と、プロフィールのメッセージボタンからDMできます。</li>
        <li>DMを受け取りたくない場合は、設定の「DM受付オフ」をオンにしてください（新しいやり取りが止まります。過去のメッセージは見られます）。</li>
      </ul>

      <Step n={10} title="通知" />
      <p className={P}>
        画面右上のベルに、スキ・フォロー等の通知が届きます。封筒アイコンにはDMの未読件数が表示されます。
      </p>

      <h2 className={H2}>守っていただきたいこと</h2>
      <ul className={UL}>
        <li>18歳未満の方は利用できません。</li>
        <li>実在しないお店への所属申請の承認、他人へのなりすましは禁止です。</li>
        <li>規定外のサービスを連想させる投稿・DMはできません。</li>
        <li>他人が撮影した画像の無断転載、DMの内容を相手の同意なく公開することも禁止です。</li>
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
