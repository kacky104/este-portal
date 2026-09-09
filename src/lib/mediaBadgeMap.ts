// ───────────── ★★★ 特徴バッジ → 媒体のタグ 変換表（第230便・2026-09-09）─────────────
//
// ★★★ **このファイルは「設計メモ_セラピストの新規登録を媒体へ送る_2026-09-09.md §6-2」の写し。**
//   ★ 直すときは【必ずメモの表を先に直してから】ここへ写す。★ ここだけ直さない。
//   ★ メモの表が正本。★ 二重管理に見えるが、決めたのは人で、ここはその写しだという順番を守る。
//
// ★★ 語彙の数（2026-09-09 実測）:
//   フクエス  42種（src/lib/therapistBadges.ts・1人6つまで）
//   駅ちか    61種（POST の `genre[<id>]`・1人19個まで）★ id は**添字**。value は常に 1
//   エステ魂  27種（POST の `type[]`）★ **1人4つまで**
//
// ★★★ ここは【変換するだけ】。★ 送らない・書かない・DBも触らない。
//   ★ 送るのは次の便（第231便以降）。★ 純粋な関数だけを置く。

import { sortBadges, BADGES_BY_CATEGORY, BADGE_CATEGORY_ORDER } from './therapistBadges';

/**
 * ★★ 駅ちかは【ジャンルが必須】。1つも無いと登録が弾かれる（2026-09-09 実弾で確認）。
 *   → バッジが1つも無いときは、これを入れる（設計メモ §6-1 の2）。
 *   ★ `5` = 店長オススメ。★ 「使わないタグ」に入れてあるのは、**既定用にしか使わない**という意味。
 */
export const EKICHIKA_DEFAULT_GENRE_ID = 5;

/** ★ 駅ちかの上限（1人19個）。★ いまは MAX_BADGES=6 なので届かないが、数は記録しておく */
export const EKICHIKA_MAX_GENRES = 19;

/** ★★ エステ魂の上限（1人4つ）。★ こちらは **届く**（バッジ6つ → 4つに削る） */
export const ESUTAMA_MAX_TYPES = 4;

/**
 * ★★★ エステ魂の「新人」は `1`。
 *   ★ 駅ちかの `rookie_flg`（30日で自動消滅）とは**別物**。★ エステ魂のこれは**自動で消えない**。
 *   ★ だから「新規登録した全員に無条件で付ける」ことは**しない**（設計メモ §6-1 の1）。
 *     ★ 付けるのは、店舗様がフクエスで「新人」バッジを選んだときだけ。
 */
export const ESUTAMA_ROOKIE_TYPE_ID = 1;

/**
 * ★★ エステ魂も【`type[]` が必須】。1つも無いと登録が弾かれる。
 *   → 変換の結果が空になったときは、これを入れる（★ カッキーさん決定・2026-09-09・第230便）。
 *   ★★★ **`1` 新人 は自動では消えない。**（駅ちかの30日とは違う）
 *     ★ 既定で入った人は、あとで店舗様が手で外すことになる。★ そこを承知のうえでの決め。
 *     ★ だから記録には「既定を入れた」ことを必ず残す（explainBadgeMapping の usedDefault）。
 */
export const ESUTAMA_DEFAULT_TYPE_ID = ESUTAMA_ROOKIE_TYPE_ID;

export type MediaBadgeRow = {
  /** フクエスのバッジ名（★ therapistBadges.ts のラベルそのまま。これが鍵） */
  badge: string;
  /** 駅ちかの genre id。★ null＝送らない */
  ekichika: number | null;
  /** ★ 相手の言葉（読む人のため。★ コードは使わない） */
  ekichikaLabel: string | null;
  /** エステ魂の type。★ null＝送らない */
  esutama: number | null;
  esutamaLabel: string | null;
};

