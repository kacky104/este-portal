// ID・パスワードが違うときは、ログインを自動で一時停止する（第1378便・2026-10-10・カッキーさん）。
//
// ★★★ 何が起きたか:
//   店舗様が駅ちか（枠2）に間違った ID・パスワードを登録した。ログインは毎回ログイン画面へ戻され、
//   lib/loginBackoff.ts の決まりで60分に1回になったが、止まりはしないので、間違ったログインが1日に20回以上続く
//   （相手サイトにアカウントを止められる恐れ）。しかも読む向きの枠は、ホームに何も出ていなかった。
//   運営にはメール（連携の止まり）が届くが、メールを見ないオーナー様もいる。
//
// ★ 決まり（カッキーさん）:
//   ・「ID・パスワードが違う」とはっきり分かる失敗が【5回続いたら】、その枠のログインを一時停止する（is_enabled=false）。
//     ★ はじめ3回と決めたが、5回にした（カッキーさん）。3回は10〜20分でたまる。5回は、3回目のあと60分に1回になるので 約2時間半〜3時間半。
//     ★★ ただし 5回で止めるのは【登録（または再開）してから、まだ1度もログインできていない枠】だけ（＝入れ間違い）。
//       前は通っていた枠は、5回では止めない。失敗が【24時間】続いたら止める（＝相手サイトでパスワードが変わった）。
//       理由: 相手サイトの側の不調で、全店のログインが一時的にログイン画面へ戻されることがありうる。
//       回数だけで止めると、不調が数時間続いたときに、通っていた全店が一斉に一時停止になり、出勤の更新が止まったままになる。
//   ・コネックエフ／フクエスリンクを開いたとき、いちばん上の赤い帯で分かるようにする。メールは送らない。
//   ・ID・パスワードを保存し直すと再開する（保存は is_enabled=true で書く）。「再開」を押しても再開する（数え直し）。
//
// ★★ 数えるのは「ID・パスワードが違う」ときだけ:
//   ・ログインした直後の画面がログイン画面へ戻された／ログイン画面がそのまま返った／相手サイトが入力を断った。
//   ・相手サイトの不調（応答が無い・画面の形が変わった・セッションが発行されない）は数えない。
//     ★ 駅ちかのメンテナンスで、勝手に一時停止にならないように（第1275便「永久には止めない」の理由を守る）。
//   ・流れの途中の「セッションが切れました」は、その流れのログインは通っている＝ID・パスワードは合っている。そこで数えるのをやめる。
//
// ★ 自動で止めた印は、記録（salon_media_audit）の credential_disabled の detail.reason に残す（DB の列は足さない）。
//   店舗様が自分で一時停止した枠（灰色の「一時停止中」）と分けるため。
//
// ★ ここは純粋関数だけ。DB を読むのは app/lib/media/loginAutoPause.ts と relayFlow.ts の startRelayFlow。

/** 続けて何回「ID・パスワードが違う」と言われたら、一時停止にするか */
export const LOGIN_REJECT_PAUSE_STREAK = 5;
/** 自動で止めたときに、credential_disabled の detail.reason に入れる印 */
export const LOGIN_REJECT_REASON = 'login_rejected';
/** 自動で止めたときの actor */
export const LOGIN_GUARD_ACTOR = 'system:login-guard';
/** 前は通っていた枠は、失敗が何時間続いたら一時停止にするか */
export const LOGIN_REJECT_PAUSE_HOURS_IF_WORKED = 24;
/** 止めた理由の種類。'new' … 登録してから1度も通っていない／'long' … 通っていたが、長く続けて通らない */
export type LoginPauseRule = 'new' | 'long';

/** 相手サイトが「ID・パスワードが違う」と言ったときの detail.reason（各フローが書く値） */
const REJECT_REASONS: readonly string[] = ['back_to_login', 'login_page', 'rejected'];

export type LoginPauseRow = {
  /** 'login' / 'credential_saved' / 'credential_enabled' / 'credential_disabled' / 'credential_deleted' */
  event: string;
  outcome: string;
  /** 店舗様向けの1行（salon_media_audit.summary） */
  summary?: string | null;
  detail?: unknown;
};

const reasonOf = (detail: unknown): string => {
  const d = detail && typeof detail === 'object' ? (detail as Record<string, unknown>) : {};
  return typeof d['reason'] === 'string' ? (d['reason'] as string) : '';
};

/**
 * ログインの失敗の種類。
 *   'rejected' … ID・パスワードが違う（数える）
 *   'session'  … 流れの途中でセッションが切れた（その流れのログインは通っていた）
 *   'other'    … 相手サイトの不調など（数えない・切りもしない）
 * ★ 同じ reason（back_to_login）が「ログイン直後に戻された」と「途中でセッションが切れた」の両方に使われているので、
 *   店舗様向けの1行（summary）も見る。★ summary の言い回しを変えるときは、scripts/loginautopause-selftest.js が落ちる。
 */
export function loginFailKind(row: LoginPauseRow): 'rejected' | 'session' | 'other' {
  const summary = String(row.summary ?? '');
  if (summary.includes('セッションが切れました')) return 'session';
  if (REJECT_REASONS.includes(reasonOf(row.detail)) && summary.includes('ログインできませんでした')) return 'rejected';
  return 'other';
}

