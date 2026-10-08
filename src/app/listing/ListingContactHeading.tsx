import { LISTING_MINCHO } from './listingStyle';

// /listing の「掲載をご希望の店舗様へ」（第1301便・2026-10-08 に画像から文字へ組み直した）。
//
// ★ これまでは全幅のデザイン画像（public/listing/contact-pc.webp・contact-sp.webp）。文言は画像のときと同じ。
// ★ 直下がお問い合わせフォームの帯（page.tsx）。この2つの間に別の要素を挟まないこと。
// ★ <h2>掲載をご希望の店舗様へ</h2> は見出し階層の一部なので必ず残すこと。
// ★ このあと画像を用意したら、このブロックを画像に戻す。そのときは下の文を sr-only で残すこと（禁則85）。
//   ★ 画像の下端の色と、フォームの帯の背景色（#1f1f1e）を合わせること（ずれると帯の始まりに横線が1本入る）。

const POINTS = ['ご相談無料', '資料請求OK'] as const;

export function ListingContactHeading() {
  return (
    <section className="w-full border-t border-[#c9a55c]/40 bg-[#faf5ec]">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <h2
          className="text-[28px] font-semibold leading-[1.45] text-[#2b211c] sm:text-[42px]"
          style={{ fontFamily: LISTING_MINCHO }}
        >
          掲載をご希望の店舗様へ
        </h2>
        <p
          className="mt-3 text-[20px] font-semibold leading-[1.6] text-[#c8402f] sm:text-[28px]"
          style={{ fontFamily: LISTING_MINCHO }}
        >
          福岡で、もっと選ばれるお店へ。
        </p>
        <p className="mt-6 max-w-2xl text-[14px] leading-[2] text-[#4a3f38] sm:text-[15px]">
          本サイトへの掲載をご希望の店舗様は、下記フォームからお気軽にお問い合わせください。掲載内容・条件等の詳細をご案内いたします。
        </p>
        <ul className="mt-7 flex flex-wrap gap-3">
          {POINTS.map((p) => (
            <li
              key={p}
              className="border border-[#c9a55c] bg-[#fffdf8] px-5 py-2.5 text-[15px] font-semibold text-[#2b211c] sm:text-[16px]"
              style={{ fontFamily: LISTING_MINCHO }}
            >
              {p}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
