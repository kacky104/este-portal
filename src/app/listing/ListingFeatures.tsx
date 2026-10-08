import { LISTING_MINCHO } from './listingStyle';
import { LISTING_FEATURES, LISTING_SET_OPTION_YEN, LISTING_TAX_LABEL, listingYen } from '@/lib/listingPlan';

// /listing の「お店の成長を支える、10の機能」（第1301便・2026-10-08 に画像から文字へ組み直した）。
//
// ★ これまでは全幅のデザイン画像（public/listing/features-pc.webp・features-sp.webp）で、09 は「予約ボード」だった。
//   予約ボードはいったん出さなくなった（第1297便）ので、09 を「コネックエフ＋フクエスCRM」に差し替えた（カッキーさんの決定）。
//   ★ 09 は掲載料に含まれない【有料オプション】。そう分かる札と金額を必ず付ける（含まれると読めないように）。
// ★ 中身（名前・説明）は lib/listingPlan.ts の LISTING_FEATURES。数（10）を変えたら、見出しの「10の機能」も直すこと。
// ★ このあと画像を用意したら、このブロックを画像に戻す。そのときは一覧を sr-only で残すこと（禁則85）。

export function ListingFeatures() {
  return (
    <section className="w-full border-t border-[#c9a55c]/40 bg-[#faf5ec]">
      <div className="mx-auto max-w-5xl px-5 py-14 sm:py-20">
        <h2
          className="text-[24px] font-semibold leading-[1.55] text-[#2b211c] sm:text-[38px] sm:leading-[1.45]"
          style={{ fontFamily: LISTING_MINCHO }}
        >
          掲載するだけじゃない。
          <br />
          お店の成長を支える、{LISTING_FEATURES.length}の機能。
        </h2>
        <p className="mt-5 text-[14px] leading-[2] text-[#4a3f38] sm:text-[15px]">
          集客・採用・予約・運営まで。フクエスひとつで、もっとスマートに。
        </p>

        <ol className="mt-10 grid grid-cols-1 border-t border-[#c9a55c]/50 sm:grid-cols-2 sm:gap-x-12">
          {LISTING_FEATURES.map((f) => (
            <li key={f.no} className="flex gap-4 border-b border-[#c9a55c]/50 py-5 sm:gap-5 sm:py-6">
              <span
                aria-hidden
                className="w-[2.2em] flex-shrink-0 text-[26px] leading-none text-[#a8843f] sm:text-[32px]"
                style={{ fontFamily: LISTING_MINCHO }}
              >
                {f.no}
              </span>
              <div className="min-w-0">
                <p className="text-[16px] font-bold leading-snug text-[#2b211c] sm:text-[17px]">
                  {f.name}
                  {f.option && (
                    <span className="ml-2 inline-block whitespace-nowrap border border-[#17767e] px-1.5 py-0.5 align-middle text-[11px] font-bold leading-none text-[#17767e]">
                      有料オプション
                    </span>
                  )}
                </p>
                <p className="mt-1.5 text-balance text-[13px] leading-[1.8] text-[#5c5048] sm:text-[14px]">{f.desc}</p>
                {f.option && (
                  <p className="mt-1 text-[13px] font-bold leading-[1.8] text-[#17767e] sm:text-[14px]">
                    月額{listingYen(LISTING_SET_OPTION_YEN)}円（{LISTING_TAX_LABEL}）
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>

        <p className="mt-8 text-[14px] leading-[2] text-[#4a3f38] sm:text-[15px]">
          集客から予約、公式サイトまで。フクエスが、お店の成長を支えます。
        </p>
      </div>
    </section>
  );
}
