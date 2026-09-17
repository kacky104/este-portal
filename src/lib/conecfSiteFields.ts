// コネックエフ「女性プロフィール」のコメント・Q&A・各サイト項目の決めごと（第414便・2026-09-17）。★ 純関数だけ。
//
// ★★ 何のため（カッキーさんの発案）
//   ベンリーの「各サイト項目」と同じく、駅ちか・エステ魂それぞれの形に沿ったプロフィールを持つ。
//   ★ この便は【入れて保存する】まで。★ サイトへ送るのは次の便（駅ちか→エステ魂の順）。
// ★★ 候補と上限は、ラビリンス様の管理画面の実物で確かめた値（2026-09-17・見るだけ）
//   駅ちか   /admin/girls/edit/{girl_id}   … 設計メモ §4
//   エステ魂 /admin/cast_edit/{cast_id}/   … 設計メモ §5
// ★ コメントの文字数別（50/100/…/1000 字）は持たない（カッキーさんの判断）。★ 1本を各サイトの上限で注意する。

export const len = (s: string) => [...s].length;

// ── コメント（共通）────────────────────────────────
/** キャッチコピー：フクエス 16・駅ちか 15 */
export const CATCH_MAX = 16;
/** お店コメント：駅ちか 2,000・エステ魂 500 */
export const SHOP_COMMENT_MAX = 2000;
/** お店からのメッセージ タイトル：駅ちか 80（推奨） */
export const SHOP_TITLE_MAX = 80;
/** 女の子コメント：駅ちか 200・エステ魂 500 */
export const GIRL_COMMENT_MAX = 500;

export const COMMENT_SITE_LIMITS = {
  catch: [['駅ちか', 15], ['フクエス', 16]],
  shopComment: [['エステ魂', 500], ['駅ちか', 2000]],
  shopTitle: [['駅ちか', 80]],
  girlComment: [['駅ちか', 200], ['エステ魂', 500]],
} as const;

/** 各サイトの上限を超えているサイト名（★ 保存は止めない。★ 画面で注意する） */
export function overSites(text: string, limits: ReadonlyArray<readonly [string, number]>): string[] {
  const n = len(text);
  return limits.filter(([, max]) => n > max).map(([name, max]) => `${name}（${max}字まで）`);
}

export type ConecfComments = { catchphrase: string; profileText: string; shopTitle: string; girlComment: string };

export function normalizeComments(input: Partial<Record<keyof ConecfComments, unknown>>):
  { ok: true; value: ConecfComments } | { ok: false; error: string } {
  const s = (v: unknown) => (typeof v === 'string' ? v.replace(/\r\n/g, '\n').trim() : '');
  const value: ConecfComments = {
    catchphrase: s(input.catchphrase), profileText: s(input.profileText),
    shopTitle: s(input.shopTitle), girlComment: s(input.girlComment),
  };
  if (len(value.catchphrase) > CATCH_MAX) return { ok: false, error: `キャッチコピーは${CATCH_MAX}文字までです` };
  if (len(value.profileText) > SHOP_COMMENT_MAX) return { ok: false, error: `お店コメントは${SHOP_COMMENT_MAX}文字までです` };
  if (len(value.shopTitle) > SHOP_TITLE_MAX) return { ok: false, error: `メッセージタイトルは${SHOP_TITLE_MAX}文字までです` };
  if (len(value.girlComment) > GIRL_COMMENT_MAX) return { ok: false, error: `女の子コメントは${GIRL_COMMENT_MAX}文字までです` };
  return { ok: true, value };
}

// ── Q&A（駅ちかの「女の子へ質問」10問・各50字）──────────────
export const QA_MAX = 10;
export const QA_TEXT_MAX = 50;
export type QaItem = { q: string; a: string };

export function normalizeQa(input: unknown): { ok: true; value: QaItem[] } | { ok: false; error: string } {
  const arr = Array.isArray(input) ? input : [];
  const out: QaItem[] = [];
  for (let i = 0; i < Math.min(arr.length, QA_MAX); i++) {
    const x = arr[i] as { q?: unknown; a?: unknown } | null;
    const q = typeof x?.q === 'string' ? x.q.trim() : '';
    const a = typeof x?.a === 'string' ? x.a.trim() : '';
    if (len(q) > QA_TEXT_MAX || len(a) > QA_TEXT_MAX) return { ok: false, error: `Q${i + 1} は質問・回答とも${QA_TEXT_MAX}文字までです` };
    out.push({ q, a });
  }
  while (out.length > 0 && !out[out.length - 1].q && !out[out.length - 1].a) out.pop();
  return { ok: true, value: out };
}