/**
 * ★★★ 正本の写し（設計メモ §6-2）。★ **並びはフクエスのバッジの並びのまま**
 *   （ランク・人気 → 経験・キャリア → 外見 → 雰囲気 → スキル）。
 *   ★ 自己点検が「42行あるか」「並びが therapistBadges.ts と同じか」を見張っている。
 */
export const MEDIA_BADGE_ROWS: readonly MediaBadgeRow[] = [
  // ── ランク・人気 ──
  { badge: 'NO.1',           ekichika: 1,  ekichikaLabel: 'NO.1',          esutama: null, esutamaLabel: null },
  { badge: 'プレミア',       ekichika: 4,  ekichikaLabel: 'プレミア',      esutama: null, esutamaLabel: null },
  { badge: '殿堂入り',       ekichika: null, ekichikaLabel: null,          esutama: null, esutamaLabel: null },
  { badge: '人気急上昇',     ekichika: null, ekichikaLabel: null,          esutama: null, esutamaLabel: null },
  { badge: '指名多数',       ekichika: null, ekichikaLabel: null,          esutama: null, esutamaLabel: null },
  { badge: 'リピーター多数', ekichika: 89, ekichikaLabel: 'リピート高確率', esutama: null, esutamaLabel: null },
  // ── 経験・キャリア ──
  // ★ 「未経験」は 78 エステ未経験のみ。★ 40 未経験 は使わない（設計メモ §6-1 の5・意味が正確なほう）
  { badge: '未経験',   ekichika: 78, ekichikaLabel: 'エステ未経験', esutama: 3,  esutamaLabel: '業界未経験' },
  { badge: '経験者',   ekichika: 77, ekichikaLabel: 'エステ経験者', esutama: 2,  esutamaLabel: '経験豊富' },
  // ★★★ 新人 → 駅ちかは【変換しない】。★ 駅ちかは rookie_flg=1 を新規登録の POST に混ぜる（§2-7b・§6-1 の1）
  { badge: '新人',     ekichika: null, ekichikaLabel: null,         esutama: 1,  esutamaLabel: '新人' },
  { badge: 'ベテラン', ekichika: null, ekichikaLabel: null,         esutama: null, esutamaLabel: null },
  { badge: '女子大生', ekichika: 12, ekichikaLabel: '女子大生',     esutama: null, esutamaLabel: null },
  { badge: 'OL',       ekichika: 6,  ekichikaLabel: 'OL系',         esutama: null, esutamaLabel: null },
  { badge: 'お嬢様',   ekichika: 9,  ekichikaLabel: 'お嬢様',       esutama: 29, esutamaLabel: 'お嬢様系' },
  // ── 外見・タイプ ──
  { badge: 'ギャル',     ekichika: 14, ekichikaLabel: 'ギャル系',   esutama: 19, esutamaLabel: 'ギャル系' },
  { badge: '清楚',       ekichika: 49, ekichikaLabel: '清楚',       esutama: 9,  esutamaLabel: '清楚系' },
  { badge: 'キレイ',     ekichika: 23, ekichikaLabel: '綺麗系',     esutama: 20, esutamaLabel: '美人系' },
  { badge: 'かわいい',   ekichika: 10, ekichikaLabel: '可愛い系',   esutama: 22, esutamaLabel: 'かわいい系' },
  { badge: 'お姉さん系', ekichika: 8,  ekichikaLabel: 'お姉さん系', esutama: 12, esutamaLabel: 'お姉様系' },
  // ★★ 妹系・童顔 は【どちらも駅ちか 11 ロリ系】。★ 重なりは取り除く（§6-1 の6）
  { badge: '妹系',       ekichika: 11, ekichikaLabel: 'ロリ系',     esutama: 26, esutamaLabel: '妹系' },
  { badge: '童顔',       ekichika: 11, ekichikaLabel: 'ロリ系',     esutama: null, esutamaLabel: null },
  { badge: 'モデル系',   ekichika: 45, ekichikaLabel: 'モデル系',   esutama: 16, esutamaLabel: 'モデル体型' },
  { badge: 'スレンダー', ekichika: 17, ekichikaLabel: 'スレンダー', esutama: null, esutamaLabel: null },
  { badge: '美脚',       ekichika: 34, ekichikaLabel: '美脚',       esutama: null, esutamaLabel: null },
  { badge: '低身長',     ekichika: 65, ekichikaLabel: '低身長',     esutama: 31, esutamaLabel: '小柄' },
  { badge: '高身長',     ekichika: 58, ekichikaLabel: '高身長',     esutama: null, esutamaLabel: null },
  { badge: '熟女',       ekichika: null, ekichikaLabel: null,       esutama: 21, esutamaLabel: '熟女系' },
  { badge: '巨乳',       ekichika: 16, ekichikaLabel: 'グラマー',   esutama: null, esutamaLabel: null },
  { badge: 'アイドル系', ekichika: 7,  ekichikaLabel: 'アイドル系', esutama: 24, esutamaLabel: 'アイドル系' },
  { badge: 'キャバ嬢',   ekichika: 13, ekichikaLabel: 'キャバ系',   esutama: null, esutamaLabel: null },
  // ── 雰囲気・性格 ──
  { badge: '癒し系',     ekichika: 22, ekichikaLabel: '癒し系',     esutama: 23, esutamaLabel: '癒し系' },
  { badge: '笑顔が素敵', ekichika: 90, ekichikaLabel: '好感度抜群', esutama: null, esutamaLabel: null },
  { badge: '明るい',     ekichika: null, ekichikaLabel: null,       esutama: 8,  esutamaLabel: '明るい' },
  { badge: '天然',       ekichika: 54, ekichikaLabel: '天然',       esutama: 10, esutamaLabel: '天然系' },
  { badge: 'トーク上手', ekichika: 86, ekichikaLabel: '話し上手',   esutama: null, esutamaLabel: null },
  { badge: 'おしとやか', ekichika: 52, ekichikaLabel: 'おっとり',   esutama: 7,  esutamaLabel: 'おっとり' },
  { badge: 'ツンデレ',   ekichika: 85, ekichikaLabel: 'ツンデレ',   esutama: null, esutamaLabel: null },
  // ── スキル ──
  { badge: '丁寧な施術', ekichika: 91, ekichikaLabel: '丁寧な施術', esutama: null, esutamaLabel: null },
  { badge: 'アロマ得意', ekichika: null, ekichikaLabel: null,       esutama: null, esutamaLabel: null },
  { badge: '施術上手',   ekichika: 25, ekichikaLabel: 'テクニシャン', esutama: 28, esutamaLabel: '施術上手' },
  { badge: '密着施術',   ekichika: null, ekichikaLabel: null,       esutama: null, esutamaLabel: null },
  { badge: 'リンパ得意', ekichika: null, ekichikaLabel: null,       esutama: null, esutamaLabel: null },
  { badge: 'サービス抜群', ekichika: 41, ekichikaLabel: 'サービス抜群', esutama: null, esutamaLabel: null },
];

