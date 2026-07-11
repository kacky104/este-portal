import Link from 'next/link';
import type { Metadata } from 'next';

// お店向け使い方ガイド。静的コンテンツのみ・データ取得なし。
// 目的: 基本操作の説明に加え、認証バッジ→フクエス掲載の順で自然に掲載申込へ誘導する（非掲載店を否定しないトーン）。
// 数値は実装の定数と一致: @ID=3〜20字 / 表示名30字・自己紹介160字・地域バッジ最大2 /
//   投稿=500字・画像4枚 / お店カード画像=認証+4・バナー設置+4（0/4/8） / ストーリー=24時間
export const metadata: Metadata = {
  title: 'お店向け使い方ガイド｜fukuX(フクエックス)',
  description:
    '福岡メンズエステ専用SNS「fukuX(フクエックス)」のお店向け使い方ガイド。アカウント開設から認証バッジ、セラピストの所属管理、お店カード画像、求人オファーの送り方、フクエス掲載店だけの連携機能まで、わかりやすく説明します。',
  alternates: { canonical: '/x/guide/shop' },
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

export default function XShopGuidePage() {
  return (
    <div className="x-card my-6 p-6 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-bold text-[color:var(--x-text-primary)] mb-4">お店向け使い方ガイド</h1>

      <p className={P}>
        fukuX（フクエックス）は、福岡のメンズエステ専用SNSです。お店の最新情報やセラピストの魅力をタイムラインで発信し、お客様と直接つながれます。利用は無料。このガイドでは、アカウント開設から店舗運用のコツまでを順番に説明します。
      </p>
      <p className={`${P} mt-2`}>
        fukuXでは、運営の認証を受けたお店と、そのお店に所属するセラピストを優遇して表示しています。<span className="font-bold text-[color:var(--x-text-primary)]">認証バッジの取得（STEP4）が店舗運用のカギ</span>です。
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
        <li>ログイン後の「アカウントを開設」で、種別は<span className="font-bold">「お店」</span>を選びます。</li>
        <li>
          <span className="font-bold">@ID</span>（英数字とアンダースコア、3〜20文字）を決めます。
          <span className="font-bold">あとから変更できない</span>ので、店名にちなんだ分かりやすいものがおすすめです。
        </li>
        <li>表示名（30文字まで・あとから変更可）とアバター画像（任意）を設定して開設完了です。</li>
      </ol>

      <Step n={3} title="プロフィールを整える" />
      <p className={P}>
        左上の自分のアイコン →「マイプロフィール」→ 編集（または設定）から、いつでも変更できます。
      </p>
      <ul className={`${UL} mt-2`}>
        <li>アバター画像（店舗ロゴ等）・ヘッダー画像（横長にクロップされます）</li>
        <li>自己紹介（160文字まで）・外部リンク（お店のホームページ等）</li>
        <li>地域バッジ（最大2つ）。プロフィールの@ID横とお店タブのカードに表示されます。</li>
      </ul>

      <Step n={4} title="認証バッジを受ける（店舗運用のカギ）" />
      <p className={P}>
        運営の審査で認証されたお店には<span className="font-bold text-[color:var(--x-text-primary)]">認証バッジ</span>が付き、次の機能が使えるようになります。
      </p>
      <ul className={`${UL} mt-2`}>
        <li>セラピストの所属管理（@ID検索で所属申請 → STEP5）</li>
        <li>お店カード画像の設定（お店タブに表示 → STEP6）</li>
        <li>求人オファーの送信（→ STEP8）</li>
      </ul>
      {/* 掲載店誘導の核心部分。非掲載店を否定せず「掲載店はスムーズ」の対比で伝える。 */}
      <div className="mt-3 rounded-2xl border border-indigo-300/60 bg-[color:var(--x-inset)] p-4">
        <p className="text-sm font-bold text-[color:var(--x-accent)] mb-1">💡 認証をスムーズに受けるには</p>
        <p className={P}>
          <span className="font-bold text-[color:var(--x-text-primary)]">フクエス掲載店は、実在確認が済んでいるため原則スムーズに認証されます。</span>
          フクエスに掲載のないお店も認証をお受けしていますが、なりすまし防止のため個別の実在確認が必要となり、お時間をいただく場合があります。フクエスへの掲載は
          <Link href="/listing" className={A}>掲載について</Link>
          または
          <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
          までお気軽にお問い合わせください。
        </p>
      </div>

      <Step n={5} title="セラピストの所属管理" />
      <p className={P}>
        認証後、ドロワーメニューの「店舗管理」から所属申請ができます。
      </p>
      <ol className={`${OL} mt-2`}>
        <li>在籍セラピストにfukuXのアカウント（セラピスト種別）を作ってもらい、@IDを教えてもらいます。</li>
        <li>店舗管理ページで@IDを検索し、所属申請を送ります。</li>
        <li>セラピスト本人が承認すると所属が成立し、プロフィールに「◯◯所属」バッジが表示されます。</li>
      </ol>
      <ul className={`${UL} mt-2`}>
        <li>所属したセラピストはストーリーを投稿できるようになり、優遇表示の対象になります。</li>
        <li>退店時は店舗管理から所属を解除できます（セラピスト側からも解除できます）。</li>
        <li>実際に在籍していないセラピストへの所属申請は禁止です。</li>
      </ul>

      <Step n={6} title="お店タブとお店カード画像" />
      <p className={P}>
        タイムラインの「お店」タブには、fukuXに登録したお店のカードが表示されます。カードに画像（主にセラピスト画像）を設定できる枚数は次のとおりです。
      </p>
      <ul className={`${UL} mt-2`}>
        <li>認証バッジのあるお店：4枚（4列×1段）</li>
        <li>
          さらに貴店サイトに
          <Link href="/x/banner" className={A}>リンクバナー</Link>
          を設置いただくと＋4枚の<span className="font-bold text-[color:var(--x-text-primary)]">合計8枚（4列×2段）</span>に拡大できます（設置後に
          <Link href="/x/banner/report" className={A}>報告フォーム</Link>
          からご連絡ください）。
        </li>
      </ul>
      <p className={NOTE}>※画像の設定は設定ページの「お店カード画像」から。表示順はお店タブで30分ごとに入れ替わります。</p>

      <Step n={7} title="投稿・ストーリーで発信する" />
      <ul className={UL}>
        <li>画面右下の「＋」ボタンから投稿できます。本文は500文字まで、画像は4枚まで（JPEG・PNG・WebP、各5MB以下）。「#ハッシュタグ」も使えます。</li>
        <li>ストーリー（24時間で消える投稿）も利用できます。イベントや空き枠のお知らせ等、気軽な発信に便利です。</li>
        <li>新規入店・イベント・割引情報などをこまめに発信すると、フォロワーとの接点が増えます。</li>
      </ul>

      <Step n={8} title="求人オファーを送る（認証店のみ）" />
      <p className={P}>
        ドロワーメニューの「求人オファーリスト」から、オファー受付中の未所属セラピストの一覧を見られます。気になるセラピストには、フォロー関係がなくても直接メッセージを送れます。PR文や希望エリアを参考に、貴店に合う人材へアプローチしてください。
      </p>

      <Step n={9} title="DM・通知" />
      <ul className={UL}>
        <li>どちらか一方がフォローしている相手と、プロフィールのメッセージボタンからDMできます。</li>
        <li>画面右上のベルに通知が、封筒アイコンにDMの未読件数が表示されます。</li>
        <li>DMを受け取りたくない場合は、設定の「DM受付オフ」をオンにできます。</li>
      </ul>

      <Step n={10} title="フクエス掲載店なら、さらに広がります" />
      <p className={P}>
        fukuXはどのお店も無料でご利用いただけますが、ポータルサイト「フクエス」に掲載中のお店は、fukuXとの連携でさらに多くの機能をご利用いただけます。
      </p>
      <ul className={`${UL} mt-2`}>
        <li>店舗ページ（店舗情報・料金・コース・写真・口コミ）でお店の魅力をしっかり紹介</li>
        <li>フクエスで登録した出勤情報が、所属セラピストのfukuXプロフィールに7日分自動表示</li>
        <li>写メ日記・お知らせの配信（お知らせはフクエスTOPの「サロン新着情報」にも掲載）・クーポン発行</li>
        <li>求人情報の掲載（フクエスワーク）</li>
        <li>実在確認済みとなるため、fukuXの認証バッジも原則スムーズに付与</li>
      </ul>
      <div className="mt-3 rounded-2xl border border-rose-300/60 bg-[color:var(--x-inset)] p-4">
        <p className="text-sm font-bold text-rose-400 mb-1">🌸 掲載のご相談はお気軽に</p>
        <p className={P}>
          掲載内容・条件のご案内は
          <Link href="/listing" className={A}>掲載について</Link>
          をご覧いただくか、フクエス運営事務局（
          <a href="mailto:info@fukues.com" className={A}>info@fukues.com</a>
          ）までお問い合わせください。
        </p>
      </div>

      <h2 className={H2}>守っていただきたいこと</h2>
      <ul className={UL}>
        <li>虚偽の情報での登録・運用、他店へのなりすましは禁止です。</li>
        <li>実際に在籍していないセラピストへの所属申請・承認は禁止です。</li>
        <li>規定外のサービスを連想させる投稿・DMはできません。</li>
        <li>権利のない画像（他店・他人の画像等）の使用は禁止です。</li>
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
