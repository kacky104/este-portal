// 「フクエスの名簿」と「媒体（駅ちか）の名簿」が揃っているかの突き合わせ（第49便・純粋関数）。
//
// ★★★ なぜ要るか — 設計メモ §1-4 と §8
//   ベンリーの実測で、同じ店の登録人数がサイトごとに揃っていなかった:
//       エステラブ 43 / エステラブ-B 46 / エステ魂 37 / 駅ちかA 37 / 駅ちかB 64 / 全国 0
//   ★ 全国は 0人のまま少なくとも8/17から放置され、誰も気づいていなかった（§1-5）。
//   §2-1 の「真似する3つ」の2番目が **「サイトごとの登録人数を並べて出す」**。
//   ズレを直す機能より先に、**ズレが見えること**を作る。
//
// ★★★ この画面が答える問いは3つだけ
//   ① フクエスに居て、この枠に紐づいていないのは誰か（＝媒体に居ない or 名前が違う）
//   ② 紐づいているのに、フクエスに出ていないのは誰か
//      ★ therapists.is_active=false には【2つの意味】がある（第34便）:
//         ・create_missing が作ったばかり（非公開で始まる）… 誰も公開にしないまま放置されやすい
//         ・退店にした                                    … ★ 駅ちか側には残っている＝§8 そのもの
//      どちらも「駅ちかには居るのにフクエスには出ていない」なので、同じ行に出してよい。
//      ★ ただし画面の文言で「非公開」だけを言うと、退店者が混じっているときに読み違える。
//   ③ 媒体に居て、フクエスに居ないのは誰か（＝退店者が媒体に残っている・§8）
//
// ★★★ この便で作るのは【読み取りだけ】。1行も書かない。
//   §4「新人登録を先にやらない。登録は人を増やす＝失敗すると重複掲載を自分で作る（禁則269）」。
//   まず見えるようにして、直すのは駅ちかの登録フォームを実機で調べたあと。
//
// ★★★ このファイルは通信もDBも触らない。時刻すら引数で受ける（now）。
//   workPlan.ts / mediaLinkStall.ts と同じ作法。★ Date.now() をこの中で呼ばないこと。
//   呼ぶと、点検で「取り込みが2日前で止まっている状態」を作れなくなる。

import { isWriteDirection } from './mediaLinkMode';

/** 直近の取り込みがこれより古ければ「古い」と言う。★ 1日1回の周（03:05）を1回飛ばしても許す幅。 */
export const ROSTER_STALE_HOURS = 36;

// ── 入力 ───────────────────────────────────────────────────────────────

/** フクエス側の1人。★ 呼び出し側が既に読んでいる列だけを渡す（ここで読み直さない）。 */
export type RosterTherapist = {
  id: number;
  name: string;
  /**
   * フクエスに出ているか（therapists.is_active）。
   * ★ false は「作ったばかりで非公開」と「退店」の両方を指す（第34便）。ここでは区別しない。
   */
  isActive: boolean;
};

/**
 * 直近の取り込み実行（salon_import_runs の最新1行）。
 * ★ 無ければ null。★ 「無い」と「0件だった」を混同しないために、null を潰さないこと。
 */
export type RosterRun = {
  startedAt: string;
  /** 'ok' | 'error' | 'running' */
  status: string;
  /** 照合できなかった名前（＝媒体に居てフクエスに居ない） */
  unmatched: string[];
};

/**
 * ★★★ 媒体側の名簿の写し（第50便・media_roster_snapshots）。
 *   管理画面の女の子一覧を直接読んだもの。★ 取り込みの未照合より強い根拠:
 *     ・公開ページに出ていない子も入っている
 *     ・「読んだ時刻」がはっきりしている
 *     ・★ 書き込みの向きの枠でも取れる（取り込みの周とは別に、明示的に1回読むから）
 */
export type RosterSnapshot = {
  readAtISO: string;
  /** 媒体側にいる castId と表示名 */
  entries: Array<{ castId: string; name: string }>;
};

