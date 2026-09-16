'use client';

import Link from 'next/link';
import {
  GUIDE_HREF, GUIDE_INTRO, GUIDE_SITES, GUIDE_MODES, GUIDE_STEPS, GUIDE_OPTIONAL, GUIDE_SERVICE_NOTE,
} from '@/lib/mediaGuide';

// はじめての方へ（使い方・Q&A）の本文（第394便・2026-09-16・カッキーさん）。
// ★ 読む順: フクエスリンクとは → できること → 3つの設定 → はじめの4ステップ → 注意。
// ★ 第394便b（カッキーさん）: Q&A は別ページ（QaBoard・/mypage/media/qa）に分けた。
// ★ 見た目は反映の早見表（MatrixBoard）と同じカード。★ 角丸なし・紺。

const card = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5';

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-[17px] font-black text-slate-800">
      <span className="w-1.5 h-5 bg-gradient-to-b from-indigo-700 to-indigo-500" aria-hidden />
      {children}
    </h2>
  );
}

function GoLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="inline-block text-[14px] font-bold text-indigo-600 underline underline-offset-4 hover:text-indigo-800">
      {children} ›
    </Link>
  );
}

const STATUS_BADGE = {
  ok:        { label: '使えます',     cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  limited:   { label: '一部のみ',     cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  preparing: { label: '準備中',       cls: 'bg-slate-50 text-slate-500 border-slate-200' },
} as const;

export { card as guideCard, SectionTitle, GoLink };

export function GuideBoard() {
  return (
    <div className="space-y-4">

      {/* ── フクエスリンクとは ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>{GUIDE_INTRO.title}</SectionTitle>
        <p className="text-[15.5px] font-bold text-slate-700 leading-relaxed">{GUIDE_INTRO.lead}</p>
        {/* ★ 流れを1本の絵で見せる（入力はフクエス1か所 → 各サイト） */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-center">
          <div className="flex-1 border border-indigo-200 bg-indigo-50 px-3 py-2.5">
            <div className="text-[12px] font-bold text-indigo-500">入力するのは</div>
            <div className="text-[16px] font-black text-indigo-800">フクエス</div>
          </div>
          <div className="text-indigo-400 font-black text-[18px] rotate-90 sm:rotate-0" aria-hidden>→</div>
          <div className="flex-1 border border-indigo-200 bg-indigo-50 px-3 py-2.5">
            <div className="text-[12px] font-bold text-indigo-500">自動で更新</div>
            <div className="text-[16px] font-black text-indigo-800">フクエスリンク</div>
          </div>
          <div className="text-indigo-400 font-black text-[18px] rotate-90 sm:rotate-0" aria-hidden>→</div>
          <div className="flex-1 border border-slate-200 bg-slate-50 px-3 py-2.5">
            <div className="text-[12px] font-bold text-slate-400">反映先</div>
            <div className="text-[14.5px] font-black text-slate-700">駅ちか・エステ魂 など</div>
          </div>
        </div>
        <ul className="space-y-1.5">
          {GUIDE_INTRO.points.map((p) => (
            <li key={p} className="flex gap-2 text-[14.5px] text-slate-600 leading-relaxed">
              <span className="text-emerald-600 font-black flex-none">✓</span>{p}
            </li>
          ))}
        </ul>
      </section>

      {/* ── サイトごとにできること ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>連携できるサイトと、できること</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {GUIDE_SITES.map((s) => (
            <div key={s.name} className="border border-slate-200 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <b className="text-[15.5px] font-black text-slate-800">{s.name}</b>
                <span className={`text-[12px] font-bold border px-2 py-0.5 ${STATUS_BADGE[s.status].cls}`}>
                  {STATUS_BADGE[s.status].label}
                </span>
              </div>
              {s.items.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {s.items.map((it) => (
                    <span key={it} className="text-[12.5px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5">{it}</span>
                  ))}
                </div>
              )}
              {s.note && <p className="mt-2 text-[13px] text-slate-500 leading-relaxed">{s.note}</p>}
            </div>
          ))}
        </div>
        <GoLink href={GUIDE_HREF.matrix}>反映の早見表（何が・どれくらいで反映されるか）</GoLink>
      </section>

      {/* ── 3つの設定 ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>更新の向きは3つから選びます</SectionTitle>
        <p className="text-[14px] text-slate-500 leading-relaxed">ホームで選びます。あとからいつでも変えられます。</p>
        <div className="space-y-2">
          {GUIDE_MODES.map((m) => (
            <div
              key={m.label}
              className={`border px-3.5 py-3 ${m.recommended ? 'border-indigo-300 bg-indigo-50/60' : 'border-slate-200'}`}
            >
              <div className="flex items-center gap-2">
                <b className={`text-[15px] font-black ${m.recommended ? 'text-indigo-800' : 'text-slate-700'}`}>{m.label}</b>
                {m.recommended && (
                  <span className="text-[11.5px] font-bold text-white bg-indigo-600 px-1.5 py-0.5">おすすめ</span>
                )}
              </div>
              <p className="mt-1 text-[14px] text-slate-600 leading-relaxed">{m.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── はじめの4ステップ ── */}
      <section className={`${card} space-y-4`}>
        <SectionTitle>はじめの{GUIDE_STEPS.length}ステップ</SectionTitle>
        <ol className="space-y-4">
          {GUIDE_STEPS.map((st, i) => (
            <li key={st.title} className="flex gap-3">
              <span className="flex-none w-8 h-8 grid place-items-center bg-gradient-to-br from-indigo-700 to-indigo-500 text-white text-[15px] font-black">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-1.5">
                <p className="text-[15.5px] font-black text-slate-800 leading-snug pt-1">{st.title}</p>
                <p className="text-[14px] text-slate-600 leading-relaxed">{st.body}</p>
                {st.warn && (
                  <p className="border border-rose-300 bg-rose-50 px-3 py-2 text-[14px] font-bold text-rose-700 leading-relaxed">
                    {st.warn}
                  </p>
                )}
                <GoLink href={GUIDE_HREF[st.link]}>{st.linkLabel}</GoLink>
              </div>
            </li>
          ))}
        </ol>

        <div className="pt-3 border-t border-slate-100">
          <p className="text-[14.5px] font-black text-slate-700">必要に応じて</p>
          <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {GUIDE_OPTIONAL.map((o) => (
              <div key={o.title} className="border border-slate-200 p-3.5 space-y-1.5">
                <b className="text-[14.5px] font-black text-slate-800">{o.title}</b>
                <p className="text-[13.5px] text-slate-600 leading-relaxed">{o.body}</p>
                <GoLink href={GUIDE_HREF[o.link]}>{o.linkLabel}</GoLink>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 注意（相手先の事情）と Q&A への入口（第394便b） ── */}
      <section className={`${card} space-y-3`}>
        <p className="text-[13.5px] text-slate-500 leading-relaxed">※ {GUIDE_SERVICE_NOTE}</p>
        <GoLink href={GUIDE_HREF.qa}>よくあるご質問（Q&A）を見る</GoLink>
      </section>
    </div>
  );
}
