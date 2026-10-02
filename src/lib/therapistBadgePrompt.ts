// AIで特徴バッジを選ぶ（第113便・2026-09-03）。★ 純粋関数のみ。
//
// ★★★ なぜ「数値で決まるもの」と「AIに頼むもの」を分けるか
//   低身長・高身長・巨乳は **数値で決まる**（T149 / B86(E)）。
//   ★ AIに判断させると毎回同じ答えにならず、**点検で固定できない**。
//   → 数値で決まるものはここで決め、AIには【写真を見ないと分からないもの】だけを頼む。
//   ★ 引き継ぎメモ「機械で決まるものは機械で」。★ 出力が短くなるので費用も減る。
//
// ★★★ 選ばせないカテゴリがある（このファイルでいちばん大事なところ）
//   ランク・人気（NO.1・プレミア・殿堂入り・人気急上昇・指名多数・リピーター多数・店長おすすめ・要予約）
//     … 実績はこちらが知らない。★ 写真からは絶対に分からない。
//   経験・キャリア（未経験・経験者・新人・ベテラン・女子大生・OL・お嬢様）
//     … 同じく分からない。★ 「女子大生」を顔で決めない。
//   スキル（丁寧な施術・アロマ得意・施術上手・密着施術・リンパ得意・サービス抜群）
//     … 施術を見ていない。
//   雰囲気のうち トーク上手・天然・ツンデレ
//     … 会話を見ていない。★ 写真から性格を断定しない。
//   外見のうち 熟女
//     … 何歳からかを誰も決めていない。★ 本人・店舗が選ぶべき語。こちらから付けない。
//   ★ copyPrompt の禁則208（実績を勝手に作らない）と同じ筋。★ 分からないものを埋めない。
//   ★ これらは駅ちかのタグを取り込めば根拠を持って足せる（設計メモ_駅ちかの特徴タグ_2026-09-03）。
//
// ★ 語彙は src/lib/therapistBadges.ts から引く。★ ここに書き写さない
//   （copyPrompt は RANK_BADGES を書き写しているが、それは6語で済むため。
//     42語を書き写すと、増やした日に必ず片方が古くなる）。

import { BADGES_BY_CATEGORY, MAX_BADGES, sanitizeBadges } from './therapistBadges';
// ★★★ 紹介文のプロンプトから【戒め】を持ち込む（第114便）。★ 素材だけ写して注意書きを写さない、を防ぐ
import { CLICHE_WORDS } from './therapistCopyPrompt';

/** ★ 数値で決まるバッジ。★ AIには選ばせない（選択肢から外す） */
export const NUMERIC_BADGES: readonly string[] = ['低身長', '高身長', '巨乳'];

/**
 * ★★★ 線引き（2026-09-03・AROMAMay 様101人の実データを見て確定）。
 *
 * ★★★ 決め方: **その語が何人に付くか**を数えて決めた。★ 感覚で決めない。
 *   ★ 6割に付く語はバッジとして役に立たない（6個の枠を1つ潰すだけ）。
 *   ★ 逆に1〜2人しか付かない語も、ほとんどの人の役に立たない。
 *   → 5〜12%くらい（101人なら6〜12人）に収まる線を選んだ。
 *
 * ★ 実データ（salon_id 12・101人）
 *   身長  145-149: 6人 ／ 150-159: 55人 ／ 160: 21人 ／ 161-167: 18人 ／ 169,172: 2人
 *   カップ C:19 D:20 E:25 F:25 G:8 H:4
 *
 * ★★ 初版（試し打ちの前）は SHORT_CM=150 / TALL_CM=168 / BUST_CUP_FROM='E' だった。
 *   ★ E以上は **62人（61.4%）**。★ 実際、試し打ちの3人とも「巨乳」が付いた。
 *   ★ TALL_CM=168 は 2人（2.0%）で、逆に厳しすぎた。
 *   ★★ **試し打ちを見ずに101人へ流していたら、6割に同じバッジが並んでいた。**
 *
 * ★ 変えるときはここ3行。★ 画面にも文言にも焼き付けない。★ 点検が境目を固定している。
 *
 * ★★ 第1096便（2026-10-02・カッキーさんの決定）: 低身長を 150 → **153cm 未満** に。
 *   ★ 高身長 165 以上・巨乳 G 以上は変えない（カッキーさんが数字を見たうえで据え置き）。
 *   ★ 153 にしたあとの人数は数え直していない（上の 6人 は 150 のときの数）。
 */
