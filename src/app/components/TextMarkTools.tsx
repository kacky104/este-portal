'use client';

import { Fragment, useState, type MouseEvent, type RefObject } from 'react';
import {
  TEXT_MARKS, parseTextMarks, stripTextMarks, textMarkStyle, expandMarkSelection, type MarkNode,
} from '@/lib/textMarks';

// 文字の飾り（色・大きさ・太字）のボタンと、見え方の確認（第1320便でココア店長ブログに作り、第1321便で共通の部品にした）。
// ★ 本文には [赤]…[/赤] のような印で入れる。相手サイトへ通る形のタグにするのは、送るとき（lib/textMarks.ts・相手サイトごとの lib）。
// ★ 使う場所: コネックエフ「ココア店長ブログ」／駅ちか新着情報（コネックエフ・フクエスリンク共通の NewsBoard）。

const MARK_BTN = 'px-2.5 py-1 border border-slate-300 bg-white text-[13px] font-bold leading-none hover:bg-slate-50';

/** 本文欄の上に置くボタン。★ 文字を選んでから押す。選んでいなければ、その場に一言出す（何も変えない） */
export function TextMarkToolbar({ textareaRef, value, onChange }: {
  textareaRef: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (next: string) => void;
}) {
  const [note, setNote] = useState('');

  const selected = (): { s: number; e: number } | null => {
    const el = textareaRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return null;
    return { s: el.selectionStart, e: el.selectionEnd };
  };
  const reselect = (s: number, e: number) => {
    requestAnimationFrame(() => { const el = textareaRef.current; if (!el) return; el.focus(); el.setSelectionRange(s, e); });
  };
  /** 選んだ文字の前後に印を足す */
  const wrap = (key: string) => {
    const sel = selected();
    if (!sel) { setNote('飾りを付けたい文字を選んでから、押してください'); return; }
    setNote('');
    const open = `[${key}]`;
    onChange(value.slice(0, sel.s) + open + value.slice(sel.s, sel.e) + `[/${key}]` + value.slice(sel.e));
    reselect(sel.s + open.length, sel.e + open.length);
  };
  /** 選んだ範囲（と、すぐ外側の印）から、印だけを消す */
  const unwrap = () => {
    const sel0 = selected();
    if (!sel0) { setNote('飾りを外したい文字を選んでから、押してください'); return; }
    setNote('');
    const sel = expandMarkSelection(value, sel0.s, sel0.e);
    const mid = stripTextMarks(value.slice(sel.s, sel.e));
    onChange(value.slice(0, sel.s) + mid + value.slice(sel.e));
    reselect(sel.s, sel.s + mid.length);
  };
  /** ボタンを押しても、本文欄の選択を外さない */
  const keep = (e: MouseEvent) => e.preventDefault();

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
      <span className="text-[12px] text-slate-500">文字を選んで押す：</span>
      {TEXT_MARKS.filter((m) => m.kind === 'color').map((m) => (
        <button key={m.key} type="button" onMouseDown={keep} onClick={() => wrap(m.key)} className={MARK_BTN} style={textMarkStyle(m.key)}>{m.key}</button>
      ))}
      <span className="w-px h-5 bg-slate-200" aria-hidden />
      {TEXT_MARKS.filter((m) => m.kind !== 'color').map((m) => (
        <button key={m.key} type="button" onMouseDown={keep} onClick={() => wrap(m.key)} className={`${MARK_BTN} text-slate-700`}>{m.key}</button>
      ))}
      <span className="w-px h-5 bg-slate-200" aria-hidden />
      <button type="button" onMouseDown={keep} onClick={unwrap} className="px-2.5 py-1 text-[13px] text-slate-500 underline">飾りを外す</button>
      {note && <span className="basis-full text-[12px] text-rose-600">{note}</span>}
    </div>
  );
}

/** 木を画面に出す。★ 打った文字は、そのまま文字として出す（HTML にしない） */
function Nodes({ nodes }: { nodes: readonly MarkNode[] }) {
  return (
    <>
      {nodes.map((n, i) => (n.t === 'mark'
        ? <span key={i} style={textMarkStyle(n.k)}><Nodes nodes={n.c} /></span>
        : n.v.split('\n').map((line, j) => <Fragment key={`${i}-${j}`}>{j > 0 && <br />}{line}</Fragment>)))}
    </>
  );
}

/** 本文欄の下に置く「見え方（めやす）」。★ 送る形と同じ木（parseTextMarks）から作る。 */
export function TextMarkPreview({ value, label }: { value: string; label: string }) {
  return (
    <div className="mt-3">
      <p className="text-[12px] font-bold text-slate-500 mb-1">{label}</p>
      <div className="border border-slate-200 bg-white px-3 py-2 min-h-[48px] text-[15px] leading-[1.8] text-slate-800 break-words">
        {value.trim()
          ? <Nodes nodes={parseTextMarks(value.replace(/^\n+/, '').replace(/\s+$/, ''))} />
          : <span className="text-slate-300">本文を入れると、ここに出ます</span>}
      </div>
      <p className="text-[12px] text-slate-400 mt-1">[赤]…[/赤] のような印は、送るときに色・大きさ・太字に置き換わります。印が文字のまま見えるときは、対になっていません。</p>
    </div>
  );
}