/**
 * 「ID・パスワードが違う」が、いま何回続いているか。
 * @param rows 新しい順。login と credential_*（saved / enabled / disabled / deleted）の記録
 */
export function loginRejectStreak(rows: ReadonlyArray<LoginPauseRow>): number {
  let streak = 0;
  for (const r of rows) {
    // ★ 保存し直した・再開した・止めた・消した＝仕切り直し。それより前は数えない
    if (r.event.startsWith('credential_')) break;
    if (r.event !== 'login') continue;
    if (r.outcome === 'ok') break;                 // ★ 通った回がある＝続いていない
    if (r.outcome !== 'failed') continue;
    const kind = loginFailKind(r);
    if (kind === 'session') break;                 // ★ その流れのログインは通っていた
    if (kind === 'rejected') streak += 1;
    // 'other'（相手サイトの不調）は数えない・切らない
  }
  return streak;
}

/**
 * いま、この枠のログインを自動で一時停止にするか。
 * @param input.streak        「ID・パスワードが違う」が続いている回数（loginRejectStreak）
 * @param input.everWorked    登録（または再開）してから、1度でもログインできたか
 * @param input.firstFailAtMs 最後に通ったあと、最初に失敗した時刻（everWorked のときだけ意味がある。分からなければ null）
 * ★ 分からないときは止めない（firstFailAtMs が null の「通っていた枠」は、今までどおり60分に1回の見送りに任せる）。
 */
export function decideLoginAutoPause(input: {
  streak: number; everWorked: boolean; firstFailAtMs: number | null; nowMs: number;
}): { pause: boolean; rule: LoginPauseRule | null } {
  if (!(input.streak >= LOGIN_REJECT_PAUSE_STREAK)) return { pause: false, rule: null };
  if (!input.everWorked) return { pause: true, rule: 'new' };
  if (input.firstFailAtMs === null || !Number.isFinite(input.firstFailAtMs)) return { pause: false, rule: null };
  const longEnough = input.nowMs - input.firstFailAtMs >= LOGIN_REJECT_PAUSE_HOURS_IF_WORKED * 60 * 60 * 1000;
  return longEnough ? { pause: true, rule: 'long' } : { pause: false, rule: null };
}

/**
 * いま一時停止している枠が、「ID・パスワードが違う」ために自動で止めたものか。
 * @param rows 新しい順。その枠の credential_*（saved / enabled / disabled / deleted）の記録
 * ★ いちばん新しい credential_* が、印の付いた credential_disabled であること。
 *   そのあと店舗様が再開して自分で止め直した枠は、店舗様の一時停止（印なし）として扱う。
 */
export function isPausedByLoginReject(rows: ReadonlyArray<LoginPauseRow>): boolean {
  for (const r of rows) {
    if (!r.event.startsWith('credential_')) continue;
    return r.event === 'credential_disabled' && reasonOf(r.detail) === LOGIN_REJECT_REASON;
  }
  return false;
}

/** 記録（更新結果）に残す1行 */
export function loginRejectPauseSummary(siteLabel: string, rule: LoginPauseRule): string {
  const why = rule === 'long'
    ? `${LOGIN_REJECT_PAUSE_HOURS_IF_WORKED}時間以上ログインできませんでした`
    : `${LOGIN_REJECT_PAUSE_STREAK}回続けてログインできませんでした`;
  return `${siteLabel}のID・パスワードが違うため、ログインを止めました（${why}）。正しいID・パスワードを登録し直してください`;
}

/** 自動の周が止まったときの note（ログに残る） */
export function loginRejectPauseNote(siteLabel: string): string {
  return `${siteLabel}のID・パスワードが違うため、ログインを一時停止しました。正しいID・パスワードを登録し直すと再開します`;
}

const joinLabels = (labels: readonly string[]): string => {
  const list = Array.from(new Set((labels ?? []).map((s) => String(s ?? '').trim()).filter(Boolean)));
  return list.join('・');
};

/**
 * ホームのいちばん上に出す赤い帯の文。★ 見出しは【状態】、本文は【することは1つ】。
 *   ★ 「入れ直す」は行き先のボタンが言う。文で二度言わない（autoOffNoticeText と同じ作法）。
 */
export function loginRejectNoticeText(labels: readonly string[]): { title: string; body: string } {
  const names = joinLabels(labels);
  return {
    title: 'ID・パスワードが違っています',
    body: `${names}にログインできなかったため、ログインを止めています。正しいID・パスワードを入れ直してください。`,
  };
}

/** サイトの行・ID・パスワードの画面に出す1行 */
export function loginRejectPausedLine(siteLabel: string): string {
  return `${siteLabel}のID・パスワードが違うため、ログインを止めています。正しいID・パスワードを入れ直して保存すると再開します。`;
}

/** 運営の見張り（連携の止まり）に出す短い文 */
export const LOGIN_REJECT_WATCH_MESSAGE = 'ID・パスワードが違うため、ログインを止めています';