export const SHORT_CM = 153;   // これ未満なら 低身長   … 150 のとき 6人（5.9%）。153 では未計測
export const TALL_CM = 165;    // これ以上なら 高身長   … 6人（5.9%）
/** ★ このカップ以上なら 巨乳。★ 'G' なら G・H… が当たる … 12人（11.9%） */
export const BUST_CUP_FROM = 'G';

/** ★ AIに選ばせる語。★ 写真（と数値の補助）から根拠を持って言えるものだけ */
export const PHOTO_BADGES: readonly string[] = [
  // 外見・タイプ（★ 低身長・高身長・巨乳は数値側／熟女は付けない）
  ...BADGES_BY_CATEGORY.look.filter(
    (b) => !NUMERIC_BADGES.includes(b) && b !== '熟女',
  ),
  // ★ 第1100便: 雰囲気・性格（癒し系・笑顔が素敵・明るい・おしとやか）は AI に選ばせない。★ くじで必ず1つ付ける（下の MOOD_PICKABLE）
];

// ────────────────────────────── ランク・人気の語（5つだけ・くじで決める） ──────────────────────────────
//
// ★★★ 第1097便・第1098便（2026-10-02・カッキーさんの決定）
//   ランク・人気のうち、付けてよいのは次の5つだけ。★ NO.1・殿堂入り・指名多数 は付けない。
//   ★★ 第1098便: AI には選ばせない。★ 試し打ち（2店舗8人）で AI は1個も選ばなかった
//     （写真とサイズに実績の材料が無いので、選ばないのが正しい答えだった）。
//   → カッキーさんの決め: **30% の人に、5つのうちどれか1つをくじで付ける**（RANK_PICK_PERCENT）。
//   ★ くじはセラピストの id から決める（pickRankBadge）。★ Math.random は使わない。
//     ＝ 同じ人は何度引いても同じ結果。★ 試し打ちで見た結果と、保存される結果が食い違わない。点検でも固定できる。
//   ★ 実績を見て付けている語ではない。★ 実態と合わないときは、店舗様がマイページで外す。
//   ★ 経験・キャリア・スキルは今までどおり付けない。

/** ★ くじで付けてよいランク・人気の語（この5つだけ） */
export const RANK_PICKABLE: readonly string[] = ['プレミア', '人気急上昇', '店長おすすめ', 'リピーター多数', '要予約'];
/** ★ 何%の人に付けるか */
export const RANK_PICK_PERCENT = 30;

/** 文字列から 0 以上の整数を作る（FNV-1a・32bit）。★ 同じ文字列なら必ず同じ数 */
function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ★★★ 第1100便（2026-10-02・カッキーさんの決定）: 雰囲気・性格とスキルは【必ず1つずつ】くじで付ける。
//   ★ 雰囲気・性格は7語ぜんぶ（天然・トーク上手・ツンデレも含む）、スキルは6語ぜんぶから、どれか1つ。
//   ★ それまで: 雰囲気は4語だけ AI が写真から選び（試し打ちでは1人も選ばれなかった）、スキルは1語も付けていなかった。
//   ★ 性格も施術の腕も、写真とサイズからは分からない。★ それを伝えたうえでの、カッキーさんの決め。
//     ★ 実態と合わないときは、店舗様がマイページで外す（ランク・人気のくじと同じ）。
//   ★ くじは id から決まる（何度引いても同じ）。★ AI には雰囲気・性格を選ばせない（くじの語と噛み合わない語が並ぶのを防ぐ）。

/** ★ くじで付ける雰囲気・性格の語（7語ぜんぶ） */
export const MOOD_PICKABLE: readonly string[] = BADGES_BY_CATEGORY.mood;
/** ★ くじで付けるスキルの語（6語ぜんぶ） */
export const SKILL_PICKABLE: readonly string[] = BADGES_BY_CATEGORY.skill;

/** ★★★ 雰囲気・性格のくじ。★ 必ず1つ返す（id が数でないときだけ null） */
export function pickMoodBadge(therapistId: number): string | null {
  if (!Number.isFinite(therapistId) || MOOD_PICKABLE.length === 0) return null;
  return MOOD_PICKABLE[hash32('mood:' + therapistId) % MOOD_PICKABLE.length];
}

