// 「出勤をサイトへ」とホームに出す【うまくいっていないこと】を、記録から決める（第1275便・2026-10-07）。
//
// ★★★ 何が起きていたか:
//   画面は「更新できないときは止めて、赤い枠でここに出します」と言っているのに、
//   赤い枠は【送る前に止めた理由】（計画の blockers）しか出していなかった。
//   送ったあとの失敗（読み直したら合わない・ログインできない・通信が確認できない）は、「更新結果」にしか残らない。
//   → ラビリンス様の駅ちかは、10/6 夕方〜10/7 夕方の12回、出勤が1件も入っていなかったのに、
//     「出勤をサイトへ」は「出勤 自動更新中」のままだった。気づいたのは店舗様からの連絡。
//   自動が切られたとき（3回続けて反映できなかった）も、ホームは「出勤の自動更新が未設定です」としか出なかった。
//
// ★ 決まり: 記録（salon_media_audit）を新しい順に見て、【いちばん新しい決め手】で決める。
//   ・うまくいった回（反映できた／確かめて同じだった）が先に出たら、問題なし。
//   ・うまくいかなかった回が先に出たら、それを出す。
//   ★ 「送る前に止めた理由」（plan_work の stopped）はここでは出さない。計画の赤い枠がもう出している（二度言わない）。
//
// ★ ここは純粋関数だけ。DB を読むのは actions/mediaCredentials.ts の getMediaOverview。

export type WorkProblemKind =
  | 'login'          // ログインに続けて失敗している
  | 'not_reflected'  // 送ったが、読み直したら合わなかった／保存できなかった／相手の画面を読めなかった
  | 'not_sent'       // 送らずに止めた（内容が新しくなっていた など）
  | 'unconfirmed'    // 通信が最後まで確認できなかった（届いたかどうか分からない）
  | 'auto_off';      // 3回続けて反映できなかったため、自動を止めた

export type WorkProblem = {
  kind: WorkProblemKind;
  /** いつのことか（ISO） */
  at: string;
};

export type WorkProblemRow = {
  event: string;
  outcome: string;
  /** ISO */
  createdAt: string;
  detail?: unknown;
};

/** ログインの失敗を「続いている」と見なす回数。★ 1回きりの失敗（相手サイトの一時的な不調）で赤くしない */
export const WORK_PROBLEM_LOGIN_STREAK = 2;

/** 出勤を【書く・読み直す】段の名前（駅ちか・エステ魂）。★ ここで切れると「届いたか分からない」 */
const WORK_WRITE_PURPOSES: readonly string[] = ['write_work', 'verify_work', 'esutama_work_save', 'esutama_work_verify'];

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

/**
 * @param rows 新しい順。このサイト（店×媒体×枠）の
 *   login / credential_saved / read_work / plan_work / write_work / verify_work / relay_gave_up / relay_expired / link_mode_changed
 */
