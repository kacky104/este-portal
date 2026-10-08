// 公式ホームページ制作（/hp/templates）に出す料金（第1302便・2026-10-08・カッキーさんの決定）。★ 純粋なデータだけ。
//
// ★★★ 決まり（10/8）:
//   ・掲載していないお店の定価は【そのまま残す】（制作料165,000円・月額利用料11,000円・ドメイン更新料 年11,000円・税込）。
//     ★ 掲載店さまに「本当はこれだけかかるものが、0円になる」と分かってもらうため（カッキーさん）。
//   ・フクエス掲載店さまは、制作料0円・月額利用料0円。かかるのは年間のドメイン・サーバー維持費だけ。
//     これまでの「フクエスワークにも掲載なら月額0円」の条件は無くなった（掲載料にフクエスワークが含まれるようになったため・lib/listingPlan.ts）。
// ★ このページは【税込】で出す（ページの決まり「表示はすべて税込です」のまま）。/listing は税別なので、混ぜないこと。
//   ★ 年間の維持費は /listing の 10,000円（税別）と同じ額（番人 check:listingplan が見張る）。
// ★ 定価を変えるときは、page.tsx の SERVICE_JSON_LD（構造化データ）とよくある質問も一緒に直すこと。

import { LISTING_HP_YEARLY_YEN } from './listingPlan';

export const HP_TAX_LABEL = '税込';

/** 定価: 制作料（初回のみ・税込） */
export const HP_LIST_SETUP_YEN = 165000;
/** 定価: 月額利用料（税込） */
export const HP_LIST_MONTHLY_YEN = 11000;
/** 定価: ドメイン更新料（年額・税込） */
export const HP_LIST_DOMAIN_YEN = 11000;

/** 掲載店さま: ドメイン・サーバー維持費（年額・税込）＝ /listing の 10,000円（税別） */
export const HP_MEMBER_YEARLY_YEN = Math.round(LISTING_HP_YEARLY_YEN * 1.1);

/** '165,000' */
export function hpYen(n: number): string {
  return Math.trunc(n).toLocaleString('ja-JP');
}
