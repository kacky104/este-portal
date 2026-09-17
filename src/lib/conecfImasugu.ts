// コネックエフ「今すぐ一括」の決めごと（第401便・1e・2026-09-17）。★ 純粋関数だけ。
//
// ★★ 自動更新の1周（10分ごと）でやること
//   1. 候補 = 公開中 ＆ いま出勤時間中 ＆ 除外していない ＆ 本人（キャスト枠）が今すぐ中でない
//   2. 並べる = 最後に今すぐにした時刻が古い人から（★ 回す）。★ 同じなら「優先順の決め方」で並べる
//   3. 上から N 人を今すぐ（店舗の枠）にする。★ N = 人数設定（0 は上限まで）。★ 上限は imasuguMax
//   4. 候補のうち選ばれなかった人の【店舗の枠】は外す（★ 本人の枠・駅ちか取り込みの枠は触らない）

export type ImasuguOrderMode = 'priority' | 'random';
export type ImasuguPriorityRule = 'list' | 'earlier' | 'later';

export const IMASUGU_BATCH_CHOICES: ReadonlyArray<{ value: number; label: string }> = [
  { value: 1, label: '1人ずつ' }, { value: 2, label: '2人ずつ' }, { value: 3, label: '3人ずつ' },
  { value: 4, label: '4人ずつ' }, { value: 5, label: '5人ずつ' }, { value: 0, label: '全員同時' },
];
export const IMASUGU_RULE_CHOICES: ReadonlyArray<{ value: ImasuguPriorityRule; label: string }> = [
  { value: 'list', label: '並べた順' }, { value: 'earlier', label: '先に出勤している人優先' }, { value: 'later', label: '後から出勤した人優先' },
];

function hm(s: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(s ?? '');
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h > 23 || mi > 59 ? null : h * 60 + mi;
}

/** いま（0時からの分）が出勤時間の中か。★ 日をまたぐ出勤（20:00〜02:00）も見る */
export function isOnDutyNow(start: string | null, end: string | null, nowMin: number): boolean {
  const s = hm(start), e = hm(end);
  if (s === null || e === null || s === e) return false;
  return e < s ? nowMin >= s || nowMin < e : nowMin >= s && nowMin < e;
}

/** 出勤開始からの経過分（日またぎを考える）。★ 「先に出勤した人」の並べ替えに使う */
export function minutesSinceStart(start: string | null, nowMin: number): number {
  const s = hm(start);
  if (s === null) return -1;
  const d = nowMin - s;
  return d >= 0 ? d : d + 1440;
}

export type ImasuguCandidate = {
  id: number;
  name: string;
  start: string | null;
  priority: number | null;
  lastOnAt: string | null;
};

/** 0〜1 の決まった乱数（★ 同じ種なら同じ並び＝点検で固定できる） */
function seeded(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) { h ^= seed.charCodeAt(i); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * ★ 今すぐにする人を選ぶ。★ 戻り値は選ばれた id（順番どおり）
 * @param seed ランダムのときの種（★ 周ごとに変える。例: 時刻の文字列）
 */
export function pickImasugu(input: {
  candidates: readonly ImasuguCandidate[];
  orderMode: ImasuguOrderMode;
  rule: ImasuguPriorityRule;
  batchSize: number;
  max: number;
  nowMin: number;
  seed: string;
}): number[] {
  const n = Math.max(0, Math.min(input.batchSize > 0 ? input.batchSize : input.max, input.max));
  if (n === 0) return [];
  const t = (x: string | null) => (x ? Date.parse(x) || 0 : 0);
  const tie = (a: ImasuguCandidate, b: ImasuguCandidate): number => {
    if (input.orderMode === 'random') return seeded(input.seed + '#' + a.id) - seeded(input.seed + '#' + b.id);
    if (input.rule === 'earlier') return minutesSinceStart(b.start, input.nowMin) - minutesSinceStart(a.start, input.nowMin);
    if (input.rule === 'later') return minutesSinceStart(a.start, input.nowMin) - minutesSinceStart(b.start, input.nowMin);
    const pa = a.priority ?? Number.MAX_SAFE_INTEGER, pb = b.priority ?? Number.MAX_SAFE_INTEGER;
    return pa !== pb ? pa - pb : a.name.localeCompare(b.name, 'ja');
  };
  return [...input.candidates]
    .sort((a, b) => (t(a.lastOnAt) - t(b.lastOnAt)) || tie(a, b) || a.id - b.id)
    .slice(0, n)
    .map((c) => c.id);
}
