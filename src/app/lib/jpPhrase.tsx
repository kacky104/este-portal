import { Children, Fragment, cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { loadDefaultJapaneseParser } from 'budoux';

// ★ 第1583便（2026-10-20・カッキーさん）: 日本語の文章を【文節】で改行させる部品。
//   スマホで「ひ／とつに。」「ポータルサ／イト」のように、単語の途中や1文字だけが次の行に落ちるのを防ぐ。
//   ★ BudouX（Google）で文節に区切り、区切りに <wbr> を入れて、文字の並びには word-break:keep-all をかける
//     ＝ 改行は文節の切れ目と句読点のあとだけで起きる。★ 1文節が行に入りきらないときだけ overflow-wrap:anywhere で折る。
//   ★ サーバー部品専用（server-only）。BudouX は画面側の JS に入らない＝ページは重くならない。
//   ★ 使い方: <Jp>…JSX…</Jp> で包むと、中の【文字】をすべて処理する（タグ・Link などの中の文字も含む）。
//     script / style / svg / textarea の中は触らない。
const parser = loadDefaultJapaneseParser();
const SKIP = new Set(['script', 'style', 'svg', 'textarea', 'title', 'option']);

function phrase(text: string, key: number): ReactNode {
  if (!/[぀-ヿ㐀-鿿]/.test(text)) return text; // 日本語が無い文字列はそのまま
  const parts = parser.parse(text);
  return (
    <span key={key} className="[word-break:keep-all] [overflow-wrap:anywhere]">
      {parts.map((p, i) => (
        <Fragment key={i}>{i > 0 && <wbr />}{p}</Fragment>
      ))}
    </span>
  );
}

function walk(node: ReactNode, key = 0): ReactNode {
  if (typeof node === 'string') return phrase(node, key);
  if (Array.isArray(node)) return node.map((n, i) => walk(n, i));
  if (!isValidElement(node)) return node;
  const el = node as ReactElement<{ children?: ReactNode; dangerouslySetInnerHTML?: unknown }>;
  if (typeof el.type === 'string' && SKIP.has(el.type)) return el;
  if (el.props.dangerouslySetInnerHTML) return el;
  const ch = el.props.children;
  if (ch === undefined || typeof ch === 'function') return el;
  return cloneElement(el, undefined, ...Children.toArray(ch).map((c, i) => walk(c, i)));
}

export function Jp({ children }: { children: ReactNode }) {
  return <>{walk(children)}</>;
}
