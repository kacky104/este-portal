// フクエスサイト（公式ホームページ制作）のご案内（第1172便で作成・第1173便でカッキーさんの画像1枚に）。
// ★ マイページのサイドバーの「フクエスサイト」バナーから、まだ申し込んでいないお店が開く、1ページの簡単な説明。
//   読んだあと「デザインを見る」（/hp/templates/designs）・「制作について問い合わせる」（/hp/templates/contact）へ。
//   くわしい説明（営業ページ）は今までどおり /hp/templates（このページからもリンクしている）。
// ★ 制作中・停止中・公開中のお店の行き先は今までどおり（mypage/page.tsx の hpNav・判断はあちらの1か所）。
// ★ ここはログインだけで開ける（中身は全店同じ）。読み取りは無い。
// ★★ 第1173便（2026-10-04・カッキーさん）: 第1172便で文字で組んだ1ページを、カッキーさん作成の画像1枚に差し替えた（写真入り・赤）。
//   fukuX・コネックエフ・フクエスCRM のご案内と同じ作り＝画像1枚＋下にボタン。
//   ★ 画像は public/mypage/site/site-intro.webp（1448×2048）。差し替えるときはこのファイルを置き換えるだけ。
//   ★ 画像の中の文章は alt に要点を書く（画面読み上げのため）。★ 画像の中身を変えたら alt も直すこと（食い違わせない）。
// ★★ 画像に焼き込まれている数字（★ 変えるときは画像の作り直しが要る）:
//   ・料金（制作料 165,000円→0円／月額 11,000円→0円／ドメイン更新料 11,000円／年間 11,000円／作業依頼 1回 3,300円）
//     ＝ /hp/templates（営業ページ）と同じ確定値。料金を変えるときは、あちら（画像・sr-only・JSON-LD）と【この画像と alt】も必ず同時に。
//   ・デザインの数「全16パターン」＝ HP_TEMPLATES × HP_COLOR_VARIANTS の数。カラーを足し引きしたら画像と alt も直す。
//   ★ 画像の「公式ホームページ制作のページ」は押せないので、下に押せる形でも置く。★ ボタン3つは画像にしない。

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'フクエスサイトのご案内｜フクエス マイページ' };

const MAIN = '#c8403a'; // 画像の赤
const DEEP = '#9f2d28'; // 濃い赤（ボタンの左側）

const INTRO_ALT =
  'フクエスサイト ご案内（フクエス掲載店さまへ）。公式ホームページを、制作料0円で。フクエスの掲載情報が、そのまま公式ホームページに。二度打ち ゼロ・制作は運営におまかせ。' +
  'フクエス（いつもどおり更新）→ 公式ホームページ（自動で反映）。' +
  '01 そのまま反映されるもの：セラピスト（写真・プロフィール）、本日の出勤（いつも最新）、料金（コース・料金表）、写メ日記・口コミ（そのまま表示）。独自ドメインも運営が取得・管理・更新。デザインは全16パターンから選べます。' +
  '02 料金（表示はすべて税込）：制作料（初回のみ）165,000円 → フクエス掲載店さまなら 0円。月額利用料 11,000円 → フクエスワークにもご掲載なら 0円。ドメイン更新料（年額）11,000円。両方ご掲載なら、年間11,000円だけで持てます。' +
  '03 制作の流れ（1週間前後で納品）：1 お申し込み、2 デザインを決める、3 運営が制作、4 ご確認・公開、5 公開後の更新。' +
  '知っておくこと：写真や文章の用意は不要。ドメイン取得から画像・文章の設定まで運営が行います。公開後はフクエスを更新するだけ。ご質問は無料です。内容変更などの作業依頼は1回3,300円（複雑な作業はお見積り）。独自ドメインのメールは対象外。' +
  'くわしい説明は、公式ホームページ制作のページをご覧ください。';

export default function HpIntroPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mypage/site/site-intro.webp"
          alt={INTRO_ALT}
          width={1448}
          height={2048}
          className="block w-full h-auto border border-slate-200 mb-5"
        />

        {/* ★ 画像の「公式ホームページ制作のページ」を押せる形でも置く（★ 画像の文字は押せないため） */}
        <p className="mb-5 text-center text-[13.5px] text-slate-500">
          くわしい説明は、<Link href="/hp/templates" target="_blank" rel="noopener noreferrer" className="underline font-bold" style={{ color: MAIN }}>公式ホームページ制作のページ</Link>にまとめています。
        </p>

        {/* ★ ボタンは画像にしない。★ PC は横並び・スマホは縦並び */}
        <div className="flex flex-col gap-3 pb-6 sm:flex-row">
          <Link href="/hp/templates/designs" target="_blank" rel="noopener noreferrer" className="flex-1 py-4 text-center text-[17px] font-black text-white shadow-md hover:opacity-95" style={{ background: `linear-gradient(to right, ${DEEP}, ${MAIN})` }}>
            デザインを見る →
          </Link>
          <Link href="/hp/templates/contact" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center border-2 bg-white px-5 py-3.5 text-[14.5px] font-bold hover:bg-red-50" style={{ borderColor: MAIN, color: DEEP }}>
            制作について問い合わせる
          </Link>
          <Link href="/mypage" className="flex items-center justify-center bg-slate-800 px-5 py-3.5 text-[14.5px] font-bold text-white hover:opacity-90">
            マイページへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
