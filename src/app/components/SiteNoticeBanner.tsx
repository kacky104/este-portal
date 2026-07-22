// テスト運用中の共通お知らせバナー。各サイトのヘッダー直下に sticky で表示する。
// 文言は全サイト共通。開設時期などの変更はこの1ファイルを直せば全ページに反映される。
// 配色だけサイトごとに出し分ける（本体=amber / フクエスワーク=green / フクエックス=fukuXテーマ）。

type Variant = 'default' | 'work' | 'x';

const VARIANTS: Record<Variant, { box: string; text: string; inner: string }> = {
  // フクエス本体（amber）＝従来のTOPバナーと同一配色。
  default: {
    box: 'bg-amber-50 border-amber-100',
    text: 'text-amber-700',
    inner: 'max-w-5xl',
  },
  // フクエスワーク（green）＝ワークの緑系テーマに合わせる。
  work: {
    box: 'bg-emerald-50 border-emerald-100',
    text: 'text-emerald-700',
    inner: 'max-w-3xl',
  },
  // フクエックス（fukuX）＝x-theme.css の CSS 変数でダーク/グラデ背景に馴染ませる。
  x: {
    box: 'bg-[color:var(--x-surface-translucent)] backdrop-blur-md border-[color:var(--x-border-strong)]',
    text: 'text-[color:var(--x-text-primary)]',
    inner: 'max-w-2xl',
  },
};

export function SiteNoticeBanner({ variant = 'default' }: { variant?: Variant }) {
  const v = VARIANTS[variant];
  return (
    <div className={`sticky top-14 z-40 border-b ${v.box}`}>
      <p className={`${v.inner} mx-auto px-4 py-2 text-center text-xs sm:text-sm font-bold leading-relaxed ${v.text}`}>
        現在テスト運用中です。9月中旬サイトオープン予定。
      </p>
    </div>
  );
}
