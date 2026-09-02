// 保存した店の「新着」を、読める量に絞る（第103便・純粋関数）。
//
// ★★★ なぜ要るか —— 2026-09-02 深夜のカッキーさんの指摘
//   > 「保存店舗量が多いとかなりの投稿が溜まってとんでもない事になりそう」
//   ★ そのとおりだった。いまの作りには【3つとも無い】:
//     ・期間の区切り   … 保存日時より後なら【何年前でも】新着
//     ・店ごとの上限   … 1店が10本出せば10本並ぶ
//     ・全体の上限     … 保存100店なら無制限に伸びる
//   ★★ さらに、お知らせの自動配信（第102便）で published_at が毎日進むので、
//     同じお知らせが【何度も新着に戻ってくる】。★ 溜まり方が加速する。
//
// ★★★ 「新着」の意味を決めた（2026-09-02・カッキーさん）
//   > 「見てないだけで1ヶ月放置されているものは新着とは呼ばない」
//   → **直近14日**。★ 私は30日を提案したが、こちらが正しい。
//   ★ 14日より古いものは消えるのではなく、店のページで見ていただく。
//
// ★★★ 隠した件数を【数で出さない】（★ カッキーさんの指摘で直した）
//   私は「ほか2件と添える（第35便の反省6）」と書いた。★ 返ってきた指摘:
//   > 「ほか300件などもありえるようになりませんか？」
//   ```
//   運営が見る数（skipped・healthy・quiet）  … 正確な件数が要る。原因を追う材料だから
//   会員が見る画面                          … 「ほかにもある」と分かればよい
//                                             ★ 件数では何も判断しない
//   ```
//   ★★★ 「黙って消さない」の目的は【消えたことに気づけること】。
//     ★ 正確な数を出すことではない。★ 作法は、当てる場所を選んで使う。
//   → 店ごとには **hasMore（真偽）だけ**を返す。★ 数は返さない。
//   → 全体の上限に当たったときだけ、**店の数**を返す（★ こちらは会員が「まだある」と分かる材料）。
//
// ★★ このファイルは通信もDBも触らない。時刻すら引数で受ける（now）。
//   ★ Date.now() をこの中で呼ばない。点検で「15日前」を作れなくなる。

/** 新着として扱う期間（日）。★ 2026-09-02・カッキーさんの決定。 */
export const FEED_WINDOW_DAYS = 14;
/** 一覧に出す店の数の上限。★ これを超えたぶんは店の数だけ知らせる。 */
export const FEED_MAX_SALONS = 50;

export type FeedKind = 'announcement' | 'coupon';

/** DBから拾ってきた1件。★ ここに来る前に絞り込みをしない（絞るのはこの関数の仕事）。 */
export type FeedCandidate = {
  key: string;
  type: FeedKind;
  salonId: number;
  salonName: string;
  title: string;
  /** 出た時刻（announcement=published_at / coupon=created_at）のISO */
  at: string;
  /** 押したときの行き先 */
  href: string;
  /** その店を保存した時刻のISO。★ これより後のものだけが新着 */
  savedAt: string | null;
};

export type FeedRow = {
  key: string;
  type: FeedKind;
  salonId: number;
  salonName: string;
  title: string;
  at: string;
  href: string;
  isUnread: boolean;
  /** ★ この店には、出していない新着がまだある。★ 件数は持たない（意図） */
  hasMore: boolean;
};

export type FeedResult = {
  rows: FeedRow[];
  /** ★★ 出した行のうち未読の数。★ 隠れた未読は数えない（ベルと一覧をずらさないため） */
  unreadCount: number;
  /** 出した店の数 */
  salonCount: number;
  /** ★ 上限で出せなかった店の数。0なら上限に当たっていない */
  cappedSalons: number;
};

const EMPTY: FeedResult = { rows: [], unreadCount: 0, salonCount: 0, cappedSalons: 0 };

