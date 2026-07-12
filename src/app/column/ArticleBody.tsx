import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';

// 本体コラム本文（Markdown）のレンダラー。ワーク側 jobs/column/ArticleBody.tsx の
// ピンクテーマ版（構成・許可要素・リンク方針は同一。配色のみ本体フクエスに合わせる）。
// - raw HTML は無効のまま（rehype-raw を入れない＝dangerouslySetInnerHTML 不使用）。
// - 許可要素を見出し(h2/h3)・段落・リスト・リンク・強調・引用程度に絞る（allowedElements）。
// - リンクは内部パス（/... ・#...）は next/link 相当、外部URLは target=_blank rel=noopener。

const ALLOWED = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote', 'br'];

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

const COMPONENTS: Components = {
  // h2: 本体の既存セクション見出し（ピンク→ローズの縦バー＋font-bold）のトーンに合わせ、
  // 下線（pink）で本文からの区切りを強調する。
  h2: ({ children }) => (
    <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 mt-10 mb-4 pb-2 border-b border-pink-100 flex items-center gap-2.5">
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

export function ArticleBody({ body }: { body: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown allowedElements={ALLOWED} unwrapDisallowed components={COMPONENTS}>
        {body}
      </ReactMarkdown>
    </div>
  );
}
