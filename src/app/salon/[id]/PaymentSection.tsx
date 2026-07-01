import type { SalonTheme } from '@/app/lib/themes';
import { cardLabel } from '@/app/lib/paymentCards';

// クレジットカード決済セクション（料金ページ・コースメニュー直下）。
// フクエスは決済処理に一切関与せず、外部の決済ページへリンクするだけ（カード入力欄は持たない）。
// payment_url 未設定の店舗では呼び出し側でセクションごと非表示にする。
export function PaymentSection({
  paymentUrl,
  paymentCards,
  theme,
}: {
  paymentUrl: string;
  paymentCards: string[];
  theme: SalonTheme;
}) {
  return (
    <section
      className="rounded-2xl border shadow-sm p-6 md:max-w-[680px] md:mx-auto mt-6"
      style={{ backgroundColor: theme.card, borderColor: theme.cardBorder }}
    >
      {/* 見出し（ブランドカラー：オレンジ→マゼンタのアクセント） */}
      <div className="flex items-center gap-2.5 mb-4">
        <span
          className="w-1 h-5 rounded-full flex-shrink-0"
          style={{ background: 'linear-gradient(to bottom, #FB923C, #DB2777)' }}
        />
        <h2 className="font-bold" style={{ color: theme.heading }}>クレジットカード決済</h2>
      </div>

      {/* 決済ページへのリンク（新規タブ） */}
      <a
        href={paymentUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-bold text-white rounded-xl px-5 py-2.5 shadow-sm hover:opacity-90 transition-opacity"
        style={{ background: 'linear-gradient(100deg, #FB923C, #DB2777)' }}
      >
        決済ページを開く
        <svg
          width="15" height="15" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden
        >
          <path d="M7 17L17 7M9 7h8v8" />
        </svg>
      </a>
      <p className="text-xs mt-2 break-all opacity-70" style={{ color: theme.body }}>{paymentUrl}</p>

      {/* 対応カードブランド（テキストバッジ・オーナーが選択したものだけ） */}
      {paymentCards.length > 0 && (
        <div className="mt-5">
          <p className="text-xs font-bold mb-2" style={{ color: theme.body }}>ご利用可能なカード</p>
          <div className="flex flex-wrap gap-2">
            {paymentCards.map((slug) => (
              <span
                key={slug}
                className="text-xs font-bold rounded-lg border px-2.5 py-1"
                style={{ color: theme.heading, borderColor: theme.cardBorder }}
              >
                {cardLabel(slug)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 固定免責文（全店共通・注意書きトーン。過度な赤字警告にはしない） */}
      <p className="text-[11px] leading-relaxed mt-5 opacity-70" style={{ color: theme.body }}>
        ※上記のクレジットカード決済ページはフクエスが提供するサービスではありません。
        ご利用の際は必ず店舗にご確認のうえ、お客様ご自身の責任においてご利用ください。
        フクエスは当決済に関するいかなる責任も負いかねます。
      </p>
    </section>
  );
}