// ── 駅ちか ────────────────────────────────────────
export const EKICHIKA_P_GENRES: readonly string[] = [
  'no1', '顔出し', 'ロリ系', 'お姉さん系', 'ぽっちゃり', 'スレンダー', 'スタイル抜群', '高身長', '低身長', 'テクニシャン',
];
export const EKICHIKA_P_GENRE_MAX = 3;
export const EKICHIKA_GENRE_GROUPS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['ステータス', ['no1', 'no2', 'no3', 'プレミア', '店長オススメ', '素人', '未経験', '禁煙', '要予約', '顔出し', 'エステ経験者', 'エステ未経験', '資格あり', 'インテリ', 'ツンデレ', '話し上手', '聞き上手', 'リピート高確率', '好感度抜群', '礼儀正しい', '好奇心旺盛']],
  ['ルックス', ['アイドル系', 'お姉さん系', 'お嬢様', '可愛い系', 'ロリ系', 'ギャル系', 'キレカワ', '美少女系', '綺麗系', 'ハーフ']],
  ['スタイル', ['グラマー', 'スレンダー', 'ぽっちゃり', 'ミニマム', '美肌', '美脚', '色白', 'スタイル抜群', 'モデル系', '高身長', '低身長', 'ﾀﾄｩｰ・刺青']],
  ['雰囲気', ['OL系', '女子大生', 'キャバ系', 'セクシー系', '癒し系', '清楚', '萌え系', 'おっとり', '天然', '真面目']],
  ['プレイ関連', ['テクニシャン', 'サービス抜群', '愛嬌抜群', 'マッサージが得意', '極液施術可能', 'バリエーション豊富', '出張サービス可能', '丁寧な施術']],
];
export const EKICHIKA_GENRES: readonly string[] = EKICHIKA_GENRE_GROUPS.flatMap(([, xs]) => xs);
export const EKICHIKA_GENRE_MAX = 19;
export const EKICHIKA_OPTIONS_MAX = 145;
/** 新人・体験入店（rookie_flg）。★ '' はどちらも付けない */
export const EKICHIKA_ROOKIE: ReadonlyArray<readonly [string, string]> = [['', '付けない'], ['1', '新人'], ['2', '体験入店＋新人']];
export const CONSTELLATIONS: readonly string[] = ['おひつじ', 'おうし', 'ふたご', 'かに', 'しし', 'おとめ', 'てんびん', 'さそり', 'いて', 'やぎ', 'みずがめ', 'うお'];

export type EkichikaFields = { pGenres: string[]; genres: string[]; options: string; rookie: string; constellation: string };