/** ★★★ スキルのくじ。★ 必ず1つ返す（id が数でないときだけ null） */
export function pickSkillBadge(therapistId: number): string | null {
  if (!Number.isFinite(therapistId) || SKILL_PICKABLE.length === 0) return null;
  return SKILL_PICKABLE[hash32('skill:' + therapistId) % SKILL_PICKABLE.length];
}

/**
 * ★★★ ランク・人気の語のくじ。★ RANK_PICK_PERCENT% の人に、RANK_PICKABLE のどれか1つ。外れは null。
 * @param therapistId セラピストの id（★ これだけで結果が決まる）
 */
export function pickRankBadge(therapistId: number): string | null {
  if (!Number.isFinite(therapistId)) return null;
  if (hash32('rank-hit:' + therapistId) % 100 >= RANK_PICK_PERCENT) return null;
  return RANK_PICKABLE[hash32('rank-which:' + therapistId) % RANK_PICKABLE.length];
}

// ────────────────────────────── 髪の色で決まる語 ──────────────────────────────
//
// ★★★ 第1096便（2026-10-02・カッキーさんの決定）
//   ギャル・キャバ嬢 … 写真の髪が【金髪】のときだけ付ける。
//   清楚           … 写真の髪が【黒髪】のときだけ付ける。
// ★★ プロンプトに書くだけにしない。★ AIには髪の色も一緒に答えさせ、こちらで照らして落とす。
//   ★ 「書いたのに付いてきた」を防ぐ。★ 決まりはコード側に置く＝点検で固定できる。
// ★ 写真が無い・髪が見えない＝「不明」＝この3語は付かない（分からないときは付けない側に倒す）。

/** AIに答えさせる髪の色。★ 茶髪・染めた色などは全部「その他」 */
export const HAIR_COLORS = ['金髪', '黒髪', 'その他', '不明'] as const;
export type HairColor = (typeof HAIR_COLORS)[number];

/** ★ その語を付けてよい髪の色。★ ここに無い語は髪の色を問わない */
export const HAIR_REQUIRED: Readonly<Record<string, HairColor>> = {
  'ギャル': '金髪',
  'キャバ嬢': '金髪',
  '清楚': '黒髪',
};

/**
 * 髪の色の決まりに合わない語を落とす。★ 並びは変えない。
 * @param hair 写真から読んだ髪の色。★ 写真が無いときは呼ぶ側が '不明' を渡す
 */
export function applyHairRules(badges: readonly string[], hair: HairColor): string[] {
  return badges.filter((b) => {
    const need = HAIR_REQUIRED[b];
    return need === undefined || need === hair;
  });
}

/**
 * ★★★ 写真が無いときは選ばせない語（第1098便・カッキーさんの決定）。
 *   ★ ギャル・キャバ嬢・清楚は髪の色の決まりでも落ちる（写真なし＝不明）が、ここにも書いて1か所で読めるようにする。
 *   ★ 妹系・お姉さん系は見た目の印象の語。★ サイズの数字からは言えない。
 */
export const NO_PHOTO_EXCLUDED: readonly string[] = ['ギャル', 'キャバ嬢', '清楚', '妹系', 'お姉さん系'];

/**
 * ★★★ AI の返事を、決まりに照らして絞る（第1097便・第1098便）。★ ここを通った語だけが保存の候補になる。
 *   ① AI が選んでよい語（PHOTO_BADGES）以外は落とす。
 *      ★ ランク・人気（くじで決める）、経験・キャリア、スキル、数値の語、AI が作った語は、返ってきてもここで落ちる
 *        （★ それまでは「一覧に載せない」だけが守りで、返ってくればそのまま保存されていた）。
 *   ② 髪の色の決まり（applyHairRules）。
 *   ③ 写真が無いときは NO_PHOTO_EXCLUDED を落とす。
 * ★ 並びは変えない（並べ替えと上限6は sanitizeBadges の仕事）。
 */
export function filterAIBadges(fromAI: readonly string[], hair: HairColor, hasImage: boolean): string[] {
  const selectable = fromAI.filter((b) => PHOTO_BADGES.includes(b));
  return applyHairRules(selectable, hasImage ? hair : '不明')
    .filter((b) => hasImage || !NO_PHOTO_EXCLUDED.includes(b));
}

