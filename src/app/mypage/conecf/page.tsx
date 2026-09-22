// コネックエフのご案内（第667便で作成・第673便で画像に差し替え・2026-09-22・カッキーさんの指示）。
// ★ マイページのサイドバーの「コネックエフ」バナーから、まだ切り替えていないお店が開く説明ページ。読んだあと「始める」で conecf.com へ。
// ★ 切り替え済みのお店はバナーから直接 conecf.com へ行く（page.tsx の renderConecfLink）。★ ここはログインだけで開ける（中身は全店同じ）。
// ★★ 第673便: 本文5ブロックを、カッキーさん作成の画像（指示書 README-implementation.md）に差し替えた。
//   ★ PC は横1200px の画像、スマホ（640px以下）は縦長の画像（<picture> で出し分け）。置き場所は public/mypage/conecf/。
//   ★ 画像の中の文章は alt に要点を書く（★ 画面読み上げ・検索のため）。★ ボタン2つは画像にせず HTML のまま（押せるように）。
//   ★ 画像の中身を変えたら alt も直すこと（★ 食い違わせない）。

import type { Metadata } from 'next';
import Link from 'next/link';
import { CONECF_ORIGIN } from '@/lib/conecfHost';

export const metadata: Metadata = { title: 'コネックエフのご案内｜フクエス マイページ' };

const BLOCKS: ReadonlyArray<{ name: string; alt: string }> = [
  {
    name: '01-conecf-overview',
    alt: 'コネックエフのサービス概要。コネックエフに入力した出勤やセラピストの情報を、フクエス・駅ちか・エステ魂などへまとめて更新するツールです。サイトごとの再入力を削減、入力は1か所だけ、更新結果を確認できる、契約店舗様は無料。',
  },
  {
    name: '02-conecf-supported-sites',
    alt: 'コネックエフでまとめて更新できるサイト。フクエス：出勤7日分・写メ日記・今すぐ・セラピストの新規登録・プロフィール写真の更新・セラピストの削除・お知らせとフクエスワーク新着情報の自動投稿。駅ちか：出勤7日分・写メ日記・即ヒメ・セラピストの新規登録・プロフィール写真の更新・セラピストの削除・新着情報とココア店長ブログの自動投稿。エステ魂：出勤7日分・写メ日記・即セラ・セラピストの新規登録・プロフィール写真の更新・セラピストの非表示。全国エステランキングは準備中。エステラブは写メ日記。',
  },
  {
    name: '03-conecf-comparison',
    alt: 'コネックエフとフクエスリンク（駅ちかからの取り込み）の違い。入力する場所：コネックエフはコネックエフだけ、フクエスリンクは今までどおり駅ちか（またはお使いのツール）。情報の向き：コネックエフからフクエス・駅ちか・エステ魂など／駅ちかからフクエス（読むだけ）。向いているお店：入力を1か所にまとめて手間を減らしたいお店／駅ちかの入力のしかたを変えたくないお店。どちらか一方をお選びください。コネックエフに切り替えると駅ちかからの取り込みは止まります。',
  },
  {
    name: '04-conecf-notes',
    alt: 'コネックエフを始める前の注意事項。ほかの連携ツール（ベンリーなど）をお使いの場合は、そちらのフクエス・駅ちか・エステ魂との連携を外してからお使いください。同じサイトに2つのツールから書き込むと上書きし合います。フクエス契約店舗様は無料でお使いいただけます。コネックエフをやめて取り込みに戻したいときは、運営事務局へご連絡ください。',
  },
  {
    name: '05-conecf-start-guide',
    alt: 'コネックエフの始め方。1、下の「コネックエフを始める」を押してコネックエフを開きます。2、フクエスと同じメールアドレス・パスワードでログインします。3、ホームの「コネックエフに切り替える」を押します。4、「駅ちかから最初に1回だけ取り込む」で今のセラピストと出勤をコネックエフに入れます。5、「ID・PASS登録」で駅ちか・エステ魂などのログイン情報を登録します。',
  },
];

export default function ConecfIntroPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mypage/sidebar/conecf-intro.webp" alt="コネックエフ　日常作業を効率化・媒体連携" width={1200} height={400} className="block w-full h-auto border border-slate-200 mb-6" />

        {BLOCKS.map((b, i) => (
          <picture key={b.name}>
            <source media="(max-width: 640px)" srcSet={`/mypage/conecf/${b.name}-sp.webp`} />
            <img
              src={`/mypage/conecf/${b.name}-pc.webp`}
              alt={b.alt}
              width={1200}
              height={b.name.startsWith('02') ? 930 : b.name.startsWith('04') ? 560 : b.name.startsWith('05') ? 830 : 650}
              loading={i === 0 ? 'eager' : 'lazy'}
              className="block w-full h-auto mx-auto mb-6"
            />
          </picture>
        ))}

        {/* ★ 画像の「はじめての方へ」を押せる形でも置く（★ 画像の文字は押せないため） */}
        <p className="-mt-2 mb-6 text-center text-[13.5px] text-slate-500">
          くわしい使い方は、コネックエフの<a href={`${CONECF_ORIGIN}/guide`} target="_blank" rel="noopener noreferrer" className="underline font-bold text-[#1d4ed8]">はじめての方へ</a>にもまとめています。
        </p>

        {/* ★ ボタンは画像にしない（指示書）。★ PC は横並び・スマホは縦並び */}
        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <a
            href={CONECF_ORIGIN}
            className="flex-1 text-center py-4 bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] text-white text-[17px] font-black shadow-md hover:opacity-95"
          >
            コネックエフを始める
          </a>
          <Link href="/mypage" className="sm:w-56 text-center py-4 border-2 border-[#2563eb] bg-white text-[15px] font-bold text-[#1d4ed8] hover:bg-blue-50">
            マイページへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
