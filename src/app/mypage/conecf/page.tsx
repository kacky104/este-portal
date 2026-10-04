// コネックエフのご案内（第667便で作成・第673便で画像5枚に・第1164便で1ページに簡素化・カッキーさんの指示）。
// ★ マイページのサイドバーの「コネックエフ」バナーから、まだ切り替えていないお店が開く説明ページ。読んだあと「始める」で conecf.com へ。
// ★ 切り替え済みのお店はバナーから直接 conecf.com へ行く（page.tsx の renderConecfLink）。★ ここはログインだけで開ける（中身は全店同じ）。読み取りは無い。
// ★★ 第1164便（2026-10-04・カッキーさん）: 画像5枚（概要・対応サイト・違い・注意・始め方）を、大事なところだけの1ページに作り直した。
//   ★ お手本は fukuX 開設のご案内・セラピストページの作り方・フクエスリンクのチラシ（淡い地・角の丸い札・番号の丸・1ページ）。
//   ★ 画像ではなく文字で組んだ（＝文言の直しはこのファイルの配列を書き換えるだけ・alt との食い違いが起きない）。
//   ★ 前の画像は public/mypage/conecf/ に残してある（いまは使っていない）。上のバナー（conecf-intro.webp）も出さない。
//   ★ ボタン2つは今までどおり（コネックエフを始める／マイページへ戻る）。

import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { CONECF_ORIGIN } from '@/lib/conecfHost';

export const metadata: Metadata = { title: 'コネックエフのご案内｜フクエス マイページ' };

// ── 色（コネックエフの青）。ここだけ直せば全体が変わる ──
const INK = '#1b2540'; // 見出しの濃い色
const BLUE = '#2563eb'; // 主役の青
const NAVY = '#1e3a8a'; // 濃い青（番号の丸・ボタン）

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const ICONS: Record<'clock' | 'photo' | 'bolt' | 'person', ReactNode> = {
  clock: (<><circle cx="12" cy="12" r="8.5" {...stroke} /><path d="M12 7.5V12l3 2" {...stroke} /></>),
  photo: (<><rect x="3.5" y="5" width="17" height="14" rx="2.5" {...stroke} /><path d="M7 15.5l3.2-3.2 2.6 2.6 2-2 2.2 2.2" {...stroke} /><circle cx="15.8" cy="9" r="1" fill="currentColor" /></>),
  bolt: (<path d="M13 3.5L6 13.5h5l-1 7 7-10h-5l1-7z" {...stroke} />),
  person: (<><circle cx="10" cy="8.5" r="3.5" {...stroke} /><path d="M3.5 19.5c.6-3.4 3.2-5.2 6.5-5.2 1.3 0 2.5.3 3.5.8" {...stroke} /><path d="M18 13.5v6M15 16.5h6" {...stroke} /></>),
};

/** 01 まとめて更新できるもの（4枚） */
const ITEMS: ReadonlyArray<{ icon: keyof typeof ICONS; name: string; sub: string }> = [
  { icon: 'clock', name: '出勤', sub: '7日分をまとめて' },
  { icon: 'photo', name: '写メ日記', sub: '書くのは1回' },
  { icon: 'bolt', name: '今すぐ', sub: '即ヒメ・即セラも' },
  { icon: 'person', name: 'セラピスト', sub: '登録・写真の更新' },
];

/** 02 始め方（4つ） */
const STEPS: ReadonlyArray<{ title: string; sub: string }> = [
  { title: '「コネックエフを始める」を押す', sub: 'この下のボタンです。フクエスと同じメールアドレス・パスワードでログインします。' },
  { title: '「コネックエフに切り替える」を押す', sub: 'コネックエフのホームにあります。' },
  { title: '駅ちかから最初に1回だけ取り込む', sub: '今のセラピストと出勤が、そのままコネックエフに入ります。' },
  { title: '各サイトのID・パスワードを登録', sub: '駅ちか・エステ魂などのログイン情報を入れたら準備完了です。' },
];

/** 始める前に（注意は3つだけ） */
const NOTES: ReadonlyArray<{ lead: string; body: string }> = [
  { lead: 'フクエスリンクとは、どちらか一方です。', body: 'コネックエフに切り替えると、駅ちかからの取り込みは止まります。' },
  { lead: 'ほかの連携ツール（ベンリーなど）は、連携を外してから。', body: '同じサイトに2つのツールから書き込むと、上書きし合います。' },
  { lead: '元に戻したいときは、運営事務局へ。', body: '取り込み（フクエスリンク）に戻せます。' },
];

function SectionHead({ no, children, tag }: { no: string; children: ReactNode; tag?: string }) {
  return (
    <div className="mt-9 mb-4 flex items-center justify-between gap-3">
      <h2 className="flex items-baseline gap-3 text-[21px] sm:text-[24px] font-black" style={{ color: INK }}>
        <span className="text-[13px] font-bold" style={{ color: BLUE }}>{no}</span>
        {children}
      </h2>
      {tag && <span className="flex-shrink-0 rounded-full bg-[#e6edfd] px-4 py-1.5 text-[12.5px] font-bold" style={{ color: NAVY }}>{tag}</span>}
    </div>
  );
}