// ────────────────────────────── 写真がある方は最低3個（次点で足す） ──────────────────────────────
//
// ★★★ 第1099便（2026-10-02・カッキーさんの決定「B. 最低3個」）
//   紹介文の自動作成は「特徴バッジ3つ以上」が条件（第880便）。★ 試し打ちでは8人中5人が2個以下だった。
//   「必ず6個」にはしない（★ 16語から6個を毎回選ぶと全員が似たバッジになる・第113便のスレンダー59%に戻る）。
//   → AI には今までどおり【確かな語】だけを badges に入れさせ、別に【次点】（next）を近い順に3個まで出させる。
//     くじ・数値・AI の合計が MIN_BADGES_WITH_PHOTO に届かないときだけ、足りないぶんを次点の上から足す。
//   ★ 足すのは写真がある方だけ（★ 写真が無い方にサイズだけから語を足さない）。
//   ★ 次点にも同じ決まり（選んでよい語だけ・髪の色）をかける。★ 噛み合わない語（BADGE_CONFLICTS）は足さない。
//   ★ 1回の呼び出しで済む（★ 足りないときにもう一度 AI を呼ばない＝時間も費用も増やさない）。

/** ★ 写真がある方に付ける最低の個数（紹介文の条件「3つ以上」と同じ数） */
export const MIN_BADGES_WITH_PHOTO = 3;
/** ★ AI に出させる次点の個数 */
export const MAX_NEXT_PICK = 3;
/** ★ 同時に付けない組み合わせ（次点を足すときに見る） */
export const BADGE_CONFLICTS: ReadonlyArray<readonly [string, string]> = [['お姉さん系', '妹系']];

/**
 * 足りないぶんを次点から足す。★ 足した語だけを返す（並びは次点の順）。
 * @param current いま決まっている語（くじ・数値・AI の確かな語）
 * @param next    AI の次点（生のまま渡してよい。ここで決まりに照らす）
 */
export function pickTopUpBadges(
  current: readonly string[],
  next: readonly string[],
  hair: HairColor,
  hasImage: boolean,
): string[] {
  if (!hasImage) return [];
  const have = new Set(current);
  const added: string[] = [];
  for (const b of filterAIBadges(next, hair, hasImage)) {
    if (have.size >= MIN_BADGES_WITH_PHOTO) break;
    if (have.has(b)) continue;
    const clash = BADGE_CONFLICTS.some(([x, y]) => (b === x && have.has(y)) || (b === y && have.has(x)));
    if (clash) continue;
    have.add(b);
    added.push(b);
  }
  return added;
}

// ────────────────────────────── 1人ぶんを組み立てる ──────────────────────────────

export type AutoBadgeParts = {
  /** 保存する内容（カテゴリ順・最大 MAX_BADGES 個） */
  badges: string[];
  fromRank: string[];
  fromMood: string[];
  fromSkill: string[];
  /** 外見・タイプ（数値＋AI）のうち、枠に入ったぶん */
  fromLook: string[];
  /** 3個に届かず、次点から足した語 */
  fromNext: string[];
};

/**
 * ★★★ くじ・数値・AI を合わせて、1人ぶんのバッジを組み立てる（第1100便）。
 *   ① くじ: ランク・人気（30%）／雰囲気・性格（必ず1つ）／スキル（必ず1つ）。★ ここは必ず入れる。
 *   ② 残りの枠（MAX_BADGES − くじの個数 ＝ 3〜4個）に、外見・タイプを入れる。★ 数値の語が先、AI の語があと。
 *      ★★ 先に枠を決めるのが大事。★ sanitizeBadges はカテゴリ順に並べて6個で切るので、
 *        外見を5個入れると、後ろに並ぶ雰囲気・スキルが切り落とされる（「必ず入れる」が守れない）。
 *   ③ 写真がある方で3個に届かなければ、AI の次点から足す（pickTopUpBadges）。
 * @param aiBadges AI の返事の badges（生のまま渡してよい。ここで決まりに照らす）
 */
