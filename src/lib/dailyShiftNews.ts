// お店のお知らせページの「本日の出勤速報」（第1418便・2026-10-13・カッキーさん）。★ 純粋関数だけ。
//
// ★ エステ魂の店舗ページにある「本日の出勤速報」のニュース（その日の出勤から1〜2人を大きく紹介し、
//   ほかの出勤の方を短く並べる）と同じものを、フクエスのお店のお知らせページのいちばん上に出す。
// ★ 決まり（カッキーさん）:
//   ・ピックアップ（大きく紹介する方）は、出勤4人以上なら2人、1〜3人なら1人。
//   ・★ 第1424便（カッキーさん）: その日に出勤する方から【完全にランダム】に選ぶ。
//     （第1418便の「イチオシ（店長おすすめタグ）から75%・それ以外から25%」はやめた）
//   ・選び方は【お店×営業日】で決まる（同じ日に何度ページを作り直しても同じ方が出る）。
// ★ DB には何も書かない（毎回、出勤とセラピストから作る）。

import { mulberry32 } from './shuffle';

export type DailyShiftPerson = {
  id: number;
  name: string;
  /** その日の出勤の始まり（営業日の 6:00 からの分・並べ順に使う） */
  startKey: number;
};

/** 文字列から 32bit の種（FNV-1a） */
export function dailySeed(salonId: number, businessDate: string): number {
  let h = 0x811c9dc5;
  for (const ch of `${salonId}|${businessDate}|daily-shift-news`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** ピックアップの人数（出勤4人以上→2人・1〜3人→1人・0人→0） */
export function dailyPickCount(working: number): number {
  if (working <= 0) return 0;
  return working >= 4 ? 2 : 1;
}

/**
 * ピックアップと、それ以外（出勤の早い順）を返す。
 * @param rand 0〜1 を返す関数（テスト用に差し替えられる）。省略時は dailySeed から作る
 */
export function pickDailyShift<T extends DailyShiftPerson>(
  people: readonly T[],
  salonId: number,
  businessDate: string,
  rand?: () => number,
): { featured: T[]; others: T[] } {
  const r = rand ?? mulberry32(dailySeed(salonId, businessDate));
  const byStart = [...people].sort((a, b) => a.startKey - b.startKey || a.id - b.id);
  const n = dailyPickCount(byStart.length);
  // ★ 第1424便: 出勤の方みんなから同じ確率で（選んだ方は除いて次を選ぶ）
  const pool = [...byStart];
  const featured: T[] = [];
  for (let k = 0; k < n && pool.length > 0; k++) {
    const i = Math.floor(r() * pool.length) % pool.length;
    featured.push(pool.splice(i, 1)[0]);
  }
  const chosen = new Set(featured.map((p) => p.id));
  return { featured, others: byStart.filter((p) => !chosen.has(p.id)) };
}

/**
 * ★ 第1421便（カッキーさん「タグで変える事が出来るならそれで」）: 題名の言い回しを、1人目のピックアップの方のタグで変える。
 *   強い順に見て、最初に当たったタグの言い回し。新人は「新人」タグか、新人の印（is_new_face が有効）。どれも無ければ「出勤速報｜」。
 *   名前は「なぎささん・るいさん」（ピックアップが2人の日は2人とも）。
 */
export const DAILY_TITLE_BY_TAG: ReadonlyArray<{ tag: string; make: (who: string) => string }> = [
  { tag: '殿堂入り', make: (w) => `👑殿堂入り👑${w}出勤` },
  { tag: 'NO.1', make: (w) => `★NO.1★${w}出勤♪` },
  { tag: 'プレミア', make: (w) => `◆プレミア◆${w}出勤` },
  { tag: '新人', make: (w) => `🌸新人🌸${w}出勤` },
  { tag: '人気急上昇', make: (w) => `🔥人気急上昇🔥${w}出勤` },
  { tag: '指名多数', make: (w) => `★指名多数★${w}出勤♪` },
  { tag: 'リピーター多数', make: (w) => `♪リピーター続出♪${w}出勤` },
  { tag: '店長おすすめ', make: (w) => `【店長イチオシ】${w}出勤` },
  { tag: '要予約', make: (w) => `【要予約】人気の${w}出勤` },
];

/**
 * ★ 第1423便（カッキーさん「外見・タイプタグも題名が変わるのに入れる事はできますか」）:
 *   上（ランク・新人）のどれも無いときは、外見・タイプのタグの言い回し。1人目の方のタグを【付けた順】に見て、最初に当たったもの。
 *   ★ 言葉は表に出る題名なので、からだの直接の言い方はしない（巨乳→グラマー・熟女→大人の魅力）。
 */
export const DAILY_TITLE_BY_LOOK: Readonly<Record<string, string>> = {
  // 外見
  'ギャル': '💖ギャル系💖', '清楚': '✨清楚系✨', 'キレイ': '✨美人✨', 'かわいい': '💕かわいい💕',
  'お姉さん系': '◇お姉さん系◇', '妹系': '🎀妹系🎀', '童顔': '☆童顔☆', 'モデル系': '👠モデル系👠',
  'スレンダー': '◇スレンダー美女◇', '美脚': '◇美脚◇', '低身長': '🌷小柄な', '高身長': '◇長身◇',
  '熟女': '◆大人の魅力◆', '巨乳': '◆グラマー◆', 'アイドル系': '⭐アイドル系⭐', 'キャバ嬢': '🥂華やか🥂',
  // タイプ（雰囲気）
  '癒し系': '🌿癒し系🌿', '笑顔が素敵': '😊笑顔が素敵😊', '明るい': '☀明るい☀', '天然': '🌼天然🌼',
  'トーク上手': '💬トーク上手💬', 'おしとやか': '🌸おしとやか🌸', 'ツンデレ': '💘ツンデレ💘',
};

/** 題名「10/13 ★NO.1★なぎささん・るいさん出勤♪」。タグが無ければ「10/13 出勤速報｜なぎささん」 */
export function dailyShiftTitleByTags(
  businessDate: string,
  featured: ReadonlyArray<{ name: string; badges: readonly string[]; isNewFace?: boolean }>,
): string {
  const [, m, d] = businessDate.split('-').map(Number);
  if (featured.length === 0) return `${m}/${d} 出勤速報`;
  const who = featured.map((p) => `${p.name}さん`).join('・');
  const lead = featured[0];
  const has = (tag: string) => lead.badges.includes(tag) || (tag === '新人' && lead.isNewFace === true);
  const hit = DAILY_TITLE_BY_TAG.find((t) => has(t.tag));
  if (hit) return `${m}/${d} ${hit.make(who)}`;
  // ★ 第1423便: 外見・タイプのタグ（付けた順の最初の1つ）
  const look = lead.badges.find((b) => DAILY_TITLE_BY_LOOK[b]);
  if (look) return `${m}/${d} ${DAILY_TITLE_BY_LOOK[look]}${who}出勤`;
  return `${m}/${d} 出勤速報｜${who}`;
}

/** 題名「10/13 出勤速報｜なぎささん・るいさん」（★ 一覧に日ごとに残るので「本日の」は付けない） */
export function dailyShiftTitle(businessDate: string, featuredNames: readonly string[]): string {
  const [, m, d] = businessDate.split('-').map(Number);
  const who = featuredNames.length > 0 ? `｜${featuredNames.map((n) => `${n}さん`).join('・')}` : '';
  return `${m}/${d} 出勤速報${who}`;
}
