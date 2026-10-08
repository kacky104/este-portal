// 掲載のご案内（/listing）に出す料金（第1301便・2026-10-08・カッキーさんの決定）。★ 純粋なデータだけ。
//
// ★★★ 料金の形が変わった（10/8）:
//   これまで … フクエス 店舗掲載 月額66,000円（税込）＋ フクエスワーク 求人掲載 月額33,000円（税込）の2本。
//   これから … 掲載料 月額120,000円（税別）の1本。フクエス・フクエスワーク・fukuX をすべて含む。
//             ・創業掲載協力キャンペーン: 月額30,000円（税別）の永久割引 ＝ 月額90,000円（税別）。期限は出さない。
//             ・コネックエフ＋フクエスCRM のセットは別のオプション: 月額20,000円（税別）。
//               ★ 値は lib/setPlan.ts の SET_PLAN_PRICE_YEN をそのまま使う（第1304便でどちらも税別にそろえた）。
//             ・公式ホームページ: 掲載店は初期費用0円・月額0円。年間10,000円（税別）のドメイン・サーバー維持費だけ。
//             ・予約ボードは出さない（第1297便）。機能一覧の 09 はコネックエフ＋フクエスCRM に差し替えた。
//
// ★ /listing の金額は【税別】で出す（カッキーさんの決定）。CRM・コネックエフのご案内（税込）と書き方が違うので、混ぜないこと。
// ★ 金額を変えるときはここだけ。/listing の各部品（料金プラン・機能一覧・公式ホームページ）が同じ値を使う。
//   ★ 請求書の自動発行の金額（店舗ごとの設定）は別（ここを変えても請求は変わらない）。
//   ★ 公式ホームページ制作のページ（/hp/templates）・マイページ「公式サイト」のご案内は、画像と文が別にある。

import { SET_PLAN_PRICE_YEN } from './setPlan';

/** 掲載料（月額・税別） */
export const LISTING_FEE_YEN = 120000;
/** 創業掲載協力キャンペーンの割引（月額・税別・永久） */
export const LISTING_CAMPAIGN_OFF_YEN = 30000;
/** キャンペーン適用後の掲載料（月額・税別） */
export const LISTING_CAMPAIGN_FEE_YEN = LISTING_FEE_YEN - LISTING_CAMPAIGN_OFF_YEN;
/** コネックエフ＋フクエスCRM セット（月額・税別）。★ 値は lib/setPlan.ts（同じ値を2か所に書かない） */
export const LISTING_SET_OPTION_YEN = SET_PLAN_PRICE_YEN;
/** 公式ホームページ: ドメイン・サーバー維持費（年額・税別） */
export const LISTING_HP_YEARLY_YEN = 10000;

export const LISTING_CAMPAIGN_NAME = '創業掲載協力キャンペーン';
export const LISTING_TAX_LABEL = '税別';

/** '120,000' */
export function listingYen(n: number): string {
  return Math.trunc(n).toLocaleString('ja-JP');
}

/** 掲載料に含まれるもの（料金プランに出す） */
export const LISTING_INCLUDED: ReadonlyArray<{ name: string; desc: string }> = [
  { name: 'フクエス 店舗掲載', desc: '店舗ページ・セラピスト紹介・出勤・写メ日記・口コミ' },
  { name: 'フクエスワーク 求人掲載', desc: '求人ページ・Googleしごと検索対応・店舗ページとの連携' },
  { name: 'fukuX（フクエックス）', desc: '福岡メンズエステ専用SNS' },
];

/** 機能一覧（10の機能）。option … 掲載料に含まれない有料オプション */
export const LISTING_FEATURES: ReadonlyArray<{ no: string; name: string; desc: string; option?: boolean }> = [
  { no: '01', name: '店舗ページ', desc: '店舗情報・料金・写真を掲載' },
  { no: '02', name: 'セラピスト紹介・出勤スケジュール', desc: 'プロフィールと本日の出勤を発信' },
  { no: '03', name: '写メ日記', desc: 'スマートフォンから日記を投稿' },
  { no: '04', name: '予約につながる導線', desc: '電話・LINE・ネット予約へ誘導' },
  { no: '05', name: '口コミ・ランキング', desc: '信頼と新規来店を後押し' },
  { no: '06', name: 'セラピスト求人', desc: 'フクエスワークで採用を支援' },
  { no: '07', name: '公式サイトへの埋め込み', desc: '写メ日記・口コミをそのまま表示' },
  { no: '08', name: 'fukuX（フクエックス）', desc: '福岡メンズエステ専用SNS' },
  { no: '09', name: 'コネックエフ＋フクエスCRM', desc: '他サイトへの出勤・写メ日記の一括更新と、予約・お客様の管理', option: true },
  { no: '10', name: '公式ホームページ制作', desc: '掲載データと連動した、お店専用の公式ホームページを制作' },
];
