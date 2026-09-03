// AIで特徴バッジを選ぶ（第113便・2026-09-03）。★ 純粋関数のみ。
//
// ★★★ なぜ「数値で決まるもの」と「AIに頼むもの」を分けるか
//   低身長・高身長・巨乳は **数値で決まる**（T149 / B86(E)）。
//   ★ AIに判断させると毎回同じ答えにならず、**点検で固定できない**。
//   → 数値で決まるものはここで決め、AIには【写真を見ないと分からないもの】だけを頼む。
//   ★ 引き継ぎメモ「機械で決まるものは機械で」。★ 出力が短くなるので費用も減る。
//
// ★★★ 選ばせないカテゴリがある（このファイルでいちばん大事なところ）
//   ランク・人気（NO.1・プレミア・殿堂入り・人気急上昇・指名多数・リピーター多数）
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

import { BADGES_BY_CATEGORY } from './therapistBadges';

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
 */
export const SHORT_CM = 150;   // これ未満なら 低身長   … 6人（5.9%）
export const TALL_CM = 165;    // これ以上なら 高身長   … 6人（5.9%）
/** ★ このカップ以上なら 巨乳。★ 'G' なら G・H… が当たる … 12人（11.9%） */
export const BUST_CUP_FROM = 'G';

/** ★ AIに選ばせる語。★ 写真（と数値の補助）から根拠を持って言えるものだけ */
export const PHOTO_BADGES: readonly string[] = [
  // 外見・タイプ（★ 低身長・高身長・巨乳は数値側／熟女は付けない）
  ...BADGES_BY_CATEGORY.look.filter(
    (b) => !NUMERIC_BADGES.includes(b) && b !== '熟女',
  ),
  // 雰囲気・性格（★ 写真の表情・雰囲気から言えるものだけ）
  '癒し系', '笑顔が素敵', '明るい', 'おしとやか',
];

/** 1人あたりの上限（sanitizeBadges と同じ 6 に揃うが、プロンプトにも書く） */
export const MAX_PICK = 6;
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
- 最大${MAX_PICK}個。★ 無理に${MAX_PICK}個埋めない。確かに言えるものだけを選ぶ。
- 1個も確かに言えなければ、空の配列を返してよい。★ 迷ったら選ばない。
- 写真から読み取れる見た目と、与えられたサイズだけを根拠にする。
- ★ 性格・経験・人気・施術の腕は【選ばない】。写真からは分からない。
  上の一覧にそれらの語は入っていないので、一覧から出ないこと自体が守りになっている。
- ★ 「低身長」「高身長」「巨乳」は選ばない。こちらが数値から決めるので一覧に入れていない。
- ★ 似た語を重ねない（「かわいい」と「アイドル系」と「妹系」を全部付けない）。
  いちばん近い1〜2個に絞る。
- ★ 写真が無いときは、サイズだけで言えるもの（スレンダー等）に限る。無理なら空でよい。

## 出力形式
必ず次のJSONだけを出力する。前後に説明文やコードフェンスを付けない。
{"badges":["語","語"]}`;

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
      : '- プロフィール写真: なし（★ サイズだけで確かに言えるものに限る。無理なら空の配列）',
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
      return (o.badges as unknown[])
        .filter((b): b is string => typeof b === 'string')
        .map((b) => b.trim())
        .filter((b) => b.length > 0);
    } catch {
      // 次の候補へ
    }
  }
  return null;
}
