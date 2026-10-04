'use client';

import type { ReactNode } from 'react';
import { useCrmLinks } from './CrmBase';
import { CRM_INTRO, type CrmIntroIcon } from '@/lib/crmIntro';

// フクエスCRM「ご案内」（第1144便・2026-10-04・カッキーさん）。★ 未契約の店舗様が入口を押したときに出る。
//   ★ ログイン不要のご案内ページ（fukuescrm.com/about・第1145便）と、マイページの中（CrmShell の未契約）の両方で使う。
//   ★ 中身は lib/crmIntro.ts（純粋なデータ）。★ 契約の判定はサーバー（actions/crm.ts）のまま。ここは見せるだけ。
// ★★ 第1165便（カッキーさん）: コネックエフのご案内（/mypage/conecf・第1164便）と同じ要領で、1ページのチラシの形に作り直した
//   （淡い地・角の丸い札・番号の丸）。札5つ（とは／できること／違いの表／はじめかた／お申し込み）→ 1枚。
//   ★ いちばん上のバナー（crm-intro.webp・第1147便）は出さない（見出しの行が代わり）。画像は public に残してある。
//   ★ ボタンは紙の外に大きく3つ（運営に申し込む＝第1163便の行き先のまま／使い方／マイページへ戻る）。

// ── 色（フクエスCRM の藍）。ここだけ直せば全体が変わる ──
const INK = '#1b2540'; // 見出しの濃い色
const MAIN = '#4f46e5'; // 主役の藍（indigo-600）
const NAVY = '#1e2a5a'; // 濃い紺（番号の丸・/about の帯と同じ）

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
const ICONS: Record<CrmIntroIcon, ReactNode> = {
  calendar: (<><rect x="3.5" y="5" width="17" height="15" rx="2.5" {...stroke} /><path d="M3.5 10h17M8 3.5v3M16 3.5v3" {...stroke} /></>),
  users: (<><circle cx="9" cy="8.5" r="3.2" {...stroke} /><path d="M3 19.5c.5-3.2 2.9-5 6-5s5.5 1.8 6 5" {...stroke} /><path d="M16 5.6a3.2 3.2 0 010 5.8M18.2 14.9c1.6.8 2.5 2.3 2.8 4.6" {...stroke} /></>),
  list: (<><path d="M9 7h11M9 12h11M9 17h11" {...stroke} /><circle cx="4.8" cy="7" r="1" fill="currentColor" /><circle cx="4.8" cy="12" r="1" fill="currentColor" /><circle cx="4.8" cy="17" r="1" fill="currentColor" /></>),
  chart: (<><path d="M4 20h16" {...stroke} /><path d="M7 20v-6M12 20V7M17 20v-9" {...stroke} strokeWidth={2.6} /></>),
  yen: (<><circle cx="12" cy="12" r="8.5" {...stroke} /><path d="M8.8 7.5l3.2 5 3.2-5M12 12.5V17M9.2 12.5h5.6M9.2 15h5.6" {...stroke} /></>),
  tag: (<><path d="M12.5 3.5h7v7L11 19.9a1.5 1.5 0 01-2.1 0l-4.8-4.8a1.5 1.5 0 010-2.1l8.4-9.5z" {...stroke} /><circle cx="16" cy="8" r="1.2" fill="currentColor" /></>),
};

function SectionHead({ no, children, tag }: { no: string; children: ReactNode; tag?: string }) {
  return (
    <div className="mt-9 mb-4 flex items-center justify-between gap-3">
      <h3 className="flex items-baseline gap-3 text-[20px] sm:text-[24px] font-black" style={{ color: INK }}>
        <span className="text-[13px] font-bold" style={{ color: MAIN }}>{no}</span>
        {children}
      </h3>
      {tag && <span className="flex-shrink-0 rounded-full bg-[#e9ebfd] px-4 py-1.5 text-[12.5px] font-bold" style={{ color: NAVY }}>{tag}</span>}
    </div>
  );
}

/** ○ が付いている行（かっこ書きは出さない） */
const has = (v: string) => v.trim().startsWith('○');

