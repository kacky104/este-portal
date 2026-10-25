'use client';

import { useEffect, useMemo, useState } from 'react';

// フクエスCRM の「使い方」「よくある質問」を表示する（第648便・第1660便で作り直し）。
// ★ 本文は src/app/lib/crm/guideText.ts（「## 」見出し・「- 」「1. 」箇条・空行で段落・「Q. 」「A. 」）。ここは見せ方だけ。
// ★ 第1660便: 左に固定の目次（スマホは横並びのチップ）・見出しをテーマ別にまとめる・手順は番号の丸・「項目 … 説明」は2列・
//   「」のボタン名は太字・よくある質問は折りたたみ＋検索・冒頭に「まずここから」の近道。
// ★ 見出しの名前を guideText.ts で変えたら、下の GUIDE_GROUPS / FAQ_GROUPS / SHORTCUTS も合わせること。

function slug(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

// 使い方の見出しをテーマ別に（順番はここの通りに並ぶ。ここに無い見出しは最後の「その他」に入る）
const GUIDE_GROUPS: { label: string; heads: string[] }[] = [
  { label: '基本', heads: ['はじめに', '画面の並び（上の帯）', 'スケジュールの見方'] },
  { label: '毎日の受付', heads: ['予約を受け付ける（かんたん受付）', '予約を見る・変える・キャンセルする', 'フクエスからのネット予約', 'セラピストの出勤情報（名前を押す）', 'セラピストへ LINE で知らせる（名前の横の「LINE」）'] },
  { label: 'お金', heads: ['報酬確定と締め作業', '料金設定'] },
  { label: 'お客様と同意書', heads: ['顧客台帳', '来店時の同意書（QR）'] },
  { label: '設定・ログイン', heads: ['設定', 'ログインについて'] },
];

// 冒頭の近道
const SHORTCUTS: { title: string; desc: string; head: string }[] = [
  { title: '予約を受け付ける', desc: '帯の空いているところを押す → かんたん受付', head: '予約を受け付ける（かんたん受付）' },
  { title: '予約を変える・キャンセル', desc: 'カードを押す → 変更する／キャンセルにする', head: '予約を見る・変える・キャンセルする' },
  { title: 'その日を締める', desc: '名前の下の「確定」→ 締め作業（日報を作る）', head: '報酬確定と締め作業' },
  { title: 'ログインできない', desc: 'マイページと同じアカウント。別に1回ログイン', head: 'ログインについて' },
];

type Section = { head: string; blocks: string[][] };

function parseSections(text: string): Section[] {
  const out: Section[] = [];
  let cur: Section | null = null;
  for (const b of text.split(/\n\s*\n/)) {
    const lines = b.split('\n').filter((l) => l.trim() !== '');
    if (lines.length === 0) continue;
    if (lines[0].startsWith('## ')) {
      cur = { head: lines[0].slice(3), blocks: [] };
      out.push(cur);
      if (lines.length > 1) cur.blocks.push(lines.slice(1));
    } else if (cur) {
      cur.blocks.push(lines);
    }
  }
  return out;
}

// 「」で囲んだ言葉（ボタンや項目の名前）を太字にする
function Inline({ text }: { text: string }) {
  const parts = text.split(/(「[^」]+」)/);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('「') && p.endsWith('」') ? (
          <b key={i} className="font-bold text-slate-900">{p}</b>
        ) : (
          <span key={i}>{linkify(p)}</span>
        ),
      )}
    </>
  );
}

function linkify(s: string) {
  const parts = s.split(/(https?:\/\/[^\s　）]+)/);
  return parts.map((p, i) =>
    /^https?:\/\//.test(p) ? (
      <a key={i} href={p} className="break-all text-indigo-700 underline">{p}</a>
    ) : (
      <span key={i}>{p}</span>
    ),
  );
}

