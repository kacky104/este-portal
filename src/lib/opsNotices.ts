// 運営からのお知らせ（第862便・2026-09-26）の決めごと。純粋関数だけ（画面・管理画面の両方から使う）。

export type OpsNotice = {
  id: number;
  notice_date: string;          // 'YYYY-MM-DD'
  title: string;
  body: string;
  published_at: string | null;
};

/** 帯に出すのは、公開してから何日まで */
export const OPS_NOTICE_BAND_DAYS = 14;

/** 公開して14日以内のお知らせ（新しく公開した順）。★ 帯と、サイドバーのバッジ（第1176便）で同じ窓を使う */
export function freshNotices(list: OpsNotice[], now: Date = new Date()): OpsNotice[] {
  const limit = now.getTime() - OPS_NOTICE_BAND_DAYS * 24 * 60 * 60 * 1000;
  const fresh = list.filter((n) => n.published_at && new Date(n.published_at).getTime() >= limit);
  fresh.sort((a, b) => new Date(b.published_at!).getTime() - new Date(a.published_at!).getTime());
  return fresh;
}

/** 帯に出す1件（公開して14日以内のうち、いちばん新しく公開したもの）。無ければ null＝帯を出さない */
export function pickBandNotice(list: OpsNotice[], now: Date = new Date()): OpsNotice | null {
  return freshNotices(list, now)[0] ?? null;
}

/**
 * サイドバーの「運営事務局」に付けるバッジの数（第1176便・カッキーさん）。
 * ＝ 公開して14日以内のお知らせのうち、まだ「運営事務局」を開いて見ていないものの数。0 ならバッジを出さない。
 */
export function unseenFreshCount(list: OpsNotice[], seenIds: number[], now: Date = new Date()): number {
  const seen = new Set(seenIds);
  return freshNotices(list, now).filter((n) => !seen.has(n.id)).length;
}

/** '2026-10-05' → '10/5' */
export function shortDate(ymd: string): string {
  const m = Number(ymd.slice(5, 7));
  const d = Number(ymd.slice(8, 10));
  return m && d ? `${m}/${d}` : ymd;
}

/** 本文を「文字」と「URL」に分ける（URL は押せるリンクにする） */
export function splitLinks(text: string): Array<{ t: string; url?: boolean }> {
  const out: Array<{ t: string; url?: boolean }> = [];
  const re = /https?:\/\/[^\s<>"'）)」]+/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ t: text.slice(last, m.index) });
    out.push({ t: m[0], url: true });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push({ t: text.slice(last) });
  return out;
}

/**
 * 「運営事務局」を開いて目に入ったお知らせ（このブラウザだけ・第1176便）。★ バッジを消すための印。
 * ★ 下の「読んだ」（個別ページを開いた＝NEW の札が消える）とは別に持つ: 運営事務局を開けばバッジは消えるが、NEW は読むまで残る。
 */
export const OPS_NOTICE_SEEN_KEY = 'fukues.opsNotices.seen';
export function loadSeenIds(): number[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(OPS_NOTICE_SEEN_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [];
  } catch {
    return [];
  }
}
/** 印を足して保存し、足したあとの一覧を返す。★ 保存できなくても一覧は返す（その画面の間はバッジが消える） */
export function addSeenIds(ids: number[]): number[] {
  const all = [...new Set([...loadSeenIds(), ...ids])].slice(-200);
  try {
    window.localStorage.setItem(OPS_NOTICE_SEEN_KEY, JSON.stringify(all));
  } catch {
    /* 保存できなくても画面は動かす */
  }
  return all;
}

/** 読んだお知らせ（このブラウザだけ）。★ 読めない環境では「全部未読」扱いで止まらない */
export const OPS_NOTICE_READ_KEY = 'fukues.opsNotices.read';
export function loadReadIds(): number[] {
  try {
    const v = JSON.parse(window.localStorage.getItem(OPS_NOTICE_READ_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x) => typeof x === 'number') : [];
  } catch {
    return [];
  }
}
export function saveReadId(id: number): void {
  try {
    const ids = new Set(loadReadIds());
    ids.add(id);
    window.localStorage.setItem(OPS_NOTICE_READ_KEY, JSON.stringify([...ids].slice(-200)));
  } catch {
    /* 保存できなくても画面は動かす */
  }
}