export function CrmIntro({ salonName }: { salonName?: string; publicPage?: boolean }) {
  const links = useCrmLinks();
  const c = CRM_INTRO;
  const plain = c.features.filter((f) => !f.accent);
  const accent = c.features.filter((f) => f.accent);
  const freeRows = c.compare.rows.filter((r) => has(r.free));
  const crmRows = c.compare.rows.filter((r) => has(r.crm));
  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-8">
      <article className="overflow-hidden border border-[#dfe2f8] bg-[#f8f9ff] shadow-sm">
        <div className="h-1.5" style={{ background: MAIN }} />
        <div className="px-4 sm:px-10 pt-6 sm:pt-7 pb-8">
          {/* ── 見出しの行 ── */}
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-baseline gap-3 whitespace-nowrap">
              <span className="text-[24px] sm:text-[30px] font-black tracking-tight" style={{ color: INK }}>フクエスCRM</span>
              <span className="hidden sm:inline text-[14px] font-bold" style={{ color: MAIN }}>のご案内</span>
            </p>
            <span className="flex-shrink-0 rounded-full bg-[#e9ebfd] px-3 sm:px-4 py-1.5 text-[11.5px] sm:text-[12.5px] font-bold" style={{ color: NAVY }}>{c.hero.audience}</span>
          </div>
          {salonName && <p className="mt-1 text-[12px] font-bold" style={{ color: MAIN }}>{salonName}</p>}

          {/* ── いちばん言いたいこと ＋ 流れの絵 ── */}
          <div className="mt-7 grid gap-6 sm:grid-cols-[1fr_236px] sm:items-center">
            <div>
              <h2 className="text-[33px] sm:text-[44px] font-black leading-[1.25] tracking-tight" style={{ color: INK }}>
                {c.hero.line1}
                <br />
                <span style={{ color: MAIN }}>{c.hero.line2}</span>
              </h2>
              <p className="mt-4 whitespace-pre-line text-[17px] sm:text-[19px] font-black leading-relaxed" style={{ color: NAVY }}>{c.hero.sub}</p>
              <div className="mt-5 flex flex-wrap gap-2.5">
                {c.hero.pills.map((t) => (
                  <span key={t} className="rounded-full px-5 py-2.5 text-[14px] sm:text-[15px] font-black text-white" style={{ background: MAIN }}>{t}</span>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-[#dfe2f8] bg-white p-4 text-center">
              {c.flow.map((f, i) => {
                const last = i === c.flow.length - 1;
                return (
                  <div key={f.name}>
                    {i > 0 && (
                      <svg viewBox="0 0 24 24" className="mx-auto my-1 h-6 w-6" style={{ color: MAIN }} aria-hidden><path d="M12 4v15M6 13.5l6 6 6-6" {...stroke} strokeWidth={2.4} /></svg>
                    )}
                    <div className={`rounded-xl px-3 py-2.5 ${last ? 'text-white' : 'border-2'}`} style={last ? { background: MAIN } : { borderColor: '#c9cdf6' }}>
                      <p className={`text-[12px] font-bold ${last ? 'text-white/85' : 'text-slate-500'}`}>{f.caption}</p>
                      <p className="text-[16.5px] font-black" style={last ? undefined : { color: INK }}>{f.name}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 01 できること ── */}
          <SectionHead no="01">できること</SectionHead>
          <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-3">
            {plain.map((f) => (
              <li key={f.name} className="flex items-center gap-2 sm:gap-2.5 rounded-2xl border border-[#dfe2f8] bg-white px-2.5 sm:px-3 py-3">
                <span className="flex h-9 w-9 sm:h-10 sm:w-10 flex-shrink-0 items-center justify-center rounded-xl bg-[#e9ebfd]" style={{ color: NAVY }}>
                  <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden>{f.icon ? ICONS[f.icon] : null}</svg>
                </span>
                <span className="text-[13.5px] sm:text-[16px] font-black leading-tight tracking-tight" style={{ color: INK }}>{f.name}</span>
              </li>
            ))}
          </ul>
          {/* ★ 第1148便（カッキーさん）: accent の札はピンク（来店時の同意書・セラピストページへの公開） */}
          <ul className="mt-3 grid gap-3 sm:grid-cols-2">
            {accent.map((f) => (
              <li key={f.name} className="rounded-2xl border border-pink-200 bg-pink-50 px-4 py-4">
                <p className="text-[16px] font-black text-pink-700">{f.name}</p>
                {f.body && <p className="mt-1.5 whitespace-pre-line text-[13.5px] leading-relaxed text-pink-900/80">{f.body}</p>}
              </li>
            ))}
          </ul>

          {/* ── 02 無料との違い（表 → 2枚の札。かっこ書きは出さない） ── */}
          <SectionHead no="02">{c.compare.title}</SectionHead>
          <div className="grid gap-3 sm:grid-cols-[5fr_7fr] sm:items-start">
            <div className="rounded-2xl border border-[#dfe2f8] bg-white px-4 py-4">
              <p className="text-[15px] font-black text-slate-500">{c.compare.freeLabel}</p>
              <ul className="mt-2.5 space-y-1.5">
                {freeRows.map((r) => (
                  <li key={r.item} className="flex gap-2 text-[14px] leading-snug text-slate-600"><span className="flex-none font-black text-slate-400">✓</span>{r.item}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl px-4 py-4 text-white" style={{ background: MAIN }}>
              <p className="text-[15px] font-black">{c.compare.crmLabel}</p>
              <ul className="mt-2.5 space-y-1.5">
                {crmRows.map((r) => (
                  <li key={r.item} className="flex gap-2 text-[14px] font-bold leading-snug"><span className="flex-none font-black text-white/80">✓</span>{r.item}</li>
                ))}
              </ul>
            </div>
          </div>
          <p className="mt-2.5 text-[12.5px] text-slate-500">{c.compare.note}</p>

          {/* ── 03 はじめかた ── */}
          <SectionHead no="03" tag={`${c.steps.length}つのステップ`}>はじめかた</SectionHead>
          <ol className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 sm:gap-3">
            {c.steps.map((s, i) => (
              <li key={s.title} className="rounded-2xl border border-[#dfe2f8] bg-white px-3 py-3.5 text-center">
                <span className="mx-auto flex h-8 w-8 items-center justify-center rounded-full text-[16px] font-black text-white" style={{ background: NAVY }}>{i + 1}</span>
                <p className="mt-2 text-balance text-[13.5px] font-black leading-snug" style={{ color: INK }}>{s.title}</p>
                {s.body && <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">{s.body}</p>}
              </li>
            ))}
          </ol>

          {/* ── お申し込み ── */}
          <div className="mt-6 rounded-2xl bg-[#e9ebfd] px-4 sm:px-6 py-5">
            <p className="text-[17px] font-black" style={{ color: MAIN }}>{c.apply.title}</p>
            <p className="mt-1.5 text-[14.5px] font-bold leading-relaxed" style={{ color: INK }}>{c.apply.body}</p>
          </div>
        </div>
      </article>

      {/* ★ ボタンは紙の外に大きく。★ 第1163便: 「運営に申し込む」の行き先はマイページの「運営事務局」→ お問い合わせ
          （件名と本文を入れた状態で開く。送信は店舗様が押す）。★ PC は横並び・スマホは縦並び */}
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <a href={links.fukues('/mypage?tab=support&apply=crm')} className="flex-1 py-4 text-center text-[17px] font-black text-white shadow-md hover:opacity-95" style={{ background: `linear-gradient(to right, ${NAVY}, ${MAIN})` }}>
          運営に申し込む
        </a>
        <a href={links.special('guide')} target="_blank" rel="noopener" className="flex items-center justify-center border-2 bg-white px-5 py-3.5 text-[14.5px] font-bold hover:bg-indigo-50" style={{ borderColor: MAIN, color: MAIN }}>
          使い方・よくある質問
        </a>
        <a href={links.fukues('/mypage')} className="flex items-center justify-center bg-slate-800 px-5 py-3.5 text-[14.5px] font-bold text-white hover:opacity-90">
          マイページへ戻る
        </a>
      </div>
    </div>
  );
}