// 1ブロック（空行で区切った塊）を描く：番号手順／「項目 … 説明」の表／箇条／段落
function Block({ lines }: { lines: string[] }) {
  const numbered = lines.filter((l) => /^\d+\. /.test(l));
  const bullets = lines.filter((l) => l.startsWith('- '));
  // 番号手順（1. 2. …）
  if (numbered.length > 0) {
    return (
      <div className="space-y-2">
        {lines.map((l, i) => {
          const m = l.match(/^(\d+)\. (.*)$/);
          if (m) {
            return (
              <div key={i} className="flex gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-[12px] font-black text-white">{m[1]}</span>
                <p className="leading-relaxed"><Inline text={m[2]} /></p>
              </div>
            );
          }
          if (l.startsWith('- ')) {
            return (
              <div key={i} className="ml-9 border-l-2 border-amber-300 bg-amber-50 px-3 py-1.5 text-[13px] leading-relaxed text-slate-700">
                <Inline text={l.slice(2)} />
              </div>
            );
          }
          return <p key={i} className="leading-relaxed"><Inline text={l} /></p>;
        })}
      </div>
    );
  }
  // 「項目 … 説明」が並ぶ箇条は2列に
  const defs = bullets.map((l) => l.slice(2).split(' … '));
  if (bullets.length > 0 && defs.every((d) => d.length === 2 && d[0].length <= 24)) {
    return (
      <dl className="divide-y divide-slate-100 overflow-hidden rounded-lg border border-slate-200">
        {defs.map(([t, d], i) => (
          <div key={i} className="grid grid-cols-1 gap-1 px-3 py-2 sm:grid-cols-[9.5rem_1fr] sm:gap-3">
            <dt className="font-bold text-slate-900">{t}</dt>
            <dd className="leading-relaxed text-slate-700"><Inline text={d} /></dd>
          </div>
        ))}
      </dl>
    );
  }
  // ふつうの箇条・段落
  return (
    <div className="space-y-1.5">
      {lines.map((l, i) =>
        l.startsWith('- ') ? (
          <p key={i} className="flex gap-2 leading-relaxed">
            <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-400" />
            <span><Inline text={l.slice(2)} /></span>
          </p>
        ) : (
          <p key={i} className="leading-relaxed"><Inline text={l} /></p>
        ),
      )}
    </div>
  );
}

