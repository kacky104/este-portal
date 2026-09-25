// フクエスリンクのご案内（第852便・2026-09-25・カッキーさんの指示）。
// ★ マイページのサイドバーの「フクエスリンク」バナーから、まだ使っていないお店（未登録・止めている）が開くページ。
//   ★ 読んだあと「フクエスリンクを始める」でフクエスリンクのホーム /mypage/media へ（コネックエフのご案内 /mypage/conecf と同じ形）。
// ★ 使っているお店（駅ちかから反映中）はバナーから直接ホームへ行く（page.tsx の renderMediaLink）。
// ★ 文字は少なく・大きく。★ 地の色は /mypage/media/layout.tsx の黄色がそのまま効く。
// ★ 中身はフクエスリンクの決めごと（第668便: 駅ちかから反映だけ・出勤/セラピスト/即ヒメは ID・PW なし・写メ日記は ID・PW を入れたら）に合わせてある。
//   ★ 決めごとが変わったらここも直すこと。

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'フクエスリンクのご案内｜フクエス マイページ' };

const ITEMS: ReadonlyArray<{ t: string; d: string; note?: boolean }> = [
  { t: '出勤', d: '毎朝6時台に反映' },
  { t: 'セラピスト', d: '新人さんも自動で登録' },
  { t: '即ヒメ', d: 'フクエスの「今すぐ」に' },
  { t: '写メ日記', d: '駅ちかのID・PWを登録すると', note: true },
];

const STEPS: ReadonlyArray<string> = [
  '下の「フクエスリンクを始める」を押す',
  '駅ちかのお店ページのURLを運営事務局に送る',
  '運営が登録すると、自動で反映が始まります',
];

export default function MediaIntroPage() {
  return (
    <main className="min-h-screen py-6 sm:py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/mypage/sidebar/link-v2.webp"
          alt="フクエスリンク　フクエスを自動で更新"
          width={600}
          height={200}
          className="block w-full max-w-[600px] h-auto mx-auto border border-amber-200"
        />

        {/* ── 一言で ── */}
        <section className="bg-white border border-amber-200 shadow-sm p-6 text-center">
          <p className="text-[22px] sm:text-[26px] font-black text-slate-800 leading-snug">
            駅ちかを更新するだけで、
            <br />
            <span className="text-amber-700">フクエスも自動で更新</span>
          </p>
          <p className="mt-2 text-[15px] text-slate-600">フクエスでの二度打ちが要らなくなります。</p>

          {/* 流れの絵（駅ちか → フクエス） */}
          <div className="mt-5 flex items-center justify-center gap-3 sm:gap-5">
            <div className="w-28 sm:w-36 border-2 border-slate-300 bg-slate-50 py-3">
              <p className="text-[17px] font-black text-slate-700">駅ちか</p>
              <p className="text-[12px] text-slate-500">いつもどおり入力</p>
            </div>
            <svg width="40" height="24" viewBox="0 0 40 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-amber-600 flex-shrink-0" aria-hidden>
              <path d="M2 12h34M28 4l8 8-8 8" />
            </svg>
            <div className="w-28 sm:w-36 border-2 border-amber-500 bg-amber-50 py-3">
              <p className="text-[17px] font-black text-amber-800">フクエス</p>
              <p className="text-[12px] text-amber-800/80">自動で反映</p>
            </div>
          </div>

          <p className="mt-5 inline-block px-4 py-1.5 bg-amber-100 text-[14px] font-bold text-amber-900">
            フクエス契約店舗様は無料
          </p>
        </section>

        {/* ── 反映されるもの ── */}
        <section className="bg-white border border-amber-200 shadow-sm p-6">
          <h2 className="text-[17px] font-black text-slate-800 text-center">反映されるもの</h2>
          <ul className="mt-4 grid grid-cols-2 gap-2.5">
            {ITEMS.map((x) => (
              <li key={x.t} className="border border-emerald-200 bg-emerald-50 px-3 py-3 text-center">
                <span className="block text-[20px] font-black leading-none text-emerald-600">○</span>
                <span className="block mt-1.5 text-[16px] font-bold text-slate-800">{x.t}</span>
                <span className={`block mt-0.5 text-[12.5px] leading-snug ${x.note ? 'text-amber-700 font-bold' : 'text-slate-500'}`}>{x.d}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[13px] text-slate-500 leading-relaxed">
            ※ キャッチ・紹介文・特徴バッジは反映されません。フクエスで入力してください（AIで下書きを作れます）。
            <br />
            ※ 駅ちかとフクエスのセラピスト名は同じにしてください。
          </p>
        </section>

        {/* ── 始め方 ── */}
        <section className="bg-white border border-amber-200 shadow-sm p-6">
          <h2 className="text-[17px] font-black text-slate-800 text-center">始め方</h2>
          <ol className="mt-4 space-y-2.5">
            {STEPS.map((t, i) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex-shrink-0 w-8 h-8 grid place-items-center bg-amber-600 text-white text-[15px] font-black">{i + 1}</span>
                <span className="text-[15px] font-bold text-slate-700">{t}</span>
              </li>
            ))}
          </ol>
          {/* ★ 運営の登録（importSourceAdmin）は link_mode='read' で入る＝押す手順はない。★ 止めたお店だけはホームのボタンで再開 */}
          <p className="mt-4 text-[13px] text-slate-500 leading-relaxed">
            ※ 一度止めたお店は、ホームの「駅ちかから反映にする」を押すだけで再開できます。
          </p>
        </section>

        {/* ★ ボタンは HTML（押せるように）。★ PC は横並び・スマホは縦並び（コネックエフのご案内と同じ） */}
        <div className="flex flex-col sm:flex-row gap-3">
          <Link
            href="/mypage/media"
            className="flex-1 text-center py-4 bg-gradient-to-r from-[#b45309] to-[#d97706] text-white text-[17px] font-black shadow-md hover:opacity-95"
          >
            フクエスリンクを始める
          </Link>
          <Link href="/mypage" className="sm:w-56 text-center py-4 border-2 border-[#d97706] bg-white text-[15px] font-bold text-[#b45309] hover:bg-amber-50">
            マイページへ戻る
          </Link>
        </div>

        <p className="pb-6 text-center text-[12.5px] text-slate-500 leading-relaxed">
          駅ちか以外（エステ魂など）にもまとめて送りたいお店は
          <Link href="/mypage/conecf" className="underline font-bold text-slate-600">コネックエフ</Link>
          をご覧ください。
        </p>
      </div>
    </main>
  );
}
