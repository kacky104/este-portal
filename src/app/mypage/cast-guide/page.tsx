// セラピストページの作り方（第1169便・2026-10-04・カッキーさんの指示）。
// ★ マイページの「セラピストページ連携」（今すぐの画面・CastLinkProgress）の見出しの横の「作り方」から開く説明ページ。
// ★ ここはログインだけで開ける（中身は全店同じ）。読み取りは無い。fukuX・コネックエフのご案内と同じ作り＝画像1枚＋下にボタン。
// ★ 本文はカッキーさん作成の画像1枚（public/mypage/cast-guide/cast-guide.webp・1600×2262）。差し替えるときはこのファイルを置き換えるだけ。
//   ★ 画像の中の文章は alt に要点を書く（画面読み上げのため）。★ 画像の中身を変えたら alt も直すこと（食い違わせない）。
//   ★ 画像の「お問い合わせ」は押せないので、下に押せるボタンでも置く（マイページの「運営事務局」）。

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'セラピストページの作り方｜フクエス マイページ' };

const GUIDE_ALT =
  'セラピストページの作り方（店舗オーナー様へ）。QRを見せるだけ。あとはセラピストさんのスマホで完成します。お店がQRを案内 → 本人が登録。4つのステップで、すぐに使えます。' +
  '01 お店がやること（STEP 1・2）：1、マイページ「セラピスト」で「QR」を押す。新しく登録した直後は、自動でQRが出ます。2、セラピストさんのスマホで読み取ってもらう。その場にいないときは「LINEで送る」でもOK。' +
  '02 セラピストさんがやること（STEP 3・4）：3、自分のメールアドレスを入れる。「招待メールを受け取る」を押すと、メールが届きます。4、メールを開いて、パスワードを決めたら完成。すぐにセラピストページが使えます。' +
  'うまくいかないときは：QRは24時間・1回だけ使えます。切れたら「リンクを作り直す」を押してください。メールが届かないときは、迷惑メールのフォルダも確認してください。' +
  'ご不明な点は、マイページの「お問い合わせ」からどうぞ。';

export default function CastGuidePage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mypage/cast-guide/cast-guide.webp"
          alt={GUIDE_ALT}
          width={1600}
          height={2262}
          className="block w-full h-auto border border-slate-200 mb-6"
        />

        {/* ★ PC は横並び・スマホは縦並び */}
        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <Link href="/mypage" className="flex-1 text-center py-4 bg-gradient-to-r from-[#b83a6f] to-[#d6558b] text-white text-[17px] font-black shadow-md hover:opacity-95">
            マイページへ戻る
          </Link>
          <Link href="/mypage?tab=support" className="sm:w-56 flex items-center justify-center py-4 border-2 border-[#c8477d] bg-white text-[15px] font-bold text-[#b83a6f] hover:bg-pink-50">
            お問い合わせ
          </Link>
        </div>
      </div>
    </main>
  );
}