export default function ConecfIntroPage() {
  return (
    <main className="min-h-screen bg-slate-50 py-6 sm:py-10 px-3 sm:px-4">
      <div className="max-w-3xl mx-auto">
        <article className="overflow-hidden border border-[#dfe7f8] bg-[#f8faff] shadow-sm">
          <div className="h-1.5" style={{ background: BLUE }} />
          <div className="px-4 sm:px-10 pt-6 sm:pt-7 pb-8">
            {/* ── 見出しの行 ── */}
            <div className="flex items-center justify-between gap-3">
              <p className="flex items-baseline gap-3 whitespace-nowrap">
                <span className="text-[24px] sm:text-[30px] font-black tracking-tight" style={{ color: INK }}>コネックエフ</span>
                <span className="hidden sm:inline text-[14px] font-bold" style={{ color: BLUE }}>のご案内</span>
              </p>
              <span className="flex-shrink-0 rounded-full bg-[#e6edfd] px-3 sm:px-4 py-1.5 text-[11.5px] sm:text-[12.5px] font-bold" style={{ color: NAVY }}>フクエス契約店舗様へ</span>
            </div>

            {/* ── いちばん言いたいこと ＋ 流れの絵 ── */}
            <div className="mt-7 grid gap-6 sm:grid-cols-[1fr_236px] sm:items-center">
              <div>
                <h1 className="text-[36px] sm:text-[46px] font-black leading-[1.25] tracking-tight" style={{ color: INK }}>
                  入力は、
                  <br />
                  <span style={{ color: BLUE }}>1か所だけ。</span>
                </h1>
                <p className="mt-4 text-[17px] sm:text-[19px] font-black leading-relaxed" style={{ color: NAVY }}>
                  フクエス・駅ちか・エステ魂も、
                  <br />
                  まとめて自動で更新されます。
                </p>
                <div className="mt-5 flex flex-wrap gap-2.5">
                  {['二度打ち ゼロ', '利用料 無料'].map((t) => (
                    <span key={t} className="rounded-full px-6 py-2.5 text-[15px] font-black text-white" style={{ background: BLUE }}>{t}</span>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-[#dfe7f8] bg-white p-4 text-center">
                <div className="rounded-xl border-2 px-3 py-3" style={{ borderColor: BLUE }}>
                  <p className="text-[19px] font-black" style={{ color: INK }}>コネックエフ</p>
                  <p className="mt-0.5 text-[12.5px] text-slate-500">ここだけ入力</p>
                </div>
                <svg viewBox="0 0 24 24" className="mx-auto my-1.5 h-7 w-7" style={{ color: BLUE }} aria-hidden><path d="M12 4v15M6 13.5l6 6 6-6" {...stroke} strokeWidth={2.4} /></svg>
                <div className="rounded-xl px-3 py-3 text-white" style={{ background: BLUE }}>
                  <div className="flex flex-wrap justify-center gap-1.5">
                    {['フクエス', '駅ちか', 'エステ魂'].map((s) => (
                      <span key={s} className="rounded-full bg-white/20 px-2.5 py-1 text-[13.5px] font-black">{s}</span>
                    ))}
                  </div>
                  <p className="mt-1.5 text-[12.5px] font-bold text-white/90">自動で更新</p>
                </div>
              </div>
            </div>

            {/* ── 01 まとめて更新できるもの ── */}
            <SectionHead no="01">まとめて更新できるもの</SectionHead>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {ITEMS.map((it) => (
                <li key={it.name} className="rounded-2xl border border-[#dfe7f8] bg-white px-3 py-4 text-center">
                  <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-[#e6edfd]" style={{ color: NAVY }}>
                    <svg viewBox="0 0 24 24" className="h-7 w-7" aria-hidden>{ICONS[it.icon]}</svg>
                  </span>
                  <p className="mt-2.5 text-[17px] font-black" style={{ color: INK }}>{it.name}</p>
                  <p className="mt-0.5 text-[13px] text-slate-500">{it.sub}</p>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[12.5px] text-slate-500">エステラブへは写メ日記を送れます。全国エステランキングは準備中です。</p>

            {/* ── 02 始め方 ── */}
            <SectionHead no="02" tag="4つのステップ">始め方</SectionHead>
            <ol className="rounded-2xl border border-[#dfe7f8] bg-white px-3.5 sm:px-6 py-2">
              {STEPS.map((s, i) => (
                <li key={s.title} className={`flex items-start gap-3 sm:gap-3.5 py-3.5 ${i > 0 ? 'border-t border-[#eef2fb]' : ''}`}>
                  <span className="mt-0.5 flex h-8 w-8 sm:h-9 sm:w-9 flex-shrink-0 items-center justify-center rounded-full text-[16px] sm:text-[17px] font-black text-white" style={{ background: NAVY }}>{i + 1}</span>
                  <div className="min-w-0">
                    <p className="text-[15px] sm:text-[16.5px] font-black leading-snug" style={{ color: INK }}>{s.title}</p>
                    <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500">{s.sub}</p>
                  </div>
                </li>
              ))}
            </ol>

            {/* ── 始める前に ── */}
            <div className="mt-6 rounded-2xl bg-[#e6edfd] px-4 sm:px-6 py-5">
              <p className="text-[17px] font-black" style={{ color: BLUE }}>始める前に</p>
              <ul className="mt-2.5 space-y-2.5">
                {NOTES.map((n) => (
                  <li key={n.lead}>
                    <p className="text-[14.5px] font-black" style={{ color: INK }}>{n.lead}</p>
                    <p className="text-[13.5px] leading-relaxed text-slate-600">{n.body}</p>
                  </li>
                ))}
              </ul>
            </div>

            <p className="mt-7 border-t border-[#dfe7f8] pt-4 text-center text-[13.5px] font-bold" style={{ color: NAVY }}>
              くわしい使い方は、コネックエフの
              <a href={`${CONECF_ORIGIN}/guide`} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: BLUE }}>はじめての方へ</a>
              をご覧ください。
            </p>
          </div>
        </article>

        {/* ★ ボタンは今までどおり。★ PC は横並び・スマホは縦並び */}
        <div className="mt-5 flex flex-col sm:flex-row gap-3 pb-6">
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
