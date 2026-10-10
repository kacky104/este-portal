import { LISTING_MINCHO } from './listingStyle';
import {
  LISTING_FEE_YEN,
  LISTING_CAMPAIGN_OFF_YEN,
  LISTING_CAMPAIGN_FEE_YEN,
  LISTING_CAMPAIGN_NAME,
  LISTING_SET_OPTION_YEN,
  LISTING_TAX_LABEL,
  LISTING_INCLUDED,
  LISTING_CRM_NAME,
  LISTING_CRM_DESC,
  LISTING_CRM_FREE_NAME,
  LISTING_CRM_FREE_DESC,
  listingYen,
} from '@/lib/listingPlan';

// /listing の「料金プラン」（第1301便・2026-10-08 に画像から文字へ組み直した）。
//
// ★★★ 料金の形が変わった（カッキーさんの決定・10/8）:
//   これまで … 集客プラン（フクエス 店舗掲載）月額66,000円（税込）＋ 採用オプション（フクエスワーク）月額33,000円（税込）。
//   これから … 掲載料 月額120,000円（税別）の1本（フクエス・フクエスワーク・fukuX すべて込み）。
//             創業掲載協力キャンペーン中＝月額30,000円の永久割引（月額90,000円）。★ 期限は書かない（カッキーさんの決定）。
//             コネックエフ＋フクエスCRM は別のオプション（月額20,000円）。
//   ★ 第1380便（2026-10-10・カッキーさんの決定）: オプションの書き方を変えた。「フクエスCRM 月額20,000円」＋
//     契約すると無料オプションで「他サイトへの連携サービス」が付く。コネックエフの名前はこのページに出さない（外部のサービスという形）。
//   ★ 金額は【税別】で出す。値は lib/listingPlan.ts（ここに数字を直接書かない）。
// ★ 金額を改定したら【このページ・掲載案内PDF】を同時に直すこと。
//   ★ 掲載案内PDF（public/docs/fukues-listing-guide.pdf）は古い料金のままなので、いまはページから外してある（page.tsx）。
// ★ 順番が重要。10機能 → 料金 → 公式ホームページ → 問い合わせ。
//   料金を先に見せることで、下の「初期費用0円・月額0円」が「掲載店の特典」として読める。
// ★ このあと画像を用意したら、このブロックを画像に戻す。そのときは金額と条件を sr-only で残すこと（禁則85）。