export function composeAutoBadges(input: {
  therapistId: number;
  fromNumbers: readonly string[];
  aiBadges: readonly string[];
  aiNext: readonly string[];
  hair: HairColor;
  hasImage: boolean;
}): AutoBadgeParts {
  const one = (b: string | null) => (b ? [b] : []);
  const fromRank = one(pickRankBadge(input.therapistId));
  const fromMood = one(pickMoodBadge(input.therapistId));
  const fromSkill = one(pickSkillBadge(input.therapistId));
  const fixed = [...fromRank, ...fromMood, ...fromSkill];

  const room = Math.max(0, MAX_BADGES - fixed.length);
  const fromLook = Array.from(new Set([...input.fromNumbers, ...filterAIBadges(input.aiBadges, input.hair, input.hasImage)])).slice(0, room);

  const base = [...fixed, ...fromLook];
  const fromNext = pickTopUpBadges(base, input.aiNext, input.hair, input.hasImage);
  return { badges: sanitizeBadges([...base, ...fromNext]), fromRank, fromMood, fromSkill, fromLook, fromNext };
}

/**
 * ★★★ ありふれた語（2026-09-03・AROMAMay 様101人へ流し切ったあとの実測で確定）。
 *
 * ★★★ 実測（101人・延べ329個・平均3.3個）
 *   スレンダー 60(59%) ／ かわいい 55(54%) ／ お姉さん系 48(48%)
 *   清楚 35(35%) ／ 美脚 33(33%) ／ 癒し系 30(30%)
 *   ★ ここで切った。次は キレイ 27(27%)。★ 以下は 童顔6・高身長6・妹系3 … と一気に落ちる。
 *
 * ★★★ 線引きは【3割以上】。★ 数値バッジ（低身長・高身長・巨乳）と同じ決め方＝
 *   「その語が何人に付くか」を数えて決めた。★ 感覚で決めない。
 *   ★ 半数に付く語は、6個の枠を1つ潰すだけで、その人を他の人と見分けられない。
 *
 * ★★ 禁止ではない。★ 確かに言えるなら選んでよい（プロンプトで「確かなときだけ」と釘を刺す）。
 *   ★ 禁止にすると、本当にスレンダーな人から語が消えて、こんどは逆に嘘になる。
 * ★ 次の店舗で数え直したら、この一覧ごと入れ替えてよい。★ 直す場所はここ1か所。
 */
export const OVERUSED_BADGES: readonly string[] = [
  'スレンダー', 'かわいい', 'お姉さん系', '清楚', '美脚', '癒し系',
];

/**
 * ★★★ プロンプトで「確かなときだけ」と釘を刺す語。
 *   ＝ 実測で3割以上に付いた語（OVERUSED_BADGES）
 *   ＋ 紹介文のプロンプトが戒めている決まり文句（CLICHE_WORDS）のうち、バッジにある語。
 *
 * ★★★ copyPrompt から取り込む理由（第113便で犯した失敗そのもの・2026-09-03）
 *   同じ素材を使う別のプロンプトを作るときは、素材だけでなく【戒め】も持ち込む。
 *   ★ 手で書き写すと、片方に語を足した日にもう片方が古くなる。→ import して自動で揃える。
 *   ★ 点検（check:badgeprompt）が「copyPrompt の語が漏れていないか」を毎回見る。
 * ★ 「色白」「透明感」はバッジの語彙に無いので、ここには入らない（filter で落ちる）。
 */
export const COMMON_BADGES: readonly string[] = Array.from(
  // ★ 第1100便: AI に選ばせなくなった語（癒し系）は、ここからも外す（選べない語を「確かなときだけ」と書かない）
  new Set([...OVERUSED_BADGES, ...CLICHE_WORDS].filter((w) => PHOTO_BADGES.includes(w))),
);

/** ★ ありふれた語をいくつまで許すか。★ プロンプトに書く数（コードでは切り落とさない） */
export const MAX_COMMON_PICK = 2;

/** ★★★ 「ありふれた語」と呼ぶ割合（%）。★ 数え直すときの線引きを1か所に置く */
export const COMMON_RATIO = 30;

/** 1人あたりの上限（sanitizeBadges と同じ 6 に揃うが、プロンプトにも書く） */
export const MAX_PICK = 6;
/** ★ 第1100便: AI に選ばせる外見・タイプの上限。★ くじ（雰囲気・スキル）の2個ぶんを空けておく */
export const MAX_LOOK_PICK = 4;
/** 返答がJSONでなかったときの作り直し回数 */
export const MAX_RETRY_BADGE = 1;

export type BadgeInput = {
  name: string;
  age: string | null;
  bodyType: string | null;   // 'T149 B86(E) W55 H84'
  salonName: string | null;
};

