// 公式ホームページ制作（/hp/templates）に出す料金（第1302便・2026-10-08・カッキーさんの決定）。★ 純粋なデータだけ。
//
// ★★★ 決まり（10/8）:
//   ・掲載していないお店の定価は【そのまま残す】（制作料150,000円・月額利用料10,000円・ドメイン更新料 年10,000円・税別）。
//     ★ 掲載店さまに「本当はこれだけかかるものが、0円になる」と分かってもらうため（カッキーさん）。
//   ・フクエス掲載店さまは、制作料0円・月額利用料0円。かかるのは年間のドメイン・サーバー維持費だけ。
//     これまでの「フクエスワークにも掲載なら月額0円」の条件は無くなった（掲載料にフクエスワークが含まれるようになったため・lib/listingPlan.ts）。
// ★ 第1303便（2026-10-08・カッキーさんの決定）: このページも【税別】にそろえた（/listing と同じ）。
//   これまで税込で出していた額: 制作料165,000円・月額11,000円・ドメイン更新料 年11,000円・作業のご依頼 1回3,300円（＝税別の1.1倍）。
//   ★ 年間の維持費は /listing の LISTING_HP_YEARLY_YEN をそのまま使う（同じ値を2か所に書かない）。
// ★ 定価を変えるときは、page.tsx の SERVICE_JSON_LD（構造化データ）とよくある質問も一緒に直すこと。

import { LISTING_HP_YEARLY_YEN } from './listingPlan';

export const HP_TAX_LABEL = '税別';

/** 定価: 制作料（初回のみ・税別） */
export const HP_LIST_SETUP_YEN = 150000;
/** 定価: 月額利用料（税別） */
export const HP_LIST_MONTHLY_YEN = 10000;
/** 定価: ドメイン更新料（年額・税別） */
export const HP_LIST_DOMAIN_YEN = 10000;

/** 掲載店さま: ドメイン・サーバー維持費（年額・税別）＝ /listing と同じ値 */
export const HP_MEMBER_YEARLY_YEN = LISTING_HP_YEARLY_YEN;

/** 作業のご依頼（ページ内容の変更など・1回・税別）。複雑な作業はお見積り */
export const HP_WORK_FEE_YEN = 3000;

/** '150,000' */
export function hpYen(n: number): string {
  return Math.trunc(n).toLocaleString('ja-JP');
}
