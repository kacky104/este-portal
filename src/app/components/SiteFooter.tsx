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
// レイアウト（2026-08-06 スマホ整理）:
//   スマホ（〜639px）… 見出しつきの左寄せ2列リスト。中央寄せの折り返しだと語の切れ目が
//                       分かりづらく、タップ領域も狭かったため。
//   sm以上（640px〜）… 従来どおり中央寄せの1行折り返し（見出しは sm:hidden で消す）。
//   ※スマホ用とPC用でマークアップを分けると同じリンクがHTMLに2本出てしまうので、
//     grid → flex の切り替えだけで1つのマークアップを使い回す。
//
// ページ本文幅は inner で max-w-* を渡す（既定 max-w-5xl）。
// テーマ色を敷くページ（サロン詳細・/salons）は className/style/textColor で上書きする。

type FooterLinkDef = { href: string; label: string; mobile?: string };

// コンテンツ系（回遊してほしいページ）。ハンバーガーメニューの ITEMS と揃える。
// ※/salons（店舗一覧）はここに載せない：無料バナー特典で契約外の店舗も掲載する
//   ページのため、利用者の主動線に置くと契約店舗が埋もれてしまう（2026-08-06 運用判断）。
const CONTENT_LINKS: FooterLinkDef[] = [
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

// サイト情報系（従来トップのフッターにあった並び）。
// mobile は sm 未満だけの短縮表記（長いラベルが2列に収まらないもののみ）。
const INFO_LINKS: FooterLinkDef[] = [
  { href: '/jobs', label: 'セラピスト求人（フクエスワーク）', mobile: 'セラピスト求人' },
  { href: '/about', label: '運営者情報' },
  { href: '/terms', label: '利用規約' },
  { href: '/privacy', label: 'プライバシーポリシー' },
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
  /** ロゴ＋サイト名の行を上に出す（トップ・/column のみ。従来の体裁を維持）。 */
  showBrand?: boolean;
};

// リンク1本。スマホは1行1リンク（py-2 でタップ領域を確保）、sm以上は行内に並ぶ。
function FooterLink({ href, label, mobile, textColor }: FooterLinkDef & { textColor?: string }) {
  return (
    <Link
      href={href}
      className={`block py-2 text-[13px] leading-tight sm:inline sm:py-0 sm:text-xs sm:whitespace-nowrap hover:text-pink-600 transition-colors${
        textColor ? '' : ' text-slate-500'
      }`}
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

// 見出し＋リンク群。スマホは2列グリッド、sm以上は中央寄せの折り返し1行。
function FooterGroup({
  title,
  links,
  textColor,
  className,
}: {
  title: string;
  links: FooterLinkDef[];
  textColor?: string;
  className?: string;
}) {
  return (
    <nav aria-label={title} className={className}>
      {/* 見出しはスマホのみ（sm以上は従来どおり見出しなしの1行） */}
      <p
        className={`sm:hidden text-[11px] font-bold tracking-[0.15em] mb-1${textColor ? ' opacity-60' : ' text-slate-400'}`}
        style={textColor ? { color: textColor } : undefined}
      >
        {title}
      </p>
      <ul className="grid grid-cols-2 gap-x-4 sm:flex sm:flex-wrap sm:justify-center sm:gap-x-4 sm:gap-y-2">
        {links.map((l) => (
          <li key={l.href}>
            <FooterLink href={l.href} label={l.label} mobile={l.mobile} textColor={textColor} />
          </li>
        ))}
      </ul>
    </nav>
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

        <FooterGroup title="さがす" links={CONTENT_LINKS} textColor={textColor} />

        {/* スマホはグループの区切り線つき、sm以上は従来どおり mt だけ */}
        <FooterGroup
          title="サイト情報"
          links={INFO_LINKS}
          textColor={textColor}
          className={`mt-4 pt-4 border-t sm:mt-3 sm:pt-0 sm:border-t-0${textColor ? ' border-slate-400/25' : ' border-slate-100'}`}
        />

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
