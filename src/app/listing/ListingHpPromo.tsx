import Link from 'next/link';
import { LISTING_MINCHO } from './listingStyle';
import { LISTING_HP_YEARLY_YEN, LISTING_TAX_LABEL, listingYen } from '@/lib/listingPlan';

// /listing の「公式ホームページ」の帯（第1301便・2026-10-08 に画像から文字へ組み直した）。
//
// ★★★ 条件が変わった（カッキーさんの決定・10/8）:
//   これまで … フクエス掲載中なら制作料 165,000円 → 0円／フクエスワークにも掲載なら月額 11,000円 → 0円／
//             両方掲載なら年間11,000円（税込）のドメイン更新料のみ。
//   これから … 掲載料にフクエスワークも含まれるので、条件は「掲載店なら」の1つだけ。
//             初期費用 0円・月額 0円。年間10,000円（税別）のドメイン・サーバー維持費のみ。値は lib/listingPlan.ts。
// ★★ 行き先の /hp/templates（公式ホームページ制作のページ）は、まだ【古い料金】のまま（画像と文が別にある）。
//   そちらを直すまで、このページと食い違う。直すときは一緒に確かめること。
// ★ 料金プランの直後に置く。「掲載料 → その掲載店なら公式ホームページは 0円」と続ける。
// ★ これまでは帯まるごとがリンクだった。文字にしたので、リンクは下のボタン1つ。
// ★ このあと画像を用意したら、このブロックを画像に戻す。そのときは条件を sr-only で残すこと（禁則85）。

const FIGURES: ReadonlyArray<{ label: string; value: string; unit: string; note?: string; free?: boolean }> = [
  { label: '初期費用', value: '0', unit: '円', free: true },
  { label: '月額', value: '0', unit: '円', free: true },
  {
    label: '年間',
    value: listingYen(LISTING_HP_YEARLY_YEN),
    unit: '円',
    note: `（${LISTING_TAX_LABEL}）ドメイン・サーバー維持費のみ`,
  },
];

export function ListingHpPromo() {
  return (
    <section className="w-full bg-[#1f1f1e]">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <h2 style={{ fontFamily: LISTING_MINCHO }}>
          <span className="inline-block bg-[#c8402f] px-3 py-1.5 text-[13px] font-bold leading-none text-white sm:text-[14px]">
            フクエス掲載店さま限定
          </span>
          <span className="mt-5 block text-[25px] font-semibold leading-[1.5] text-[#f7efe0] sm:text-[40px]">
            公式ホームページを、
            <br className="sm:hidden" />
            もっと身近に。
          </span>
        </h2>
        <p className="mt-5 max-w-2xl text-[14px] leading-[2] text-[#d8cdbb] sm:text-[15px]">
          掲載データと連動した、お店専用の公式ホームページを制作します。かかるのは、ドメイン・サーバー維持費だけです。
        </p>

        {/* スマホ: 初期費用と月額を横に並べ、年間は下の段。PC: 3つ横並び */}
        <dl className="mt-9 grid grid-cols-2 border-y border-[#c9a55c]/60 sm:grid-cols-3">
          {FIGURES.map((f, i) => (
            <div
              key={f.label}
              className={
                'py-6 sm:py-8 ' +
                (i === 0
                  ? 'pr-4 sm:pr-8'
                  : i === 1
                    ? 'border-l border-[#c9a55c]/40 pl-5 sm:px-8'
                    : 'col-span-2 border-t border-[#c9a55c]/40 sm:col-span-1 sm:border-l sm:border-t-0 sm:px-8')
              }
            >
              <dt className="text-[14px] font-bold text-[#d9b46a] sm:text-[15px]">{f.label}</dt>
              <dd className="mt-2" style={{ fontFamily: LISTING_MINCHO }}>
                <span
                  className={
                    'text-[52px] font-semibold leading-none sm:text-[64px] ' +
                    (f.free ? 'text-[#f08a7c]' : 'text-[#f7efe0]')
                  }
                >
                  {f.value}
                </span>
                <span className={'ml-1 text-[20px] font-semibold ' + (f.free ? 'text-[#f08a7c]' : 'text-[#f7efe0]')}>
                  {f.unit}
                </span>
                {f.note && (
                  <span className="mt-2 block text-[13px] leading-[1.8] text-[#d8cdbb]" style={{ fontFamily: 'inherit' }}>
                    {f.note}
                  </span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <Link
          href="/hp/templates"
          className="mt-9 inline-block bg-[#c8402f] px-7 py-4 text-[15px] font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#f7efe0] sm:text-[16px]"
        >
          ホームページ制作を見る
        </Link>
      </div>
    </section>
  );
}