/** 候補にあるものだけ・重複なし・選んだ順のまま・上限まで */
export function pickFrom(input: unknown, candidates: readonly string[], max: number): string[] {
  const set = new Set(candidates);
  const out: string[] = [];
  for (const v of Array.isArray(input) ? input : []) {
    if (typeof v === 'string' && set.has(v) && !out.includes(v)) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

export function normalizeEkichikaFields(input: Record<string, unknown> | null | undefined):
  { ok: true; value: EkichikaFields } | { ok: false; error: string } {
  const x = input ?? {};
  const options = typeof x.options === 'string' ? x.options.trim() : '';
  if (len(options) > EKICHIKA_OPTIONS_MAX) return { ok: false, error: `可能オプションは${EKICHIKA_OPTIONS_MAX}文字までです` };
  const rookie = EKICHIKA_ROOKIE.some(([v]) => v === x.rookie) ? String(x.rookie) : '';
  const constellation = typeof x.constellation === 'string' && CONSTELLATIONS.includes(x.constellation) ? x.constellation : '';
  return {
    ok: true,
    value: {
      pGenres: pickFrom(x.pGenres, EKICHIKA_P_GENRES, EKICHIKA_P_GENRE_MAX),
      genres: pickFrom(x.genres, EKICHIKA_GENRES, EKICHIKA_GENRE_MAX),
      options, rookie, constellation,
    },
  };
}

// ── エステ魂 ──────────────────────────────────────
export const ESUTAMA_TYPES: readonly string[] = [
  '新人', '経験豊富', '業界未経験', '施術上手', '上品', '甘えん坊', 'おとなしい', 'おっとり', '明るい', '優しい', '努力家', '礼儀正しい',
  '清楚系', '天然系', 'セクシー系', 'お姉様系', 'お嬢様系', 'ギャル系', '美人系', '熟女系', 'かわいい系', 'アイドル系', '癒し系', '妹系',
  'モデル体型', '小柄', '色白肌',
];
export const ESUTAMA_TYPE_MAX = 4;
export const ESUTAMA_BODY_STYLES: readonly string[] = ['スレンダー', '普通', 'グラマー', '少しぽっちゃり', 'ぽっちゃり'];
/** セラピストへの質問（各20字）。★ [保存のキー, 画面の名前] */
export const ESUTAMA_QUESTIONS: ReadonlyArray<readonly [string, string]> = [
  ['forte', '得意な施術'], ['food', '好きな食べ物'], ['manType', '好きな男性のタイプ'],
  ['likeTalent', '似ている芸能人'], ['holiday', '休みの日は何してる？'], ['hobby', '趣味・特技'],
];
export const ESUTAMA_QUESTION_MAX = 20;
export const ESUTAMA_QUALIFIED_MAX = 200;
export const ESUTAMA_SNS: ReadonlyArray<readonly [string, string]> = [['blog', '外部ブログ'], ['twitter', 'X(旧Twitter)'], ['bluesky', 'Bluesky'], ['instagram', 'Instagram']];
export const ESUTAMA_SNS_MAX = 255;

export type EsutamaFields = {
  types: string[]; experience: string; qualified: string; bodyStyle: string;
  answers: Record<string, string>; sns: Record<string, string>;
};

export function normalizeEsutamaFields(input: Record<string, unknown> | null | undefined):
  { ok: true; value: EsutamaFields } | { ok: false; error: string } {
  const x = input ?? {};
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const experience = s(x.experience);
  if (experience && !/^\d{1,2}$/.test(experience)) return { ok: false, error: 'エステ歴は2桁までの数字で入れてください' };
  const qualified = s(x.qualified);
  if (len(qualified) > ESUTAMA_QUALIFIED_MAX) return { ok: false, error: `資格は${ESUTAMA_QUALIFIED_MAX}文字までです` };
  const bodyStyle = ESUTAMA_BODY_STYLES.includes(s(x.bodyStyle)) ? s(x.bodyStyle) : '';
  const ansIn = (x.answers ?? {}) as Record<string, unknown>;
  const answers: Record<string, string> = {};
  for (const [k, label] of ESUTAMA_QUESTIONS) {
    const v = s(ansIn[k]);
    if (len(v) > ESUTAMA_QUESTION_MAX) return { ok: false, error: `${label}は${ESUTAMA_QUESTION_MAX}文字までです` };
    if (v) answers[k] = v;
  }
  const snsIn = (x.sns ?? {}) as Record<string, unknown>;
  const sns: Record<string, string> = {};
  for (const [k, label] of ESUTAMA_SNS) {
    const v = s(snsIn[k]);
    if (len(v) > ESUTAMA_SNS_MAX) return { ok: false, error: `${label}は${ESUTAMA_SNS_MAX}文字までです` };
    if (v) sns[k] = v;
  }
  return { ok: true, value: { types: pickFrom(x.types, ESUTAMA_TYPES, ESUTAMA_TYPE_MAX), experience, qualified, bodyStyle, answers, sns } };
}

/** 各サイト項目を持てる媒体（★ いまは駅ちか・エステ魂） */
export const SITE_FIELD_PROVIDERS: readonly string[] = ['ekichika', 'esutama'];

export function normalizeSiteFields(provider: string, input: Record<string, unknown> | null | undefined):
  { ok: true; value: EkichikaFields | EsutamaFields } | { ok: false; error: string } {
  if (provider === 'ekichika') return normalizeEkichikaFields(input);
  if (provider === 'esutama') return normalizeEsutamaFields(input);
  return { ok: false, error: 'このサイトの項目はまだありません' };
}