export type RosterInput = {
  provider: string;
  slot: number;
  /** 連携の向き。'none' | 'read' | 'write' | 'write_auto' | null */
  linkMode: string | null;
  therapists: RosterTherapist[];
  /** この媒体・この枠で castId が付いている therapist_id（therapist_media_ids ＋ 旧列） */
  linkedIds: readonly number[];
  lastRun: RosterRun | null;
  /** ★ 媒体側の名簿の写し。あれば lastRun より優先する（第50便） */
  snapshot?: RosterSnapshot | null;
  /** ★ フクエス側が知っている castId（この媒体・枠）。写しとの差を出すのに要る */
  knownCastIds?: readonly string[];
  now: Date;
  /** 既定 ROSTER_STALE_HOURS。点検で短くするためだけに開けてある */
  staleHours?: number;
};

// ── 出力 ───────────────────────────────────────────────────────────────

/**
 * ★★★ 根拠の状態。このファイルでいちばん大事な型。
 *
 * ★ 「媒体に居てフクエスに居ない人が0人」と「取り込んだ記録が無いので分からない」は
 *   画面上でまったく同じ見た目になる。第43便-b の教訓 §26
 *   「変更なし は成功の証拠にならない」・第35便の反省6「0のときも理由が読み取れる形にする」。
 *   → 0件を成功に見せないために、根拠そのものを返り値に持たせる。
 *
 *   none    … 取り込んだ記録が1件も無い。★ ③は【分からない】
 *   paused  … 書き込みの向きなので取り込みが止まっている。古くて当然（★ 警告にしない）
 *   error   … 直近の周が失敗した。★ 数字を信じてはいけない
 *   stale   … 記録はあるが古い
 *   fresh   … 新しい
 */
export type RosterEvidence =
  | { kind: 'none'; asOfISO: null; ageHours: null }
  | { kind: 'paused'; asOfISO: string | null; ageHours: number | null }
  | { kind: 'error'; asOfISO: string; ageHours: number }
  | { kind: 'stale'; asOfISO: string; ageHours: number }
  | { kind: 'fresh'; asOfISO: string; ageHours: number };

export type RosterPerson = { id: number; name: string; isActive: boolean };

export type RosterResult = {
  provider: string;
  slot: number;
  /** フクエスにある行の数。★ 退店者の行が残っていれば、それも含まれる */
  total: number;
  /** そのうち公開中 */
  active: number;
  /** この枠に紐づいている数（castId あり） */
  linked: number;
  /** ① 紐づいていない人 */
  unlinked: RosterPerson[];
  /** ② 紐づいているのにフクエスに出ていない人（非公開のまま、または退店） */
  linkedButHidden: RosterPerson[];
  /**
   * ★ 媒体側の人数（写しがあるときだけ）。null は「読んでいないので分からない」。
   *   設計メモ §2-1の2「サイトごとの登録人数を並べて出す」が、ここで初めて出せる。
   */
  mediaTotal: number | null;
  /** ③ 媒体に居てフクエスに居ない名前 */
  onlyOnMedia: string[];
  /**
   * ★★★ ③を数字として信じてよいか。false のとき onlyOnMedia は必ず空だが、
   *   それは「0人」ではなく【分からない】の意味。★ 画面で 0 と書かないこと。
   */
  onlyOnMediaKnown: boolean;
  /**
   * ★ ③の数字がどこから来たか。
   *   'snapshot' … 管理画面の名簿を直接読んだ（強い）
   *   'run'      … 取り込みの未照合（公開ページ経由・最大24時間古い）
   *   null       … 根拠なし
   * ★ 画面で出典を出すこと。同じ数字でも、意味の強さが違う。
   */
  source: 'snapshot' | 'run' | null;
  evidence: RosterEvidence;
};

// ── 判定 ───────────────────────────────────────────────────────────────