// ────────────────────────────── 数値から決める ──────────────────────────────

/**
 * body_type の文字列から身長とカップを読む。★ 読めない部分は null。
 * ★★ 形が違っても落ちないこと。★ 取り込みが入れる形は 'T149 B86(E) W55 H84' だが、
 *   手入力の店もあるので、拾えるものだけ拾って残りは null にする（推測で埋めない）。
 */
export function parseBodyType(bodyType: string | null): { heightCm: number | null; cup: string | null } {
  const s = typeof bodyType === 'string' ? bodyType : '';
  const t = s.match(/T\s*(\d{2,3})/i);
  const c = s.match(/\(\s*([A-Za-z]{1,3})\s*\)/);
  const heightCm = t ? Number(t[1]) : null;
  return {
    heightCm: heightCm !== null && Number.isFinite(heightCm) && heightCm >= 120 && heightCm <= 200 ? heightCm : null,
    cup: c ? c[1].toUpperCase() : null,
  };
}

/** ★ 'E' 以上か。★ 2文字（'AA'）は小さい側として扱う */
function cupAtLeast(cup: string, from: string): boolean {
  if (cup.length !== 1 || from.length !== 1) return false;
  return cup >= from;
}

/**
 * ★★★ 数値だけで決まるバッジ。★ AIを通さない＝毎回同じ答えになる＝点検で固定できる。
 * ★ 読めない値からは何も出さない（分からないときは付けない側に倒す）。
 */
export function badgesFromNumbers(bodyType: string | null): string[] {
  const { heightCm, cup } = parseBodyType(bodyType);
  const out: string[] = [];
  if (heightCm !== null) {
    if (heightCm < SHORT_CM) out.push('低身長');
    else if (heightCm >= TALL_CM) out.push('高身長');
  }
  if (cup !== null && cupAtLeast(cup, BUST_CUP_FROM)) out.push('巨乳');
  return out;
}

// ────────────────────────────── AIに頼む ──────────────────────────────

export const SYSTEM_PROMPT_BADGE = `あなたはメンズエステ情報サイト「フクエス」の編集者です。
セラピストの写真とサイズを見て、そのセラピストに当てはまる「特徴バッジ」を選びます。

## 選べる語（この中からだけ選ぶ。ここに無い語を作らない）
${PHOTO_BADGES.join(' / ')}

## 守ること
- 最大${MAX_LOOK_PICK}個。★ 無理に${MAX_LOOK_PICK}個埋めない。確かに言えるものだけを選ぶ。
- 1個も確かに言えなければ、空の配列を返してよい。★ 迷ったら選ばない。
- 写真から読み取れる見た目と、与えられたサイズだけを根拠にする。
- ★ 性格・経験・人気・施術の腕は【選ばない】。写真からは分からない。
  上の一覧にそれらの語は入っていないので、一覧から出ないこと自体が守りになっている。
- ★ 「低身長」「高身長」「巨乳」は選ばない。こちらが数値から決めるので一覧に入れていない。
- ★ 似た語を重ねない（「かわいい」と「アイドル系」と「妹系」を全部付けない）。
  いちばん近い1〜2個に絞る。
- ★★★ 次の語は、実測で3〜6割の人に付いた【誰にでも当てはまる語】です。
  ${COMMON_BADGES.join(' / ')}
  写真から**その人を他の人と見分けられる**ときだけ選ぶ。迷ったら選ばない。
  この中から選ぶのは多くても${MAX_COMMON_PICK}個までにする。★ この語だけで埋めない。
- ★★ 代わりに、その人にしか当てはまらない語を優先する。
  ★ 髪型・表情・雰囲気・スタイルから【他の人と違う】と言えるものを先に選ぶ。
  ★ 選べる語が1〜2個しかなくてよい。★ 数を増やすことより、見分けられることが大事。
- ★ 写真が無いときは、サイズだけで確かに言えるものに限る。無理なら空でよい。
  ★★ 材料が無いからといって、上の【誰にでも当てはまる語】で埋めない。
  ★★ 写真が無いときは、次の語は選ばない（こちらでも外します）: ${NO_PHOTO_EXCLUDED.join(' / ')}
- ★★★ 髪の色で決まる語（こちらでも髪の色と照らして、合わない語は外します）
  - 「ギャル」「キャバ嬢」は、写真の髪が【金髪】とはっきり分かるときだけ選ぶ。
    茶髪・暗い色・判断に迷う色のときは選ばない。
  - 「清楚」は、写真の髪が【黒髪】とはっきり分かるときだけ選ぶ。
  - 写真が無い・髪が写っていないときは、この3語は選ばない。

## 髪の色（hair）
写真の髪の色を、次の4つから1つだけ答える。
- 金髪 … ブリーチした金色・明るい黄色の髪
- 黒髪 … 黒い髪
- その他 … 茶髪・暗めの茶色・ピンクや青などの色
- 不明 … 写真が無い・髪が写っていない・光や加工で色が分からない
★ 迷ったら「その他」か「不明」にする。金髪・黒髪は、はっきり分かるときだけ。

## 次点（next）
badges に入れなかった語のうち、写真にいちばん近いと思う順に、最大${MAX_NEXT_PICK}個を next に入れる。
- こちらで、バッジが${MIN_BADGES_WITH_PHOTO}個に届かないときだけ、足りないぶんを next の上から使います。
- ★ badges は今までどおり【確かに言える語だけ】。数を増やすために badges へ入れない。迷う語は next に回す。
- next も「選べる語」の一覧からだけ選ぶ。髪の色の決まりも同じ。似た語・badges と噛み合わない語は入れない。
- 写真が無いときは、next は空の配列にする。

## 出力形式
必ず次のJSONだけを出力する。前後に説明文やコードフェンスを付けない。
{"hair":"金髪・黒髪・その他・不明のどれか1つ","badges":["語","語"],"next":["語","語"]}`;

