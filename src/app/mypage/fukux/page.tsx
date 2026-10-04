// fukuX（フクエックス）開設のご案内（第1162便・2026-10-04・カッキーさんの指示）。
// ★ マイページのサイドバーの「fukuX」バナーから、まだフクエックスを開設していないお店が開く説明ページ。
//   読んだあと、いちばん下の「フクエックスを始める」でフクエックス（/x）へ。
// ★ 開設済みのお店（店舗アカウントが連携済み・または店舗基本設定に fukuX URL がある）は、バナーから今までどおり
//   自分のフクエックスのページへ直接行く（page.tsx の fukuxHref・判断はあちらの1か所）。
// ★ ここはログインだけで開ける（中身は全店同じ・コネックエフのご案内 /mypage/conecf と同じ作り）。読み取りは無い。
// ★ 本文はカッキーさん作成の画像1枚（public/mypage/fukux/fukux-intro.webp・1600×2262）。
//   ★ 画像の中の文章は alt に要点を書く（画面読み上げのため）。★ 画像の中身を変えたら alt も直すこと（食い違わせない）。
//   ★ ボタンは画像にしない（押せるように HTML のまま）。

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'fukuX 開設のご案内｜フクエス マイページ' };

const INTRO_ALT =
  'fukuX 開設のご案内（フクエス掲載店さまへ）。お店のお仕事は「QRを送る」だけ。開設したあとは、ほとんど自動で回ります。お店の fukuX アカウントは、運営が作ってお渡しします。' +
  '01 お店がやること（マイページで3タップ）：1、セラピストの「QR」を押す。2、「LINEで送る」を押す。3、女の子を選んで送信する。セラピストページへの招待を送る手順です。すでにセラピストページを使っている子は、この手順もいりません。' +
  '02 女の子がやること（最初の1回だけ）：セラピストページの「開設する」から、fukuX に登録するだけ。' +
  '03 そのあとは、ぜんぶ自動：写メ日記はフクエスに書けば fukuX にも自動で掲載されます。出勤予定はフクエスの出勤がそのまま表示されます。毎日の紹介は運営が毎日12時台・18時台に出勤中の子を紹介します。ランキングは、開設した子は人気セラピストランキングで毎週 +10点。';

export default function FukuxIntroPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mypage/fukux/fukux-intro.webp"
          alt={INTRO_ALT}
          width={1600}
          height={2262}
          className="block w-full h-auto border border-slate-200 mb-6"
        />

        {/* ★ いちばん下に、大きく1つ。行き先はフクエックス（/x）。PC は横並び・スマホは縦並び */}
        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <a
            href="/x"
            className="flex-1 text-center py-5 bg-gradient-to-r from-[#5b34ad] to-[#7c4ddb] text-white text-[19px] font-black tracking-wide shadow-lg hover:opacity-95"
          >
            フクエックスを始める →
          </a>
          <Link href="/mypage" className="sm:w-56 flex items-center justify-center py-4 border-2 border-[#6d45c4] bg-white text-[15px] font-bold text-[#5b34ad] hover:bg-violet-50">
            マイページへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
