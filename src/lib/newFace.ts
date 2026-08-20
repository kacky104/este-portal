// 新人マーク（NEWバッジ）の表示判定。
// is_new_face = true かつ new_face_since から 60 日以内のときだけ true を返す。
//
// ★★ 新人期間の正はこの NEW_FACE_WINDOW_DAYS ただ1つ。
//   NEWバッジ・トップの新人枠・/therapist/new の一覧は【すべてこの関数】を通しているので、
//   期間を変えるときはここの数字だけを直すこと（判定を各画面に書き足さない）。
//   ★ ただし【画面に出る説明文】は別。数字を変えたら次の2か所も必ず直す:
//     ・/therapist/new のリード文「入店から◯ヶ月以内の…」（app/therapist/new/page.tsx）
//     ・/mypage「新人マークを付ける」の注記「（◯日間表示）」（app/mypage/page.tsx）
//   ★ 判定は new_face_since からの経過【時間】で見るので、DBの保存は不要
//     （期間を延ばすと、過去にNEWが切れた子でも 60 日以内ならその場で復活する）。
//
// 2026-08-19（第25便・オーナー要望）: 30日 → 60日（2ヶ月）に変更。
const NEW_FACE_WINDOW_DAYS = 60;
const NEW_FACE_WINDOW_MS = NEW_FACE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

export function isNewFaceActive(
  isNew: boolean | null | undefined,
  since: string | null | undefined
): boolean {
  if (!isNew || !since) return false;
  const sinceTime = new Date(since).getTime();
  if (Number.isNaN(sinceTime)) return false;
  return Date.now() - sinceTime <= NEW_FACE_WINDOW_MS;
}
