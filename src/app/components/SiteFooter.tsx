import Link from 'next/link';
import Image from 'next/image';

// 全ページ共通のフッター（2026-08-06 新設）。
//
// 従来は各ページに「© 2026 フクエス. All rights reserved.」1行だけのフッターが
// 30箇所ベタ書きされており、内部リンクを持つフッターはトップページだけだった。
// そのため下層ページはヘッダーのハンバーガー（マウント前は sr-only）以外に導線が無く、
// クローラから見て主要ページ同士がほとんど繋がっていない状態だった。
// ここに主要ページへの可視リンクを集約し、全ページから同じ導線を出す。
//
// レイアウトはページごとの本文幅に合わせるため inner で max-w-* を渡す（既定 max-w-5xl）。
// テーマ色を敷くページ（サロン詳細・/salons）は className/style/textColor で上書きする。

// コンテンツ系（回遊してほしいページ）。ハンバーガーメニューの ITEMS と揃える。
const CONTENT_LINKS: { href: string; label: string }[] = [
  { href: '/salons', label: '店舗一覧' },
  { href: '/news', label: '店舗新着情報' },
  { href: '/ranking', label: '人気ランキング' },
  { href: '/therapists', label: '特徴で探す' },
  { href: '/working', label: '出勤中' },
  { href: '/therapist/new', label: '新人' },
  { href: '/diary', label: '写メ日記' },
  { href: '/reviews', label: '口コミ' },
  { href: '/column', label: 'コラム' },
  { href: '/x-shops', label: 'SNS' },
  { href: '/join', label: '会員登録について' },
];

// サイト情報系（従来トップのフッターにあった並び）。mobile はスマホのみの短縮表記。
const INFO_LINKS: { href: string; label: string; mobile?: string }[] = [
  { href: '/jobs', label: 'セラピスト求人（フクエスワーク）', mobile: 'セラピスト求人' },
  { href: '/about', label: '運営者情報' },
  { href: '/terms', label: '利用規約' },
  { href: '/privacy', label: 'プライバシーポリシー', mobile: 'ﾌﾟﾗｲﾊﾞｼｰﾎﾟﾘｼｰ' },
  { href: '/listing', label: '掲載について' },
  { href: '/contact', label: 'お問い合わせ' },
  { href: '/banner', label: 'リンクバナー' },
];

type Props = {
  /** 内側コンテナの最大幅。ページ本文と揃える（既定 max-w-5xl）。 */
  inner?: string;
  /** <footer> の className。テーマ色ページで上書きする。 */
  className?: string;
  /** <footer> の style。テーマ色ページで上書きする。 */
  style?: React.CSSProperties;
  /** 文字色。テーマ色ページ用（未指定なら slate 系のクラスを使う）。 */
  textColor?: string;
  /** ロゴ＋サイト名の行を上に出す（トップページのみ。従来のトップのフッター体裁を維持）。 */
  showBrand?: boolean;
};

function FooterLink({
  href,
  label,
  mobile,
  textColor,
}: {
  href: string;
  label: string;
  mobile?: string;
  textColor?: string;
}) {
  return (
    <Link
      href={href}
      className={`hover:text-pink-600 transition-colors whitespace-nowrap${textColor ? '' : ' text-slate-500'}`}
      style={textColor ? { color: textColor } : undefined}
    >
      {mobile ? (
        <>
          <span className="sm:hidden">{mobile}</span>
          <span className="hidden sm:inline">{label}</span>
        </>
      ) : (
        label
      )}
    </Link>
  );
}

export function SiteFooter({
  inner = 'max-w-5xl',
  className = 'border-t border-slate-200 bg-white py-8 mt-12',
  style,
  textColor,
  showBrand = false,
}: Props) {
  return (
    <footer className={className} style={style}>
      <div className={`${inner} mx-auto px-4`}>
        {showBrand && (
          <div className="flex items-center justify-center gap-2.5 mb-5">
            {/* ヘッダーと同じフクエスのロゴ（肉球） */}
            <Image src="/logo.png" alt="フクエス" width={20} height={20} className="w-5 h-5 flex-shrink-0" />
            <span className="text-slate-500 text-sm font-medium">フクエス ～福岡メンズエステポータル～</span>
          </div>
        )}
        <nav aria-label="サイト内メニュー" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs">
          {CONTENT_LINKS.map((l) => (
            <FooterLink key={l.href} href={l.href} label={l.label} textColor={textColor} />
          ))}
        </nav>
        <nav aria-label="サイト情報" className="flex flex-wrap justify-center gap-x-4 gap-y-2 text-xs mt-3">
          {INFO_LINKS.map((l) => (
            <FooterLink key={l.href} href={l.href} label={l.label} mobile={l.mobile} textColor={textColor} />
          ))}
        </nav>
        <p
          className={`text-center text-xs mt-5${textColor ? ' opacity-70' : ' text-slate-400'}`}
          style={textColor ? { color: textColor } : undefined}
        >
          © 2026 フクエス. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