export function workProblemOf(rows: ReadonlyArray<WorkProblemRow>): WorkProblem | null {
  // ── ログイン（どの流れのログインでも、同じ ID・パスワードを使っている）──
  let loginFails = 0;
  let loginFailAt: string | null = null;
  let loginSettled = false;   // ★ 通った回より古い失敗は数えない
  // ── 出勤 ──
  let found: WorkProblem | null = null;

  for (const r of rows) {
    const d = obj(r.detail);

    // ★ 保存し直した。ログインは数え直し。それより前の出勤の失敗も、古い ID・パスワードでの話
    if (r.event === 'credential_saved') break;

    if (r.event === 'login') {
      if (loginSettled) continue;
      if (r.outcome === 'ok') { loginSettled = true; continue; }
      if (r.outcome === 'failed') {
        if (loginFailAt === null) loginFailAt = r.createdAt;
        loginFails += 1;
      }
      continue;
    }

    // ★ 店舗様の画面にたたんである行（途中経過）は、決め手にしない。
    //   ★ うまくいかなかった行は、印が付いていても見る（lib/mediaAudit.ts の isShopVisibleAudit と同じ決まり）。
    //   ★ ただし「読めた」行は、ログインが通っている証拠として使う。
    if (d['shopVisible'] === false && r.outcome !== 'failed') {
      if (r.event === 'read_work' && r.outcome === 'ok') loginSettled = true;
      continue;
    }

    if (r.event === 'link_mode_changed') {
      if (d['reason'] === 'auto_gave_up') found = { kind: 'auto_off', at: r.createdAt };
      // ★ それ以外の切り替え（店舗様が自動を入れ直した・止めた・向きを変えた）＝仕切り直し。それより前は見ない
      break;
    }

    if (r.event === 'write_work') {
      if (r.outcome === 'ok') break;
      // ★ エステ魂の「変更なしで終わった回」（相手サイトを読んで、同じだと確かめた回）
      if (r.outcome === 'stopped' && d['saved'] === 0 && d['changed'] === 0) break;
      found = { kind: r.outcome === 'failed' ? 'not_reflected' : 'not_sent', at: r.createdAt };
      break;
    }
    if (r.event === 'verify_work') {
      if (r.outcome === 'ok') break;
      if (r.outcome === 'failed') { found = { kind: 'not_reflected', at: r.createdAt }; break; }
      continue;
    }
    if (r.event === 'read_work') {
      if (r.outcome === 'failed') { found = { kind: 'not_reflected', at: r.createdAt }; break; }
      loginSettled = true;   // ★ 読めた＝ログインは通っている
      continue;
    }
    if (r.event === 'plan_work') {
      // ★ 送る前に止めた理由は、計画の赤い枠が出している。ここでは出さない（仕切りにする）
      if (r.outcome === 'stopped' || r.outcome === 'failed') break;
      // ★ 確かめて、変わるところが無かった＝合っている
      if (r.outcome === 'ok' && (d['changes'] === 0 || d['changed'] === 0)) break;
      // ★ 変わるところがある確認（まだ送っていない）は決め手にしない。ただしログインは通っている
      loginSettled = true;
      continue;
    }
    if (r.event === 'relay_gave_up' || r.event === 'relay_expired') {
      // ★ 通信の打ち切りは、出勤以外の流れ（写メ日記の取り込み・即ヒメ など）でも同じ名前で残る。
      //   ★ 【出勤を書く・読み直す段】で切れたときだけ出す（detail.purpose）。分からない行は出さない（他の流れの話を出勤の話にしない）。
      if (!WORK_WRITE_PURPOSES.includes(String(d['purpose'] ?? ''))) continue;
      found = { kind: 'unconfirmed', at: r.createdAt };
      break;
    }
  }

  // ★ ログインの失敗が続いているなら、そちらを先に言う（出勤が反映できない理由そのもの。直す場所も違う）。
  //   ★ ここまでに数えた失敗は、見つけた出勤の行より【新しい】ものだけ。
  if (loginFails >= WORK_PROBLEM_LOGIN_STREAK && loginFailAt !== null) return { kind: 'login', at: loginFailAt };
  return found;
}

/**
 * 画面に出す文。★ 何が起きているか → 何をすればよいか、の順。内部の言葉を出さない。
 * @param when 「10/7 15:20」の形（呼ぶ側が作る）
 * @param names いまの画面での呼び名（コネックエフとフクエスリンクで違う）
 */
export function workProblemText(
  p: WorkProblem,
  label: string,
  when: string,
  names: { loginScreen: string; logScreen: string; autoOn: boolean },
): { title: string; body: string; link: 'login' | 'log' | null } {
  switch (p.kind) {
    case 'login':
      return {
        title: label + 'にログインできていません（' + when + '）',
        body:
          '「' + names.loginScreen + '」で、いまの ID・パスワードをご確認ください。' +
          '保存し直すと、すぐに試します。直るまで、自動の更新は1時間に1回だけ試します。',
        link: 'login',
      };
    case 'not_reflected':
      return {
        title: when + ' の更新が、' + label + 'に反映できていません',
        body:
          '「いますぐ更新する」をお試しください。' + label + 'の管理画面で、出勤が合っているかもご確認ください。' +
          '続くときは「' + names.logScreen + '」の時刻を添えて運営にお知らせください。',
        link: 'log',
      };
    case 'not_sent':
      return {
        title: when + ' の更新は、' + label + 'へ送らずに止めました',
        body: '「いますぐ更新する」を押すと、いまの内容で送り直します。理由は「' + names.logScreen + '」に出ています。',
        link: 'log',
      };
    case 'unconfirmed':
      return {
        title: when + ' の更新は、' + label + 'に届いたか確認できませんでした',
        body: label + 'の管理画面で出勤をご確認のうえ、「いますぐ更新する」をお試しください。',
        link: 'log',
      };
    case 'auto_off':
      return {
        title: '3回続けて反映できなかったため、' + when + ' に自動更新を止めました',
        body: names.autoOn
          ? '「' + names.logScreen + '」で理由をご確認ください。'
          : '下のボタンで、もう一度自動更新にできます。理由は「' + names.logScreen + '」に出ています。',
        link: 'log',
      };
  }
}

/** ホームの行に出す1行（短く）。★ 詳しい説明は「出勤をサイトへ」に任せる */
export function workProblemShort(p: WorkProblem): string {
  switch (p.kind) {
    case 'login': return 'ログインできていません';
    case 'not_reflected': return '出勤の更新が反映できていません';
    case 'not_sent': return '出勤の更新を送らずに止めました';
    case 'unconfirmed': return '出勤の更新が届いたか確認できていません';
    case 'auto_off': return '出勤の自動更新が止まりました';
  }
}