/** ラベル → 行 の逆引き。★ 未知のバッジは引けない（＝送らない） */
const ROW_BY_BADGE: Record<string, MediaBadgeRow> = (() => {
  const m: Record<string, MediaBadgeRow> = {};
  for (const r of MEDIA_BADGE_ROWS) m[r.badge] = r;
  return m;
})();

/** ★ フクエスのバッジの並び（therapistBadges.ts の順）。★ 自己点検が突き合わせる */
export function fukuesBadgeOrder(): string[] {
  const out: string[] = [];
  for (const cat of BADGE_CATEGORY_ORDER) for (const b of BADGES_BY_CATEGORY[cat]) out.push(b);
  return out;
}

/** 知っているバッジだけを、カテゴリ順に並べて返す（★ 重複も落とす） */
function knownSorted(badges: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const b of badges) {
    if (typeof b !== 'string' || !ROW_BY_BADGE[b] || seen.has(b)) continue;
    seen.add(b);
    out.push(b);
  }
  return sortBadges(out);
}

/**
 * ★★★ 駅ちかへ送る genre id の並び。
 *   ★ 順番はフクエスのバッジの並び（カテゴリ順）。★ 重なりは取り除く。
 *   ★★ **1つも無いときは `5` 店長オススメ を入れる**（§6-1 の2）。★ 入れないと登録が弾かれる。
 *   ★ 「新人」はここに出ない（rookie_flg で別に送る・§6-1 の1）。
 */
