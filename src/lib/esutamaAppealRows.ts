// ★ 第1930便（2026-11-11・カッキーさん「店舗情報・クーポン情報・お店体験談を3ブロックに分けて、時刻指定とタイマー」）
//   エステ魂の集客ワンクリックアピールを【行ごと】に設定する。表は conecf_esutama_appeal_rows（追加SQL_第1930便）。
//   ★ 行ごとに1日10回（エステ魂の画面で行ごとに残り回数が出る・11/11 カッキーさん確認）。毎朝6時に戻る
import { ESUTAMA_APPEAL_ROWS, ESUTAMA_APPEAL_ROW_LABEL } from './esutamaAppeal';

export type EsutamaAppealRowKey = (typeof ESUTAMA_APPEAL_ROWS)[number];

/** 画面の URL に使う短い名前 */
export const ESUTAMA_APPEAL_ROW_SLUG: Record<EsutamaAppealRowKey, string> = {
  'shop,guest_appeal': 'shop',
  'shop_coupon,guest_appeal': 'coupon',
  'shop_exp,guest_appeal': 'exp',
};

export function esutamaAppealRowFromSlug(slug: string): EsutamaAppealRowKey | null {
  const hit = (Object.entries(ESUTAMA_APPEAL_ROW_SLUG) as Array<[EsutamaAppealRowKey, string]>).find(([, v]) => v === slug);
  return hit ? hit[0] : null;
}

export function isEsutamaAppealRowKey(v: unknown): v is EsutamaAppealRowKey {
  return typeof v === 'string' && (ESUTAMA_APPEAL_ROWS as readonly string[]).includes(v);
}

export function esutamaAppealRowLabel(k: string): string {
  return ESUTAMA_APPEAL_ROW_LABEL[k] ?? k;
}

/** 行ごとの間隔の選択肢（ベンリーの 1時間30分・2時間30分 も選べる） */
export const ESUTAMA_APPEAL_INTERVAL_CHOICES = [30, 60, 90, 120, 150, 180] as const;
