import Link from 'next/link';
import ReactMarkdown, { type Components } from 'react-markdown';
import { headingId } from '@/app/lib/articleToc';

// 本体コラム本文（Markdown）のレンダラー。ワーク側 jobs/column/ArticleBody.tsx の
// ピンクテーマ版（構成・許可要素・リンク方針は同一。配色のみ本体フクエスに合わせる）。
// - raw HTML は無効のまま（rehype-raw を入れない＝dangerouslySetInnerHTML 不使用）。
// - 許可要素を見出し(h2/h3)・段落・リスト・リンク・強調・引用程度に絞る（allowedElements）。
// - リンクは内部パス（/... ・#...）は next/link 相当、外部URLは target=_blank rel=noopener。
// - h2 には目次から飛ぶための id を振る（2026-08-19 第24便）。
// - 画像（img）は既定で描画しない。用語集（/glossary）だけ allowImages=true で本文中の画像を出す
//   （第349便）。コラムは引数を付けていないので今までどおり画像は出ない。
//   id は articleToc.ts の headingId() が見出しの文言から作る。目次側（ページの
//   extractArticleHeadings）と同じ関数なので、片方だけずれることが無い。
//   ★ scroll-mt-20 は追従ヘッダー（h-14＝56px）に見出しが隠れないための余白。外さないこと。

const ALLOWED = ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote', 'br'];
// allowImages=true のときだけ img を許す（用語集）。
const ALLOWED_WITH_IMAGES = [...ALLOWED, 'img'];

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
function buildComponents(seen: Map<string, number>, allowImages: boolean): Components {
  // 本文中の画像（用語集）。★ 1200×800 固定（用語集の画像指示で本文中はこのサイズと決めた。
  //   幅高さが無いと読み込み時に本文がガタつく）。★ next/image は通さない（/public の WebP を
  //   原寸で配信＝変換を挟む意味が無い。著者アイコンと同じ作法）。
  const img: Components['img'] = ({ src, alt }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={typeof src === 'string' ? src : ''}
      alt={alt ?? ''}
      width={1200}
      height={800}
      loading="lazy"
      decoding="async"
      className="w-full h-auto rounded-2xl border border-pink-100 my-6"
    />
  );
  return {
    ...(allowImages ? { img } : {}),
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

export function ArticleBody({ body, allowImages = false }: { body: string; allowImages?: boolean }) {
  const seen = new Map<string, number>();
  return (
    <div className="break-words">
      <ReactMarkdown
        allowedElements={allowImages ? ALLOWED_WITH_IMAGES : ALLOWED}
        unwrapDisallowed
        components={buildComponents(seen, allowImages)}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}
