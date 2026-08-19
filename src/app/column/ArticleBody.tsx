import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import { headingId } from '@/app/lib/articleToc';

// 本体コラム本文（Markdown）のレンダラー。ワーク側 jobs/column/ArticleBody.tsx の
// ピンクテーマ版（構成・許可要素・リンク方針は同一。配色のみ本体フクエスに合わせる）。
// - raw HTML は無効のまま（rehype-raw を入れない＝dangerouslySetInnerHTML 不使用）。
// - 許可要素を見出し(h2/h3)・段落・リスト・リンク・強調・引用程度に絞る（allowedElements）。
// - リンクは内部パス（/... ・#...）は next/link 相当、外部URLは target=_blank rel=noopener。
// - h2 には目次から飛ぶための id を振る（2026-08-19 第24便）。
//   id は articleToc.ts の headingId() が見出しの文言から作る。目次側（ページの
//   extractArticleHeadings）と同じ関数なので、片方だけずれることが無い。
//   ★ scroll-mt-20 は追従ヘッダー（h-14＝56px）に見出しが隠れないための余白。外さないこと。

const ALLOWED = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote', 'br'];

// 描画される見出しの文字列を hast ノードから取り出す（**強調** やリンクを含む見出しでも、
// 記号を除いた「読める文字列」になる＝目次側の抽出結果と一致する）。
type HastLike = { type?: string; value?: string; children?: HastLike[] };
function nodeText(node: unknown): string {
  const n = node as HastLike | undefined;
  if (!n) return '';
  if (n.type === 'text') return n.value ?? '';
  return (n.children ?? []).map(nodeText).join('');
}

function MarkdownLink({ href, children }: { href?: string; children?: React.ReactNode }) {
  const target = href ?? '';
  if (target.startsWith('/')) {
    return (
      <Link href={target} className="font-semibold underline underline-offset-2 text-pink-600">
        {children}
      </Link>
    );
  }
  if (target.startsWith('#')) {
    return (
      <a href={target} className="font-semibold underline underline-offset-2 text-pink-600">
        {children}
      </a>
    );
  }
  return (
    <a
      href={target}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold underline underline-offset-2 text-pink-600"
    >
      {children}
    </a>
  );
}

// seen は同じ文言の見出しが2回以上出たときの枝番用。1回の描画につき1つ作る。
function buildComponents(seen: Map<string, number>): Components {
  return {
    // h2: 本体の既存セクション見出し（ピンク→ローズの縦バー＋font-bold）のトーンに合わせ、
    // 下線（pink）で本文からの区切りを強調する。
    h2: ({ node, children }) => (
      <h2
        id={headingId(nodeText(node), seen)}
        className="scroll-mt-20 text-xl sm:text-2xl font-extrabold text-slate-900 mt-10 mb-4 pb-2 border-b border-pink-100 flex items-center gap-2.5"
      >
        <span className="w-1.5 h-6 rounded-full flex-shrink-0 bg-gradient-to-b from-pink-400 to-rose-500" />
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="text-base sm:text-lg font-bold text-slate-800 mt-7 mb-2">{children}</h3>
    ),
    p: ({ children }) => <p className="text-[15px] leading-8 text-slate-700 my-4">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-6 my-4 space-y-1.5 text-[15px] leading-7 text-slate-700 marker:text-pink-400">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-6 my-4 space-y-1.5 text-[15px] leading-7 text-slate-700 marker:text-pink-500 marker:font-bold">{children}</ol>,
    li: ({ children }) => <li className="pl-1">{children}</li>,
    strong: ({ children }) => <strong className="font-bold text-slate-900">{children}</strong>,
    em: ({ children }) => <em className="italic">{children}</em>,
    blockquote: ({ children }) => (
      <blockquote className="border-l-4 pl-4 py-1 my-5 rounded-r-lg text-slate-600 italic" style={{ borderColor: '#f472b6', background: 'rgba(244,114,182,0.06)' }}>
        {children}
      </blockquote>
    ),
    a: MarkdownLink,
  };
}

export function ArticleBody({ body }: { body: string }) {
  const seen = new Map<string, number>();
  return (
    <div className="break-words">
      <ReactMarkdown allowedElements={ALLOWED} unwrapDisallowed components={buildComponents(seen)}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
