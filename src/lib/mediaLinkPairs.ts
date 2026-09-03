// 名簿の結び（therapist_media_ids）を画面から作るための突き合わせ（第115便・2026-09-03）。
//
// ★★★ なぜ要るか
//   第109便の実弾で「20人は送りません（エステ魂にまだ登録されていない）」と出た。
//   ★ 実際は登録されていて、フクエス「レミ」／エステ魂「れみ」のように【表記が違う】だけだった。
//   ★ 送るときの突き合わせ（mediaMatch）は **読みが同じでも別の文字なら別人**として扱う。
//     それは意図した決めで、緩めない（他人の欄に出勤を入れる事故のほうが取り返しがつかない）。
//   → だから【人が見て結ぶ】場所が要る。これまでは運営が SQL を流していた（確認SQL_エステ魂の名簿結び）。
//
// ★★★ このファイルは通信もDBも触らない。名簿と結びを受け取って、候補を並べるだけ。
//   ★ 「結んでよいか」の判定（canLink）も、ここ1か所に置く。
//     ★ 画面とサーバの両方が同じ関数を呼ぶ。★ 2か所に書くと、必ず片方が緩くなる。
//
// ★★★ 決めごと（第115便・カッキーさん）
//   ① まとめて結ぶボタンは作らない。★ 1人ずつ、人が見て押したときだけ結ぶ。
//      ★ 名前が完全に一致する人は、そもそも送るときに名前で解決できる（mediaMatch）。
//        手で結ぶのは【表記が違う人だけ】＝ふつうは数人。
//   ② 候補は出すが、**カナ違いは弱い根拠**として区別して見せる（読みが同じだけの別人がいる）。
//   ③ 店舗様も使える画面に置く。★ 名前をいちばん知っているのはオーナー様。

import { normalizeName, type MediaRosterEntry } from './mediaMatch';

/** 候補の強さ。★ exact は文字まで同じ。kana は読みが同じだけ（★ 別人でありうる） */
export type LinkStrength = 'exact' | 'kana';

export type LinkCandidate = { castId: string; mediaName: string; strength: LinkStrength };

/** まだ媒体側の番号と結ばれていない人 */
export type UnlinkedPerson = {
  therapistId: number;
  name: string;
  isActive: boolean;
  /** ★ 空でもよい（候補が無い＝一覧から人が選ぶ） */
  candidates: LinkCandidate[];
};

/** すでに結ばれている人 */
export type LinkedPerson = {
  therapistId: number;
  name: string;
  isActive: boolean;
  castId: string;
  /** 媒体側の表示名。★ null は「名簿に見つからない」（＝古い番号のおそれ） */
  mediaName: string | null;
  /**
   * ★★★ 名簿で確かめられたか。
   *   ★ 名簿が読めていないとき（known=false）は必ず false になるが、それは
   *     「いない」ではなく【分からない】の意味。★ 画面でそう書き分けること。
   */
  onMedia: boolean;
};

export type LinkPairs = {
  /** ★★★ 媒体側の名簿の写しがあるか。false のとき候補も空欄も【分からない】の意味 */
  known: boolean;
  unlinked: UnlinkedPerson[];
  linked: LinkedPerson[];
  /** まだ誰にも結ばれていない媒体側の登録。★ 一覧から人が選ぶときの選択肢 */
  free: MediaRosterEntry[];
  /** すでに誰かに結ばれている番号。★ 二重に結ばせない */
  takenCastIds: string[];
};

export type LinkPairsInput = {
  /** フクエスの在籍。★ 呼び出し側が読んだものをそのまま渡す（ここで読み直さない） */
  therapists: ReadonlyArray<{ id: number; name: string; isActive: boolean }>;
  /** いまの結び（therapist_media_ids ＋ 旧列。★ loadCastIds を通したもの） */
  links: ReadonlyArray<{ therapistId: number; castId: string }>;
  /** ★ 媒体側の名簿の写し。★ null は【読めていない】。空配列（0人）とは別物 */
  entries: readonly MediaRosterEntry[] | null;
};

/**
 * カタカナをひらがなに寄せた比較用の文字列。★ 候補を出すためだけに使う。
 *
 * ★★★ これで「同じ人だ」と決めない。★ 決めるのは人。
 *   ★ 「レミ」と「れみ」は同じ人のことが多いが、「アイ」と「あい」が別人の店もありうる。
 *   ★ mediaMatch が読みで揃えないと決めた理由（他人の欄に書く事故）はそのまま。
 */
