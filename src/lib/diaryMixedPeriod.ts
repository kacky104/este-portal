// 写メ日記の「移行期間の取り込み」の【期限】（第1265便・2026-10-07・カッキーさんの決定）。★ 純粋関数のみ（通信も DB も触らない）。
//
// ★★★ 何を決めているか
//   コネックエフに切り替えた店は、駅ちかを読まない（向きが逆）。★ ただし写メ日記だけは例外にする:
//     切り替えてから30日間は「移行期間」。セラピストがフクエスで1度写メ日記を投稿するまでは、
//     駅ちかに書いた写メ日記もフクエスに取り込む（見分けは第1140便・ekichikaDiaryParse の isFukuesWrittenCopy）。
//     30日を過ぎたら、駅ちかへ見に行くのをやめる（ログインも 0 回になる）。
//     救済として、店舗様がコネックエフの画面で「14日間延長する」を何回でも押せる（押すたびに連携の記録に残す）。
//   ★ なぜ期限か: 取り込みは15分ごとに駅ちかへログインする（1枠で1日約96回）。終わりが無いと、全員が切り替わったあとも続く。
//     「まだ書いていない方が居るあいだだけ」という数え方は、在籍に残っているだけの方・出勤はするが日記を書かない方が
//     1人でも居ると止まらない（カッキーさんの指摘）。→ 人を数えず、日数で切る。
//   ★ フクエスリンクの「フクエスで書く」には期限を付けない（もともと15分ごとに駅ちかの日記を読んでいるので、回数が増えない）。
//
// ★★★ 期限の持ち方（salons.diary_mixed_until）
//   「◯月◯日まで」＝その日の終わり（翌日 0:00 JST）の時刻を入れる。★ 期限の日の 23:59 までは取り込む。
//   ★ 日本時間は夏時間が無いので、UTC＋9時間で固定して数える。

/** 切り替えてからの移行期間（日） */
export const DIARY_MIXED_DAYS = 30;
/** 「延長する」1回ぶん（日） */
export const DIARY_MIXED_EXTEND_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;
const JST_MS = 9 * 60 * 60 * 1000;

function parseMs(iso: unknown): number {
  return typeof iso === 'string' && iso.length > 0 ? Date.parse(iso) : Number.NaN;
}

/** その時刻の【日本時間の日付】から days 日後の、日の終わり（＝その翌日 0:00 JST）を ISO で返す。 */
function endOfJstDayAfter(ms: number, days: number): string {
  const dayStartJst = Math.floor((ms + JST_MS) / DAY_MS) * DAY_MS;
  return new Date(dayStartJst + (days + 1) * DAY_MS - JST_MS).toISOString();
}

/**
 * ★ 移行期間を始めるときの期限。今日（JST）から DIARY_MIXED_DAYS 日後の、日の終わり。
 *   例: 10/7 に始める → 11/6 まで（＝ 11/7 0:00 JST）。
 * @returns ISO。★ いまの時刻が読めなければ null（★ 当てずっぽうの期限を入れない）
 */
export function mixedUntilFromStart(nowISO: string): string | null {
  const now = parseMs(nowISO);
  return Number.isNaN(now) ? null : endOfJstDayAfter(now, DIARY_MIXED_DAYS);
}

/** ★ 期間中か（期限が入っていて、いまがそれより前）。★ 期限が無い・読めないは「期間中ではない」 */
export function isMixedPeriodOpen(until: string | null | undefined, nowISO: string): boolean {
  const u = parseMs(until);
  const now = parseMs(nowISO);
  if (Number.isNaN(u) || Number.isNaN(now)) return false;
  return now < u;
}

/**
 * ★★★ 「14日間延長する」を押したあとの期限。
 *   ・期間中に押した       … いまの期限に 14日 足す（★ 残りを捨てない。11/6 まで → 11/20 まで）
 *   ・期限切れのあとに押した … 押した日（JST）から 14日後の、日の終わり（★ 止まっていた日数ぶんは足さない）
 *   ・期限が入っていない   … 同上（押した日から14日）
 * @returns ISO。★ いまの時刻が読めなければ null
 */
export function extendMixedUntil(currentUntil: string | null | undefined, nowISO: string): string | null {
  const now = parseMs(nowISO);
  if (Number.isNaN(now)) return null;
  const u = parseMs(currentUntil);
  if (!Number.isNaN(u) && now < u) return new Date(u + DIARY_MIXED_EXTEND_DAYS * DAY_MS).toISOString();
  return endOfJstDayAfter(now, DIARY_MIXED_EXTEND_DAYS);
}

/** ★ 画面に出す「◯/◯」（期限の日＝期限の時刻の直前の、日本時間の日付）。期限が無い・読めないは null */
export function mixedLastDayLabel(until: string | null | undefined): string | null {
  const u = parseMs(until);
  if (Number.isNaN(u)) return null;
  const d = new Date(u - 1 + JST_MS);
  return (d.getUTCMonth() + 1) + '/' + d.getUTCDate();
}

/**
 * ★ 期限の日まで、あと何日か（日本時間の日付の差）。今日が期限の日なら 0。期限切れは負の数。
 *   期限が無い・読めないは null。
 */
export function mixedDaysLeft(until: string | null | undefined, nowISO: string): number | null {
  const u = parseMs(until);
  const now = parseMs(nowISO);
  if (Number.isNaN(u) || Number.isNaN(now)) return null;
  const lastDay = Math.floor((u - 1 + JST_MS) / DAY_MS);
  const today = Math.floor((now + JST_MS) / DAY_MS);
  return lastDay - today;
}

/**
 * ★★★ 取り込みの周（/api/admin/diary-import）が、その駅ちかの枠で「移行期間の取り込み」を回すか。
 *   ★ 呼ぶ側が先に見るもの: 入口が 'fukues'・始まりの時刻（diary_mixed_since）が入っている・ID・PW が有効で同意済み。
 *
 *   切り替えていない店（フクエスリンク） … その枠が「駅ちかから反映（read）」のあいだ（第1142便）。★ 期限は見ない（期限なし）
 *   コネックエフに切り替えた店           … その枠が「フクエスから反映（write / write_auto）」で、【期間中】のあいだだけ
 *   ★ どちらも、枠が止められている（is_enabled=false）・「反映しない（none）」なら回さない。
 */
export function diaryMixedRuns(input: {
  /** salons.conecf_enabled_at が入っているか */
  switched: boolean;
  linkMode: string | null | undefined;
  /** salon_import_sources.is_enabled が false でない */
  slotEnabled: boolean;
  /** salons.diary_mixed_until */
  until: string | null | undefined;
  nowISO: string;
}): boolean {
  if (!input.slotEnabled) return false;
  if (!input.switched) return input.linkMode === 'read';
  if (input.linkMode !== 'write' && input.linkMode !== 'write_auto') return false;
  return isMixedPeriodOpen(input.until, input.nowISO);
}