/** ISO文字列 → ミリ秒。読めなければ null（★ 推測で埋めない）。 */
function msOf(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

/**
 * 直近の取り込みが、どれだけ信じられるか。
 *
 * ★★★ 順番に意味がある。
 *   1. 書き込みの向き（write / write_auto）なら、そもそも取り込みは止めてある（設計メモ §11）。
 *      ここを先に見ないと、正しく動いている書き込みの店に「取り込みが古い」と嘘の警告が出る。
 *      ★ mediaLinkStall.ts が「根拠が無いときは黙る」と決めたのと同じ考え方。
 *   2. 記録が無ければ none。★ ここで「0人」と言わない。
 *   3. 失敗した周の数字は信じない（error）。★ 取れなかったのを「消えた」と読むのが最悪の形。
 *   4. 古ければ stale、新しければ fresh。
 */
export function judgeRosterEvidence(input: {
  linkMode: string | null;
  lastRun: RosterRun | null;
  /** ★ あればこちらを見る（第50便） */
  snapshot?: RosterSnapshot | null;
  now: Date;
  staleHours?: number;
}): RosterEvidence {
  const nowMs = input.now.getTime();
  const limitH = input.staleHours ?? ROSTER_STALE_HOURS;

  // ★★★ 0. 名簿の写しがあれば、それが根拠（第50便）。
  //   ★ ここで paused を見ない。写しは【明示的に1回読んだもの】であって、
  //     取り込みの周の産物ではない。書き込みの向きの枠でも正しく新しい。
  //     ★ 見てしまうと、write の店で「読んだばかりの名簿」が
  //       「止まっているので古い」と表示される。それは嘘になる。
  const readAt = msOf(input.snapshot?.readAtISO ?? null);
  if (readAt !== null && Number.isFinite(nowMs)) {
    const age = Math.max(0, (nowMs - readAt) / 3_600_000);
    const asOfISO = new Date(readAt).toISOString();
    return age >= limitH
      ? { kind: 'stale', asOfISO, ageHours: age }
      : { kind: 'fresh', asOfISO, ageHours: age };
  }

  const started = msOf(input.lastRun?.startedAt ?? null);
  const now = input.now.getTime();
  // ★ 経過は「未来の時刻」を負の数のまま人に見せない（時計のずれ）。
  const age = started !== null && Number.isFinite(now) ? Math.max(0, (now - started) / 3_600_000) : null;

  // 1. 書き込みの向き … 取り込みが止まっているのは設計どおり
  if (isWriteDirection(input.linkMode)) {
    return { kind: 'paused', asOfISO: started !== null ? new Date(started).toISOString() : null, ageHours: age };
  }

  // 2. 記録が無い
  if (started === null || age === null) return { kind: 'none', asOfISO: null, ageHours: null };

  const asOfISO = new Date(started).toISOString();

  // 3. 直近が失敗（'ok' 以外はすべて信じない。'running' も途中なので信じない）
  if (input.lastRun?.status !== 'ok') return { kind: 'error', asOfISO, ageHours: age };

  // 4. 鮮度
  const limit = input.staleHours ?? ROSTER_STALE_HOURS;
  return age >= limit ? { kind: 'stale', asOfISO, ageHours: age } : { kind: 'fresh', asOfISO, ageHours: age };
}

/**
 * 名簿を突き合わせる。
 *
 * ★ 並び順は「フクエスの id 昇順」を保つ（呼び出し側が渡した順ではなく）。
 *   画面を開くたびに人の並びが変わると、店舗は「増えた・減った」を目で追えない。
 */
export function buildRoster(input: RosterInput): RosterResult {
  const linkedSet = new Set<number>(input.linkedIds);

  const people = [...input.therapists].sort((a, b) => a.id - b.id);

  const unlinked: RosterPerson[] = [];
  const linkedButHidden: RosterPerson[] = [];
  let linked = 0;
  let active = 0;

  for (const t of people) {
    const person: RosterPerson = { id: t.id, name: t.name, isActive: t.isActive };
    if (t.isActive) active++;
    if (linkedSet.has(t.id)) {
      linked++;
      if (!t.isActive) linkedButHidden.push(person);
    } else {
      unlinked.push(person);
    }
  }

  // ★★★ 写しは「いつ読んだか」が読めて初めて使える。
  //   ★ ここを判定と揃えないと、根拠は「取り込みから」と言いながら
  //     ③は写しから出す、という食い違いが起きる（点検で実際に出た）。
  //   ★ 分からない時刻を新しいものとして扱わない。判定側と同じ規則をここでも通す。
  const snapshot =
    input.snapshot && msOf(input.snapshot.readAtISO) !== null ? input.snapshot : null;

  const evidence = judgeRosterEvidence({
    linkMode: input.linkMode,
    lastRun: input.lastRun,
    snapshot,
    now: input.now,
    staleHours: input.staleHours,
  });

  // ★★★ ③を出してよいのは、成功した周の記録があるときだけ。
  //   none  … 記録が無い       → 分からない
  //   paused… 取り込みを止めた → 止めた時点の話でしかない。今の媒体側は分からない
  //   error … 失敗した周       → 一覧が短く返っただけで全員が「居ない」に見えうる
  const known = evidence.kind === 'fresh' || evidence.kind === 'stale';

  // ★★★ 3をどこから出すか。写しがあるならそちらが強い（第50便）。
  //   写し   … 管理画面の名簿そのもの。公開ページに出ていない子も入っている
  //   未照合 … 公開ページ経由・最大24時間古い（追記17 §72）
  let onlyOnMedia: string[];
  let source: 'snapshot' | 'run' | null;
  let mediaTotal: number | null;

  if (snapshot) {
    const knownCast = new Set<string>(input.knownCastIds ?? []);
    mediaTotal = snapshot.entries.length;
    source = 'snapshot';
    // ★ 媒体側にいて、こちらが番号を知らない子。★ 並びは写しの順のまま（相手の並び順）
    onlyOnMedia = known
      ? snapshot.entries.filter((e) => !knownCast.has(e.castId)).map((e) => e.name)
      : [];
  } else {
    mediaTotal = null;
    source = known ? 'run' : null;
    onlyOnMedia = known ? [...(input.lastRun?.unmatched ?? [])] : [];
  }

  return {
    provider: input.provider,
    slot: input.slot,
    total: people.length,
    active,
    linked,
    unlinked,
    linkedButHidden,
    mediaTotal,
    onlyOnMedia,
    onlyOnMediaKnown: known,
    source,
    evidence,
  };
}

// ── 文言 ───────────────────────────────────────────────────────────────

/** 「3時間」「2日」。★ 切り捨て（実際より長く言わない）。mediaLinkStall.elapsedLabel と同じ規則。 */
export function rosterAgeLabel(hours: number): string {
  const h = Math.floor(hours);
  if (h < 48) return h + '時間';
  return Math.floor(h / 24) + '日';
}

/**
 * 根拠の1行。★ 店舗が読んで分かる日本語だけ。英語の状態名を混ぜない。
 * ★ fresh のときだけ null（「異常なし」の行を作らない・mediaLinkStall と同じ）。
 *
 * ★★★ 出典（source）を必ず渡すこと（第51便で直した）。
 *   第49便では出典を見ずに「直近の取り込みから2日経っています」と出していた。
 *   ★ これは salon_import_runs（1日1回の周）のことなのに、
 *     店舗が読むと **出勤の取り込みが止まっている** と受け取る文面だった。
 *     2026-08-29 の実データでは、出勤の取り込み（15分ごと）は正常に動いていた。
 *   ★★ 同じ「古い」でも、何が古いのかが違う。**根拠ごとに時計が違う**（追記21 §96）。
 */
export function evidenceMessage(e: RosterEvidence, source: 'snapshot' | 'run' | null): string | null {
  switch (e.kind) {
    case 'fresh':
      return null;
    case 'none':
      return '駅ちかから取り込んだ記録がまだありません。下の「駅ちかにいてフクエスにいない人」は、0人ではなく【分からない】状態です。「駅ちかの名簿を読む」を押すと分かります';
    case 'paused':
      return 'いまは「フクエスから駅ちかへ反映する」向きのため、駅ちかからの取り込みは止まっています。「駅ちかの名簿を読む」を押せば、この向きのままでも名簿を確かめられます';
    case 'error':
      return '直近の取り込みが失敗しています（' + rosterAgeLabel(e.ageHours) + '前）。人数が実際より少なく見えている可能性があるため、この数字はまだ信じないでください';
    case 'stale':
      // ★ 写しが古い … 押し直せば済む話
      if (source === 'snapshot') {
        return '駅ちかから読み取った名簿は' + rosterAgeLabel(e.ageHours) + '前のものです。「駅ちかの名簿を読む」を押すと新しくできます';
      }
      // ★★ 取り込みの記録が古い … **出勤の取り込みが止まっているという意味ではない**
      return (
        'この比較に使っている記録は、1日1回の取り込みが' + rosterAgeLabel(e.ageHours) +
        '前に残したものです。出勤の取り込み（15分ごと）とは別のものなので、' +
        '出勤が止まっているという意味ではありません。' +
        '「駅ちかの名簿を読む」を押すと、いまの名簿と比べられます'
      );
  }
}

/**
 * 突き合わせの結果、店舗に伝えるべきことがあるか。
 * ★ 「無い」を返せることが大事。異常が無い店に赤い箱を出さない。
 */
export function rosterHasFindings(r: RosterResult): boolean {
  return r.unlinked.length > 0 || r.linkedButHidden.length > 0 || r.onlyOnMedia.length > 0;
}
