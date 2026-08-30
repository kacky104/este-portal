// 媒体連携を画面に出すかどうか（第54便・純粋関数）。
//
// ★★★ なぜ要るか（2026-08-29・カッキーさん）
//   他社（いま店舗が使っている転送サービス）の担当者が、店舗のマイページを覗きに来る。
//   ★ 媒体連携タブを開かれると、フクエスが駅ちかへの書き込みを作っていることが一目で分かる。
//     ・駅ちかのログイン情報を預かっている
//     ・「フクエスから駅ちかへ反映する」向きの切り替えと、その差分の表
//     ・写メ日記の投稿先／名簿の突き合わせ／駅ちか管理画面へのログイン履歴
//   ★★ いちばん重い危険は競合対応ではなく、**駅ちかに伝わって止められること**。
//     フクエスの媒体連携は全部そこに乗っている。
//
// ★★★ なぜ「もう一つパスワード」にしなかったか
//   覗きに来る人は【店舗の隣にいる】。店舗が目の前で入力すれば見られるし、
//   「これ何のパスワード？」と聞かれる。★ 隠していること自体が伝わる。
//   → **入力する場面を作らない**形にする。
//
// ★★★ ②は【鍵ではなく目隠し】。正直に書いておく。
//   URLに ?media=1 を付けて開いたブラウザにだけ出す。URLを知っていれば誰でも開ける。
//   ★ 秘密の値をJSに埋め込む（NEXT_PUBLIC_…）ほうが、鍵のふりをするぶん危ない。
//     公開バンドルに入るので、見る人が見れば分かる。★ 偽の鍵を作らない。
//   ★ 守りたいのは「肩越しに覗かれること」なので、これで足りる。
//   ★★ 秘密を守る仕組みではないので、**認可の代わりに使わないこと。**
//     server action 側は従来どおりオーナー検証をしている（assertSalonOwner）。
//     ここは【表示の出し分け】だけ。

/** URL に付ける名前。?media=1 で出す、?media=0 で消す。 */
export const MEDIA_UNLOCK_PARAM = 'media';
/** そのブラウザに覚えておく場所。 */
export const MEDIA_UNLOCK_KEY = 'fukues.media.visible';

export type MediaVisibilityInput = {
  /** この店舗の owner_id */
  ownerId: string | null | undefined;
  /** 運営アカウントの UID（src/app/lib/admin.ts の ADMIN_UUID） */
  adminUuid: string;
  /** そのブラウザで目隠しを外してあるか */
  unlocked: boolean;
};

/**
 * 媒体連携を出してよいか。
 *
 * ★ 出す条件は2つ。どちらかで足りる:
 *   ① 店舗の持ち主が運営アカウント … ★ 本筋。テスト店舗はこれで足りる
 *   ② そのブラウザで目隠しを外してある … ★ 当面の逃げ道
 *
 * ★ 既定は【出さない】。★ 分からないときは出さない側に倒す
 *   （mediaLinkMode の hasApprovedOnce と同じ「分からないときは危なくない側」）。
 */
export function canSeeMedia(input: MediaVisibilityInput): boolean {
  if (input.unlocked === true) return true;
  const owner = input.ownerId;
  if (typeof owner !== 'string' || owner.length === 0) return false;
  if (typeof input.adminUuid !== 'string' || input.adminUuid.length === 0) return false;
  return owner === input.adminUuid;
}

/**
 * URL のクエリ文字列から、目隠しをどうするかを読む。
 * ★ 3値。★ 「指定なし」と「消す」を分ける（指定なしで勝手に消さない）。
 */
export function readUnlockIntent(search: string): 'on' | 'off' | 'none' {
  const s = String(search ?? '');
  const q = new URLSearchParams(s.startsWith('?') ? s.slice(1) : s);
  if (!q.has(MEDIA_UNLOCK_PARAM)) return 'none';
  const v = (q.get(MEDIA_UNLOCK_PARAM) ?? '').trim().toLowerCase();
  // ★ 消すのは、はっきり消すと書いたときだけ
  if (v === '0' || v === 'off' || v === 'false') return 'off';
  return 'on';
}

/**
 * ページとして開いたときの入口の判定（第55便・㉜）。★ 3値。
 *
 * ★★★ なぜ canSeeMedia をそのまま使わないか
 *   ページ単位にすると「出さない＝別の場所へ戻す」になる。
 *   ★ 読み込みが終わる前の値は【まだ分からない】であって【出さない】ではない。
 *     userId も目隠しも、読み終わるまでは false 相当に見えるので、
 *     そのまま canSeeMedia に渡すと **正しい持ち主が毎回 /mypage へ弾かれる。**
 *   → 'wait' が「まだ分からない」を受け持つ。★ 描かないが、戻しもしない。
 *
 * ★ 倒れる向きは第54便と同じ。分からないときは【描かない】側に倒す。
 *   ★ ただし「描かない」と「戻す」は別。分からないうちは戻さない。
 */
export type MediaPageDecision = 'wait' | 'show' | 'leave';

export function decideMediaPage(input: MediaVisibilityInput & { ready: boolean }): MediaPageDecision {
  // ★ ready は真偽値のみ。★ 'false' のような文字列で通さない（canSeeMedia の unlocked と同じ扱い）
  if (input.ready !== true) return 'wait';
  return canSeeMedia(input) ? 'show' : 'leave';
}