/** ISO文字列 → ミリ秒。読めなければ null（★ 推測で埋めない）。 */
function msOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * 候補を、会員が読める形に絞る。
 *
 * ★★★ 絞る順番に意味がある:
 *   1. 期間と保存日時で【母数】を切る   … ここで大半が落ちる
 *   2. 店ごとに最新1件                  … 1店が一覧を占領しない
 *   3. 全体の上限                        … 保存数が多い会員でも伸びない
 *   ★ 逆順にすると、1店の連投で上限が埋まり、ほかの店が1件も出なくなる。
 *
 * ★★ 未読の数は【1〜3を通ったあと】で数える。
 *   ★ 先に数えると「ベルは30・一覧は5件」になる（★ 画面と数を別々に数えない）。
 */
export function buildNotificationFeed(input: {
  candidates: FeedCandidate[];
  now: Date;
  /** notification_reads.last_checked_at。null なら全部未読 */
  lastCheckedAt: string | null;
  /** 点検で短くするためだけに開けてある */
  windowDays?: number;
  maxSalons?: number;
}): FeedResult {
  const now = input.now.getTime();
  if (!Number.isFinite(now)) return EMPTY;                 // ★ 読めない時刻で推測しない

  const days = Number(input.windowDays);
  const windowDays = Number.isFinite(days) && days > 0 ? days : FEED_WINDOW_DAYS;
  const maxRaw = Number(input.maxSalons);
  const maxSalons = Number.isFinite(maxRaw) && maxRaw > 0 ? Math.trunc(maxRaw) : FEED_MAX_SALONS;

  const windowStart = now - windowDays * 24 * 3_600_000;
  const lastMs = msOf(input.lastCheckedAt) ?? 0;           // ★ 行が無ければ全件未読

  // ── 1. 母数を切る ──────────────────────────────────────────
  type Sized = { c: FeedCandidate; atMs: number };
  const kept: Sized[] = [];
  for (const c of input.candidates ?? []) {
    const atMs = msOf(c.at);
    if (atMs === null) continue;                           // ★ 読めない行は捨てる
    const savedMs = msOf(c.savedAt);
    if (savedMs === null) continue;                        // ★ 保存日時が無ければ新着と言えない
    if (atMs <= savedMs) continue;                         // 保存より前のものは新着ではない
    if (atMs < windowStart) continue;                      // ★ 14日より古いものは新着と呼ばない
    kept.push({ c, atMs });
  }
  if (kept.length === 0) return EMPTY;

  // ── 2. 店ごとに最新1件（★ 種別をまたいで1件。クーポンが最新ならクーポン）──
  //   ★ 同着は key の並びで決める（★ 実行のたびに入れ替わらないように）
  const bestBySalon = new Map<number, Sized>();
  const countBySalon = new Map<number, number>();
  for (const s of kept) {
    const sid = s.c.salonId;
    countBySalon.set(sid, (countBySalon.get(sid) ?? 0) + 1);
    const cur = bestBySalon.get(sid);
    if (
      cur === undefined ||
      s.atMs > cur.atMs ||
      (s.atMs === cur.atMs && s.c.key < cur.c.key)
    ) {
      bestBySalon.set(sid, s);
    }
  }

  // ── 3. 新しい順に並べ、店の数で切る ───────────────────────────
  const picked = [...bestBySalon.values()].sort((a, b) =>
    b.atMs - a.atMs || (a.c.key < b.c.key ? -1 : a.c.key > b.c.key ? 1 : 0),
  );
  const shown = picked.slice(0, maxSalons);
  const cappedSalons = picked.length - shown.length;

  const rows: FeedRow[] = shown.map((s) => ({
    key: s.c.key,
    type: s.c.type,
    salonId: s.c.salonId,
    salonName: s.c.salonName,
    title: s.c.title,
    at: s.c.at,
    href: s.c.href,
    isUnread: s.atMs > lastMs,
    hasMore: (countBySalon.get(s.c.salonId) ?? 1) > 1,
  }));

  return {
    rows,
    // ★★ 出した行だけで数える。★ 隠れた未読は数えない
    unreadCount: rows.filter((r) => r.isUnread).length,
    salonCount: rows.length,
    cappedSalons,
  };
}
