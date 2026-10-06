// コネックエフのご案内（第667便で作成・第673便で画像5枚に・第1164便で1ページに簡素化・第1166便でカッキーさんの画像1枚に）。
// ★ マイページのサイドバーの「コネックエフ」バナーから、まだ切り替えていないお店が開く説明ページ。読んだあと「始める」で conecf.com へ。
// ★ 切り替え済みのお店はバナーから直接 conecf.com へ行く（page.tsx の renderConecfLink）。★ ここはログインだけで開ける（中身は全店同じ）。読み取りは無い。
// ★★ 第1166便（2026-10-04・カッキーさん）: 第1164便で文字で組んだ1ページを、カッキーさん作成の画像1枚に差し替えた
//   （中身は第1164便と同じ項目。写真入り・水色）。fukuX 開設のご案内（/mypage/fukux）と同じ作り＝画像1枚＋下にボタン。
//   ★ 画像は public/mypage/conecf/conecf-intro.webp（1600×2262）。差し替えるときはこのファイルを置き換えるだけ。
//   ★ 画像の中の文章は alt に要点を書く（画面読み上げのため）。★ 画像の中身を変えたら alt も直すこと（食い違わせない）。
//   ★ 画像の「はじめての方へ」は押せないので、下に押せる形でも置く。★ ボタン2つは画像にしない（今までどおり）。
//   ★ 前の画像（01〜05 の pc/sp・10枚）は public/mypage/conecf/ に残してある（いまは使っていない）。
// ★★ 第1241便（2026-10-06・カッキーさん）: コネックエフはフクエスCRM とのセット販売（月額22,000円・税込）になった。
//   ・画像の札「利用料 無料」を「月額 22,000円（税込）」に書き換えた画像（conecf-intro-v2.webp）に差し替え（元の conecf-intro.webp は残してある）。
//     ★ 札の文字は Claude が上から書いたもの。カッキーさんが作り直した画像が来たら、ファイルを置き換える。
//   ・画像の下に、料金と「お申し込みは運営へ」を文字で出し、「運営に申し込む」ボタンを足した（行き先は CRM のご案内と同じお問い合わせ）。
//   ・「コネックエフを始める」は残す（見るだけなら契約前でも入れる。切り替えは契約後＝サーバーで止めている）。

import type { Metadata } from 'next';
import Link from 'next/link';
import { CONECF_ORIGIN } from '@/lib/conecfHost';
import { SET_PLAN_LINE, SET_PLAN_APPLY_LINE } from '@/lib/setPlan';

export const metadata: Metadata = { title: 'コネックエフのご案内｜フクエス マイページ' };

const INTRO_ALT =
  'コネックエフ ご案内（フクエス契約店舗様へ）。入力は、1か所だけ。フクエス・駅ちか・エステ魂も、まとめて自動で更新されます。二度打ち ゼロ・月額 22,000円（税込）。' +
  'コネックエフ（ここだけ入力）から、フクエス・駅ちか・エステ魂 など（まとめて自動で更新）。' +
  '01 まとめて更新できるもの：出勤（7日分をまとめて）、写メ日記（書くのは1回）、今すぐ（即ヒメ・即セラも）、セラピスト（登録・写真の更新）。エステラブへは写メ日記を送れます。全国エステランキングは準備中です。' +
  '02 始め方（4つのステップ）：1、「コネックエフを始める」を押す。フクエスと同じメールアドレス・パスワードでログインします。2、「コネックエフに切り替える」を押す。コネックエフのホームにあります。' +
  '3、駅ちかから最初に1回だけ取り込む。今のセラピストと出勤が、そのままコネックエフに入ります。4、各サイトのID・パスワードを登録。駅ちか・エステ魂などのログイン情報を入れたら準備完了です。' +
  '始める前に：フクエスリンクとは、どちらか一方です。切り替えると、駅ちかからの取り込みは止まります。ほかの連携ツールは、連携を外してから。同じサイトに2つのツールから書き込むと、上書きし合います。' +
  '元に戻したいときは運営事務局へ。取り込み（フクエスリンク）に戻せます。くわしい使い方は、コネックエフの「はじめての方へ」をご覧ください。';

export default function ConecfIntroPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mypage/conecf/conecf-intro-v2.webp"
          alt={INTRO_ALT}
          width={1600}
          height={2262}
          className="block w-full h-auto border border-slate-200 mb-5"
        />

        {/* ★ 第1241便: 料金（セット販売）とお申し込み先 */}
        <div className="mb-5 border-2 border-[#2563eb] bg-white px-4 py-3.5 text-center">
          <p className="text-[15px] font-black text-[#1e3a8a]">ご利用料金</p>
          <p className="mt-1 text-[14px] font-bold text-slate-700 leading-relaxed">{SET_PLAN_LINE}</p>
          <p className="mt-0.5 text-[13px] text-slate-500 leading-relaxed">
            コネックエフだけ・フクエスCRMだけのご契約はありません。{SET_PLAN_APPLY_LINE}ご契約後に「コネックエフに切り替える」を押せるようになります。
          </p>
        </div>

        {/* ★ 画像の「はじめての方へ」を押せる形でも置く（★ 画像の文字は押せないため） */}
        <p className="mb-5 text-center text-[13.5px] text-slate-500">
          くわしい使い方は、コネックエフの<a href={`${CONECF_ORIGIN}/guide`} target="_blank" rel="noopener noreferrer" className="underline font-bold text-[#1d4ed8]">はじめての方へ</a>にもまとめています。
        </p>

        {/* ★ ボタンは画像にしない。★ PC は横並び・スマホは縦並び */}
        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <a
            href={CONECF_ORIGIN}
            className="flex-1 text-center py-4 bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] text-white text-[17px] font-black shadow-md hover:opacity-95"
          >
            コネックエフを始める
          </a>
          {/* ★ 第1241便: お申し込み（お問い合わせの画面に件名と本文を入れて開く。送信は店舗様が押す） */}
          <Link href="/mypage?tab=support&apply=crm" className="sm:w-48 text-center py-4 border-2 border-[#1e3a8a] bg-white text-[15px] font-black text-[#1e3a8a] hover:bg-blue-50">
            運営に申し込む
          </Link>
          <Link href="/mypage" className="sm:w-56 text-center py-4 border-2 border-[#2563eb] bg-white text-[15px] font-bold text-[#1d4ed8] hover:bg-blue-50">
            マイページへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