function GuideBody({ sections }: { sections: Section[] }) {
  const byHead = new Map(sections.map((s) => [s.head, s]));
  const used = new Set<string>();
  const groups = GUIDE_GROUPS.map((g) => ({ label: g.label, secs: g.heads.map((h) => byHead.get(h)).filter((s): s is Section => { if (s) used.add(s.head); return !!s; }) }));
  const rest = sections.filter((s) => !used.has(s.head));
  if (rest.length > 0) groups.push({ label: 'その他', secs: rest });
  // 通し番号（01, 02 …）
  const numberOf = new Map<string, number>();
  groups.forEach((g) => g.secs.forEach((s) => numberOf.set(s.head, numberOf.size + 1)));
  return (
    <div className="space-y-10">
      {groups.map((g) => (
        <div key={g.label}>
          <p className="mb-3 inline-block rounded-full bg-indigo-600 px-3 py-0.5 text-[12px] font-black tracking-wide text-white">{g.label}</p>
          <div className="space-y-4">
            {g.secs.map((s) => {
              const n = numberOf.get(s.head) ?? 0;
              return (
                <section key={s.head} id={slug(s.head)} className="scroll-mt-28 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <h2 className="mb-3 flex items-start gap-2 text-[17px] font-black text-slate-900">
                    <span className="mt-0.5 shrink-0 text-[12px] font-black text-indigo-500">{String(n).padStart(2, '0')}</span>
                    {s.head}
                  </h2>
                  <div className="space-y-3 text-[14px] text-slate-700">
                    {s.blocks.map((b, i) => <Block key={i} lines={b} />)}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

type Qa = { q: string; a: string[] };

function parseFaq(text: string): { head: string; items: Qa[] }[] {
  return parseSections(text).map((s) => ({
    head: s.head,
    items: s.blocks
      .filter((b) => b[0]?.startsWith('Q. '))
      .map((b) => ({ q: b[0].slice(3), a: b.slice(1).map((l) => (l.startsWith('A. ') ? l.slice(3) : l)) })),
  }));
}

function FaqBody({ groups, query }: { groups: { head: string; items: Qa[] }[]; query: string }) {
  const q = query.trim().toLowerCase();
  const filtered = groups
    .map((g) => ({ ...g, items: q ? g.items.filter((it) => (it.q + it.a.join(' ')).toLowerCase().includes(q)) : g.items }))
    .filter((g) => g.items.length > 0);
  if (filtered.length === 0) return <p className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-[14px] text-slate-500">「{query}」に合う質問は見つかりませんでした。別の言葉で探すか、「使い方」をご覧ください。</p>;
  return (
    <div className="space-y-8">
      {filtered.map((g) => (
        <section key={g.head} id={slug(g.head)} className="scroll-mt-28">
          <h2 className="mb-2 flex items-center gap-2 text-[16px] font-black text-slate-900">
            {g.head}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">{g.items.length}件</span>
          </h2>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            {g.items.map((it) => (
              <details key={it.q} open={!!q} className="group">
                <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-3 text-[14px] font-bold text-slate-900 hover:bg-indigo-50/60">
                  <span className="mt-0.5 shrink-0 rounded bg-indigo-600 px-1.5 text-[11px] font-black text-white">Q</span>
                  <span className="flex-1 leading-relaxed">{it.q}</span>
                  <span className="mt-1 shrink-0 text-slate-400 transition group-open:rotate-180">▼</span>
                </summary>
                <div className="flex gap-3 bg-slate-50 px-4 py-3 text-[14px] leading-relaxed text-slate-700">
                  <span className="mt-0.5 shrink-0 rounded bg-pink-500 px-1.5 text-[11px] font-black text-white">A</span>
                  <div className="space-y-1">{it.a.map((l, i) => <p key={i}><Inline text={l} /></p>)}</div>
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function GuideView({ guide, faq }: { guide: string; faq: string }) {
  // ★ 第1228便: 初期値はサーバーと同じ 'guide' にして、#faq は開いたあとに見る（サーバー＝使い方／ブラウザ＝FAQ の不一致を避ける）
  const [tab, setTab] = useState<'guide' | 'faq'>('guide');
  const [query, setQuery] = useState('');
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL の #faq を開いたあとに読む（ハイドレーション後の1回だけ）
    if (window.location.hash === '#faq') setTab('faq');
  }, []);
  const sections = useMemo(() => parseSections(guide), [guide]);
  const faqGroups = useMemo(() => parseFaq(faq), [faq]);
  const faqCount = faqGroups.reduce((a, g) => a + g.items.length, 0);

  // 目次（使い方はテーマ別、よくある質問は見出し）
  const toc: { label: string; items: string[] }[] = tab === 'guide'
    ? GUIDE_GROUPS.map((g) => ({ label: g.label, items: g.heads.filter((h) => sections.some((s) => s.head === h)) }))
    : [{ label: 'よくある質問', items: faqGroups.map((g) => g.head) }];

  const switchTab = (k: 'guide' | 'faq') => {
    setTab(k);
    try { window.history.replaceState(null, '', k === 'faq' ? '#faq' : '#'); } catch { /* 何もしない */ }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-700">
      {/* 上の帯（固定）：タイトルとタブ */}
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
          <div className="flex items-baseline justify-between gap-3">
            <h1 className="text-xl font-black text-slate-900 sm:text-2xl">フクエスCRM 使い方・よくある質問</h1>
            <a href="https://fukuescrm.com" className="hidden shrink-0 rounded-md border border-indigo-200 bg-indigo-50 px-3 py-1 text-[12px] font-bold text-indigo-700 hover:bg-indigo-100 sm:inline-block">CRM を開く</a>
          </div>
          <p className="mt-1 text-[12px] text-slate-500">お店のスタッフ向け。画面の名前は、実際のボタンや項目と同じ言葉で書いています。</p>
          <div className="mt-3 flex gap-1">
            {([['guide', '使い方（取扱説明書）', sections.length], ['faq', 'よくある質問', faqCount]] as const).map(([k, label, count]) => (
              <button
                key={k}
                type="button"
                onClick={() => switchTab(k)}
                className={`-mb-px rounded-t-lg border px-4 py-2 text-[14px] font-bold ${tab === k ? 'border-slate-200 border-b-white bg-white text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
              >
                {label}
                <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${tab === k ? 'bg-indigo-100 text-indigo-700' : 'bg-slate-100 text-slate-500'}`}>{count}</span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:grid lg:grid-cols-[14rem_1fr] lg:gap-8">
        {/* 目次：パソコンは左に固定、スマホは横並びのチップ */}
        <aside className="mb-5 lg:mb-0">
          <nav className="flex gap-1.5 overflow-x-auto pb-1 lg:sticky lg:top-32 lg:block lg:space-y-4 lg:overflow-visible lg:pb-0">
            {toc.map((g) => (
              <div key={g.label} className="flex shrink-0 gap-1.5 lg:block">
                <p className="hidden text-[11px] font-black tracking-wide text-slate-400 lg:mb-1 lg:block">{g.label}</p>
                {g.items.map((h) => (
                  <a
                    key={h}
                    href={`#${slug(h)}`}
                    className="block whitespace-nowrap rounded-full border border-slate-200 bg-white px-3 py-1 text-[12px] font-bold text-slate-600 hover:border-indigo-300 hover:text-indigo-700 lg:whitespace-normal lg:rounded-md lg:border-0 lg:border-l-2 lg:border-transparent lg:bg-transparent lg:px-2 lg:py-1 lg:hover:border-indigo-400 lg:hover:bg-indigo-50"
                  >
                    {h}
                  </a>
                ))}
              </div>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          {tab === 'guide' ? (
            <>
              {/* まずここから（近道） */}
              <div className="mb-8">
                <p className="mb-2 text-[12px] font-black tracking-wide text-slate-400">まずここから</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {SHORTCUTS.map((s) => (
                    <a key={s.head} href={`#${slug(s.head)}`} className="rounded-xl border border-indigo-100 bg-white p-3 shadow-sm hover:border-indigo-300 hover:bg-indigo-50/40">
                      <p className="text-[14px] font-black text-indigo-700">{s.title} →</p>
                      <p className="mt-0.5 text-[12px] text-slate-500">{s.desc}</p>
                    </a>
                  ))}
                </div>
              </div>
              <GuideBody sections={sections} />
            </>
          ) : (
            <>
              <div className="mb-6">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="困っていることを言葉で探す（例：アラーム、QR、ログイン）"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-[14px] shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                />
                <p className="mt-1.5 text-[12px] text-slate-500">質問を押すと答えが開きます。答えが見つからないときは「使い方」もご覧ください。</p>
              </div>
              <FaqBody groups={faqGroups} query={query} />
            </>
          )}

          <footer className="mt-12 rounded-xl border border-slate-200 bg-white p-4 text-[13px] text-slate-600">
            <p className="font-black text-slate-800">アドレスと連絡先</p>
            <ul className="mt-2 space-y-1">
              <li>フクエスCRM：<a href="https://fukuescrm.com" className="text-indigo-700 underline">https://fukuescrm.com</a></li>
              <li>パスワードの再設定：<a href="https://fukues.com/forgot-password?from=owner" className="break-all text-indigo-700 underline">https://fukues.com/forgot-password?from=owner</a></li>
              <li>困ったときは、フクエスのマイページの「運営事務局（お問い合わせ等）」からご連絡ください。</li>
            </ul>
          </footer>
        </main>
      </div>
    </div>
  );
}
