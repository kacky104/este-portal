'use client';

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type MouseEvent, type ReactNode } from 'react';
import { ekichikaArticleBody } from '@/lib/ekichikaArticle';
import { splitRichBody, wrapRichBody, cleanStyleText, htmlToSource, sourceToHtml, type RichWrap } from '@/lib/richBody';

// 駅ちか新着情報の本文を、見たまま飾れる入力欄（第1966便・2026-11-12・カッキーさん「ベンリーと同じ機能を」）。
//
// ★ ベンリーの本文欄と同じ考え方: 見たままの欄（太字・斜体・下線・取り消し線・書式クリア・リスト・左右中央・文字色・背景色・サイズ）と、「ソース」（HTML をじかに直す）。
// ★ 加えて「全体の色」: 本文をまるごと1つの枠で包み、背景と文字の色を決める。
//   駅ちかのお店ページは、お店ごとに地の色・文字の色が違う（オイルクエスト様は白い地に白い文字＝色を付けていない本文は読めなかった）。
// ★ 本文は HTML で持つ（salon_article_templates.body）。送る形にするのは今までどおり lib/ekichikaArticle.ts の ekichikaArticleBody。
//   ・前からある本文（文字だけ・[赤]…[/赤] の印）は、開いたときに同じ見え方の HTML にして出す。何も触らなければ、保存してある本文は変わらない。
// ★ 入れられないもの（駅ちかの決まり）: 画像・リンク。貼り付け・ソースに入っていたら外す（リンクは文字だけ残す）。
//   script など危ないタグ、on〜 の属性、位置を動かす書き方も外す（sanitizeHtml・lib/richBody.ts の cleanStyleText）。
// ★ 使う場所: NewsBoard（コネックエフ「駅ちか新着情報」・フクエスリンク共通）。

const DROP = new Set(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'textarea', 'select', 'option', 'img', 'picture', 'source', 'video', 'audio', 'svg', 'canvas', 'link', 'meta', 'title', 'head', 'noscript', 'template']);
const KEEP = new Set(['div', 'p', 'br', 'span', 'font', 'b', 'strong', 'i', 'em', 'u', 's', 'strike', 'del', 'ul', 'ol', 'li', 'blockquote', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'center', 'hr', 'sub', 'sup', 'small', 'big', 'table', 'tbody', 'thead', 'tr', 'td', 'th']);

/** 貼り付け・ソース・欄の中身を、送ってよい形にそろえる（ブラウザの中でだけ動く） */
function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return '';
  const doc = new DOMParser().parseFromString(`<div id="rbe-root">${html}</div>`, 'text/html');
  const root = doc.getElementById('rbe-root');
  if (!root) return '';
  const walk = (el: Element) => {
    for (const child of Array.from(el.childNodes)) {
      if (child.nodeType === 8) { child.remove(); continue; }   // コメント
      if (child.nodeType !== 1) continue;
      const c = child as HTMLElement;
      const tag = c.tagName.toLowerCase();
      if (DROP.has(tag)) { c.remove(); continue; }
      walk(c);
      if (!KEEP.has(tag)) { c.replaceWith(...Array.from(c.childNodes)); continue; }   // リンクなど: 中の文字だけ残す
      // 昔の書き方（<font color> <div align>）は style に移す
      let style = c.getAttribute('style') ?? '';
      const color = c.getAttribute('color');
      const align = c.getAttribute('align');
      if (color && /^[#a-z0-9(), .%]+$/i.test(color)) style = `color:${color};${style}`;
      if (align && /^(left|center|right|justify)$/i.test(align)) style = `text-align:${align.toLowerCase()};${style}`;
      for (const at of Array.from(c.attributes)) c.removeAttribute(at.name);
      const clean = cleanStyleText(style);
      if (clean) c.setAttribute('style', clean);
    }
  };
  walk(root);
  if ((root.textContent ?? '').trim() === '' && !root.querySelector('hr')) return '';
  return root.innerHTML;
}

const PALETTE = ['#000000', '#ffffff', '#666666', '#ff0000', '#ff6600', '#ffcc00', '#ffff00', '#00a650', '#00b0f0', '#0070c0', '#1e3a8a', '#7030a0', '#ff3399'] as const;
const SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40] as const;
const WRAP_PRESETS: ReadonlyArray<{ label: string; wrap: RichWrap }> = [
  { label: '白地に黒', wrap: { bg: '#ffffff', fg: '#000000' } },
  { label: '黒地に白', wrap: { bg: '#000000', fg: '#ffffff' } },
  { label: '緑地に白', wrap: { bg: '#2aa84a', fg: '#ffffff' } },
  { label: '紺地に白', wrap: { bg: '#1e3a8a', fg: '#ffffff' } },
  { label: '桃地に白', wrap: { bg: '#ff3399', fg: '#ffffff' } },
];

