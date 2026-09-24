'use client';

import Link from 'next/link';
import { FUKUES_LINK_GUIDE, type GuideContent } from '@/lib/mediaGuide';
import { useMediaBrand } from './mediaBrand';

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

export function GuideBoard({ content = FUKUES_LINK_GUIDE }: { content?: GuideContent } = {}) {
  const { link, isConecf } = useMediaBrand();
  const c = content;
  return (
    <div className="space-y-4">

      {/* ── フクエスリンクとは ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>{c.intro.title}</SectionTitle>
        <p className="text-[15.5px] font-bold text-slate-700 leading-relaxed">{c.intro.lead}</p>
        {/* ★ 流れを1本の絵で見せる（入力はフクエス1か所 → 各サイト） */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 text-center">
          {c.flow.map((f, i) => (
            <div key={f.name} className="contents">
              {i > 0 && <div className="text-indigo-400 font-black text-[18px] rotate-90 sm:rotate-0" aria-hidden>→</div>}
              {/* ★ 第700便（カッキーさん）: 反映先の箱は灰色 → ピンク基調（フクエスの色）。★ 第778便: コネックエフもピンクに（カッキーさん） */}
              <div className={`flex-1 border px-3 py-2.5 ${i < 2 ? 'border-indigo-200 bg-indigo-50' : 'border-pink-200 bg-pink-50'}`}>
                <div className={`text-[12px] font-bold ${i < 2 ? 'text-indigo-500' : 'text-pink-500'}`}>{f.caption}</div>
                <div className={i < 2 ? 'text-[16px] font-black text-indigo-800' : isConecf ? 'text-[14.5px] font-black text-pink-700' : 'text-[16px] font-black text-pink-700'}>{f.name}</div>
              </div>
            </div>
          ))}
        </div>
        <ul className="space-y-1.5">
          {c.intro.points.map((p) => (
            <li key={p} className="flex gap-2 text-[14.5px] text-slate-600 leading-relaxed">
              <span className="text-emerald-600 font-black flex-none">✓</span>{p}
            </li>
          ))}
        </ul>
      </section>

      {/* ── サイトごとにできること ── */}
      <section className={`${card} space-y-3`}>
        <SectionTitle>{isConecf ? '連携できるサイトと、できること' : '連携できること'}</SectionTitle>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {c.sites.map((s) => (
            <div key={s.name} className="border border-slate-200 p-3.5">
              {/* ★ 第701便: フクエスリンクは駅ちかだけなので「駅ちか／使えます」の行を出さない。★ 2枠目（反映されないもの）は名前だけ出す */}
              {(isConecf || s.status !== 'ok') && (
              <div className="flex items-center justify-between gap-2">
                <b className="text-[15.5px] font-black text-slate-800">{s.name}</b>
                {isConecf && (
                <span className={`text-[12px] font-bold border px-2 py-0.5 ${STATUS_BADGE[s.status].cls}`}>
                  {STATUS_BADGE[s.status].label}
                </span>
                )}
              </div>
              )}
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
        {/* ★ 第671便: 早見表はフクエスリンクの並びから外した（書き込みの表のため）。★ コネックエフだけ出す */}
        {isConecf && <GoLink href={link('matrix')}>反映の早見表（何が・どれくらいで反映されるか）</GoLink>}
      </section>

      {/* ── 3つの設定 ── ★ 第396便: 中身が空なら節ごと出さない（コネックエフには向きの選択が無い） */}
      {c.modes.length > 0 && <section className={`${card} space-y-3`}>
        <SectionTitle>更新の向きは3つから選びます</SectionTitle>
        <p className="text-[14px] text-slate-500 leading-relaxed">ホームで選びます。あとからいつでも変えられます。</p>
        <div className="space-y-2">
          {c.modes.map((m) => (
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
      </section>}

      {/* ── はじめの4ステップ ── */}
      <section className={`${card} space-y-4`}>
        <SectionTitle>はじめの{c.steps.length}ステップ</SectionTitle>
        <ol className="space-y-4">
          {c.steps.map((st, i) => (
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
                <GoLink href={link(st.link)}>{st.linkLabel}</GoLink>
              </div>
            </li>
          ))}
        </ol>

        {c.optional.length > 0 && (
        <div className="pt-3 border-t border-slate-100">
          <p className="text-[14.5px] font-black text-slate-700">必要に応じて</p>
          {/* ★ 第779便: 3つのときは3列（2列だと1つだけ下に余る） */}
          <div className={`mt-2 grid grid-cols-1 gap-3 ${c.optional.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>
            {c.optional.map((o) => (
              <div key={o.title} className="border border-slate-200 p-3.5 space-y-1.5">
                <b className="text-[14.5px] font-black text-slate-800">{o.title}</b>
                <p className="text-[13.5px] text-slate-600 leading-relaxed">{o.body}</p>
                <GoLink href={link(o.link)}>{o.linkLabel}</GoLink>
              </div>
            ))}
          </div>
        </div>
        )}
      </section>

      {/* ── 注意（相手先の事情）と Q&A への入口（第394便b） ── */}
      <section className={`${card} space-y-3`}>
        <p className="text-[13.5px] text-slate-500 leading-relaxed">※ {c.serviceNote}</p>
        <GoLink href={link('qa')}>よくあるご質問（Q&A）を見る</GoLink>
      </section>
    </div>
  );
}