/** 素材から user メッセージ本文を組み立てる。写真は呼び出し側が image ブロックとして足す。 */
export function buildBadgeUserPrompt(
  input: BadgeInput,
  opts?: { hasImage?: boolean; retryReason?: string },
): string {
  const lines: string[] = [];
  lines.push('次のセラピストに当てはまる特徴バッジを選んでください。');
  lines.push('');
  lines.push('## 素材');
  lines.push(`- 源氏名: ${input.name}`);
  if (input.salonName) lines.push(`- 店舗: ${input.salonName}`);
  if (input.age) lines.push(`- 年齢: ${input.age}歳`);
  if (input.bodyType) lines.push(`- サイズ: ${input.bodyType}`);
  lines.push(
    opts?.hasImage
      ? '- プロフィール写真: 添付（これが主な根拠。写り込んだ文字・ロゴ・他店名には触れない）'
      : `- プロフィール写真: なし（★ サイズだけで確かに言えるものに限る。無理なら空の配列。${NO_PHOTO_EXCLUDED.join('・')} は選ばない）`,
  );
  if (opts?.retryReason) {
    lines.push('');
    lines.push(`## やり直しの理由\n${opts.retryReason}`);
  }
  return lines.join('\n');
}

/**
 * モデルの返答から語の配列を取り出す。★ 取り出すだけ。
 * ★★ 知らない語を落とすのは呼び出し側の sanitizeBadges の仕事（1か所でやる）。
 *   ★ ここでも落とすと、2か所で語彙を持つことになる。
 */
export function parseBadgeResponse(raw: string): string[] | null {
  const o = readBadgeJson(raw);
  if (!o) return null;
  return (o.badges as unknown[])
    .filter((b): b is string => typeof b === 'string')
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

/**
 * モデルの返答から髪の色を取り出す（第1096便）。
 * ★★ 読めない・書いていない・4つ以外の言葉 ＝ '不明'。★ 不明なら髪の色で決まる語は付かない（付けない側に倒す）。
 */
export function parseBadgeHair(raw: string): HairColor {
  const o = readBadgeJson(raw);
  const h = o && typeof o.hair === 'string' ? o.hair.trim() : '';
  return (HAIR_COLORS as readonly string[]).includes(h) ? (h as HairColor) : '不明';
}

/**
 * モデルの返答から次点（next）を取り出す（第1099便）。★ 取り出すだけ（決まりに照らすのは pickTopUpBadges）。
 * ★ 書いていない・配列でない・読めない ＝ 空の配列（＝何も足さない）。
 */
export function parseBadgeNext(raw: string): string[] {
  const o = readBadgeJson(raw);
  if (!o || !Array.isArray(o.next)) return [];
  return (o.next as unknown[])
    .filter((b): b is string => typeof b === 'string')
    .map((b) => b.trim())
    .filter((b) => b.length > 0);
}

/** 返答の中から、badges が配列になっている JSON を探す。★ 見つからなければ null */
function readBadgeJson(raw: string): Record<string, unknown> | null {
  const text = String(raw ?? '').trim();
  const candidates: string[] = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.unshift(fenced[1].trim());
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) candidates.push(braced[0]);

  for (const c of candidates) {
    try {
      const o = JSON.parse(c) as Record<string, unknown>;
      if (!Array.isArray(o.badges)) continue;
      return o;
    } catch {
      // 次の候補へ
    }
  }
  return null;
}

