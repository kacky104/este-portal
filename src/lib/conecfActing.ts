// コネックエフ: 運営が「店舗様の代わりに操作する」ときの決めごと（第1399便・2026-10-11・カッキーさん）。
//
// ★★★ 何のため
//   コネックエフは「ログインした人が持ち主の店」を1つだけ開く作りで、運営アカウントから店舗様の画面に入る道が無かった。
//   設定のお手伝い・不具合の確認のために、運営アカウントでログインしたときだけ、店を選んで開けるようにする
//   （見るだけでなく、保存・各サイトへの送信までできる）。
//
// ★★★ 守り（ここを崩さない）
//   ① 店を選べるのは運営アカウント（ADMIN_UUID）だけ。選んだ店は cookie に入れるが、
//      ★ cookie は「運営アカウントでログインしているとき」にしか読まない（actingSalonIdFor）。
//      店舗様のブラウザに同じ cookie があっても、何も起きない。
//   ② cookie の中身は店の番号だけ。数字以外・0以下は「選んでいない」として扱う（parseActingSalonId）。
//   ③ 説明への同意（ID・パスワードのはじめての登録・同意の取り直し）は、運営が代わりに入れられない（operatorConsentBlocked）。
//      同意は店舗様ご本人のもの。運営ができるのは、同意済みの枠の ID・パスワードの変更だけ。
//
// ★ ここは決めごとだけ（cookie を読む・DB を読むのは src/app/lib/conecf/actingSalon.ts）。番人: npm run check:conecfacting

/** 運営が選んだ店の番号を入れる cookie の名前（conecf.com のホストにだけ付く） */
export const CONECF_ACT_COOKIE = 'conecf_act_salon';

// ★★★ cookie に期限（maxAge）を付けない＝ブラウザを閉じるか「やめる」を押すまで続く。
//   期限を付けると、画面を開いたまま期限が来たときに、画面は店Aのまま・サーバーは運営自身の店、と食い違う
//   （その状態で保存を押すと、見ている店と違う店に保存される）。食い違いを作らないことを優先する。
//   操作中は、どの画面でもいちばん上に帯が出ているので、選んだままになっていることは見て分かる。

/** ほかのタブへ「店を変えた／やめた」を知らせる localStorage の鍵（中身は店の番号か空。権限には使わない） */
export const CONECF_ACT_SIGNAL_KEY = 'conecf_act_signal';

/**
 * ★★★ 開いたままの画面が、いまサーバーが見ている店と食い違っていないか。
 *   2つのタブで別の店を開こうとすると、あとから選んだ店が全部のタブに効く（cookie は1つ）。
 *   古いタブは店Aの画面のまま、サーバーは店Bを見ている → その画面で保存すると店Bに入る。
 *   → 画面を開いたときの店（shown）と、読み直した店（now）が違えば、画面をまるごと読み直す。
 */
export function actingScreenIsStale(shown: { salonId: number | null; acting: boolean }, now: { salonId: number | null; acting: boolean }): boolean {
  return shown.salonId !== now.salonId || shown.acting !== now.acting;
}

/** cookie の値 → 店の番号。★ 数字だけの正の整数以外は null（＝選んでいない） */
export function parseActingSalonId(raw: unknown): number | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!/^[1-9][0-9]{0,11}$/.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/**
 * ★★★ いま「運営として、選んだ店を操作中」なら、その店の番号。そうでなければ null。
 *   ・運営アカウント以外は、cookie があっても必ず null。
 *   ・adminUuid が空（設定が読めていない）ときも null（誰にでも通る形にしない）。
 */
export function actingSalonIdFor(input: { userId: string | null | undefined; adminUuid: string | null | undefined; cookie: unknown }): number | null {
  const admin = typeof input.adminUuid === 'string' ? input.adminUuid : '';
  if (admin.length === 0) return null;
  if (typeof input.userId !== 'string' || input.userId !== admin) return null;
  return parseActingSalonId(input.cookie);
}

/**
 * ★★★ 運営が、店舗様の代わりに「説明への同意」を入れようとしているか。
 *   isOwner … ログインしている人が、その店の持ち主か（運営が自分の店を触るときは true）
 *   newlyAgreed … この保存で、新しく同意を記録することになるか（はじめての登録・版が変わったあとの取り直し）
 */
export function operatorConsentBlocked(input: { isOwner: boolean; newlyAgreed: boolean }): boolean {
  return input.isOwner !== true && input.newlyAgreed === true;
}

/** 断るときに画面へ出す文 */
export const OPERATOR_FIRST_CONSENT_MESSAGE =
  'はじめての登録（説明への同意）は、店舗様ご本人のログインでお願いします。運営では、同意済みの枠のID・パスワードの変更だけできます。';

/** 運営として操作中は、まだ使えない画面に出す文（お知らせ・フクエスの上位表示・写真のアップロード） */
export const OPERATOR_NOT_YET_MESSAGE =
  '運営として操作しているときは、まだ使えません（フクエスお知らせ・フクエスの上位表示・写真のアップロード）。';

/** 店を選ぶ一覧の1行の説明（切り替え済みか・契約があるか） */
export function operatorSalonNote(s: { switched: boolean; contract: boolean; hidden: boolean }): string {
  const parts = [s.switched ? '切り替え済み' : '切り替え前', s.contract ? '契約あり' : '契約なし'];
  if (s.hidden) parts.push('非表示');
  return parts.join('・');
}