export function kanaKey(name: string): string {
  const s = normalizeName(name).replace(/\s+/g, '');
  // ★ 全角カタカナ → ひらがな。★ 半角カナは normalizeName の NFKC が先に全角へ直している
  return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** 名簿の重複を落とす（同じ番号が2行ある写しを、そのまま数えない） */
function uniqueEntries(entries: readonly MediaRosterEntry[]): MediaRosterEntry[] {
  const seen = new Set<string>();
  const out: MediaRosterEntry[] = [];
  for (const e of entries) {
    const castId = String(e?.castId ?? '').trim();
    if (!castId || seen.has(castId)) continue;
    seen.add(castId);
    out.push({ castId, name: String(e?.name ?? '') });
  }
  return out;
}

/**
 * 「まだ結ばれていない人」と「まだ誰にも結ばれていない番号」を並べ、候補を付ける。
 *
 * ★★ 候補に出すのは【空いている番号】だけ。★ 他の人に結ばれている番号は候補にしない
 *   （押せてしまうと、二重に結んだつもりが取り違えになる）。
 */
export function buildLinkPairs(input: LinkPairsInput): LinkPairs {
  const known = input.entries !== null;
  const entries = known ? uniqueEntries(input.entries as readonly MediaRosterEntry[]) : [];

  const castIdOf = new Map<number, string>();
  const takenBy = new Map<string, number>();
  for (const l of input.links) {
    const castId = String(l.castId ?? '').trim();
    if (!castId) continue;
    castIdOf.set(l.therapistId, castId);
    if (!takenBy.has(castId)) takenBy.set(castId, l.therapistId);
  }

  const nameOfCast = new Map<string, string>();
  for (const e of entries) nameOfCast.set(e.castId, e.name);

  const free = entries.filter((e) => !takenBy.has(e.castId));

  const linked: LinkedPerson[] = [];
  const unlinked: UnlinkedPerson[] = [];

  for (const t of input.therapists) {
    const castId = castIdOf.get(t.id) ?? null;
    if (castId) {
      const mediaName = nameOfCast.has(castId) ? (nameOfCast.get(castId) as string) : null;
      linked.push({
        therapistId: t.id,
        name: t.name,
        isActive: t.isActive,
        castId,
        mediaName,
        // ★ 名簿が読めていないときは false。★ 「いない」ではない（known を見て書き分ける）
        onMedia: known && mediaName !== null,
      });
      continue;
    }
    const exactKey = normalizeName(t.name);
    const kKey = kanaKey(t.name);
    const candidates: LinkCandidate[] = [];
    // ★ 名前が空の人には候補を出さない（全員が候補になってしまう）
    if (exactKey.length > 0) {
      for (const e of free) {
        if (normalizeName(e.name) === exactKey) {
          candidates.push({ castId: e.castId, mediaName: e.name, strength: 'exact' });
        } else if (kKey.length > 0 && kanaKey(e.name) === kKey) {
          candidates.push({ castId: e.castId, mediaName: e.name, strength: 'kana' });
        }
      }
    }
    // ★ 強い候補を先に。★ 同じ強さなら名簿の並び順のまま（毎回同じ並びにする）
    candidates.sort((a, b) => (a.strength === b.strength ? 0 : a.strength === 'exact' ? -1 : 1));
    unlinked.push({ therapistId: t.id, name: t.name, isActive: t.isActive, candidates });
  }

  return { known, unlinked, linked, free, takenCastIds: [...takenBy.keys()] };
}

export type LinkVerdict = { ok: true } | { ok: false; error: string };

/**
 * ★★★ この人とこの番号を結んでよいか。★ 画面もサーバもこの関数で判定する。
 *
 * ★★ 断る側に倒す:
 *   ・名簿を読めていない            … 番号が正しいか確かめる手立てが無い
 *   ・名簿に無い番号                … 手打ちの打ち間違いを弾く（★ 番号は選ぶもので、打つものではない）
 *   ・すでに他の人に結ばれている番号 … 2人が同じ欄へ書く事故になる
 *   ・すでに結ばれている人          … 付け替えは【外してから】。黙って上書きしない
 */
export function canLink(pairs: LinkPairs, therapistId: number, castId: string): LinkVerdict {
  if (!pairs.known) {
    return { ok: false, error: '媒体側の名簿をまだ読めていないので、結べません。先に名簿を読み直してください' };
  }
  const id = String(castId ?? '').trim();
  if (!id) return { ok: false, error: '媒体側の登録が選ばれていません' };

  const already = pairs.linked.find((p) => p.therapistId === therapistId);
  if (already) {
    return { ok: false, error: 'この方はすでに結ばれています。付け替えるときは、いったん外してください' };
  }
  const person = pairs.unlinked.find((p) => p.therapistId === therapistId);
  if (!person) return { ok: false, error: 'この店舗のセラピストではありません' };

  const taken = pairs.takenCastIds.includes(id);
  if (taken) return { ok: false, error: 'その登録は、すでに別の方に結ばれています' };

  const inRoster = pairs.free.some((e) => e.castId === id);
  if (!inRoster) return { ok: false, error: '媒体側の名簿にない登録です。名簿を読み直してから選んでください' };

  return { ok: true };
}

/** 外してよいか。★ 結ばれていない人を外したと言わない（0件と成功を混ぜない） */
export function canUnlink(pairs: LinkPairs, therapistId: number): LinkVerdict {
  const already = pairs.linked.find((p) => p.therapistId === therapistId);
  if (!already) return { ok: false, error: 'この方は結ばれていません' };
  return { ok: true };
}

/** 候補の強さを、店舗が読んで分かる言葉にする。 */
export function strengthLabel(s: LinkStrength): string {
  return s === 'exact' ? '名前が同じ' : '読みが同じ';
}

/**
 * 画面の見出しに出す1行。★ 0件のときに「揃っています」と言わない場合を分ける。
 * ★ known=false のときは件数を言わない（分からないものを数えない）。
 */
export function pairsSummary(pairs: LinkPairs): string {
  if (!pairs.known) return '媒体側の名簿をまだ読めていないので、結びつきを確かめられません';
  const n = pairs.unlinked.length;
  if (n === 0) return '全員が結びついています（' + pairs.linked.length + '名）';
  const withCandidate = pairs.unlinked.filter((p) => p.candidates.length > 0).length;
  return withCandidate > 0
    ? 'まだ結びついていない方が' + n + '名（うち' + withCandidate + '名は候補があります）'
    : 'まだ結びついていない方が' + n + '名';
}