const BTN = 'h-8 min-w-[32px] px-2 border border-slate-300 bg-white text-[13px] leading-none text-slate-700 hover:bg-slate-50';
const SEP = <span className="mx-0.5 h-5 w-px bg-slate-200" aria-hidden />;

type Pop = 'fore' | 'back' | 'wrap' | null;

/** 色の見本（選んだ色を返す）。★ ボタンを押しても、欄の選択を外さない */
function Swatches({ onPick, onClose, label }: { onPick: (c: string) => void; onClose: () => void; label: string }) {
  return (
    <div className="absolute left-0 top-9 z-20 w-[212px] border border-slate-300 bg-white p-2 shadow-lg">
      <div className="flex flex-wrap gap-1">
        {PALETTE.map((c) => (
          <button key={c} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onPick(c); onClose(); }} aria-label={`${label} ${c}`}
            className="h-6 w-6 border border-slate-300" style={{ background: c }} />
        ))}
      </div>
      <label className="mt-2 flex items-center gap-2 text-[12px] text-slate-600">
        ほかの色
        <input type="color" onChange={(e) => onPick(e.target.value)} className="h-6 w-10 cursor-pointer border border-slate-300 bg-white p-0" />
      </label>
    </div>
  );
}


export function RichBodyEditor({ value, onChange, placeholder }: {
  /** 保存してある本文（HTML。前からの「文字だけ・印つき」も可） */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  const ed = useRef<HTMLDivElement | null>(null);
  /** この部品が最後に出した本文。外から来た value がこれと違うときだけ、欄の中身を入れ直す */
  const last = useRef<string | null>(null);
  const saved = useRef<Range | null>(null);
  const [pop, setPop] = useState<Pop>(null);
  const [src, setSrc] = useState<string | null>(null);

  const parsed = useMemo(() => splitRichBody(ekichikaArticleBody(value)), [value]);
  const wrap = parsed.wrap;

  useEffect(() => {
    const el = ed.current;
    if (!el || value === last.current) return;
    el.innerHTML = sanitizeHtml(parsed.inner);
    last.current = value;
  }, [value, parsed.inner]);

  const emit = (w: RichWrap | null = wrap) => {
    const el = ed.current;
    if (!el) return;
    const out = wrapRichBody(sanitizeHtml(el.innerHTML), w);
    last.current = out;
    onChange(out);
  };

  const saveSel = () => {
    const sel = window.getSelection();
    const el = ed.current;
    if (sel && el && sel.rangeCount > 0 && el.contains(sel.anchorNode)) saved.current = sel.getRangeAt(0).cloneRange();
  };
  const restoreSel = () => {
    const el = ed.current;
    if (!el) return;
    el.focus();
    const r = saved.current;
    if (!r) return;
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(r);
  };
  /** ボタンを押しても、欄の選択を外さない */
  const keep = (e: MouseEvent) => e.preventDefault();

  const exec = (cmd: string, val?: string) => {
    restoreSel();
    try {
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand(cmd, false, val);
    } catch { /* 古いブラウザで使えない命令は、何もしない */ }
    saveSel();
    emit();
  };
  /** サイズ: いちばん大きい印（7）を付けてから、その印を px に書き換える */
  const setSize = (px: number) => {
    restoreSel();
    try {
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('fontSize', false, '7');
    } catch { /* 同上 */ }
    const el = ed.current;
    if (el) {
      el.querySelectorAll<HTMLElement>('span, font').forEach((n) => {
        if (n.style.fontSize === 'xxx-large' || n.style.fontSize === '-webkit-xxx-large' || n.getAttribute('size') === '7') {
          n.removeAttribute('size');
          n.style.fontSize = `${px}px`;
        }
      });
    }
    saveSel();
    emit();
  };

  const onPaste = (e: ClipboardEvent<HTMLDivElement>) => {
    const html = e.clipboardData.getData('text/html');
    if (!html) return;   // 文字だけの貼り付けは、ブラウザに任せる
    e.preventDefault();
    try { document.execCommand('insertHTML', false, sanitizeHtml(html)); } catch { /* 同上 */ }
    emit();
  };

  const openSource = () => { setPop(null); setSrc(htmlToSource(sanitizeHtml(ed.current?.innerHTML ?? ''))); };
  const applySource = () => {
    const el = ed.current;
    if (el && src !== null) { el.innerHTML = sanitizeHtml(sourceToHtml(src)); emit(); }
    setSrc(null);
  };

  const popBtn = (k: Exclude<Pop, null>, face: ReactNode, title: string) => (
    <button type="button" onMouseDown={keep} onClick={() => { saveSel(); setPop((v) => (v === k ? null : k)); }} title={title} aria-expanded={pop === k}
      className={`${BTN} ${pop === k ? 'bg-slate-100' : ''}`}>{face}</button>
  );

  return (
    <div>
      <style>{`.rbe-ed:empty:before{content:attr(data-placeholder);color:#cbd5e1}.rbe-ed ul{list-style:disc;padding-left:1.6em}.rbe-ed ol{list-style:decimal;padding-left:1.6em}.rbe-ed blockquote{margin-left:1.6em}`}</style>
      {/* ── 道具 ── */}
      <div className="flex flex-wrap items-center gap-1 border border-b-0 border-slate-300 bg-slate-100 px-2 py-1.5">
        <button type="button" onMouseDown={keep} onClick={openSource} className={BTN} title="HTML をじかに直す">ソース</button>
        {SEP}
        <button type="button" onMouseDown={keep} onClick={() => exec('bold')} className={`${BTN} font-black`} title="太字">B</button>
        <button type="button" onMouseDown={keep} onClick={() => exec('italic')} className={`${BTN} italic`} title="斜体">I</button>
        <button type="button" onMouseDown={keep} onClick={() => exec('underline')} className={`${BTN} underline`} title="下線">U</button>
        <button type="button" onMouseDown={keep} onClick={() => exec('strikeThrough')} className={`${BTN} line-through`} title="取り消し線">S</button>
        <button type="button" onMouseDown={keep} onClick={() => exec('removeFormat')} className={BTN} title="選んだ文字の飾りを外す">飾りを外す</button>
        {SEP}
        <button type="button" onMouseDown={keep} onClick={() => exec('insertOrderedList')} className={BTN} title="番号付きリスト">1.</button>
        <button type="button" onMouseDown={keep} onClick={() => exec('insertUnorderedList')} className={BTN} title="箇条書き">・</button>
        {SEP}
        <button type="button" onMouseDown={keep} onClick={() => exec('justifyLeft')} className={BTN} title="左寄せ">左</button>
        <button type="button" onMouseDown={keep} onClick={() => exec('justifyCenter')} className={BTN} title="中央">中央</button>
        <button type="button" onMouseDown={keep} onClick={() => exec('justifyRight')} className={BTN} title="右寄せ">右</button>
        {SEP}
        <span className="relative">
          {popBtn('fore', <span className="font-black">A<span className="ml-0.5 inline-block h-1.5 w-3 bg-rose-600 align-baseline" aria-hidden /></span>, '文字の色')}
          {pop === 'fore' && <Swatches onPick={(c) => exec('foreColor', c)} onClose={() => setPop(null)} label="文字の色" />}
        </span>
        <span className="relative">
          {popBtn('back', <span className="bg-yellow-300 px-1 font-black">A</span>, '文字の背景の色')}
          {pop === 'back' && <Swatches onPick={(c) => exec('hiliteColor', c)} onClose={() => setPop(null)} label="文字の背景の色" />}
        </span>
        <select value="" onMouseDown={saveSel} onChange={(e) => { const px = Number(e.target.value); if (px) setSize(px); }}
          className="h-8 border border-slate-300 bg-white px-1 text-[13px] text-slate-700" aria-label="文字の大きさ" title="文字の大きさ">
          <option value="">サイズ</option>
          {SIZES.map((s) => <option key={s} value={s}>{s}px</option>)}
        </select>
        {SEP}
        <span className="relative">
          {popBtn('wrap', <span>全体の色{wrap && <span className="ml-1 inline-block h-3 w-3 border border-slate-400 align-middle" style={{ background: wrap.bg }} aria-hidden />}</span>, '本文全体の背景と文字の色')}
          {pop === 'wrap' && (
            <div className="absolute right-0 top-9 z-20 w-[260px] space-y-2 border border-slate-300 bg-white p-3 text-[12.5px] text-slate-600 shadow-lg">
              <p className="leading-relaxed">本文をまるごと、決めた背景と文字の色で出します（お店ページの色に左右されません）。</p>
              <div className="flex flex-wrap gap-1">
                {WRAP_PRESETS.map((p) => (
                  <button key={p.label} type="button" onClick={() => emit(p.wrap)} className="border border-slate-300 px-2 py-1 text-[12px] font-bold" style={{ background: p.wrap.bg, color: p.wrap.fg }}>{p.label}</button>
                ))}
              </div>
              <label className="flex items-center gap-2">背景
                <input type="color" value={wrap?.bg ?? '#ffffff'} onChange={(e) => emit({ bg: e.target.value, fg: wrap?.fg ?? '#000000' })} className="h-6 w-10 cursor-pointer border border-slate-300 bg-white p-0" />
                文字
                <input type="color" value={wrap?.fg ?? '#000000'} onChange={(e) => emit({ bg: wrap?.bg ?? '#ffffff', fg: e.target.value })} className="h-6 w-10 cursor-pointer border border-slate-300 bg-white p-0" />
              </label>
              <div className="flex justify-between pt-1">
                <button type="button" onClick={() => { emit(null); setPop(null); }} className="text-slate-500 underline">色を決めない（なし）</button>
                <button type="button" onClick={() => setPop(null)} className="font-bold text-indigo-600">閉じる</button>
              </div>
            </div>
          )}
        </span>
      </div>

      {/* ── 見たままの欄 ── */}
      <div className="border border-slate-300" style={wrap ? { background: wrap.bg, color: wrap.fg, padding: 10 } : { background: '#ffffff', color: '#1e293b' }}>
        <div
          ref={ed}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="本文"
          data-placeholder={placeholder ?? ''}
          onInput={() => emit()}
          onKeyUp={saveSel}
          onMouseUp={saveSel}
          onBlur={saveSel}
          onFocus={() => setPop(null)}
          onPaste={onPaste}
          className={`rbe-ed min-h-[180px] max-h-[520px] overflow-y-auto text-[15px] leading-[1.8] outline-none break-words ${wrap ? '' : 'px-3 py-2.5'}`}
        />
      </div>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-400">
        文字を選んでから、上のボタンを押します。この欄の見え方が、ほぼそのまま駅ちかに出ます。
        {!wrap && ' お店ページの色によっては、色を付けていない文字が見えにくいことがあります（白い地に白い文字など）。「全体の色」で背景と文字の色を決めておくと安心です。'}
      </p>

      {/* ── ソース ── */}
      {src !== null && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="ソース">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSrc(null)} aria-hidden />
          <div className="relative w-full max-w-3xl space-y-3 bg-white p-4 shadow-2xl">
            <p className="text-[15px] font-black text-slate-800">ソース</p>
            <textarea value={src} onChange={(e) => setSrc(e.target.value)} rows={18} spellCheck={false}
              className="w-full border border-slate-300 px-3 py-2 font-mono text-[13px] leading-relaxed outline-none focus:border-indigo-400" />
            <p className="text-[12px] leading-relaxed text-slate-500">
              ベンリーなどの「ソース」をそのまま貼り付けられます。画像（img）とリンク（a）は載せられないので外します（リンクは文字だけ残ります）。「全体の色」の枠は、ここには出ません。
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setSrc(null)} className="h-9 min-w-[96px] bg-black/[0.07] px-4 text-[14px] text-slate-700">キャンセル</button>
              <button type="button" onClick={applySource} className="h-9 min-w-[96px] bg-emerald-700 px-5 text-[14px] font-bold text-white hover:bg-emerald-800">OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
