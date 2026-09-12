// サンプル店舗（デモ）の出勤スケジュールの組み立てと、作り直すかどうかの判定（第295便・2026-09-12）。
//
// ★★★ なぜ切り出すか
//   これまで出勤の組み立ては actions/hpDemo.ts の中にあり、
//   【運営がログインして押す】口からしか呼べなかった。
//   ★ 自動で回す周（/api/admin/hp-demo-schedule）からも同じものを使いたいので、
//     DBを触らない部分だけをここへ出す。★ 2つの作り方を持たない。
//
// ★★ ここは【DBを見ない・時計も見ない】。★ 今日の日付は必ず引数で受ける。
//   → 「7日を切ったら作り直す」を、1週間待たずに確かめられる（scripts/hpdemoschedule-selftest.js）。

/** 出勤パターン（日替わりで時間帯をばらす）。★ 見た目のためだけ。 */
export const DEMO_SHIFT_PATTERNS = [
  { start: '12:00', end: '22:00' },
  { start: '15:00', end: '23:00' },
  { start: '18:00', end: '24:00' },
  { start: '13:00', end: '21:00' },
] as const;

/** 作り置きする日数。★ 今日を1日目として14日分。 */
export const DEMO_SCHEDULE_DAYS = 14;

/**
 * 残りがこの日数を切ったら作り直す。
 * ★ 7日＝「1週間先まではいつでも埋まっている」状態を保つということ。
 * ★ 14日分を作るので、実際に書き込むのは7日に1回だけになる。
 */
export const DEMO_SCHEDULE_MIN_REMAIN_DAYS = 7;

/** 'YYYY-MM-DD' の n 日後。★ 月またぎ・年またぎは Date.UTC に任せる。 */
export function addDaysYmd(ymd: string, n: number): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd ?? '');
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n));
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString().slice(0, 10);
}

/** 2つの 'YYYY-MM-DD' の差（日数・b - a）。★ 読めなければ null。 */
export function diffDaysYmd(a: string, b: string): number | null {
  const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a ?? '');
  const pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(b ?? '');
  if (!pa || !pb) return null;
  const ta = Date.UTC(Number(pa[1]), Number(pa[2]) - 1, Number(pa[3]));
  const tb = Date.UTC(Number(pb[1]), Number(pb[2]) - 1, Number(pb[3]));
  return Math.round((tb - ta) / 86_400_000);
}

export type ReseedDecision = {
  /** 作り直すか */
  reseed: boolean;
  /** なぜそうしたか（画面・ログに出す用） */
  reason: 'no_schedule' | 'running_out' | 'unreadable' | 'enough';
  /** 今日を含めてあと何日ぶん埋まっているか。★ 読めないときは null */
  remainDays: number | null;
};

/**
 * 出勤を作り直すべきかを決める。
 *
 * @param today    今日（'YYYY-MM-DD'・JST営業日基準）
 * @param lastDate いま入っている出勤の【最終日】。1件も無ければ null
 * @param minRemain 残りがこれを切ったら作り直す（既定7日）
 *
 * ★★ 「残り日数」は last - today で数える（今日ぶんは数えない）。
 *   ★ last = today なら残り0＝今日で切れる。★ last が過去なら負になる＝とっくに切れている。
 * ★★★ 読めなかったとき（日付の形が壊れている）は【作り直す】側に倒す。
 *   ★ ここは「作りすぎても上書きで済む」側なので、迷ったら埋める方が安全。
 */
export function shouldReseedDemoSchedule(
  today: string,
  lastDate: string | null,
  minRemain: number = DEMO_SCHEDULE_MIN_REMAIN_DAYS,
): ReseedDecision {
  if (lastDate === null) return { reseed: true, reason: 'no_schedule', remainDays: null };
  const remain = diffDaysYmd(today, lastDate);
  if (remain === null) return { reseed: true, reason: 'unreadable', remainDays: null };
  if (remain < minRemain) return { reseed: true, reason: 'running_out', remainDays: remain };
  return { reseed: false, reason: 'enough', remainDays: remain };
}

export type DemoScheduleRow = {
  therapist_id: string;
  schedule_date: string;
  is_active: boolean;
  start_time: string | null;
  end_time: string | null;
};

/**
 * 今日から days 日ぶんの出勤行を組み立てる。
 * ★ 中身の規則は第?便から変えていない（在籍の6割・最少3・最多6／端数は偶数日だけ出勤）。
 * ★ ここを触ると【押したとき】と【自動】の両方が同じだけ変わる。
 */
export function buildDemoScheduleRows(
  therapistIds: string[],
  today: string,
  days: number = DEMO_SCHEDULE_DAYS,
): DemoScheduleRow[] {
  const ids = (therapistIds ?? []).filter((id) => typeof id === 'string' && id.length > 0);
  if (ids.length === 0) return [];
  const slots = Math.max(3, Math.min(6, Math.round(ids.length * 0.6)));
  const rows: DemoScheduleRow[] = [];
  for (let day = 0; day < days; day++) {
    const date = addDaysYmd(today, day);
    if (date === null) return []; // ★ 起点が読めないなら1行も作らない（中途半端に書かない）
    ids.forEach((id, i) => {
      const slot = (i + day) % ids.length;
      const on = slot < slots - 1 || (slot === slots - 1 && day % 2 === 0);
      const p = DEMO_SHIFT_PATTERNS[(i + day) % DEMO_SHIFT_PATTERNS.length];
      rows.push({
        therapist_id: id,
        schedule_date: date,
        is_active: on,
        start_time: on ? p.start : null,
        end_time: on ? p.end : null,
      });
    });
  }
  return rows;
}
