// ログインに続けて失敗しているサイトへ、自動の周が打ち続けないようにする（第1275便・2026-10-07）。
//
// ★★★ 何が起きていたか（コネックエフ全体の調査で見つかった）:
//   相手サイトのパスワードが変わると、自動の周（出勤30分・写メ日記の取り込み15分・即ヒメ10分・即セラ10分・写メ日記の送信5分）が
//   それぞれログインを試み続ける。止める仕組みがどこにも無かった。
//   ・出勤の「3回続けて反映できなかったら自動をやめる」は、出勤の記録（write_work）しか数えない。
//     ログインで落ちた流れは login の1行しか書かないので、数に入らない。
//   ・ほかの周は、直近の結果を見ていない。
//   → 間違ったパスワードで1時間に十数回ログインする。相手サイトにアカウントを止められる恐れがある。
//
// ★ 決まり:
//   ・ログインの失敗が【3回続いた】ら、自動の周は、最後の失敗から【60分】そのサイトへ行かない。
//   ・60分たったら1回だけ試す。通れば元どおり。また落ちたら、そこから60分。
//     ★ 永久には止めない。相手サイトの一時的な不調（メンテナンス）で止まったまま、という状態を作らない。
//   ・店舗様が ID・パスワードを保存し直したら、数え直す（すぐ試せる）。
//   ・人が画面から押した操作（接続テスト・いますぐ更新する など）は、いつでも通す。
//     ★ 直したあとすぐ確かめられるように。
//
// ★ ここは純粋関数だけ。DB を読むのは app/lib/media/relayFlow.ts の startRelayFlow。

/** 続けて何回失敗したら、間をあけるか */
export const LOGIN_BACKOFF_STREAK = 3;
/** 最後の失敗から何分あけるか */
export const LOGIN_BACKOFF_MIN = 60;

/**
 * 自動の周から始まった流れか。
 *   ★ 'cron:…' / 'system…' ＝自動。'shop:…'（店舗様）・'conecf:…'・'admin:…'（運営が手で叩く口）＝人。
 *   ★ 名前が無いときは自動として扱う（人が押した口は必ず名前を付けている）。
 */
export function isAutomaticActor(actor: string | null | undefined): boolean {
  const a = String(actor ?? '').trim();
  if (a === '') return true;
  return a.startsWith('cron:') || a === 'system' || a.startsWith('system:');
}

export type LoginBackoffRow = {
  /** 'login' か 'credential_saved'。ほかの種類は無視する */
  event: string;
  outcome: string;
  /** ISO */
  createdAt: string;
};

/**
 * いま、自動の周がこのサイトへ行くのを見送るか。
 * @param rows 新しい順。login と credential_saved の記録（直近の数件でよい）
 */
export function loginBackoff(input: { rows: ReadonlyArray<LoginBackoffRow>; nowMs: number }): {
  hold: boolean;
  /** 続けて失敗した回数（数えた範囲で） */
  streak: number;
  /** いつまで見送るか（ISO）。hold でなければ null */
  untilISO: string | null;
} {
  let streak = 0;
  let newestFailMs: number | null = null;
  for (const r of input.rows) {
    if (r.event === 'credential_saved') break;          // ★ 保存し直した＝数え直す
    if (r.event !== 'login') continue;
    if (r.outcome === 'ok') break;                      // ★ 通った回がある＝続いていない
    if (r.outcome !== 'failed') continue;
    const t = Date.parse(r.createdAt);
    if (!Number.isFinite(t)) continue;
    if (newestFailMs === null) newestFailMs = t;
    streak += 1;
    if (streak >= LOGIN_BACKOFF_STREAK) break;
  }
  if (streak < LOGIN_BACKOFF_STREAK || newestFailMs === null) return { hold: false, streak, untilISO: null };
  const untilMs = newestFailMs + LOGIN_BACKOFF_MIN * 60 * 1000;
  if (input.nowMs >= untilMs) return { hold: false, streak, untilISO: null };
  return { hold: true, streak, untilISO: new Date(untilMs).toISOString() };
}
