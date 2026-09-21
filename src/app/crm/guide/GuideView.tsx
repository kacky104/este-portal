'use client';

import { useState } from 'react';

// フクエスCRM の「使い方」「よくある質問」を表示する（第648便）。
// ★ 本文の書き方は TermsView と同じ（「## 」見出し・「- 」「1. 」箇条・空行で段落）。★ よくある質問は「Q. 」「A. 」の行。
// ★ 上に「使い方／よくある質問」の切り替えと、見出しの目次。★ 見出しには id を付けて #で飛べる。

function slug(s: string): string {
  return s.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

function Body({ text, faq }: { text: string; faq: boolean }) {
  const blocks = text.split(/\n\s*\n/);
  return (
    <div>
      {blocks.map((b, i) => {
        const lines = b.split('\n');
        return (
          <div key={i} className={`mb-4 space-y-1 text-[14px] leading-relaxed ${faq && lines[0]?.startsWith('Q. ') ? 'border-l-4 border-indigo-200 bg-slate-50 px-3 py-2' : ''}`}>
            {lines.map((l, j) => {
              if (l.startsWith('## ')) return <h2 key={j} id={slug(l.slice(3))} className="mt-8 scroll-mt-20 border-b-2 border-indigo-200 pb-1 text-lg font-black text-slate-800">{l.slice(3)}</h2>;
              if (faq && l.startsWith('Q. ')) return <p key={j} className="font-black text-slate-800"><span className="mr-1 bg-indigo-600 px-1.5 text-[12px] text-white">Q</span>{l.slice(3)}</p>;
              if (faq && l.startsWith('A. ')) return <p key={j} className="text-slate-700"><span className="mr-1 bg-pink-500 px-1.5 text-[12px] text-white">A</span>{l.slice(3)}</p>;
              if (/^(- |\d+\. )/.test(l)) return <p key={j} className="pl-4 -indent-4">{l.startsWith('- ') ? `・${l.slice(2)}` : l}</p>;
              return <p key={j}>{l}</p>;
            })}
          </div>
        );
      })}
    </div>
  );
}

export function GuideView({ guide, faq }: { guide: string; faq: string }) {
  const [tab, setTab] = useState<'guide' | 'faq'>(() => {
    if (typeof window !== 'undefined' && window.location.hash === '#faq') return 'faq';
    return 'guide';
  });
  const text = tab === 'guide' ? guide : faq;
  const heads = text.split('\n').filter((l) => l.startsWith('## ')).map((l) => l.slice(3));
  return (
    <main className="mx-auto w-full max-w-3xl bg-white px-5 py-8 text-slate-700">
      <h1 className="text-2xl font-black text-slate-900">フクエスCRM 使い方・よくある質問</h1>
      <p className="mt-1 text-[13px] text-slate-500">お店のスタッフ向けです。画面の名前は、実際のボタンや項目と同じ言葉で書いています。</p>
      <div className="mt-4 flex border-b border-slate-200">
        {([['guide', '使い方（取扱説明書）'], ['faq', 'よくある質問']] as const).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => { setTab(k); try { window.history.replaceState(null, '', k === 'faq' ? '#faq' : '#'); } catch { /* 何もしない */ } }}
            className={`px-4 py-2 text-[14px] font-bold ${tab === k ? 'border-b-4 border-indigo-600 text-indigo-700' : 'text-slate-500'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <nav className="mt-4 flex flex-wrap gap-1.5">
        {heads.map((h) => (
          <a key={h} href={`#${slug(h)}`} className="border border-slate-300 bg-slate-50 px-2 py-0.5 text-[12px] font-bold text-slate-600 hover:bg-indigo-50">{h}</a>
        ))}
      </nav>
      <Body key={tab} text={text} faq={tab === 'faq'} />
      <p className="mt-10 border-t border-slate-200 pt-4 text-[12px] text-slate-400">
        アドレス：https://fukuescrm.com　／　パスワードの再設定：https://fukues.com/forgot-password
      </p>
    </main>
  );
}