// ────────────────────────────── 分布を数える ──────────────────────────────
//
// ★★★ なぜ数える口を作るか（第114便・2026-09-03）
//   第113便は【流し切ってから】偏り（スレンダー59%）に気づいた。★ 3人の試し打ちでは見えなかった。
//   ★ 数えるのは毎回 SQL でやっていた。★ 手間がかかると、忙しい日に数えなくなる。
//   → 数えるところをコードに置き、運営の口から呼べるようにする（tally=true）。
//   ★★ ここは純粋関数。★ DBも通信も知らない＝点検で固定できる。

export type BadgeTallyRow = { 語: string; 人数: number; 割合: number };
export type BadgeTally = {
  /** ★ バッジが1個以上入っている人数。★ 割合の母数はこれ（空の子で薄めない） */
  母数: number;
  /** 延べ個数 */
  延べ: number;
  /** 1人あたり何個か（小数1桁） */
  平均: number;
  語ごと: BadgeTallyRow[];
  /** ★★★ 割合が COMMON_RATIO 以上だった語。★ 一覧（COMMON_BADGES）ではなく【今回のデータ】から出す */
  ありふれた語: string[];
};

/** ★ 語彙の並び順。★ 同数のときの順番を毎回同じにする（点検で固定できる形にする） */
const VOCAB_ORDER: Record<string, number> = (() => {
  const m: Record<string, number> = {};
  let i = 0;
  for (const cat of Object.keys(BADGES_BY_CATEGORY) as Array<keyof typeof BADGES_BY_CATEGORY>) {
    for (const label of BADGES_BY_CATEGORY[cat]) if (!(label in m)) m[label] = i++;
  }
  return m;
})();

/**
 * 何人に何の語が付いているかを数える。
 * @param perPerson 1人ぶんの feature_badges をそのまま並べたもの（null・[]・壊れた値が混ざってよい）
 *
 * ★★ 同じ人に同じ語が2回入っていても1回として数える（重複は人数を膨らませる）。
 * ★★ 知らない語も数える。★ ここは「入っているものを見せる」場所（落とすのは sanitizeBadges）。
 */
export function tallyBadges(perPerson: readonly unknown[]): BadgeTally {
  const count = new Map<string, number>();
  let 母数 = 0;
  let 延べ = 0;

  for (const one of perPerson) {
    if (!Array.isArray(one)) continue; // ★ null・[] ・壊れた値は「バッジが無い人」
    const seen = new Set<string>();
    for (const v of one) {
      if (typeof v !== 'string') continue;
      const w = v.trim();
      if (!w || seen.has(w)) continue;
      seen.add(w);
    }
    if (seen.size === 0) continue;
    母数++;
    延べ += seen.size;
    for (const w of seen) count.set(w, (count.get(w) ?? 0) + 1);
  }

  const 語ごと: BadgeTallyRow[] = [...count.entries()]
    .map(([語, 人数]) => ({ 語, 人数, 割合: 母数 === 0 ? 0 : Math.round((人数 / 母数) * 100) }))
    .sort((a, b) =>
      b.人数 - a.人数 ||
      (VOCAB_ORDER[a.語] ?? Number.MAX_SAFE_INTEGER) - (VOCAB_ORDER[b.語] ?? Number.MAX_SAFE_INTEGER) ||
      (a.語 < b.語 ? -1 : a.語 > b.語 ? 1 : 0),
    );

  return {
    母数,
    延べ,
    平均: 母数 === 0 ? 0 : Math.round((延べ / 母数) * 10) / 10,
    語ごと,
    ありふれた語: 語ごと.filter((r) => r.割合 >= COMMON_RATIO).map((r) => r.語),
  };
}
