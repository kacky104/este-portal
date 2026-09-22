// コネックエフのご案内（第667便・2026-09-22・カッキーさんの指示）。
// ★ マイページのサイドバーの「コネックエフ」バナーから、まだ切り替えていないお店が開く説明ページ。読んだあと「始める」で conecf.com へ。
// ★ 切り替え済みのお店はバナーから直接 conecf.com へ行く（page.tsx の renderConecfLink）。★ ここはログインだけで開ける（中身は全店同じ）。
// ★★ 位置づけ（カッキーさんの決定 2026-09-22）: 書き込み・一元管理＝コネックエフ。駅ちかから読むだけ＝フクエスリンクの取り込み（残す）。
//   ★ 1つのお店はどちらか一方（★ コネックエフに切り替えると駅ちかからの取り込みは止まる・第400便）。
// ★ できることの一覧は lib/conecfGuide.ts が正（★ ここで別に書かない）。

import type { Metadata } from 'next';
import Link from 'next/link';
import { CONECF_GUIDE } from '@/lib/conecfGuide';
import { CONECF_ORIGIN } from '@/lib/conecfHost';

export const metadata: Metadata = { title: 'コネックエフのご案内｜フクエス マイページ' };

const CARD = 'bg-white border border-slate-200 shadow-sm p-5 sm:p-6';
const H2 = 'text-[17px] sm:text-[18px] font-black text-slate-800 mb-3 flex items-center gap-2';
const BAR = 'inline-block w-1 h-5 bg-[#1e3a8a]';

export default function ConecfIntroPage() {
  const sites = CONECF_GUIDE.sites.filter((s) => s.status === 'ok');
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-4">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/mypage/sidebar/conecf-intro.webp" alt="コネックエフ　日常作業を効率化・媒体連携" width={1200} height={400} className="block w-full h-auto border border-slate-200" />

        <section className={CARD}>
          <h1 className="text-[20px] sm:text-[22px] font-black text-slate-800">{CONECF_GUIDE.intro.title}</h1>
          <p className="mt-2 text-[15px] text-slate-600 leading-relaxed">{CONECF_GUIDE.intro.lead}</p>
          <ul className="mt-4 space-y-2">
            {CONECF_GUIDE.intro.points.map((p) => (
              <li key={p} className="flex gap-2 text-[14.5px] text-slate-700 leading-relaxed">
                <span className="text-[#1e3a8a] font-black">✓</span>{p}
              </li>
            ))}
          </ul>
        </section>

        <section className={CARD}>
          <h2 className={H2}><span className={BAR} />まとめて更新できるサイト</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {sites.map((s) => (
              <div key={s.name} className="border border-slate-200 p-3">
                <p className="text-[15px] font-black text-[#1e3a8a]">{s.name}</p>
                <ul className="mt-1.5 space-y-0.5">
                  {s.items.map((it) => <li key={it} className="text-[13px] text-slate-600">・{it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section className={CARD}>
          <h2 className={H2}><span className={BAR} />フクエスリンク（駅ちかからの取り込み）との違い</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] border-collapse text-[14px]">
              <thead>
                <tr className="bg-slate-50 text-slate-500 text-[13px]">
                  <th className="border border-slate-200 px-3 py-2 text-left w-[28%]"></th>
                  <th className="border border-slate-200 px-3 py-2 text-left text-[#1e3a8a]">コネックエフ</th>
                  <th className="border border-slate-200 px-3 py-2 text-left">フクエスリンク（取り込み）</th>
                </tr>
              </thead>
              <tbody className="text-slate-700">
                <tr>
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold bg-slate-50">入力する場所</th>
                  <td className="border border-slate-200 px-3 py-2">コネックエフだけ</td>
                  <td className="border border-slate-200 px-3 py-2">今までどおり駅ちか（またはお使いのツール）</td>
                </tr>
                <tr>
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold bg-slate-50">情報の向き</th>
                  <td className="border border-slate-200 px-3 py-2">コネックエフ → フクエス・駅ちか・エステ魂 など</td>
                  <td className="border border-slate-200 px-3 py-2">駅ちか → フクエス（読むだけ）</td>
                </tr>
                <tr>
                  <th className="border border-slate-200 px-3 py-2 text-left font-bold bg-slate-50">向いているお店</th>
                  <td className="border border-slate-200 px-3 py-2">入力を1か所にまとめて、手間を減らしたいお店</td>
                  <td className="border border-slate-200 px-3 py-2">駅ちかの入力のしかたを変えたくないお店</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-[13.5px] text-slate-500 leading-relaxed">
            どちらか一方をお選びください。コネックエフに切り替えると、駅ちかからの取り込みは止まります（両方を使うと、情報が上書きし合うためです）。
          </p>
        </section>

        <section className={CARD}>
          <h2 className={H2}><span className={BAR} />始める前にご確認ください</h2>
          <ul className="space-y-2 text-[14.5px] text-slate-700 leading-relaxed">
            <li>・ほかの連携ツール（ベンリーなど）をお使いの場合は、<b>そちらのフクエス・駅ちか・エステ魂との連携を外してから</b>お使いください。同じサイトに2つのツールから書き込むと、上書きし合います。</li>
            <li>・フクエス契約店舗様は無料でお使いいただけます。</li>
            <li>・コネックエフをやめて取り込みに戻したいときは、運営事務局へご連絡ください。</li>
          </ul>
        </section>

        <section className={CARD}>
          <h2 className={H2}><span className={BAR} />始め方</h2>
          <ol className="space-y-2.5 text-[14.5px] text-slate-700 leading-relaxed">
            <li><b className="text-[#1e3a8a]">1.</b> 下の「コネックエフを始める」を押して、コネックエフを開きます。</li>
            <li><b className="text-[#1e3a8a]">2.</b> フクエスと同じメールアドレス・パスワードでログインします。</li>
            <li><b className="text-[#1e3a8a]">3.</b> ホームの「コネックエフに切り替える」を押します。</li>
            <li><b className="text-[#1e3a8a]">4.</b> 「駅ちかから最初に1回だけ取り込む」で、今のセラピストと出勤をコネックエフに入れます。</li>
            <li><b className="text-[#1e3a8a]">5.</b> 「ID・PASS登録」で、駅ちか・エステ魂などのログイン情報を登録します。</li>
          </ol>
          <p className="mt-3 text-[13.5px] text-slate-500">
            くわしい使い方は、コネックエフの<a href={`${CONECF_ORIGIN}/guide`} target="_blank" rel="noopener noreferrer" className="underline font-bold text-[#1e3a8a]">はじめての方へ</a>にもまとめています。
          </p>
        </section>

        <div className="flex flex-col sm:flex-row gap-3 pb-6">
          <a
            href={CONECF_ORIGIN}
            className="flex-1 text-center py-4 bg-gradient-to-r from-[#1e3a8a] to-[#2563eb] text-white text-[17px] font-black shadow-md hover:opacity-95"
          >
            コネックエフを始める
          </a>
          <Link href="/mypage" className="sm:w-48 text-center py-4 border border-slate-300 bg-white text-[15px] font-bold text-slate-600 hover:bg-slate-50">
            マイページへ戻る
          </Link>
        </div>
      </div>
    </main>
  );
}