export function toEkichikaGenreIds(badges: readonly string[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const b of knownSorted(badges)) {
    const id = ROW_BY_BADGE[b].ekichika;
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) return [EKICHIKA_DEFAULT_GENRE_ID];
  return ids.slice(0, EKICHIKA_MAX_GENRES);
}

/**
 * ★★★ エステ魂へ送る type の並び。
 *   ★ カテゴリ順（ランク→経験→外見→雰囲気→スキル）で **先頭4つ**（§6-1 の3）。
 *   ★ 重なりは取り除く。
 *
 *   ★★ **1つも無いときは `1` 新人 を入れる**（★ 必須なので・カッキーさん決定 2026-09-09）。
 *     ★★★ この既定は**自動で消えない**。★ 入ったことは記録に残す（explainBadgeMapping）。
 */
export function toEsutamaTypeIds(badges: readonly string[]): number[] {
  const ids: number[] = [];
  const seen = new Set<number>();
  for (const b of knownSorted(badges)) {
    const id = ROW_BY_BADGE[b].esutama;
    if (id === null || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  if (ids.length === 0) return [ESUTAMA_DEFAULT_TYPE_ID];
  return ids.slice(0, ESUTAMA_MAX_TYPES);
}

/**
 * ★ 画面や記録に「何が落ちたか」を出すための内訳。★ 送る側は使わなくてよい。
 *   ★★ 「6つ選んだのに4つしか行かない」を、あとから説明できるようにするための1本。
 */
export function explainBadgeMapping(badges: readonly string[]): {
  known: string[];
  unknown: string[];
  ekichika: { ids: number[]; usedDefault: boolean; droppedBadges: string[] };
  esutama: { ids: number[]; usedDefault: boolean; overflowBadges: string[]; droppedBadges: string[] };
} {
  const known = knownSorted(badges);
  const unknown = badges.filter((b) => typeof b === 'string' && !ROW_BY_BADGE[b]);

  const eIds = toEkichikaGenreIds(known);
  const usedDefault = known.every((b) => ROW_BY_BADGE[b].ekichika === null);
  const eDropped = known.filter((b) => ROW_BY_BADGE[b].ekichika === null);

  // ★ エステ魂: 「相手に言葉が無い」で落ちたぶんと、「4つを超えた」で落ちたぶんを**分けて**返す
  const mapped: Array<{ badge: string; id: number }> = [];
  const sDropped: string[] = [];
  const seen = new Set<number>();
  for (const b of known) {
    const id = ROW_BY_BADGE[b].esutama;
    if (id === null) { sDropped.push(b); continue; }
    if (seen.has(id)) { sDropped.push(b); continue; }
    seen.add(id);
    mapped.push({ badge: b, id });
  }
  return {
    known,
    unknown,
    ekichika: { ids: eIds, usedDefault, droppedBadges: eDropped },
    esutama: {
      ids: toEsutamaTypeIds(known),
      // ★★★ 「既定の 1 新人 が入った」＝ 変換できたものが1つも無かった、ということ
      usedDefault: mapped.length === 0,
      overflowBadges: mapped.slice(ESUTAMA_MAX_TYPES).map((x) => x.badge),
      droppedBadges: sDropped,
    },
  };
}