export function ListingPricePlans() {
  return (
    <section className="w-full bg-[#f1e7d6]">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <h2
          className="text-[28px] font-semibold leading-[1.4] text-[#2b211c] sm:text-[42px]"
          style={{ fontFamily: LISTING_MINCHO }}
        >
          料金プラン
        </h2>
        <p className="mt-4 text-[14px] leading-[2] text-[#4a3f38] sm:text-[15px]">
          フクエス・フクエスワーク・fukuX を、ひとつの掲載料で。
        </p>

        {/* 二重の枠（これまでの画像の札と同じつくり）: 外側の金の線＋内側に少し離した細い線 */}
        <div className="mt-8 border border-[#c9a55c] bg-[#fffdf8] p-[5px] sm:mt-10">
          <div className="grid grid-cols-1 border border-[#c9a55c]/50 md:grid-cols-[1.15fr_1fr]">
            {/* ── 掲載料 ── */}
            <div className="flex flex-col items-start justify-center px-5 py-8 sm:px-10 sm:py-12">
              <p className="inline-block bg-[#c8402f] px-3 py-1.5 text-[13px] font-bold leading-none text-white sm:text-[14px]">
                現在、{LISTING_CAMPAIGN_NAME}中
              </p>
              <h3 className="mt-6 text-[15px] font-bold text-[#2b211c] sm:text-[16px]">掲載料（月額）</h3>

              <p className="mt-3 flex flex-wrap items-baseline gap-x-3 text-[#6b5d53]" style={{ fontFamily: LISTING_MINCHO }}>
                <span className="sr-only">通常</span>
                <s className="text-[22px] decoration-[#c8402f] decoration-2 sm:text-[28px]">
                  {listingYen(LISTING_FEE_YEN)}円
                </s>
                <span aria-hidden className="text-[20px] sm:text-[24px]">→</span>
                <span className="sr-only">キャンペーン適用で</span>
              </p>
              <p className="mt-1 flex flex-wrap items-baseline text-[#c8402f]" style={{ fontFamily: LISTING_MINCHO }}>
                <span className="text-[64px] font-semibold leading-[1.05] tracking-[-0.01em] sm:text-[96px]">
                  {listingYen(LISTING_CAMPAIGN_FEE_YEN)}
                </span>
                <span className="ml-1 text-[22px] font-semibold sm:text-[30px]">円</span>
                <span className="ml-1 text-[14px] sm:text-[16px]">（{LISTING_TAX_LABEL}）</span>
              </p>

              <p className="mt-5 text-[16px] font-bold leading-[1.8] text-[#2b211c] sm:text-[18px]">
                月額{listingYen(LISTING_CAMPAIGN_OFF_YEN)}円 永久割引 実施中
              </p>
              <p className="mt-1 text-[13px] leading-[1.9] text-[#5c5048] sm:text-[14px]">
                通常の掲載料は月額{listingYen(LISTING_FEE_YEN)}円（{LISTING_TAX_LABEL}）です。
              </p>
            </div>

            {/* ── 含まれるもの・オプション ── */}
            <div className="border-t border-[#c9a55c]/50 px-5 py-8 sm:px-10 sm:py-12 md:border-l md:border-t-0">
              <h3 className="text-[15px] font-bold text-[#2b211c] sm:text-[16px]">掲載料に含まれるもの</h3>
              <ul className="mt-3">
                {LISTING_INCLUDED.map((x) => (
                  <li key={x.name} className="border-b border-dashed border-[#c9a55c]/70 py-3.5">
                    <p className="text-[16px] font-semibold text-[#2b211c] sm:text-[17px]" style={{ fontFamily: LISTING_MINCHO }}>
                      {x.name}
                    </p>
                    <p className="mt-1 text-[13px] leading-[1.8] text-[#5c5048]">{x.desc}</p>
                  </li>
                ))}
              </ul>

              <h3 className="mt-8 text-[15px] font-bold text-[#17767e] sm:text-[16px]">オプション</h3>
              <div className="mt-3 border border-[#17767e]/60 px-4 py-4">
                <p className="text-[16px] font-semibold text-[#2b211c] sm:text-[17px]" style={{ fontFamily: LISTING_MINCHO }}>
                  {LISTING_CRM_NAME}
                </p>
                <p className="mt-1 text-[13px] leading-[1.8] text-[#5c5048]">{LISTING_CRM_DESC}</p>
                <p className="mt-2 text-[#17767e]" style={{ fontFamily: LISTING_MINCHO }}>
                  <span className="text-[14px]">月額</span>
                  <span className="ml-1 text-[28px] font-semibold leading-none sm:text-[32px]">
                    {listingYen(LISTING_SET_OPTION_YEN)}
                  </span>
                  <span className="ml-0.5 text-[15px] font-semibold">円</span>
                  <span className="ml-1 text-[13px]">（{LISTING_TAX_LABEL}）</span>
                </p>

                {/* 契約すると付く無料オプション（第1380便）。★ サービスの名前は出さない */}
                <div className="mt-4 border-t border-dashed border-[#17767e]/50 pt-3.5">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-block whitespace-nowrap bg-[#17767e] px-1.5 py-1 text-[11px] font-bold leading-none text-white">
                      無料オプション
                    </span>
                    <span className="text-[14px] font-bold text-[#2b211c] sm:text-[15px]">{LISTING_CRM_FREE_NAME}</span>
                  </p>
                  <p className="mt-1.5 text-[13px] leading-[1.8] text-[#5c5048]">{LISTING_CRM_FREE_DESC}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <p className="mt-5 text-[12px] leading-[1.9] text-[#5c5048] sm:text-[13px]">
          ※ 金額はすべて{LISTING_TAX_LABEL}です。契約期間・お支払い方法など、詳細はお問い合わせ時にご案内します。
        </p>
      </div>
    </section>
  );
}
