// 駅ちかへの中継フロー・純粋関数（第41便）。
//
// ★★★ このファイルは通信もDBも触らない。「いまの応答を見て、次に何をするか」だけを決める。
//   DBへ書く・ジョブを積むのは src/app/lib/media/relayFlow.ts。
//   ★ 分けている理由は mediaAudit.ts と同じ:
//     **テストできる形にしておかないと、判断の根拠が1つも無くなる。**
//
// ★★★ この便の射程（第41便）
//   login → read_work まで。**駅ちかを一切書き換えない。**
//   だから実弾を何度流しても店舗に影響が無く、/mypage の接続テストがそのまま本番経路になる。
//   write_work / verify_work は「積む材料（フクエスの出勤→WorkChange[]）」がまだ無いので積まない。
//
// ★★★ いちばん大事な設計判断 —— ログインの成否を【ログインの応答では判定しない】
//   駅ちかのログインは CAPTCHA もトークンも無い素の POST（設計メモ §17-9）。
//   だが「302 が返ったこと」と「ログインできたこと」は別の話で、
//   失敗時の応答の形（200でフォーム再表示か、302で/admin/loginへ戻すか）は**実機で未確認**。
//   → 推測で判定を書くと、間違えたときに「ログインできたつもり」の監査ログが残る。
//   → **次の段（GET /admin/girlswork/）が読めたかどうかを、ログインの成否そのものとする。**
//     読めた ＝ ログインできた。ログイン画面が返った ＝ ログインできなかった。
//     ★ この形なら、駅ちかの失敗時の応答が何であっても判定を間違えない。
//
// ★★ 失敗しても【積み直さない】。
//   completeRelayJob の attempts は「通信が届かなかった」ための再送であって、
//   ログイン失敗の再送ではない。ID/PWが違うまま3回投げると相手のアカウントが凍る（設計メモ §17-1）。
//   → ここが 'stop' を返したら、そのフローは終わり。人が直すまで再開しない。

import {
  parseWorkPage,
  checkWorkPage,
  encodePayload,
  buildPayload,
  assertWithinInputVars,
  decodeGirlWork,
  verifyAfterWrite,
  type GirlWork,
  type WorkPage,
} from './ekichikaWorkParse';
import { parseEkichikaGirls, girlsPageUsable, type EkichikaGirlsPage } from './ekichikaGirlsParse';
// ★★ 名前の突き合わせは【1か所】。★ ここで自前の正規化を書かない（読みが同じでも別文字は別人）
import { normalizeName } from './mediaMatch';
import { parseEkichikaSokuhime, sokuhimePageUsable, sokuhimeUsed, type EkichikaSokuhimePage } from './ekichikaSokuhimeParse';
import { parseEkichikaMailList, mailListUsable, type EkichikaMailListPage } from './ekichikaMailListParse';
// ★ 写メ日記（第94便）。★ 駅ちかの既存の段には一切触れず、段名を分けて足す
import {
  parseEkichikaDiaryList,
  parseEkichikaDiaryDetail,
  diaryListUsable,
  diaryDetailUsable,
  type EkichikaDiaryListPage,
  type EkichikaDiaryDetail,
} from './ekichikaDiaryParse';
import { mergeCookies } from './relayJob';
// ★ 送る内容の形。★ 型だけ借りる（実体は esutamaRequests。★ 実行時の依存は増やさない）
import type { EsutamaCastCreateValues } from './esutamaRequests';
// ★ 駅ちかの登録（第234便）。★ 読み手と組み立ては ekichikaGirlCreate が持つ
import {
  parseEkichikaGirlForm, buildEkichikaGirlFormRequest, buildEkichikaGirlCreateRequest,
  readEkichikaMessage, describeEkichikaResponse, EKICHIKA_GIRL_CREATE_URL,
  type EkichikaGirlCreateValues,
} from './ekichikaGirlCreate';
import { RELAY_USER_AGENT } from './relayUserAgent';
// ★ 写真の送信（第107便）。★ 既存の段には触れず、段名を分けて足す
import {
  parsePhotoPage,
  parsePhotoJson,
  buildUploadFields,
  buildMainCropFields,
  buildThumbCropFields,
  centeredMainCrop,
  ekichikaGirlEditUrl,
  isPhotoSlot,
  THUMB_DEFAULT_RECT,
  EKICHIKA_PHOTO_UPLOAD_URL,
  EKICHIKA_PHOTO_CROP_URL,
  type Rect,
} from './ekichikaPhoto';
import { relayFileUrl, type RelayMultipart } from './relayMultipart';
// ★ エステラブ（第78便）。★ 駅ちかの段には一切触れず、別の段名で足す
import { buildEsuloveTherapistListRequest, judgeEsuloveLogin, ESULOVE_THERAPIST_URL } from './esuloveRequests';
// ★ 駅ちかの新着情報の段（第155便）。★ 段名で分けているので既存の判定に触らない
import {
  afterArticleList, afterArticleRead, afterArticleSave, afterArticleVerify,
  buildArticleListStep, afterArticleImage, afterArticleCrop,
} from './articleFlow';
import type { EkichikaArticleRow } from './ekichikaArticle';
import { parseEsuloveTherapists, duplicateNames, type EsuloveTherapistRow } from './esuloveTherapistParse';
// ★ エステ魂の段（第109便）。★ 段の中身は esutamaFlow.ts に置き、ここは振り分けだけ
import {
  afterEsutamaLoginPage, afterEsutamaLogin, afterEsutamaRoster,
  afterEsutamaWorkRead, afterEsutamaWorkSave, afterEsutamaWorkVerify,
  // ★ セラピスト設定の段（第229便）。★ 非表示にする道だけが通る
  afterEsutamaCastList, afterEsutamaCastHide,
  // ★ セラピストの新規登録の段（第232便）
  afterEsutamaCastForm, afterEsutamaCastCreate,
} from './esutamaFlow';
// ★ エステ魂へ写真を送る段（第243便）。★ 既存の段には触れていない
import {
  afterEsutamaPhotoForm, afterEsutamaPhotoTmp, afterEsutamaPhotoSave,
} from './esutamaPhotoFlow';
// ★★★ エステ魂の写メ日記（第130便で書いた段を、第133便で advanceFlow に繋いだ）。
//   ★ 130便では書いただけで【一度も呼ばれていなかった】。★ 繋いで初めて動く
import {
  afterEsutamaTherapistList, afterEsutamaDiaryToken, afterEsutamaDiaryProxy,
  afterEsutamaDiaryPage, afterEsutamaDiaryPost, afterEsutamaDiaryEnd,
} from './esutamaDiaryFlow';
// ★ 即セラの段（第143便）
import {
  afterEsutamaSokuseraToken, afterEsutamaSokuseraProxy, afterEsutamaSokuseraPage,
  afterEsutamaSokuseraStart, afterEsutamaSokuseraVerify, afterEsutamaSokuseraEnd,
} from './esutamaSokuseraFlow';
import type { EsutamaPerson } from './esutamaPlan';
import type { EsutamaRosterRow } from './esutamaParse';
import type { AuditDetail, MediaAuditEvent, MediaAuditOutcome } from './mediaAudit';

/** 駅ちかのログインフォーム（設計メモ §17-9・2026-08-27 実測）。 */
export const EKICHIKA_LOGIN_URL = 'https://ranking-deli.jp/admin/login';
/** 出勤管理。★ 末尾の番号なしが一覧、番号つきが更新用の action（§17-2） */
export const EKICHIKA_WORK_URL = 'https://ranking-deli.jp/admin/girlswork/';
/** 女の子一覧（管理画面）。★ 読むだけ。ここから castId と名前が取れる（第50便） */
export const EKICHIKA_GIRLS_URL = 'https://ranking-deli.jp/admin/girls/';
/** ★ 即ヒメ設定画面（第213便）。★ 読むだけ */
export const EKICHIKA_SOKUHIME_URL = 'https://ranking-deli.jp/admin/sokuiku/';
/** ★ 即ヒメの ajax 3本（第214便・girls.js から実測）。★ CSRF トークンは無い（セッション Cookie だけ） */
export const EKICHIKA_SOKUHIME_CHECK_URL = 'https://ranking-deli.jp/admin/ajaxgirlinfo/create.json';
export const EKICHIKA_SOKUHIME_SET_URL = 'https://ranking-deli.jp/admin/ajaxgirlinforegist/create.json';
export const EKICHIKA_SOKUHIME_DEL_URL = 'https://ranking-deli.jp/admin/ajaxgirlinfodel/create.json';
/** 投稿用メールアドレス一覧（管理画面）。★ 読むだけ。写メ日記の転送先がここに載る（第53便） */
export const EKICHIKA_MAILLIST_URL = 'https://ranking-deli.jp/admin/maillist/';

/**
 * 写メ日記の一覧（第94便・2026-09-01 実測）。
 * ★ ページ送りは `/admin/maildiary/2`、`/3` …（★ 末尾のスラッシュは付かない形で出ている）
 */
export const EKICHIKA_DIARY_LIST_URL = 'https://ranking-deli.jp/admin/maildiary/';

/** 一覧のNページ目。★ 1ページ目は番号を付けない（別のURLにしない）。 */
export function ekichikaDiaryListUrl(pageNumber: number): string {
  const n = Math.floor(Number(pageNumber));
  if (!Number.isFinite(n) || n <= 1) return EKICHIKA_DIARY_LIST_URL;
  return EKICHIKA_DIARY_LIST_URL + String(n);
}

/**
 * 写メ日記1件の編集ページ。★ **読むだけ**。ここへ POST は投げない。
 * ★ 日記IDは相手から受け取った値。★ 数字以外が来たら組み立てない（URLを作らせない）。
 */
export function ekichikaDiaryDetailUrl(diaryId: string): string {
  const id = String(diaryId ?? '');
  if (!/^\d+$/.test(id)) throw new Error('日記IDが数字ではない: ' + id);
  return EKICHIKA_DIARY_LIST_URL + 'edit/' + id + '/';
}
export const EKICHIKA_ORIGIN = 'https://ranking-deli.jp';

/**
 * relay-selftest と同じものを使う。★ 片方だけ変えない。
 * ★ 実体は relayUserAgent.ts（第78便）。★ ここからも今までどおり import できるよう再エクスポートする。
 *   ★ 移した理由: esuloveRequests.ts がこれを使うので、ここに置くと循環参照になる。
 */
export { RELAY_USER_AGENT } from './relayUserAgent';

/** フロー文脈の版。★ 形を変えるときは上げる。走っている途中のジョブは版違いで止まる（黙って壊れない）。 */
// ★ 第46便で文脈の形が変わった（承認の指紋・送った内容を持ち回すため）ので 1 → 2。
//   走っている途中のジョブは版違いで止まる。**黙って古い形のまま進めない。**
export const RELAY_FLOW_VERSION = 2;

/**
 * このフローが何をしに来たか。
 * ★ 増やすときは advanceFlow の switch がコンパイルエラーになる（末尾の never で見張っている）。
 */
export type RelayFlowIntent =
  /** ログイン＋出勤の読み取りまで。★ 駅ちかを書き換えない */
  | 'connect_test'
  /**
   * ★★★ 試し打ち（第43便）。読んだうえで「送るとこうなる」を組み立てて終わる。
   *   ★ **送らない。** 設計メモ §11-3「切り替え直後の1回目は必ず試し打ち → 人が承認」。
   */
  | 'work_dryrun'
  /**
   * ★★★ 承認された内容を実際に書く（第46便）。**駅ちかを書き換える唯一の intent。**
   *   login → read_work →（読み直して計画）→ write_work → verify_work
   *   ★ 承認の時点と送る時点で内容が変わっていたら **送らない**（指紋を突き合わせる）。
   */
  | 'work_push'
  /**
   * ★★★ 自動反映（第48便・設計メモ 追記14）。**人が見ずに書く。**
   *   login → read_work →（読み直して計画）→ write_work → verify_work
   *   ★ 指紋は使わない。人が見た内容が存在しないので、照合しても何も検証していない（§53）。
   *   ★★ 代わりに blockers を厳しくする（workPlan の unattended: true / §56）。
   *   ★ 立てられるのは link_mode='write_auto' の枠だけ。それには
   *     【いまの向きになってから1回でも反映が成功していること】が要る（§54）。
   */
  | 'work_auto'
  /**
   * ★★★ 媒体側の名簿を読むだけ（第50便・設計メモ 追記18 §81の1）。
   *   login → read_girls → 終わり。★ **駅ちかへ何も書かない。**
   *   ★ connect_test と同じ「読むだけ」の仲間だが、読む先が違う（出勤ページではなく女の子一覧）。
   *   ★ 向きが write の枠でも使える。取り込みの周とは別に、明示的に1回読むものだから。
   */
  | 'roster_read'
  /**
   * ★★★ 駅ちかの即ヒメ設定画面を読むだけ（第213便・2026-09-08・設計メモ_今すぐを駅ちかの即ヒメへ §4 の1）。
   *   login → read_sokuhime → 終わり。★ **駅ちかへ何も書かない。**
   *   ★ 枠の数（＝上限）・設定中の子・切れる時刻・出勤中の子 を写しに残す。★ 押す側は次の便。
   */
  | 'sokuhime_read'
  /**
   * ★★★ フクエスの「今すぐ」を駅ちかの「即ヒメ」へ（第214便・設計メモ_今すぐを駅ちかの即ヒメへ §2）。
   *   login → read_sokuhime →（DB を読んで計画）→ sokuhime_check → sokuhime_set → read_sokuhime（照合）
   *   ★ 消すとき: → sokuhime_del → read_sokuhime（照合）
   *   ★ 1回のフローで ON にするのは1人だけ（相手のアカウントを触る操作・即セラと同じ）。
   *   ★ sokuhime_push は運営／店舗が1人だけ試す（試し打ちが既定・sokuhimeApply=true で実弾）。sokuhime_auto は周から。
   */
  | 'sokuhime_push'
  | 'sokuhime_auto'
  /**
   * ★★ 投稿用メールアドレスの取り込み（第53便・設計メモ 追記26 §123）。
   *   login → read_maillist → 終わり。★ **駅ちかへは何も書かない。**
   *   ★ 2つに分かれているのは第43便の作法（試し打ち → 本番）:
   *     mail_dryrun … 何件入れるつもりかを数えるだけ。フクエスのDBも書き換えない
   *     mail_apply  … 実際に therapist_diary_forward を更新する
   *   ★ 駅ちかへの通信はどちらも同じ（読むだけ）。違うのはフクエス側を書くかどうか。
   */
  | 'mail_dryrun'
  | 'mail_apply'
  /**
   * ★★★ 写メ日記の取り込み（第94便・設計メモ_写メ日記の取り込みの口）。
   *   login → read_diary_list →（DBを見て開くものを決める）→ read_diary_detail ×N → 終わり。
   *   ★★ **駅ちかへは何も書かない。** 読むだけ。
   *   ★ 新しい口（/api/import/diary）を作らずここに寄せた理由:
   *     管理画面に入る道は中継フローだけ。★ 口を分けると **ログインの段が2系統になる**。
   *     ★ 片方だけ直す日が必ず来る。
   */
  | 'diary_read'
  /**
   * ★★★ 写真の送信（第107便・設計メモ_駅ちかの画像アップロード 追記 A〜E）。
   *   login → read_photo_page → upload_photo → read_photo_page → crop_photo(3:4) → read_photo_page → crop_photo(正方形) → 終わり
   *   ★★ **駅ちかを書き換える intent（work_push / work_auto に次ぐ3つ目）。**
   *   ★ 写真そのものはジョブに載せない。VPS が fukues.com の口から取って multipart で投げる（第106便・案B）。
   *   ★ POST のたびに編集ページを読み直す（★ fuel_csrf_token を毎回そのページから拾う。使い捨てでも壊れない）。
   *   ★ 触るのは【指定した1枠】だけ。★ 枠1（トップ画像）を指定するのは呼び出し側で止める。
   */
  | 'photo_push'
  /**
   * ★★★ エステ魂の写メ日記を送る（第130便・2026-09-04）。
   *   login → therapist一覧 →（DBを見て相手と下書きを決める）→ token発行 → 代理ログイン
   *   → 投稿ページGET(ctk) → 投稿POST → 読み返し → **end_proxy** → 終わり
   *
   * ★★★ **エステ魂を書き換える intent。** ★ しかも【本人のアカウント】から出る。
   *   ★ 日記は上書きではなく【投稿】。★ 二度送ると記事が2本載り、店舗側から消せない。
   *     → 送った印（diary_posts 側）が無いと重複する。★ 積むのは DB 側の責任。
   * ★★ 送るのは【了承あり】かつ【利用中(active)】かつ【名簿が結びついている】人だけ。
   * ★★★ diary_dryrun は【1文字も書かない】。★ 代理ログインもしない（一覧を読んで終わり）。
   */
  | 'diary_dryrun'
  | 'diary_push'
  /**
   * ★★★ 自動で1件だけ送る（第137便・2026-09-05）。
   *   ★ diary_push との違いは【相手をこちらで決めない】こと。
   *     ★ 魂セラピスト一覧を読んだあと、**送れる人の先頭1人**を DB 側が選ぶ。
   *   ★★ それでも **1回のフローで送るのは1件だけ**。★ 「全員に送る」は作らない。
   *   ★ 周（cron）から呼ぶ。★ 送るものが無ければ何もせず終わる。
   */
  | 'diary_auto'
  /**
   * ★★★ 即セラを自動でONにする（第143便・2026-09-05）。
   *   ★ フクエスの「今すぐ」がONの人の、エステ魂の即セラをONにする。
   *   ★★ OFFは打たない（★ 60分で相手が勝手に切る。★ 業界の風習として誰も手動OFFしない）。
   *   ★ sokusera_push は運営が1人だけ試すため。★ sokusera_auto は周から。
   */
  | 'sokusera_push'
  | 'sokusera_auto'
  /**
   * ★★★ 駅ちかの新着情報（ニュース）を1枠だけ書き換える（第155便・2026-09-05）。
   *   login → article_read →（試し打ちならここで終わり）→ article_save → article_verify → 終わり
   *
   * ★★★ **駅ちかを書き換える intent。** ★ work_push / work_auto / photo_push に次ぐもの。
   *   ★★ ニュースは【カテゴリー5枠を上書きする】形。★ 積まない。
   *     ★ だから「二度送ると2本載る」は起きない。★ 代わりに **前の記事が消える**。
   *   ★★★ 触るのは【指定した1枠】だけ。★ 店舗様が選んでいない枠には触らない（設計メモ §9②）。
   *
   * ★ article_dryrun は【1文字も書かない】。★ 編集ページを読んで、送る内容を組み立てて終わる。
   * ★★ 記事ID・画像の識別子は**読んだページのものをそのまま使う**（決め打ちしない）。
   */
  | 'article_dryrun'
  | 'article_push'
  /**
   * ★★★ 枠の状態を読むだけ（第158便）。★ login → article_list → 終わり。
   *   ★ 編集ページも読まない。★ **1文字も書かない。**
   *   ★★ なぜ要るか: 店舗様が登録する【前】に「この枠は非表示です」「この枠はカラです」と言うため。
   *     ★ 2026-09-05 の実弾で、送ってから「公開ページに出ていない」と分かった。★ その順番を逆にする。
   */
  | 'article_slots'
  /**
   * ★★★ 自動で1本出す（第166便）。★ やることは article_push とまったく同じ。
   *   ★ 分けているのは【記録の出し分け】のため。
   *     ★ 自動は1日◯回まわるので、読み取りの行まで出すと「連携の記録」が埋まる（第149便）。
   *     ★★ だから自動のときだけ、読み取りの行をたたむ。★ 送った・載ったは必ず出す。
   */
  | 'article_auto'
  /**
   * ★★★ 駅ちかから1人だけ削除する（第228便・2026-09-09）。
   *   login → read_girls（一覧＋使い捨てトークン）→ girl_delete → read_girls（照合）→ 終わり
   *
   * ★★★ **取り返しがつかない唯一の intent。** ★ 消したものは戻らない。
   *   ★ だから作法を3つ重ねてある:
   *     ① 消す相手は **castId で1人だけ**。★ 「まとめて消す」は作らない
   *     ② 押す前に一覧を読み、**その castId が本当に居ることを確かめる**。居なければ何もせず終わる
   *     ③ 押したあと **もう一度一覧を読み、本当に消えたかを照合する**（verify_work と同じ）
   *   ★★ 個別の削除リンク（GET /admin/girls/delete/<castId>）は**使わない**。
   *     ★ 確認ダイアログが無く、開いた瞬間に消える（2026-09-09 実測）。
   *     ★ 代わりに一括削除のフォーム（POST /admin/girls/）を、**1人だけチェックした形**で送る。
   *   ★ 入口は運営だけの口（/api/admin/media-girl-delete）。★ 店舗様の画面にボタンは置かない。
   */
  | 'girl_delete'
  /**
   * ★★★ エステ魂で1人だけ非表示にする（第229便・2026-09-09）。
   *   login → esutama_cast_list（状態＋ctk）→ esutama_cast_hide → esutama_cast_list（照合）→ 終わり
   *
   * ★★ 駅ちかの削除と違い、**取り返しはつく**（「表示する」で戻る）。
   *   ★ それでも作法は同じにそろえる:
   *     ① 相手は **cast_id で1人だけ**。★ 「まとめて非表示」は作らない
   *     ② 押す前にセラピスト設定を読み、**その cast_id が居ること・まだ表示中であること**を確かめる
   *     ③ 押したあと **もう一度読み直し、本当に disabled が付いたか**を照合する
   *   ★★ 「非表示」と「表示に戻す」は口が別（cast_disabled / cast_enable・2026-09-09 実測）。
   *     ★ この intent は **非表示にする側だけ**。★ 戻す側は作っていない（戻すのは店舗様の画面から）。
   *   ★ 入口は運営だけの口（/api/admin/media-cast-hide）。★ 店舗様の画面にボタンは置かない。
   */
  | 'cast_hide'
  /**
   * ★★★ エステ魂にセラピストを1人 登録する（第232便・2026-09-09）。
   *   login → esutama_cast_list（もう居ないか＋いまの顔ぶれ）→ esutama_cast_form（65部品を読む）
   *        → esutama_cast_create → esutama_cast_list（照合＋cast_id 回収）→ 終わり
   *
   * ★★★ **相手に人を増やす唯一の intent。** ★ 作法:
   *   ① 送る前に一覧を読み、**同じ名前がもう居ないか**を確かめる（居たら作らない＝二重掲載を作らない）
   *   ② そのとき **いまの cast_id を全部控える**。★ 照合で「増えた1人」を特定する物差しになる
   *   ③ 追加フォームを**毎回読み**、名前・特徴・年齢・サイズだけ差し替えて返す（★ 決め打ちしない）
   *   ④ 押したあと **もう一度読み直し、本当に増えたか**を照合する
   *   ★★ `set_up_limit`（保存と同時に上位表示・残り回数あり）は**絶対に送らない**（読み手と組み立ての二重の見張り）。
   *   ★ 写真は送らない（相手の file 欄に name が無く、送り方が未調査・第231便）。
   *   ★ 入口は運営だけの口（/api/admin/media-cast-create）。★ 店舗様の画面にボタンは置かない。
   */
  | 'cast_create'
  /**
   * ★★★ 駅ちかにセラピストを1人 登録する（第234便・2026-09-09）。
   *   login → read_girls（もう居ないか＋いまの顔ぶれ）→ girl_create_form（110部品を読む）
   *        → girl_create → read_girls（照合＋castId 回収）→ 終わり
   *
   * ★★★ **相手に人を増やす。** ★ 作法は cast_create（エステ魂）とそろえてある:
   *   ① 送る前に一覧を読み、**同じ名前がもう居ないか**を確かめる（居たら作らない）
   *   ② そのとき **いまの castId を全部控える**。★ 照合で「増えた1人」を番号の差で特定する
   *   ③ 登録フォームを**毎回読み**、名前・ジャンル・年齢・サイズだけ差し替えて返す
   *   ④ 押したあと **もう一度読み直し、本当に増えたか**を照合する
   *     ★★ 保存すると `/admin/girls/edit/<castId>` へ飛ぶが、**そこから castId を取らない**（§2-4）。
   *   ★ `rookie_flg=1` を混ぜる（★ 画面に欄が無いが通る・§2-7b 実弾で確認）。
   *   ★ 優先タグ（p_genre）は送らない。★ 写真は登録フォームに欄が無いので別の口（第107便）。
   *   ★ 入口は運営だけの口（/api/admin/media-girl-create）。★ 店舗様の画面にボタンは置かない。
   */
  | 'girl_create'
  /**
   * ★★★ エステ魂のセラピストに写真を1枚 送る（第243便・2026-09-10）。
   *   login → esutama_photo_form（枠の状態と ctk を読む）→ esutama_photo_tmp（仮置きへ multipart）
   *        → esutama_photo_form（新しい ctk と65部品を取り直す）→ esutama_photo_save
   *        → esutama_photo_form（照合）→ 終わり
   *
   * ★★★★★ **2段構え。** ★ 仮置きへ上げただけでは写真は付かない（設計メモ §25-1・実測）。
   *   ★ 仮置きの hidden は JS が画面に差し込むだけで、サーバは覚えていない
   *     （★ 実測: 仮置きのあと F5 で消えた）。★ だから**こちらが持ち回して保存に足す。**
   *
   * ★★★ 作法:
   *   ① 送る前に編集ページを読み、**空き枠**を画面から決める（★ 枠の番号を決め打ちしない）
   *   ② 寸法は取りに来た口で 357×556 に合わせてもらう（第241便・★ 相手のブラウザと同じ形）
   *   ③ 保存は**読んだ65部品をそのまま返し**、写真の1組だけ足す（★ ほかの値に触らない）
   *   ④ 押したあと **もう一度読み直し、その枠が saved になったか**を照合する
   *   ★★ **空き枠にだけ送る**（駅ちか第107便と同じ）。★ 店舗様の写真を上書きしない
   *   ★ 入口は運営だけの口（/api/admin/esutama-photo-push）。★ 店舗様の画面にボタンは置かない。
   */
  | 'cast_photo';

/**
 * 段と段のあいだで持ち回す状態。
 * ★★ cookie は【秘密】。この型のまま平文でDBに置かないこと（context_enc に暗号化して入れる）。
 */
export type RelayFlowContext = {
  v: number;
  /** 同じフローの段を束ねる。監査ログに出して、店舗の画面で1回の処理として読めるようにする */
  flowId: string;
  intent: RelayFlowIntent;
  /** ここまでに畳んだ Cookie（name=value; name=value）。★ 秘密 */
  cookie: string;
  /** ISO文字列。フローが長引いたときに気づくため */
  startedAt: string;

  // ── ここから下は intent='work_push' のときだけ入る（第46便）──
  /**
   * ★★★ 人が画面で見て承認した計画の指紋（workPlan.planFingerprint）。
   *   送る直前に読み直して作った計画の指紋と比べ、**違ったら送らない。**
   *   ★ 指紋だけを持つので文脈が太らない。
   */
  approvedFingerprint?: string;
  /** ★ 送った内容（encodeGirlWork の詰めた文字列）。verify_work で照合するのに要る */
  sentPacked?: string;
  /** 送った人数。★ 切り捨て（max_input_vars）の主症状はここに出る */
  sentCount?: number;
  /** 送信前の日付見出し。送信の前後で日がずれていないかを見る */
  expectedDateLabels?: string[];
  /** 変更した件数（監査ログの文面に使う） */
  changeCount?: number;

  // ── ここから下は intent='article_*' のときだけ入る（第155便）──
  /**
   * 書き換える枠（1〜5）。★ **1つだけ。** ★ 店舗様が選んでいない枠には触らない。
   */
  articleSlot?: number;
  /** 送るタイトル。★ 検査は ekichikaArticle.checkArticleTitle が持つ */
  articleTitle?: string;
  /** 送る本文（HTML） */
  articleBody?: string;
  /** 誰の紹介か（駅ちかの girl_id）。★ 入れなければ読んだページの選択のまま */
  articleGirlId?: string;
  /** 画像をどうするか。'keep'（既定）＝読んだページのまま ／ 'girl'＝女の子の写真を使う */
  articleImage?: 'keep' | 'girl' | 'upload';
  /**
   * ★★★ フクエスから送る画像の在処（第162便）。★ 画像そのものは通さない（第106便・案B）。
   *   ★ VPS が fukues.com の口へ取りに行く。★ width/height は実寸（★ 切り抜きの物差し）
   */
  articleFile?: {
    bucket: string; path: string; filename: string; contentType: string; width: number; height: number;
    /**
     * ★★★ 取りに来た口で JPEG へ直してもらう（第165便）。
     *   ★ 駅ちかの記事の画像は JPEG のみ（実測）。★ 元が PNG のときだけ立てる。
     *   ★ 元の写真は触らない。★ 直すのはこの1回ぶんだけ
     */
    as?: 'jpeg';
  };
  /** ★ 編集ページから拾った値（第161便）。★ ①②に要る */
  articleCsrf?: string;

  // ── ここから下は intent='girl_delete' のときだけ入る（第228便）──
  /** ★★★ 消す相手（駅ちかの castId）。★ **1人だけ。** ★ 空なら何もせず終わる */
  deleteCastId?: string;
  /** 段。undefined＝これから消す ／ 'verify'＝消したあとの照合 */
  deleteStage?: 'verify';
  /** 消す前に一覧で確かめた表示名（★ 記録に残して「誰を消したか」が後から読めるように） */
  deleteName?: string;
  /** 消す前の在籍人数（★ 照合で「1人だけ減ったか」を見る） */
  deleteBefore?: number;

  // ── ここから下は intent='cast_hide' のときだけ入る（第229便）──
  /** ★★★ 非表示にする相手（エステ魂の cast_id）。★ **1人だけ。** ★ 空なら何もせず終わる */
  hideCastId?: string;
  /** 段。undefined＝これから非表示にする ／ 'verify'＝押したあとの照合 */
  hideStage?: 'verify';
  /** 押す前に一覧で確かめた表示名（★ 記録に残して「誰を非表示にしたか」が後から読めるように） */
  hideName?: string;

  // ── ここから下は intent='cast_create' のときだけ入る（第232便）──
  /** ★ フクエス側のセラピストID。★ 登録できたあと、番号を結びつける相手 */
  createTherapistId?: number;
  /** ★★★ 送る内容。★ DB を読むのは呼び出し側の仕事（このファイルは DB を知らない） */
  createValues?: EsutamaCastCreateValues;
  /** 段。undefined＝これから登録する ／ 'verify'＝送ったあとの照合 */
  createStage?: 'verify';
  /** ★★★ 送る前に居た cast_id ぜんぶ。★ 「増えた1人」を名前ではなく**番号の差**で特定する */
  createBeforeIds?: string[];

  // ── ここから下は intent='girl_create' のときだけ入る（第234便）──
  /** ★★★ 駅ちかへ送る内容。★ DB を読むのは呼び出し側の仕事 */
  createGirlValues?: EkichikaGirlCreateValues;
  /**
   * ★★★★ 送り先の決め方（第235便・設計メモ §17-8）。
   *   'action'（既定）… **読んだフォームの action** へ送る（★ 動いている出勤と同じ作法）
   *   'fixed'        … これまでどおり決め打ちの URL（★ 切り分け用に残してある）
   */
  createPostTo?: 'action' | 'fixed';
  /**
   * ★★★ `rookie_flg=1` を混ぜるか（既定 true）。
   *   ★ §2-7b は1回だけの確認。★ 疑うときに**コードを直さずに**外せるようにした。
   */
  createRookie?: boolean;
  /**
   * ★★★★ **実際に送った中身**（第235便）。★ 記録に残すためだけに持ち回す。
   *   ★ 設計メモ §17-5「ブラウザの全文とこちらの全文を1組ずつ突き合わせる」を、
   *     実弾のたびにコードを直さなくてもできるようにするため。
   *   ★ 2026-09-09 は送った本文がどこにも残っておらず、失敗のたびに推測になった。
   */
  createSent?: { url: string; sentTo: string; formAction: string | null; rookie: boolean; pairs: number; body: string };
  /** ★★★ 削除で実際に送った中身（第235便）。★ 記録のためだけ */
  deleteSent?: { url: string; sentTo: string; formAction: string | null; body: string };

  // ── ここから下は intent='cast_photo' のときだけ入る（第243便）──
  /** ★★★ 写真を送る相手（エステ魂の cast_id）。★ **1人だけ。** ★ 空なら何もせず終わる */
  castPhotoCastId?: string;
  /** ★ フクエス側のセラピストID。★ 記録に残すためだけ（★ 判断には使わない） */
  castPhotoTherapistId?: number;
  /**
   * ★★★ 送る写真の在処。★ 画像そのものはジョブに載せない（第106便・案B）。
   *   ★ VPS が fukues.com の取り出し口から取りに行く。★ 寸法もその口で合わせる（第241便）
   */
  castPhotoFile?: { bucket: string; path: string };
  /** ★ 枠を指名したいとき（1〜6）。★ 入っていなければ**空き枠を画面から選ぶ** */
  castPhotoSlotWanted?: number;
  /**
   * ★★★★★ 既に写真がある枠へ送るか。★ 既定は **送らない**。
   *   ★ 店舗様の写真を上書きしないための止め（駅ちか第107便と同じ決め）
   */
  castPhotoReplace?: boolean;
  /** 段。undefined＝枠を選ぶ ／ 'save'＝保存する ／ 'verify'＝照合する */
  castPhotoStage?: 'save' | 'verify';
  /** ★ 実際に送った枠（★ 照合で見るのはこの番号） */
  castPhotoSlot?: number;
  /** ★★★ 仮置きの結果。★ **保存に足すのはこの1組**（★ 読み直しても付いてこない） */
  castPhotoTmp?: { field: string; value: string; slot: number };
  /** ★ 仮置きの応答の正体。★ 記録のためだけ（第236便の作法） */
  castPhotoNote?: string;
  /**
   * ★★★★ 書き込みの応答に出ていた画面のメッセージ（第234便の修正）。
   *   ★ 設計メモ §2-6「**書き込みのあとは必ず画面のメッセージを読むこと**」。
   *   ★★ **記録のためだけに持ち回す。** ★ 成否の判定には使わない（判定は読み直しての照合）。
   */
  createMessage?: string;
  /**
   * ★★★★ 書き込みの応答の正体（HTTPの番号・題・差し戻しかどうか）。★ 記録のためだけ。
   *   ★ 2026-09-09 の実弾で「届いたが登録されない・メッセージも無い」に当たり、
   *     そこから先が推測になったので足した。
   */
  createDiag?: string;
  articleShopId?: string;
  /** ★ ①article_image.json が返した識別子 */
  articleImgB?: string;
  /**
   * ★ ②article_crop.json が返した識別子。
   * ★★★ **これが入っていることが「もう上げ終わった」の印**（★ 編集ページを読み直しても二度上げない）
   */
  articleImgS?: string;
  /**
   * ★★★ 送ったタイトル。★ **読み返しで突き合わせるために持ち回す。**
   *   ★ 「送った」と「載った」を分けるのに要る（第136便）。
   */
  articleSentTitle?: string;
  /**
   * ★ 相手の言葉のカテゴリー名（速報NEWS・新人速報…）。★ 一覧から拾う。
   *   ★★ 記録に「駅ちかの新人速報」と書くために持ち回す（第156便）。
   */
  articleWhere?: string;
  /**
   * ★★★ その枠が公開ページに出るか（第156便・2026-09-05 に実弾で分かった）。
   *   ★ true / false のときだけ入れる。★ 分からなければ**入れない**（undefined）。
   *   ★★ 非表示の枠に送っても公開ページには出ない。★ そのことを読み返しの記録に必ず出す。
   */
  articleVisible?: boolean;

  // ── ここから下は intent='diary_read' のときだけ入る（第94便）──
  /** いま読みに行っている一覧のページ番号（1始まり）。★ ページ送りで遡るときに使う */
  diaryPage?: number;
  /**
   * これから開く日記の残り。★ 先頭から1件ずつ開く。★ 空になったら終わり。
   * ★★ 投稿日時を一緒に持ち回すのは、**詳細ページに投稿日時が無いから**。
   *   ★ 記録（salon_diary_imports.posted_at）に残すには、一覧で見た値を運ぶしかない。
   */
  diaryQueue?: DiaryQueueItem[];
  /** いま開いている日記の投稿日時（一覧で見た値）。★ 記録に残すために詳細の段まで運ぶ */
  diaryPostedAt?: string | null;
  /** 初回の遡り範囲。★ これより古い投稿は開かない。★ 通常運転では入れない（1ページ目だけ） */
  diarySince?: string | null;
  /** あと何ページ遡ってよいか。★ 暴走の歯止め */
  diaryPagesLeft?: number;
  /**
   * ★★★ いま開きに行っている日記ID。
   *   ★ 応答を読むときに **パーサへ渡して突き合わせる**。★ 別の日記が返っていたら止めるため。
   */
  diaryId?: string;

  // ── ここから下は intent='photo_push' のときだけ入る（第107便）──
  /** 駅ちかの girl_id（= castId） */
  photoGirlId?: string;
  /** 画像の枠（image_set_id 1〜8） */
  photoSlot?: number;
  /** 送る写真の在処（フクエスの Storage）と寸法。★ VPS はここから取る */
  photoFile?: { bucket: string; path: string; filename: string; contentType: string; width: number; height: number };
  /** ②大画像の 3:4 の範囲（実寸）。無ければ中央 */
  photoMainRect?: Rect;
  /** ③サムネイルの正方形（300×400 の空間）。無ければ駅ちかの既定（中央 180×180） */
  photoThumbRect?: Rect;
  /** いまどの段のために編集ページを読みに行っているか */
  photoStage?: 'upload' | 'crop_main' | 'crop_thumb';
  /** 直近の応答の src（①の大画像 → ②の 3:4 → ③のサムネイル） */
  photoSrc?: string;

  // ── ここから下は intent='diary_push' のときだけ入る（第130便・エステ魂）──
  /**
   * ★★★ 送る相手（フクエス側の therapist_id・第133便）。
   *   ★ 運営の口が【1人だけ】指定する。★ 一覧を読んだあと、DB 側がこの人だけを選ぶ。
   *   ★★ 入っていなければ何も送らない（＝ここが実弾の安全装置）。
   */
  esutamaDiaryTherapistId?: number;
  /** 送る相手（エステ魂の cast_id）。★ 数字だけ */
  esutamaDiaryCastId?: string;
  /** ★★★ 送る相手の名前。★ 代理ログイン後に画面と突き合わせる（別人に入っていないか） */
  esutamaDiaryCastName?: string;
  /** フクエス側の日記ID。★ 送った印を書く相手を取り違えないため、最後まで運ぶ */
  esutamaDiaryPostId?: string;
  /** 送る中身。★ 題名と本文とカテゴリ。★ 秘密ではない（店舗様が書いたもの） */
  esutamaDiaryDraft?: { title: string; content: string; categoryId?: string };
  /** 投稿ページで拾った ctk。★ POST を組むまでの間だけ持つ */
  esutamaDiaryCtk?: string;
  /**
   * ★★★ 代理ログインに入ったか。★ true なら【何があっても end_proxy を通す】。
   *   ★ 本人のセッションを残さない。★ 失敗しても、途中で止めても、必ず戻す。
   */
  esutamaProxyOpen?: boolean;
  /** ★ 途中で止めた理由。★ end_proxy を通したあとで stop に落とすために運ぶ */
  esutamaDiaryStopNote?: string;
  /** ★ 投稿の POST が通ったか。★ 「載ったか」は読み返しで確かめる（ここでは決めつけない） */
  esutamaDiaryPosted?: boolean;
  /**
   * ★★★ 投稿の判定（第137便）。★ 印の状態をここから決める。
   *   'sent' … 送れた ／ 'rejected' … 送れていない（★ あとで再挑戦する）
   *   'unknown' … 判定できない（★ 二度と送らない）
   * ★ 入っていなければ【POST まで届かなかった】＝ rejected として扱う（何も送っていない）。
   */
  esutamaDiaryVerdict?: 'sent' | 'rejected' | 'unknown';
  /**
   * ★★★ 送った印（diary_post_sent）を【立てたか】（第133便）。
   *   ★ 印は送る【前】に立てる（消せない相手に二度送らないため）。
   *   ★★ だから **送れずに終わったら消す**。★ この旗が無いと、消してよいか判断できない。
   *   ★ 「指定された diaryId が文脈にある」だけでは足りない（まだ立てていないかもしれない）。
   */
  esutamaDiaryMarked?: boolean;

  // ── ここから下は intent='sokuhime_*' のときだけ入る（第214便）──
  /** 試し打ちか実弾か。★ 既定 false（読んで計画を記録するだけ・駅ちかを触らない） */
  sokuhimeApply?: boolean;
  /** 運営／店舗が1人だけ試すときの相手（フクエス側の therapist_id）。★ auto では入れない */
  sokuhimeTherapistId?: number;
  /** いま何をしているか。★ read_sokuhime の応答をどう扱うかを決める */
  sokuhimeStage?: 'plan' | 'verify_set' | 'verify_del';
  /** 押す相手（計画で決まる） */
  sokuhimeTarget?: { therapistId: number; name: string; castId: string; slotIndex: number; oldGirlId: string | null; oldSokuikuId: string | null; untilUnix: number | null };
  /** 消す相手（計画で決まる） */
  sokuhimeDel?: { castId: string; slotIndex: number; sokuikuId: string | null; expiresAtUnix: number | null };
  /** #hide_shop_id・#preceding_flg・回数（ページから） */
  sokuhimeShopId?: string;
  sokuhimePrecedingFlg?: string;
  sokuhimeRemaining?: number | null;
  /** 相手が返した終了時刻の文字（"HH:MM"）。★ 照合の段で記録に残す */
  sokuhimeToppriorityTime?: string;

  // ── ここから下は intent='sokusera_*' のときだけ入る（第143便）──
  /** 即セラをONにする相手（フクエス側の therapist_id）。★ 周が1人だけ選ぶ */
  esutamaSokuseraTherapistId?: number;
  /** エステ魂の cast_id */
  esutamaSokuseraCastId?: string;
  /** ★★★ 突き合わせに使う名前。★ 【エステ魂側の名前】（第134便の教訓） */
  esutamaSokuseraCastName?: string;
  /**
   * ★★★ 送った「ひとこと呼びかけ」。★ 読み返しで消えていないか見る。
   *   ★ 2026-09-04 に空で送って本人の呼びかけを消した事故がある。
   */
  esutamaSokuseraSentMessage?: string;
  /** ★ 読み返しでONを確かめられたか */
  esutamaSokuseraOn?: boolean;
  /** ★ 途中で止めた理由。★ end_proxy を通したあとで stop に落とすために運ぶ */
  esutamaSokuseraStopNote?: string;

  // ── ここから下は エステ魂（provider='esutama'）のときだけ入る（第109便）──
  /** ログイン画面で拾った csrf。★ ログイン POST を組むまでの間だけ持つ */
  esutamaCsrf?: string;
  /** 送る人と日付ごとの範囲（esutamaPlan.planEsutamaWork の people）。★ 名簿を読んだあと DB 側が入れる */
  esutamaPeople?: EsutamaPerson[];
  /** いま何人目を処理しているか（0始まり） */
  esutamaIndex?: number;
  /** 保存したあと照合で確かめる「変えた日とその見た目」 */
  esutamaExpect?: Array<{ dateISO: string; after: string }>;
  /** 変更があった人数／保存できた人数（done のまとめ用） */
  esutamaChanged?: number;
  esutamaSaved?: number;
  // ── 第110便: 店舗の画面「出勤を送る」に出すための材料 ──
  /** 計画の窓（14日の 'YYYY-MM-DD'）。diff の dayIndex はこの添え字 */
  esutamaWindow?: string[];
  /** ここまでに見つかった「変わるところ」（人ごとに足していく） */
  esutamaDiffs?: EsutamaDiffRow[];
  /** 送らない人の理由（計画の段で決まる） */
  esutamaBlocked?: string[];
  /** 時刻を寄せた等の注記 */
  esutamaNotes?: string[];
  /**
   * ★★ 人が画面で見て承認した内容（castId → その人の変更の鍵）。work_push で店舗が押したときだけ入る。
   *   ★ 読み直した結果がこれと違えば、その人は送らない（駅ちかの指紋と同じ守り・人ごと）。
   *   ★ undefined は「運営の口」（照合しない）。★ 空 {} とは別物
   */
  esutamaApproved?: Record<string, string>;
};

/** 店舗の画面に出す「変わるところ」1行（第110便）。★ media_work_plans.diff と同じ形（girlId=castId） */
export type EsutamaDiffRow = { castId: string; name: string; dayIndex: number; before: string; after: string };

/** エステ魂の流れが終わったときのまとめ（第110便）。DB 側が media_work_plans に書く */
export type EsutamaPlanSummary = {
  /** 'work_dryrun' なら「これから送る内容」、送ったあとなら「送らずに残った内容」 */
  window: string[];
  diffs: EsutamaDiffRow[];
  blocked: string[];
  notes: string[];
  people: number;
  changed: number;
  saved: number;
  /** 人が押して送ってよいか（送らない理由が無く、変更がある） */
  sendable: boolean;
  fingerprint: string;
};

export type FlowAudit = {
  event: MediaAuditEvent;
  outcome: MediaAuditOutcome;
  /** 省略すると defaultAuditSummary が店舗向けの1行を組み立てる */
  summary?: string;
  detail?: AuditDetail;
};

export type FlowNextRequest = {
  purpose:
    | 'read_work' | 'write_work' | 'verify_work' | 'read_girls' | 'read_maillist'
    // ★ 即ヒメ設定画面（第213便）。★ 読むだけ
    | 'read_sokuhime'
    // ★★★ 駅ちかから1人削除する（第228便）。★ 取り返しがつかない
    | 'girl_delete'
    // ★★ 駅ちかにセラピストを1人 登録する（第234便）。★ girl_create だけが相手に人を増やす
    | 'girl_create_form' | 'girl_create'
    // ★★★★ 突き返された先を読んで、赤字をそのまま記録に残す段（第234便の修正5）
    | 'girl_create_msg'
    // ★ 即ヒメを押す／消す（第214便）。★ ajax 3本
    | 'sokuhime_check' | 'sokuhime_set' | 'sokuhime_del'
    // ★ 駅ちかの新着情報（第155便）。★ 名前を分けることで、既存の段の判定に一切触らない
    | 'article_list' | 'article_read' | 'article_save' | 'article_verify'
    // ★ 写メ日記の段（第94便）。★ 読むだけ
    | 'read_diary_list' | 'read_diary_detail'
    // ★ エステラブの段（第78便）。★ 名前を分けることで、駅ちかの段の判定に一切触れない
    | 'esulove_therapists'
    // ★ 写真の段（第107便）。★ upload_photo だけがファイル付き
    | 'read_photo_page' | 'upload_photo' | 'crop_photo'
    // ★ 新着情報の画像（第162便）★ ①上げる → ②切る
    | 'article_image' | 'article_crop'
    // ★ エステ魂の段（第109便）。★ 名前を分けることで、駅ちか・エステラブの段の判定に一切触れない
    | 'esutama_login_page' | 'esutama_login' | 'esutama_roster'
    // ★★ エステ魂のセラピスト設定（第229便）。★ 名簿（出勤）とは別の画面。★ 名前を分けて既存の段に触れない
    | 'esutama_cast_list' | 'esutama_cast_hide'
    // ★★ セラピストの新規登録（第232便）。★ esutama_cast_create だけが相手に人を増やす
    | 'esutama_cast_form' | 'esutama_cast_create'
    // ★★ エステ魂へ写真を送る（第243便）。★ esutama_photo_save だけが相手の設定を書き換える
    | 'esutama_photo_form' | 'esutama_photo_tmp' | 'esutama_photo_save'
    | 'esutama_work_read' | 'esutama_work_save' | 'esutama_work_verify'
    // ★ エステ魂の写メ日記（第130便）。★ 代理ログインを通るので段が多い
    | 'esutama_sokusera_token' | 'esutama_sokusera_proxy' | 'esutama_sokusera_page'
    | 'esutama_sokusera_start' | 'esutama_sokusera_verify' | 'esutama_sokusera_end'
    | 'esutama_therapist_list' | 'esutama_diary_token' | 'esutama_diary_proxy'
    | 'esutama_diary_page' | 'esutama_diary_post' | 'esutama_diary_end';
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body: string;
  /** ★ ファイル付き POST（第106便）。upload_photo のときだけ。★ 付けるときは body を空にする */
  multipart?: RelayMultipart;
  context: RelayFlowContext;
};

export type FlowOutcome =
  | { kind: 'next'; next: FlowNextRequest; audits: FlowAudit[]; note: string }
  | {
      kind: 'done'; audits: FlowAudit[]; note: string;
      /** ★ エステ魂の流れの終わりだけ（第110便） */
      esutamaPlan?: EsutamaPlanSummary;
      /**
       * ★★★ 媒体に1人 登録できた（第232便＝エステ魂／第234便＝駅ちか）。★ **番号を表に書くのは呼び出し側**。
       *   ★ このファイルは DB を知らない。★ 「誰の番号がいくつか」を返すところまでが仕事。
       *   ★★ ここを書き落とすと **次の周でまた同じ人を作る**（二重掲載を自分で作る・禁則269）。
       */
      mediaCreated?: { therapistId: number; castId: string; name: string };
      /**
       * ★★★★★ 媒体からその人が**居なくなった**（第239便＝駅ちかの削除）。
       *   ★ `mediaCreated` の裏返し。★ **結びつき（therapist_media_ids）を外すのは呼び出し側**。
       *   ★ このファイルは DB を知らない。★ 「どの番号が居なくなったか」を返すところまでが仕事。
       *
       * ★★★ 返す条件（★ ここを緩めない）: **一覧を読み直して、その castId がもう居ない**とき。
       *   ★ 書き込みの応答では判定しない（第46便 §35）。
       *
       * ★★ reason … 'deleted'＝こちらが消した ／ 'not_listed'＝行ったらもう居なかった
       *   ★ 後者も外す。★ 2026-09-10 に、手で消された方の結びつきが残って 409 で詰まった。
       */
      mediaRemoved?: { castId: string; name: string | null; reason: 'deleted' | 'not_listed' };
    }
  | { kind: 'stop'; audits: FlowAudit[]; note: string }
  /**
   * ★★★ 読めた。ここから先は【DBを読まないと決められない】（第43便）。
   *   フクエスの出勤は DB にあり、このファイルは DB を触らない約束なので、
   *   ページを持ったまま呼び出し側へ返す。★ 判断そのものは workPlan.ts（これも純粋関数）が持つ。
   *   ★ ここで「次のジョブ」を返さないのが大事: **返さない＝駅ちかへ何も飛ばない。**
   */
  | { kind: 'plan_work'; page: WorkPage; audits: FlowAudit[]; note: string }
  /**
   * ★ 媒体側の名簿を読めた（第50便）。plan_work と同じ理由でここでは保存しない
   *   （このファイルは DB を触らない約束）。呼び出し側が写しを1件だけ上書きで残す。
   *   ★ ここで「次のジョブ」を返さない＝**駅ちかへ何も飛ばない。**
   */
  | { kind: 'roster'; page: EkichikaGirlsPage; audits: FlowAudit[]; note: string }
  /**
   * ★ 即ヒメ設定画面を読めた（第213便）。roster と同じ理由でここでは保存しない。
   *   ★ ここで「次のジョブ」を返さない＝**駅ちかへ何も飛ばない。**
   */
  | { kind: 'sokuhime'; page: EkichikaSokuhimePage; audits: FlowAudit[]; note: string }
  /**
   * ★★★ ニュースの一覧を読めた（第158便）。roster と同じ理由でここでは保存しない。
   *   ★ 呼び出し側が写しを1件だけ上書きで残す。
   * ★★ next を **持つことがある**のがここの特徴:
   *   article_slots  … 読むだけ → next は無い（★ これで終わり）
   *   article_dryrun / article_push … 読んだうえで編集ページへ進む → next がある
   *   ★ どちらも「読めた事実」は同じなので、写すのは同じ場所。
   */
  | {
      kind: 'article_slots';
      /** 一覧から読めた5枠。★ 編集ページの段では入らない（★ 空配列で上書きしないこと） */
      rows?: EkichikaArticleRow[];
      /**
       * ★★★ 選べる女の子（第160便）。★ 編集ページにしか無いので、そちらの段でだけ入る。
       *   ★ undefined は【この段では読んでいない】。★ [] は【読めたが0人】。混ぜない。
       */
      girls?: Array<{ id: string; name: string }>;
      audits: FlowAudit[];
      note: string;
      next?: FlowNextRequest;
    }
  /**
   * ★ 投稿用メールアドレス一覧を読めた（第53便）。roster と同じ理由でここでは保存しない。
   *   ★★ page.rows には【秘密値（アドレス）】が入っている。
   *     ★ 監査ログにも note にも値を出さないこと。件数とドメインだけ。
   */
  | { kind: 'maillist'; page: EkichikaMailListPage; audits: FlowAudit[]; note: string }
  /**
   * ★ 写メ日記の一覧を読めた（第94便）。maillist と同じ理由でここでは保存しない。
   *   ★★★ ここで「次のジョブ」を返さないのが大事。
   *     どの日記を開くかは **salon_diary_imports を読まないと決められない**（§369・§375）。
   *     ★ 判断そのものは ekichikaDiaryParse.selectDiariesToFetch が持っている（純粋関数）。
   */
  | {
      kind: 'diary_list';
      page: EkichikaDiaryListPage;
      /** 何ページ目を読んだか（1始まり）。★ 遡るときに呼び出し側が使う */
      pageNumber: number;
      audits: FlowAudit[];
      note: string;
    }
  /**
   * ★ 写メ日記を1件開いた（第94便）。
   *
   * ★★★ **読めなかったときも、この kind で返す（stop にしない）。**
   *   ★ 1件おかしいだけで、その店の取り込みが永久に止まるのを避けるため。
   *     ★ stop にすると、次の周も同じ日記で止まり、以降ずっと1件も入らなくなる。
   *   ★ 呼び出し側は **必ず diaryDetailUsable(detail) を見ること**。
   *     読めなかったものは `skipped:unreadable` として記録し、§375 のとおり1日1回だけ開き直す。
   *   ★ ログインが切れた・ページの形が変わった等、**全件に効く**failure は stop で返す。
   */
  | {
      kind: 'diary_detail';
      detail: EkichikaDiaryDetail;
      /** 開きに行った日記ID。★ 記録を書く相手を取り違えないため、返り値にも入れる */
      diaryId: string;
      audits: FlowAudit[];
      note: string;
    }
  /**
   * ★ エステラブの名簿を読めた（第78便）。roster と同じ理由でここでは保存しない。
   *   ★ ここで「次のジョブ」を返さない＝**エステラブへ何も飛ばない。**
   *   ★ warnings は必ず呼び出し側が人に見せること（黙って捨てない）。
   */
  | { kind: 'esulove_roster'; rows: EsuloveTherapistRow[]; warnings: string[]; audits: FlowAudit[]; note: string }
  /**
   * ★ エステ魂のログイン画面を読めた（第109便）。★ ログイン POST には認証情報が要るので、ここでは組まない。
   *   DB 側（startRelayFlow と同じ場所）が復号して積む。★ パスワードを文脈に入れない。
   */
  | { kind: 'esutama_login_needed'; csrf: string; context: RelayFlowContext; audits: FlowAudit[]; note: string }
  /**
   * ★ エステ魂の名簿を読めた（第109便）。誰に何を送るかは DB（フクエスの出勤）を読まないと決められない。
   *   DB 側が planEsutamaWork で people を作って文脈に入れ、1人目の出勤表 GET を積む。
   *   ★ connect_test / roster_read のときは次を積まない＝ここで終わり。何も書き換えていない。
   */
  | { kind: 'esutama_roster'; rows: EsutamaRosterRow[]; warnings: string[]; context: RelayFlowContext; audits: FlowAudit[]; note: string }
  /**
   * ★ 魂セラピスト一覧を読めた（第130便）。★ 誰に送るかは DB（了承・名簿の結び・送った印）を
   *   読まないと決められないので、ここでは次を積まない＝**エステ魂へ何も飛ばない。**
   *   ★ rows に入るのは【代理ログインできる人（active）】だけ。
   */
  | {
      kind: 'esutama_therapists';
      rows: Array<{ castId: string; name: string; state: string }>;
      /** ★ 一覧ページで拾った ctk。★ token 発行 POST に要る */
      ctk: string | null;
      context: RelayFlowContext;
      audits: FlowAudit[];
      note: string;
    };

// ────────────────────────── フローの入口（login を組み立てる） ──────────────────────────

export function newFlowContext(input: {
  flowId: string;
  intent: RelayFlowIntent;
  startedAt: string;
}): RelayFlowContext {
  return {
    v: RELAY_FLOW_VERSION,
    flowId: input.flowId,
    intent: input.intent,
    cookie: '',
    startedAt: input.startedAt,
  };
}

/**
 * ★★★ 送信ボタンの value（2026-08-28 実機確認）。
 *   空で送ると「ボタンを押していない」扱いになり、ログイン画面がそのまま返る。
 *   ★ 実際にそれで3回失敗した。**空に戻さないこと。**
 */
export const EKICHIKA_LOGIN_SUBMIT_VALUE = 'ログイン';

/**
 * ログインの POST を組み立てる。
 *
 * ★★★ 2026-08-28 の訂正 — 送るのは【2点】。設計メモ §17-9 の「3点」は誤りだった。
 *   実機のログイン画面を読んだ結果:
 *     <form> の中にあるのは email / password / submit の3つだけ。
 *     ★ `shopid` は hidden で存在するが **<form> の外（body直下）** にあり、
 *       ブラウザは送っていない（値も空）。
 *   ★ 誤りの原因: HTML を検索して `name="shopid"` を見つけただけで
 *     「フォームの項目」と判断した。**送られるかどうかは form の中にあるかで決まる。**
 *   → こちらが余計に shopid を送っていた。ブラウザと同じものだけ送る。
 *
 * ★ shopId は引数に残してあるが**送らない**（DBには保管し続ける。画面に出して
 *   「どのアカウントを登録したか」を店舗が確かめるために使う）。
 */
export function buildLoginRequest(cred: {
  shopId?: string;
  loginId: string;
  password: string;
}): { method: 'POST'; url: string; headers: Record<string, string>; body: string } {
  if (!cred.loginId || !cred.password) {
    throw new Error('ログインに要る2点（ログインID / パスワード）のどちらかが空');
  }
  // ★ 並びもブラウザと同じにする（email → password → submit）
  const body = encodePayload([
    ['email', cred.loginId],
    ['password', cred.password],
    ['submit', EKICHIKA_LOGIN_SUBMIT_VALUE],
  ]);
  return {
    method: 'POST',
    url: EKICHIKA_LOGIN_URL,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      referer: EKICHIKA_LOGIN_URL,
      origin: EKICHIKA_ORIGIN,
    },
    body,
  };
}

/** 出勤ページを読む GET。★ 読むだけ。ここまでは何も書き換えない。 */
export function buildReadWorkRequest(cookie: string): FlowNextRequest['headers'] {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    referer: EKICHIKA_LOGIN_URL,
    cookie,
  };
}

/**
 * ★★★ 出勤の書き込み（第46便）。**このプロジェクトで唯一、相手を書き換えるリクエスト。**
 *
 * ★ 宛先は【読んだページの form action】をそのまま使う（.../girlswork/<番号>/）。
 *   こちらで組み立てない。番号なしの検索フォームへ投げると静かに何も起きない（§17-2）。
 *   ★ parseWorkPage / checkWorkPage が action の形を検査済み。
 *
 * ★★ assertWithinInputVars をここでも通す。計画の時点でも数えているが、
 *   **送る直前にもう一度数える。** 超えた分は相手に黙って捨てられ、全件上書きなので出勤が消える。
 */
export function buildWriteWorkRequest(
  page: WorkPage,
  sent: GirlWork[],
  cookie: string,
): { url: string; method: 'POST'; headers: Record<string, string>; body: string } {
  const fields = buildPayload(page, sent);
  assertWithinInputVars(fields);
  return {
    url: page.action,
    method: 'POST',
    headers: {
      'user-agent': RELAY_USER_AGENT,
      'content-type': 'application/x-www-form-urlencoded',
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      origin: EKICHIKA_ORIGIN,
      referer: EKICHIKA_WORK_URL,
      cookie,
    },
    body: encodePayload(fields),
  };
}

// ────────────────────────── ログイン画面かどうか ──────────────────────────

/**
 * 返ってきたHTMLが【ログイン画面】か。
 *
 * ★★★ 2026-08-28 の訂正 — 最初の実装は【誤検知していた】。
 *   （誤）`name="password"` と `name="shopid"` が両方あればログイン画面
 *   → **ログイン済みの出勤ページも両方を満たす**:
 *       ・`shopid` は <form> の外にあるページ共通のテンプレート ＝ 全ページに入っている
 *       ・`name="password"` は管理画面に埋め込まれた求人サイトの自動ログインフォーム（設計メモ §17-6）
 *   → 実際に「ログインは302で成功しているのに、ログイン失敗と記録する」事故になった。
 *
 * ★★★ 教訓（同じ日に2回踏んだ）: **HTMLに文字列が在るかどうかで構造を判断しない。**
 *   朝の `shopid`（<form> の外にあるのに「フォームの項目」と判断した）とまったく同じ形。
 *
 * → いまは【駅ちかのログインへ POST する form があるか】で見る。
 *   ★ 他社ドメイン（cocoa-job など）へ POST する埋め込みフォームは拾わない。
 * ★ そもそもこの判定は**保険**になった。成否はまず「出勤ページとして読めたか」で決める（afterReadWork）。
 */
export function looksLikeEkichikaLoginPage(html: string): boolean {
  const h = String(html ?? '');
  // <form ... action="(https://ranking-deli.jp)?/admin/login" ...>
  const form = /<form[^>]+action=["']?(?:https?:\/\/ranking-deli\.jp)?\/admin\/login\/?["'\s>]/i;
  if (form.test(h)) return true;
  // 念のため題名でも見る（駅ちかランキング|ログイン）
  return /<title>[^<]*\|\s*ログイン\s*<\/title>/i.test(h);
}

// ────────────────────────── 状態遷移 ──────────────────────────

function stop(audits: FlowAudit[], note: string): FlowOutcome {
  return { kind: 'stop', audits, note };
}

/**
 * ★★★ 状態遷移の本体。
 * 「いま閉じたジョブの purpose と応答」から「次に積むもの・監査に残すもの」を決める。
 * ★ ここは純粋関数。DBもネットワークも触らない＝テストで固定できる。
 */
export function advanceFlow(input: {
  purpose: string;
  status: number;
  headers: Record<string, string | string[]>;
  /** 展開済みの本文。login では使わないので空でよい（2.3MBを無駄に展開しないため） */
  body: string;
  context: RelayFlowContext;
}): FlowOutcome {
  const ctx = input.context;

  if (ctx.v !== RELAY_FLOW_VERSION) {
    // ★ 版が違う＝こちらが知らない形。黙って進めない
    return stop([], 'フロー文脈の版が違うので進めない（' + ctx.v + ' / いまは ' + RELAY_FLOW_VERSION + '）');
  }

  switch (input.purpose) {
    case 'login':
      return afterLogin(input, ctx);
    case 'read_work':
      return afterReadWork(input, ctx);
    case 'read_girls':
      return afterReadGirls(input, ctx);
    case 'read_sokuhime':
      return afterReadSokuhime(input, ctx);
    // ── 駅ちかから1人削除（第228便）★ 段名で分けている。既存の case には触れていない ──
    case 'girl_delete':
      return afterGirlDelete(input, ctx);
    // ── 駅ちかにセラピストを1人 登録（第234便）★ 段名で分けている ──
    case 'girl_create_form':
      return afterGirlCreateForm(input, ctx);
    case 'girl_create':
      return afterGirlCreate(input, ctx);
    case 'girl_create_msg':
      return afterGirlCreateMsg(input, ctx);
    case 'sokuhime_check':
      return afterSokuhimeCheck(input, ctx);
    case 'sokuhime_set':
      return afterSokuhimeSet(input, ctx);
    case 'sokuhime_del':
      return afterSokuhimeDel(input, ctx);
    case 'read_maillist':
      return afterReadMailList(input, ctx);
    // ── 駅ちかの新着情報（第155便）★ 段名で分けている。既存の case には触れていない ──
    case 'article_list':
      return afterArticleList(input, ctx);
    case 'article_read':
      return afterArticleRead(input, ctx);
    case 'article_save':
      return afterArticleSave(input, ctx);
    case 'article_verify':
      return afterArticleVerify(input, ctx);
    // ── 写メ日記（第94便）★ 段名で分けている。既存の case には触れていない ──
    case 'read_diary_list':
      return afterReadDiaryList(input, ctx);
    case 'read_diary_detail':
      return afterReadDiaryDetail(input, ctx);
    case 'write_work':
      return afterWriteWork(input, ctx);
    case 'verify_work':
      return afterVerifyWork(input, ctx);
    // ── エステラブ（第78便）★ 段名で分けている。駅ちかの case には触っていない ──
    case 'esulove_login':
      return afterEsuloveLogin(input, ctx);
    case 'esulove_therapists':
      return afterEsuloveTherapists(input, ctx);
    // ── 写真（第107便）★ 段名で分けている。既存の case には触れていない ──
    case 'read_photo_page':
      return afterReadPhotoPage(input, ctx);
    // ── 新着情報の画像（第162便）──
    case 'article_image':
      return afterArticleImage(input, ctx);
    case 'article_crop':
      return afterArticleCrop(input, ctx);
    case 'upload_photo':
      return afterUploadPhoto(input, ctx);
    case 'crop_photo':
      return afterCropPhoto(input, ctx);
    // ── エステ魂（第109便）★ 段名で分けている。既存の case には触れていない ──
    case 'esutama_login_page':
      return afterEsutamaLoginPage(input, ctx);
    case 'esutama_login':
      return afterEsutamaLogin(input, ctx);
    case 'esutama_roster':
      return afterEsutamaRoster(input, ctx);
    // ── エステ魂のセラピスト設定（第229便）★ 段名で分けている。既存の case には触れていない ──
    case 'esutama_cast_list':
      return afterEsutamaCastList(input, ctx);
    case 'esutama_cast_hide':
      return afterEsutamaCastHide(input, ctx);
    // ── セラピストの新規登録（第232便）★ 段名で分けている。既存の case には触れていない ──
    case 'esutama_cast_form':
      return afterEsutamaCastForm(input, ctx);
    case 'esutama_cast_create':
      return afterEsutamaCastCreate(input, ctx);
    // ── エステ魂へ写真を送る（第243便）★ 段名で分けている。既存の case には触れていない ──
    case 'esutama_photo_form':
      return afterEsutamaPhotoForm(input, ctx);
    case 'esutama_photo_tmp':
      return afterEsutamaPhotoTmp(input, ctx);
    case 'esutama_photo_save':
      return afterEsutamaPhotoSave(input, ctx);
    case 'esutama_work_read':
      return afterEsutamaWorkRead(input, ctx);
    case 'esutama_work_save':
      return afterEsutamaWorkSave(input, ctx);
    case 'esutama_work_verify':
      return afterEsutamaWorkVerify(input, ctx);
    // ── エステ魂の写メ日記（第130便の段・第133便で接続）★ 段名で分けている ──
    case 'esutama_therapist_list':
      return afterEsutamaTherapistList(input, ctx);
    case 'esutama_diary_token':
      return afterEsutamaDiaryToken(input, ctx);
    case 'esutama_diary_proxy':
      return afterEsutamaDiaryProxy(input, ctx);
    case 'esutama_diary_page':
      return afterEsutamaDiaryPage(input, ctx);
    case 'esutama_diary_post':
      return afterEsutamaDiaryPost(input, ctx);
    case 'esutama_diary_end':
      return afterEsutamaDiaryEnd(input, ctx);
    // ── 即セラ（第143便）★ 段名で分けている ──
    case 'esutama_sokusera_token':
      return afterEsutamaSokuseraToken(input, ctx);
    case 'esutama_sokusera_proxy':
      return afterEsutamaSokuseraProxy(input, ctx);
    case 'esutama_sokusera_page':
      return afterEsutamaSokuseraPage(input, ctx);
    case 'esutama_sokusera_start':
      return afterEsutamaSokuseraStart(input, ctx);
    case 'esutama_sokusera_verify':
      return afterEsutamaSokuseraVerify(input, ctx);
    case 'esutama_sokusera_end':
      return afterEsutamaSokuseraEnd(input, ctx);
    default:
      return stop([], '知らない段: ' + String(input.purpose));
  }
}

/**
 * ログインの応答。
 * ★★ ここでは【監査ログを書かない】。まだ成否が分からないから（このファイル冒頭）。
 *   分からないことを書かない、が第39便からの一貫した作法。
 */
function afterLogin(
  input: { status: number; headers: Record<string, string | string[]> },
  ctx: RelayFlowContext,
): FlowOutcome {
  if (input.status >= 400) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', flowId: ctx.flowId },
        },
      ],
      'ログインの応答が ' + input.status + ' だった',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  if (!cookie) {
    // ★ これは解釈の余地なく失敗と言える。セッションが無ければ次の GET は必ずログイン画面になる
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary: '駅ちかにログインできませんでした（セッションが発行されませんでした）',
          detail: { httpStatus: input.status, reason: 'no_cookie', flowId: ctx.flowId },
        },
      ],
      'ログインの応答にセッションCookieが無かった',
    );
  }

  // ★★ 何を読みに行くかは intent で決まる（第50便）。
  //   ★ 「ログインの成否は、次に読むページが読めたかで判定する」という作法は変えない。
  //     出勤の用事なら出勤ページ、名簿の用事なら女の子一覧。どちらも「読めた＝ログインできた」。
  if (ctx.intent === 'mail_dryrun' || ctx.intent === 'mail_apply') {
    return {
      kind: 'next',
      next: {
        purpose: 'read_maillist',
        method: 'GET',
        url: EKICHIKA_MAILLIST_URL,
        headers: buildReadWorkRequest(cookie),
        body: '',
        context: { ...ctx, cookie },
      },
      audits: [],
      note: 'ログインの応答を受け取った。★ 成否はメールアドレス一覧が読めるかどうかで判定する',
    };
  }

  if (ctx.intent === 'diary_read') {
    return {
      kind: 'next',
      next: buildReadDiaryListRequest({ ...ctx, cookie }, 1),
      audits: [],
      note: 'ログインの応答を受け取った。★ 成否は写メ日記の一覧が読めるかどうかで判定する',
    };
  }

  if (ctx.intent === 'photo_push') {
    return {
      kind: 'next',
      next: buildReadPhotoPageRequest({ ...ctx, cookie, photoStage: ctx.photoStage ?? 'upload' }),
      audits: [],
      note: 'ログインの応答を受け取った。★ 成否は女の子の編集ページが読めるかどうかで判定する',
    };
  }

  if (ctx.intent === 'article_dryrun' || ctx.intent === 'article_push'
    || ctx.intent === 'article_slots' || ctx.intent === 'article_auto') {
    // ★★★ 第156便: 編集ページより先に【一覧】を読む。
    //   ★ その枠に記事があるか・公開ページに出るかは、**一覧にしか書いていない**（2026-09-05 実測）。
    const next = buildArticleListStep({ ...ctx, cookie });
    // ★ 枠が入っていなければ進めない（★ どこを書き換えるか決まっていないまま先へ行かない）
    if (next === null) return stop([], '書き換える枠（1〜5）が文脈に入っていないので進めない');
    return {
      kind: 'next',
      next,
      audits: [],
      note: 'ログインの応答を受け取った。★ 成否はニュースの一覧が読めるかどうかで判定する',
    };
  }

  if (ctx.intent === 'sokuhime_read' || ctx.intent === 'sokuhime_push' || ctx.intent === 'sokuhime_auto') {
    return {
      kind: 'next',
      next: {
        purpose: 'read_sokuhime',
        method: 'GET',
        url: EKICHIKA_SOKUHIME_URL,
        headers: buildReadWorkRequest(cookie),
        body: '',
        context: { ...ctx, cookie },
      },
      audits: [],
      note: 'ログインの応答を受け取った。★ 成否は即ヒメ設定画面が読めるかどうかで判定する',
    };
  }

  if (ctx.intent === 'girl_delete' || ctx.intent === 'girl_create') {
    // ★ 消す前・作る前に必ず一覧を読む。★ 相手が居るか（居ないか）の確認と、使い捨てトークンの取得を兼ねる
    return {
      kind: 'next',
      next: {
        purpose: 'read_girls',
        method: 'GET',
        url: EKICHIKA_GIRLS_URL,
        headers: buildReadWorkRequest(cookie),
        body: '',
        context: { ...ctx, cookie },
      },
      audits: [],
      note: 'ログインの応答を受け取った。★ まだ1文字も消していない（先に一覧を読む）',
    };
  }

  if (ctx.intent === 'roster_read') {
    return {
      kind: 'next',
      next: {
        purpose: 'read_girls',
        method: 'GET',
        url: EKICHIKA_GIRLS_URL,
        // ★ ヘッダは出勤ページを読むときと同じでよい（GET・Cookie・Referer だけ）
        headers: buildReadWorkRequest(cookie),
        body: '',
        context: { ...ctx, cookie },
      },
      audits: [],
      note: 'ログインの応答を受け取った。★ 成否は女の子一覧が読めるかどうかで判定する',
    };
  }

  return {
    kind: 'next',
    next: {
      purpose: 'read_work',
      method: 'GET',
      url: EKICHIKA_WORK_URL,
      headers: buildReadWorkRequest(cookie),
      body: '',
      context: { ...ctx, cookie },
    },
    audits: [],
    note: 'ログインの応答を受け取った。★ 成否は出勤ページが読めるかどうかで判定する',
  };
}

// ───────────── ★★★ 即ヒメを押す／消す（第214便） ─────────────
//   girls.js（駅ちか）の droppable→setbox4 の枝と #imgdel_toppriority の click をそのまま写した。
//   ① POST ajaxgirlinfo/create.json        { id, sokuikuSetIndex, shopId }            → 在籍・出勤中の確認・名前
//   ② POST ajaxgirlinforegist/create.json  { id, idname:"setbox4", oldid, sokuikunum, preceding_flg, sokuikuSetIndex, sokuikuid, is_sokuiku:true }
//   ③ POST ajaxgirlinfodel/create.json     { id, boxname:"setbox4", preceding_flg, sokuikuSetIndex, expired_at, shopId, sokuikuid }
//   ★ jQuery の $.ajax と同じ形（x-www-form-urlencoded・X-Requested-With）。★ undefined は空文字で送る（jQuery.param と同じ）。

function sokuhimeHeadersPost(ctx: RelayFlowContext): Record<string, string> {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'application/json, text/javascript, */*; q=0.01',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    'content-type': 'application/x-www-form-urlencoded',
    origin: EKICHIKA_ORIGIN,
    referer: EKICHIKA_SOKUHIME_URL,
    'x-requested-with': 'XMLHttpRequest',
    cookie: ctx.cookie,
  };
}

/** ① 在籍・出勤中の確認。★ 押す前に相手側でも見る（二重） */
export function buildSokuhimeCheckStep(ctx: RelayFlowContext): FlowNextRequest {
  const t = ctx.sokuhimeTarget;
  if (!t) throw new Error('sokuhimeTarget が無い');
  const fields: Array<[string, string]> = [
    ['id', t.castId],
    ['sokuikuSetIndex', String(t.slotIndex)],
    ['shopId', ctx.sokuhimeShopId ?? ''],
  ];
  return { purpose: 'sokuhime_check', method: 'POST', url: EKICHIKA_SOKUHIME_CHECK_URL, headers: sokuhimeHeadersPost(ctx), body: encodePayload(fields), context: ctx };
}

/** ② 即ヒメに設定 */
export function buildSokuhimeSetStep(ctx: RelayFlowContext): FlowNextRequest {
  const t = ctx.sokuhimeTarget;
  if (!t) throw new Error('sokuhimeTarget が無い');
  const fields: Array<[string, string]> = [
    ['id', t.castId],
    ['idname', 'setbox4'],
    ['oldid', t.oldGirlId ?? ''],
    ['sokuikunum', ctx.sokuhimeRemaining == null ? '' : String(ctx.sokuhimeRemaining)],
    ['preceding_flg', ctx.sokuhimePrecedingFlg ?? ''],
    ['sokuikuSetIndex', String(t.slotIndex)],
    ['sokuikuid', t.oldSokuikuId ?? ''],
    ['is_sokuiku', 'true'],
  ];
  return { purpose: 'sokuhime_set', method: 'POST', url: EKICHIKA_SOKUHIME_SET_URL, headers: sokuhimeHeadersPost(ctx), body: encodePayload(fields), context: ctx };
}

/** ③ 即ヒメを消す */
export function buildSokuhimeDelStep(ctx: RelayFlowContext): FlowNextRequest {
  const d = ctx.sokuhimeDel;
  if (!d) throw new Error('sokuhimeDel が無い');
  const fields: Array<[string, string]> = [
    ['id', d.castId],
    ['boxname', 'setbox4'],
    ['preceding_flg', ctx.sokuhimePrecedingFlg ?? ''],
    ['sokuikuSetIndex', String(d.slotIndex)],
    ['expired_at', d.expiresAtUnix == null ? '' : String(d.expiresAtUnix)],
    ['shopId', ctx.sokuhimeShopId ?? ''],
    ['sokuikuid', d.sokuikuId ?? ''],
  ];
  return { purpose: 'sokuhime_del', method: 'POST', url: EKICHIKA_SOKUHIME_DEL_URL, headers: sokuhimeHeadersPost(ctx), body: encodePayload(fields), context: ctx };
}

/** 照合のために即ヒメ設定画面を読み直す */
export function buildSokuhimeVerifyStep(ctx: RelayFlowContext, stage: 'verify_set' | 'verify_del'): FlowNextRequest {
  return {
    purpose: 'read_sokuhime', method: 'GET', url: EKICHIKA_SOKUHIME_URL,
    headers: buildReadWorkRequest(ctx.cookie), body: '',
    context: { ...ctx, sokuhimeStage: stage },
  };
}

/** ★ 駅ちかの ajax の JSON を読む。★ 配列でも {"0":{…}} でも受ける（決めつけない） */
export function parseSokuhimeJson(body: string): { empty: boolean; first: Record<string, unknown> | null; obj: Record<string, unknown> | null; problems: string[] } {
  let v: unknown;
  try { v = JSON.parse(String(body ?? '')); } catch { return { empty: true, first: null, obj: null, problems: ['JSON として読めない（ログイン画面などが返った可能性）'] }; }
  if (v === null || typeof v !== 'object') return { empty: true, first: null, obj: null, problems: ['JSON がオブジェクトではない'] };
  const obj = v as Record<string, unknown>;
  const keys = Array.isArray(v) ? v.map((_, i) => String(i)) : Object.keys(obj);
  if (keys.length === 0) return { empty: true, first: null, obj, problems: [] };
  const first0 = Array.isArray(v) ? v[0] : obj['0'];
  const first = first0 && typeof first0 === 'object' ? (first0 as Record<string, unknown>) : null;
  return { empty: false, first, obj, problems: [] };
}

function sokuhimeStop(ctx: RelayFlowContext, event: 'write_sokuhime' | 'delete_sokuhime', reason: string, summary: string, note: string, extra?: Record<string, string | number | boolean | null>): FlowOutcome {
  return stop(
    [{ event, outcome: 'stopped', summary, detail: { reason, castId: ctx.sokuhimeTarget?.castId ?? ctx.sokuhimeDel?.castId ?? null, flowId: ctx.flowId, ...(extra ?? {}) } }],
    note,
  );
}

/** ①の応答。★ 空＝在籍していない／is_working=false＝出勤中でない → 止める。★ 通れば ② */
function afterSokuhimeCheck(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const lost = diaryLoginLost(input, ctx, '即ヒメの確認の応答');
  if (lost) return lost;
  const j = parseSokuhimeJson(input.body);
  const name = ctx.sokuhimeTarget?.name ?? '';
  if (input.status !== 200 || j.problems.length > 0) {
    return sokuhimeStop(ctx, 'write_sokuhime', 'check_bad_response', name + 'さんの即ヒメの確認で想定外の応答がありました', 'check の応答が読めない: ' + (j.problems[0] ?? input.status), responseClue(input));
  }
  if (j.empty) {
    return sokuhimeStop(ctx, 'write_sokuhime', 'not_registered', name + 'さんは駅ちかに在籍していないため、即ヒメにできませんでした', '駅ちかが空を返した（在籍していない）');
  }
  const working = j.obj?.['is_working'];
  if (!(working === true || working === 1 || working === '1')) {
    return sokuhimeStop(ctx, 'write_sokuhime', 'not_working', name + 'さんは駅ちかで出勤中になっていないため、即ヒメにできませんでした', '駅ちかが is_working=false を返した');
  }
  return {
    kind: 'next',
    next: buildSokuhimeSetStep(ctx),
    audits: [],
    note: '駅ちかで在籍・出勤中を確かめた（' + String(j.first?.['name'] ?? name) + '）。★ 次は即ヒメに設定する',
  };
}

/** ②の応答。★ 読めたら照合へ（画面を読み直して枠に居るかを見る） */
function afterSokuhimeSet(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const lost = diaryLoginLost(input, ctx, '即ヒメの設定の応答');
  if (lost) return lost;
  const j = parseSokuhimeJson(input.body);
  const name = ctx.sokuhimeTarget?.name ?? '';
  if (input.status !== 200 || j.problems.length > 0) {
    return sokuhimeStop(ctx, 'write_sokuhime', 'set_bad_response', name + 'さんの即ヒメの設定で想定外の応答がありました', 'set の応答が読めない: ' + (j.problems[0] ?? input.status), responseClue(input));
  }
  const tt = j.first?.['topprioritytime'];
  return {
    kind: 'next',
    next: buildSokuhimeVerifyStep({ ...ctx, sokuhimeToppriorityTime: typeof tt === 'string' ? tt : undefined }, 'verify_set'),
    audits: [],
    note: '即ヒメの設定を送った（相手の返事: ' + (typeof tt === 'string' ? '～' + tt + ' 迄' : '時刻なし') + '）。★ 次は画面を読み直して照合',
  };
}

/** ③の応答。★ 読めたら照合へ */
function afterSokuhimeDel(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const lost = diaryLoginLost(input, ctx, '即ヒメの解除の応答');
  if (lost) return lost;
  const j = parseSokuhimeJson(input.body);
  if (input.status !== 200 || j.problems.length > 0) {
    return sokuhimeStop(ctx, 'delete_sokuhime', 'del_bad_response', '即ヒメの解除で想定外の応答がありました', 'del の応答が読めない: ' + (j.problems[0] ?? input.status), responseClue(input));
  }
  return {
    kind: 'next',
    next: buildSokuhimeVerifyStep(ctx, 'verify_del'),
    audits: [],
    note: '即ヒメの解除を送った。★ 次は画面を読み直して照合',
  };
}

/**
 * 即ヒメ設定画面の応答（第213便）。★ afterReadGirls と同じ順序の作法（まず「読めるか」を試す）。
 */
function afterReadSokuhime(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  if (input.status >= 300 && input.status < 400) {
    const location = String(input.headers['location'] ?? '');
    if (location.includes('/admin/login')) {
      return stop(
        [{
          event: 'login', outcome: 'failed',
          summary: '駅ちかにログインできませんでした（ログイン画面へ戻されました）。店舗ID・ログインID・パスワードをご確認ください',
          detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
        }],
        'ログイン後の即ヒメ設定画面がログイン画面へ戻された＝ログインできていない',
      );
    }
    return stop(
      [{ event: 'read_sokuhime', outcome: 'failed', summary: '駅ちかの即ヒメ設定画面を開けませんでした（別の場所へ転送されました）', detail: { httpStatus: input.status, reason: 'redirected', flowId } }],
      '即ヒメ設定画面が想定外の場所へ転送された',
    );
  }
  if (input.status !== 200) {
    return stop(
      [{ event: 'read_sokuhime', outcome: 'failed', detail: { httpStatus: input.status, reason: 'http_error', flowId } }],
      '即ヒメ設定画面の応答が ' + input.status + ' だった',
    );
  }
  const page = parseEkichikaSokuhime(input.body);
  if (sokuhimePageUsable(page)) {
    return {
      kind: 'sokuhime',
      page,
      audits: [
        { event: 'login', outcome: 'ok', detail: { flowId } },
        {
          event: 'read_sokuhime', outcome: 'ok',
          detail: { slots: page.boxes.length, used: sokuhimeUsed(page), working: page.working.length, flowId },
        },
      ],
      note: '即ヒメ設定画面を読めた（枠 ' + sokuhimeUsed(page) + '/' + page.boxes.length + '・出勤中 ' + page.working.length + '名）',
    };
  }
  if (looksLikeEkichikaLoginPage(input.body)) {
    return stop(
      [{
        event: 'login', outcome: 'failed',
        summary: '駅ちかにログインできませんでした（ログイン画面が返りました）。店舗ID・ログインID・パスワードをご確認ください',
        detail: { httpStatus: input.status, reason: 'login_page', flowId },
      }],
      '即ヒメ設定画面の代わりにログイン画面が返った',
    );
  }
  return stop(
    [{
      event: 'read_sokuhime', outcome: 'failed',
      summary: '駅ちかの即ヒメ設定画面を読み取れませんでした（画面の形が変わった可能性があります）',
      detail: { httpStatus: input.status, reason: 'unparseable', problems: page.problems.slice(0, 5).join(' / '), flowId },
    }],
    '即ヒメ設定画面として読めなかった: ' + page.problems.join(' / '),
  );
}

/**
 * 女の子一覧の応答（第50便）。★ afterReadWork とまったく同じ順序の作法で判定する。
 *
 * ★★★ 順序が大事。**まず「一覧として読めるか」を試す。**
 *   読めた ＝ ログインできている。ログイン画面らしさの判定（誤検知しうるもの）を先に置かない。
 *   ★ 2026-08-28 に踏んだ形（302で成功しているのに失敗と記録した）を繰り返さない。
 */
// ───────────── ★★★ 駅ちかから1人削除する（第228便・2026-09-09） ─────────────
//
// ★★★ 使う口は【一括削除のフォーム】。★ 個別の削除リンクは使わない。
//   POST https://ranking-deli.jp/admin/girls/
//     chck_girls_id[<castId>]=<castId>   ← ★ 1人だけ
//     girls_list_action=delete_girl
//     girls_btn_batch_del=（押したボタン）
//     fuel_csrf_token=<一覧ページから拾った使い捨て>
//
// ★★★★★ 【訂正・第238便 2026-09-10】**この POST では消えなかった。**
//   ブラウザで手押し削除したときの実物（実測）:
//     GET https://ranking-deli.jp/admin/girls/delete/<castId>&gl=XXXX → 302 → /admin/girls
//   ★ 駅ちかの削除は **GET**。★ 一括削除フォームの POST は（少なくともこの画面では）効かない。
//   ★★ だからいまは **一覧の削除リンク（href）をそのまま GET する**。★ `&gl=` は毎回変わる（§2-5）
//     ので、**番号から URL を組み立てない**。★ 読んだ href 以外を叩かない。
//   ★★★ 押した瞬間に消える（確認ダイアログが無い）。★ だから見張りを2つ置いてある:
//     ① ホストが駅ちかであること ② パスが**消すつもりの castId** の削除リンクであること
//
// ★★ 消したかどうかは【応答では判定しない】（第46便 §35 の作法）。
//   もう一度一覧を読み、その castId が消えていることを確かめる。

/**
 * 一括削除の POST を組み立てる。★ 1人ぶんしか入れない。
 *
 * ★★★★ 送り先は【読んだ一覧ページの form action】（第235便・設計メモ §17-8）。
 *   ★ 2026-09-09 の切り分けで、駅ちかへの書き込みのうち**動いているのは出勤だけ**で、
 *     出勤だけが「読んだフォームの action」へ送っていた。★ 削除と登録は URL を決め打ちしていた。
 *   ★★ 読めなければ、これまでどおりの決め打ちへ落とす（★ 黙って落とさず、記録に残す）。
 *   ★★★ ホストが ranking-deli.jp でなければ**使わない**（★ Cookie を他所へ飛ばさない）。
 */
export function buildGirlDeleteStep(ctx: RelayFlowContext, deleteHref: string): FlowNextRequest {
  const castId = String(ctx.deleteCastId ?? '');
  const href = String(deleteHref ?? '').trim();
  // ★★★★★ 見張り（★ ここを緩めない）:
  //   ① ホストが駅ちかであること ② パスが **消すつもりの castId** の削除リンクであること
  //   ★ 一覧の別の行の href を掴んでいたら、**別人を消す**。★ 取り返しがつかない。
  const host = /^https?:\/\/([^/?#]+)/.exec(href)?.[1]?.toLowerCase() ?? null;
  if (host !== 'ranking-deli.jp' && host !== 'www.ranking-deli.jp') {
    throw new Error('削除リンクの行き先が駅ちかではありません（' + String(host) + '）。★ 消しません');
  }
  if (!new RegExp('/admin/girls/delete/' + castId + '(?![0-9])').test(href)) {
    throw new Error('削除リンクが castId ' + castId + ' のものではありません。★ 消しません');
  }
  return {
    purpose: 'girl_delete',
    method: 'GET',
    url: href,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      cookie: ctx.cookie,
      referer: EKICHIKA_GIRLS_URL,
    },
    body: '',
    context: {
      ...ctx,
      deleteStage: 'verify',
      // ★★★★ 何をどこへ送ったかを記録のために持ち回す（第235便・第238便）
      deleteSent: { url: href, sentTo: 'link', formAction: null, body: '' },
    },
  };
}

/**
 * 一覧を読み終えたときの、削除の流れの分岐。
 * ★ 1回目（deleteStage が無い）… 相手が居るか・トークンが取れたかを確かめて POST を積む
 * ★ 2回目（deleteStage='verify'）… 本当に消えたかを照合して終わる
 */
function girlDeleteAfterGirls(page: EkichikaGirlsPage, ctx: RelayFlowContext): FlowOutcome {
  const flowId = ctx.flowId;
  const castId = String(ctx.deleteCastId ?? '');
  const found = page.rows.find((r) => r.castId === castId) ?? null;

  // ── 2回目: 照合 ──────────────────────────────────────────────
  if (ctx.deleteStage === 'verify') {
    const who = ctx.deleteName ? ctx.deleteName + 'さん' : 'castId ' + castId;
    if (found !== null) {
      // ★ まだ居る＝消えていない。★ 「消しました」と言わない
      return stop(
        [{
          event: 'delete_girl', outcome: 'failed',
          summary: who + 'を駅ちかから削除できませんでした（一覧にまだ残っています）',
          detail: {
            castId, name: ctx.deleteName ?? null, people: page.rows.length, reason: 'still_listed',
            // ★★★★ **送った全文**（第235便／第236便で入れ方を直した）。★ 推測で追わないため
            sentTo: ctx.deleteSent?.sentTo ?? null,
            sentPath: pathOfUrl(ctx.deleteSent?.url) ?? null,
            actionPath: pathOfUrl(ctx.deleteSent?.formAction) ?? null,
            ...(ctx.deleteSent?.body ? splitBodyForAudit(ctx.deleteSent.body) : {}),
            flowId,
          },
        }],
        '削除を送ったが、一覧にまだ castId ' + castId + ' が残っている',
      );
    }
    const before = typeof ctx.deleteBefore === 'number' ? ctx.deleteBefore : null;
    const after = page.rows.length;
    // ★★ 1人だけ減ったか。★ 2人以上減っていたら「消しました」と言い切らない
    const diff = before === null ? null : before - after;
    const suspicious = diff !== null && diff !== 1;
    return {
      kind: 'done',
      audits: [{
        event: 'delete_girl',
        outcome: suspicious ? 'failed' : 'ok',
        summary: suspicious
          ? who + 'を削除しましたが、在籍が' + String(diff) + '名ぶん変わっています（お確かめください）'
          : who + 'を駅ちかから削除しました',
        detail: { castId, name: ctx.deleteName ?? null, before, after, diff, flowId },
      }],
      note: suspicious
        ? '削除は通ったが在籍の増減が1名ではない（before=' + String(before) + ' after=' + after + '）'
        : '削除を確認した（' + String(before) + '名 → ' + after + '名）',
      // ★★★★★ 相手から居なくなった。★ 結びつきを外すのは呼び出し側（第239便）
      mediaRemoved: { castId, name: ctx.deleteName ?? null, reason: 'deleted' },
    };
  }

  // ── 1回目: これから消す ───────────────────────────────────────
  if (!/^\d{1,12}$/.test(castId)) {
    return stop(
      [{ event: 'delete_girl', outcome: 'stopped', summary: '削除する相手が指定されていないため、何もしませんでした', detail: { reason: 'no_cast_id', flowId } }],
      '消す相手（castId）が文脈に入っていない',
    );
  }
  if (found === null) {
    // ★ 既に居ない。★ これは失敗ではない（同じ相手をもう一度消すだけ・§81）
    return {
      kind: 'done',
      audits: [{
        event: 'delete_girl', outcome: 'stopped',
        summary: 'castId ' + castId + ' は駅ちかの一覧に居ないため、何もしませんでした',
        detail: { castId, people: page.rows.length, reason: 'not_listed', flowId },
      }],
      note: '一覧に居ないので削除しない（' + page.rows.length + '名を読んだ）',
      // ★★★★★ 行ったらもう居なかった。★ **結びつきは外す**（第239便）。
      //   ★ 2026-09-10、手で消された方の行が残っていて、同じ方を送ろうとして 409 で詰まった。
      //   ★★ 一覧は読めている（problems が空でなければここまで来ない）ので、
      //     「読めなかったから居ない」ではない。★ 確かに居ない。
      mediaRemoved: { castId, name: ctx.deleteName ?? null, reason: 'not_listed' },
    };
  }
  // ★★★★★ 削除は【一覧の削除リンクを GET する】（第238便・2026-09-10 実測）。
  //   ★ 一括削除フォームの POST では消えなかった（実弾で確認）。
  //   ★★ リンクには毎回変わる `&gl=` が付く（§2-5）。★ だから**読んだ href をそのまま使う。**
  const href = found.deleteHref;
  if (!href) {
    return stop(
      [{ event: 'delete_girl', outcome: 'failed', summary: '駅ちかの一覧から削除リンクを読み取れなかったため、削除しませんでした', detail: { castId, reason: 'no_delete_link', flowId } }],
      '一覧ページから削除リンク（/admin/girls/delete/…）を拾えなかった（画面の作りが変わった疑い）',
    );
  }
  let step: FlowNextRequest;
  try {
    step = buildGirlDeleteStep({ ...ctx, deleteName: found.name, deleteBefore: page.rows.length }, href);
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return stop(
      [{ event: 'delete_girl', outcome: 'stopped', summary: '削除を止めました（' + why + '）', detail: { castId, reason: 'blocked', note: why, flowId } }],
      '組み立てが止めた: ' + why,
    );
  }

  return {
    kind: 'next',
    next: step,
    audits: [
      { event: 'login', outcome: 'ok', detail: { flowId } },
      { event: 'read_girls', outcome: 'ok', detail: { people: page.rows.length, flowId } },
    ],
    note: found.name + 'さん（castId ' + castId + '）を削除します。★ 在籍 ' + page.rows.length + '名を読んだうえで1人だけ送ります',
  };
}

/**
 * 削除の POST の応答。
 * ★★ ここでは成否を判定しない。★ もう一度一覧を読んで照合する（第46便 §35）。
 */
function afterGirlDelete(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const location = String(input.headers['location'] ?? '');
  if (location.includes('/admin/login')) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '駅ちかのセッションが切れました（削除は行われていません）', detail: { httpStatus: input.status, reason: 'back_to_login', flowId } }],
      '削除の応答がログイン画面へ戻された',
    );
  }
  if (input.status >= 400) {
    return stop(
      [{ event: 'delete_girl', outcome: 'failed', summary: '駅ちかの削除で想定外の応答がありました', detail: { castId: ctx.deleteCastId ?? null, httpStatus: input.status, reason: 'http_error', flowId } }],
      '削除の応答が ' + input.status + ' だった',
    );
  }
  // ★ 200 でも 302 でも、判定は次の読み直しで行う
  return {
    kind: 'next',
    next: {
      purpose: 'read_girls',
      method: 'GET',
      url: EKICHIKA_GIRLS_URL,
      headers: buildReadWorkRequest(ctx.cookie),
      body: '',
      context: { ...ctx, deleteStage: 'verify' },
    },
    audits: [],
    note: '削除を送った。★ 成否は一覧を読み直して確かめる（応答では判定しない）',
  };
}

/**
 * ★★★★ **送った本文を監査記録に載せられる形にする**（第236便・2026-09-10）。
 *
 * ★★★ なぜ要るか（★ 2026-09-10 未明に踏んだ）
 *   `sentBody` をそのまま detail に入れたら、監査の見張り（`scrubAuditDetail`）が**丸ごと落とした**。
 *   ★ 見張りの決まり: 値が URL に見える／`fuel_csrf_token` を含む／**120字を超える** ものは残さない。
 *   ★★ 見張りは正しい（店舗様が読む記録に秘密を流さないため）。★ 直すのは**入れ方**のほう。
 *
 * ★ やること: ① 使い捨てトークンの**名前ごと**伏せる ② 110字ずつに分ける
 *   → `b01` `b02` … に入れる。★ 順に繋げば元の本文に戻る。
 * ★★ 上限20枚（＝2200字）。★ 超えたぶんは切って `bCut` に残す（★ 黙って切らない）。
 */
/**
 * ★★★ URL から **パスだけ**を取り出す（第236便）。
 *   ★ 監査の見張りは「値が `http(s)://` で始まる」ものを丸ごと落とす。★ ホストを外せば残せる。
 *   ★ 送り先が `/admin/girls/create/` なのか `/admin/girls/create_exe/` なのかが読めれば足りる。
 *   ★ 取れなければ null（★ 推測しない）。
 */
export function pathOfUrl(url: string | null | undefined): string | null {
  const u = String(url ?? '').trim();
  if (!u) return null;
  const m = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]+(\/[^\s]*)?$/.exec(u);
  if (!m) return u.slice(0, 110);
  return (m[1] ?? '/').slice(0, 110);
}

export function splitBodyForAudit(body: string, prefix = 'b'): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  // ★★★ 使い捨てトークンは【名前ごと】置き換える。★ 見張りは名前で弾くので、値を伏せるだけでは通らない
  const masked = String(body ?? '').replace(/fuel_csrf_token=[^&]*/g, 'csrftk=(伏せた)');
  const size = 110;
  const max = 20;
  let n = 0;
  for (let i = 0; i < masked.length && n < max; i += size) {
    n += 1;
    out[prefix + String(n).padStart(2, '0')] = masked.slice(i, i + size);
  }
  const kept = n * size;
  if (masked.length > kept) out[prefix + 'Cut'] = masked.length - kept;
  return out;
}

// ───────────── ★★★ 駅ちかにセラピストを1人 登録する（第234便・2026-09-09） ─────────────
//
// ★★★ 段: login → read_girls（もう居ないか＋いまの顔ぶれ）→ girl_create_form（110部品）
//            → girl_create → read_girls（照合＋castId 回収）
//
// ★★★ **相手に人を増やす。** ★ 作法はエステ魂の登録（第232便）とそろえてある。
//   ★★ 保存に成功すると `/admin/girls/edit/<castId>` へ飛ぶが、**そこから castId を取らない**。
//     ★ 第46便 §35「書き込みの成否を書き込みの応答で判定しない」。★ 一覧を読み直して裏取りする。
//   ★★ 新しい人は **名前ではなく「前に無かった castId」** で特定する。★ 同名の取り違えを避ける。

/** ★ 1回目: もう居ないかを見て、登録フォームを読みに行く */
function girlCreateAfterGirls(
  page: EkichikaGirlsPage,
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const want = String(ctx.createGirlValues?.name ?? '').trim();

  // ── 2回目: 照合して castId を回収 ──────────────────────────
  if (ctx.createStage === 'verify') {
    const before = new Set(ctx.createBeforeIds ?? []);
    const fresh = page.rows.filter((r) => !before.has(r.castId));
    if (fresh.length === 0) {
      return stop(
        [{
          event: 'create_girl', outcome: 'failed',
          // ★★★★ 駅ちかが出した文言をそのまま見せる（§2-6「画面のメッセージを読む」）
          summary: want + 'さんを駅ちかに登録できませんでした（一覧に増えていません）'
            + (ctx.createMessage ? '。駅ちかの画面には「' + ctx.createMessage + '」と出ていました' : ''),
          detail: {
            name: want, people: page.rows.length, reason: 'not_created',
            note: ctx.createMessage ?? null,
            // ★★★★ 応答の正体。★ 「届いたのに登録されない」ときの次の一手はここから決める
            response: ctx.createDiag ?? null,
            // ★★★★ **送った全文**（第235便・設計メモ §17-5／第236便で入れ方を直した）。
            //   ★ URL は **パスだけ**にする（★ 値が URL に見えると見張りが落とす）
            //   ★ 本文は b01… に分けて入れる（★ 120字超も見張りが落とす）
            sentTo: ctx.createSent?.sentTo ?? null,
            sentPath: pathOfUrl(ctx.createSent?.url) ?? null,
            actionPath: pathOfUrl(ctx.createSent?.formAction) ?? null,
            rookie: ctx.createSent?.rookie ?? null,
            pairs: ctx.createSent?.pairs ?? null,
            ...(ctx.createSent?.body ? splitBodyForAudit(ctx.createSent.body) : {}),
            flowId,
          },
        }],
        '登録を送ったが、読み直しても人数が増えていない'
          + (ctx.createMessage ? '（画面のことば: ' + ctx.createMessage + '）' : ''),
      );
    }
    const byName = fresh.filter((r) => normalizeName(r.name) === normalizeName(want));
    const hit = fresh.length === 1 ? fresh[0] : (byName.length === 1 ? byName[0] : null);
    if (hit === null) {
      return stop(
        [{ event: 'create_girl', outcome: 'failed', summary: '駅ちかで増えた方が' + fresh.length + '名あり、どれを登録したのか決められませんでした', detail: { name: want, added: fresh.length, reason: 'ambiguous', flowId } }],
        '増えた人が複数あり、名前でも1人に絞れなかった',
      );
    }
    return {
      kind: 'done',
      audits: [{
        event: 'create_girl', outcome: 'ok',
        summary: hit.name + 'さんを駅ちかに登録しました'
          + (ctx.createSent && ctx.createSent.rookie === false ? '（★ 新人マークなし）' : '（新人マークつき）'),
        detail: {
          name: hit.name, castId: hit.castId, people: page.rows.length,
          // ★ 通ったときの送り方も残す（★ 次に何を守ればよいかが分かるように・第235便）
          sentTo: ctx.createSent?.sentTo ?? null,
          sentPath: pathOfUrl(ctx.createSent?.url) ?? null,
          rookie: ctx.createSent?.rookie ?? null,
          pairs: ctx.createSent?.pairs ?? null,
          flowId,
        },
      }],
      note: '駅ちかに登録できた（castId ' + hit.castId + '・' + page.rows.length + '名を読み直した）',
      mediaCreated: { therapistId: Number(ctx.createTherapistId ?? 0), castId: hit.castId, name: hit.name },
    };
  }

  // ── 1回目 ──────────────────────────────────────────────
  if (!want) {
    return stop(
      [{ event: 'create_girl', outcome: 'stopped', summary: '登録する方が指定されていないため、何もしませんでした', detail: { reason: 'no_name', flowId } }],
      '登録する名前が文脈に入っていない',
    );
  }
  // ★★★ 同じ名前がもう居たら作らない。★ 二重掲載を自分で作らないための止め
  const same = page.rows.find((r) => normalizeName(r.name) === normalizeName(want)) ?? null;
  if (same) {
    return {
      kind: 'done',
      audits: [{
        event: 'create_girl', outcome: 'stopped',
        summary: want + 'さんは、すでに駅ちかに居ます（castId ' + same.castId + '）。登録しませんでした',
        detail: { name: want, castId: same.castId, reason: 'already_listed', flowId },
      }],
      note: 'すでに同じ名前が居るので登録しない',
    };
  }
  // ★★★ Cookie を畳み直す（第234便の修正3）。★ エステ魂の流れでは各段でやっていたのに、
  //   こちらで書き漏らしていた。★ セッションが更新されると、古いセッションのまま次の段へ行ってしまう。
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  const req = buildEkichikaGirlFormRequest(cookie);
  return {
    kind: 'next',
    audits: [
      { event: 'login', outcome: 'ok', detail: { flowId } },
      { event: 'read_girls', outcome: 'ok', detail: { people: page.rows.length, flowId } },
    ],
    note: want + 'さんはまだ居ない。登録フォームを読みます（★ まだ1文字も送っていない）',
    next: {
      purpose: 'girl_create_form',
      method: req.method, url: req.url, headers: req.headers, body: '',
      // ★★★ いまの顔ぶれを控える。★ これが「増えた1人」を見つける物差しになる
      context: { ...ctx, cookie, createBeforeIds: page.rows.map((r) => r.castId) },
    },
  };
}

/**
 * 登録フォームを読んだあと。★ ここで**初めて送る形を組み立てる**。
 * ★★ 組み立てが例外を投げたら【送らない】。★ 文言をそのまま記録に残す（人が読んで直せるように）。
 */
function afterGirlCreateForm(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const want = String(ctx.createGirlValues?.name ?? '').trim();
  const location = String(input.headers['location'] ?? '');
  if (location.includes('/admin/login')) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '駅ちかのセッションが切れました（登録は行っていません）', detail: { httpStatus: input.status, reason: 'back_to_login', flowId } }],
      '登録フォームがログイン画面へ戻された',
    );
  }
  if (input.status !== 200) {
    return stop(
      [{ event: 'create_girl', outcome: 'failed', summary: '駅ちかの登録フォームを開けませんでした', detail: { name: want, httpStatus: input.status, reason: 'http_error', flowId } }],
      '登録フォームの応答が ' + input.status + ' だった',
    );
  }
  // ★★★★ 土台の URL を渡して action を絶対に直す（第235便）。★ 送り先はここから決まる
  const form = parseEkichikaGirlForm(input.body, EKICHIKA_GIRL_CREATE_URL);
  if (form.fields.length === 0 || form.warnings.length > 0) {
    return stop(
      [{ event: 'create_girl', outcome: 'failed', summary: '駅ちかの登録フォームを読み取れませんでした（画面の作りが変わった可能性があります）', detail: { name: want, reason: 'parse_failed', note: form.warnings[0] ?? null, flowId } }],
      '登録フォームを読めなかった: ' + (form.warnings[0] ?? '欄が1つも無い'),
    );
  }
  const values = ctx.createGirlValues;
  if (!values) {
    return stop(
      [{ event: 'create_girl', outcome: 'stopped', summary: '送る内容が無いため、登録しませんでした', detail: { reason: 'no_values', flowId } }],
      '送る内容が文脈に入っていない',
    );
  }
  // ★★★ ここでも Cookie を畳み直す（第234便の修正3）
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  let req;
  try {
    req = buildEkichikaGirlCreateRequest(cookie, form, values, {
      postTo: ctx.createPostTo ?? 'action',
      rookie: ctx.createRookie !== false,
    });
  } catch (e) {
    const why = e instanceof Error ? e.message : String(e);
    return stop(
      [{ event: 'create_girl', outcome: 'stopped', summary: want + 'さんの登録を止めました（' + why + '）', detail: { name: want, reason: 'blocked', note: why, flowId } }],
      '組み立てが止めた: ' + why,
    );
  }
  const m = req.meta;
  return {
    kind: 'next',
    audits: [],
    note: want + 'さんを駅ちかに登録します（ジャンル ' + (values.genreIds ?? []).join(',') + '）'
      // ★★★★ 何をどこへ送るのかを、送る前に1行で残す（★ 失敗しても後から読めるように・第235便）
      + ' ／ 送り先 ' + req.url + '（' + (m ? m.sentTo : '?') + '）'
      + ' ／ ' + (m ? m.pairs : 0) + '組'
      + ' ／ 新人マーク' + (m && m.rookie ? 'あり' : 'なし')
      + (form.action && form.action !== EKICHIKA_GIRL_CREATE_URL ? ' ／ ★ 決め打ちと action が違っていた（action=' + form.action + '）' : ''),
    next: {
      purpose: 'girl_create',
      method: req.method, url: req.url, headers: req.headers, body: req.body ?? '',
      context: {
        ...ctx, cookie, createStage: 'verify',
        // ★★★★ 送った中身を持ち回す（★ §17-5 の突き合わせを、コードを直さずにできるように）
        ...(m ? { createSent: { url: req.url, sentTo: m.sentTo, formAction: m.formAction, rookie: m.rookie, pairs: m.pairs, body: m.body } } : {}),
      },
    },
  };
}

/**
 * 登録の POST の応答。
 * ★★★ ここでは成否を判定しない。★ 保存に成功すると編集ページへ飛ぶが、**その番号を使わない**（§2-4）。
 *   ★ もう一度一覧を読み、本当に増えたかを照合する。
 */
function afterGirlCreate(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const want = String(ctx.createGirlValues?.name ?? '').trim();
  const location = String(input.headers['location'] ?? '');
  if (location.includes('/admin/login')) {
    return stop(
      [{ event: 'login', outcome: 'failed', summary: '駅ちかのセッションが切れました（登録できたか分かりません）', detail: { name: want, httpStatus: input.status, reason: 'back_to_login', flowId } }],
      '登録の応答がログイン画面へ戻された',
    );
  }
  if (input.status >= 400) {
    return stop(
      [{ event: 'create_girl', outcome: 'failed', summary: '駅ちかの登録で想定外の応答がありました', detail: { name: want, httpStatus: input.status, reason: 'http_error', flowId } }],
      '登録の応答が ' + input.status + ' だった',
    );
  }
  // ★★★★ 画面のメッセージを読む（§2-6 の教訓）。★ 判定には使わない。★ 記録に残すためだけ
  const message = readEkichikaMessage(input.body);
  // ★★★★ 応答の正体も残す（第234便の修正3）。★ 「届いたのに登録されない」を推測で追わないため
  const diag = describeEkichikaResponse(input.status, input.body, String(input.headers['location'] ?? ''));
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  // ★★★★ 弾かれたとき、赤字は **飛んだ先**に出る（2026-09-09 実測）。★ だから飛んだ先を読む
  const loc = String(input.headers['location'] ?? '');
  if (input.status >= 300 && input.status < 400 && /^https?:\/\/(?:www\.)?ranking-deli\.jp\//.test(loc)) {
    return {
      kind: 'next',
      audits: [],
      note: '登録を送った。★ ' + diag + ' ／ 突き返された先を読みます',
      next: {
        purpose: 'girl_create_msg',
        method: 'GET',
        url: loc,
        headers: buildReadWorkRequest(cookie),
        body: '',
        context: { ...ctx, cookie, createStage: 'verify', createDiag: diag },
      },
    };
  }
  return {
    kind: 'next',
    audits: [],
    note: '登録を送った。★ 成否は一覧を読み直して確かめる（応答では判定しない）'
      + (message ? ' ／ 画面のことば: ' + message : '') + ' ／ ' + diag,
    next: {
      purpose: 'read_girls',
      method: 'GET',
      url: EKICHIKA_GIRLS_URL,
      headers: buildReadWorkRequest(cookie),
      body: '',
      context: { ...ctx, cookie, createStage: 'verify', createDiag: diag, ...(message ? { createMessage: message } : {}) },
    },
  };
}

/**
 * ★★★★ 突き返された先の画面を読む（第234便の修正5・2026-09-09）。
 *
 * ★★★ 駅ちかは弾いたとき **302 で飛ばし、赤字は飛んだ先に出す**（実測）。
 *   ★ だから POST の応答そのものには何も書いていない。★ 飛んだ先を読まないと理由が分からない。
 *   ★★ 2026-09-09 の実弾で、ここを読まずに3回とも理由不明のまま終わった。
 *
 * ★ 実物で見えている2種類（2026-09-09 実測）:
 *   /admin/girls/index/  「ページ遷移が正しくありません」… 使い捨てトークンが合わない
 *   /admin/girls/create/ 「名前は必須入力です。」「ジャンルは最低１つ選択してください。」… 入力の検証
 *
 * ★★★ **判定には使わない。** ★ 判定は今までどおり一覧を読み直しての照合。
 */
function afterGirlCreateMsg(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const message = readEkichikaMessage(input.body);
  // ★ class で拾えないことがあるので、実物で見えている文言も直に探す（★ 記録のためだけ）
  const known = ['ページ遷移が正しくありません', '名前は必須入力です', 'ジャンルは最低１つ選択してください',
    '必ず１枚目の画像を正方形にカットして下さい', 'データを登録しました']
    .filter((w) => input.body.includes(w));
  const said = [message, known.join(' ／ ')].filter((x) => x).join(' ／ ') || null;
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  return {
    kind: 'next',
    audits: [],
    note: '突き返された先を読んだ' + (said ? '（画面のことば: ' + said + '）' : '（文言は見つからなかった）'),
    next: {
      purpose: 'read_girls',
      method: 'GET',
      url: EKICHIKA_GIRLS_URL,
      headers: buildReadWorkRequest(cookie),
      body: '',
      context: { ...ctx, cookie, createStage: 'verify', ...(said ? { createMessage: said } : {}) },
    },
  };
}

function afterReadGirls(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 300 && input.status < 400) {
    const location = String(input.headers['location'] ?? '');
    if (location.includes('/admin/login')) {
      return stop(
        [
          {
            event: 'login',
            outcome: 'failed',
            summary:
              '駅ちかにログインできませんでした（ログイン画面へ戻されました）。' +
              '店舗ID・ログインID・パスワードをご確認ください',
            detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
          },
        ],
        'ログイン後の女の子一覧がログイン画面へ戻された＝ログインできていない',
      );
    }
    return stop(
      [
        {
          event: 'read_girls',
          outcome: 'failed',
          summary: '駅ちかの女の子一覧を開けませんでした（別の場所へ転送されました）',
          detail: { httpStatus: input.status, reason: 'redirected', flowId },
        },
      ],
      '女の子一覧が想定外の場所へ転送された',
    );
  }

  if (input.status !== 200) {
    return stop(
      [
        {
          event: 'read_girls',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      '女の子一覧の応答が ' + input.status + ' だった',
    );
  }

  const page = parseEkichikaGirls(input.body);

  if (girlsPageUsable(page)) {
    // ★★★ 削除の流れ（第228便）は、ここで終わらずに次の段へ進む。
    //   ★ 既存の roster_read の枝には一切触っていない（下の return がそのまま残る）。
    if (ctx.intent === 'girl_delete') return girlDeleteAfterGirls(page, ctx);
    // ★★★ 登録の流れ（第234便）も、ここで終わらずに次の段へ進む
    if (ctx.intent === 'girl_create') return girlCreateAfterGirls(page, input, ctx);

    // ★★ ここまで来て初めて「ログインできた」と言える
    return {
      kind: 'roster',
      page,
      audits: [
        { event: 'login', outcome: 'ok', detail: { flowId } },
        {
          event: 'read_girls',
          outcome: 'ok',
          // ★ people は defaultAuditSummary が「（在籍N人）」に使う
          detail: { people: page.rows.length, flowId },
        },
      ],
      note: '女の子一覧を読めた（' + page.rows.length + '名）。★ 駅ちかへは何も書いていない',
    };
  }

  // ★ 読めなかった。ここで初めて「ログイン画面が返ったのか」を疑う
  if (looksLikeEkichikaLoginPage(input.body)) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary:
            '駅ちかにログインできませんでした（ログイン画面が返りました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: 200, reason: 'login_page', bytes: input.body.length, flowId },
        },
      ],
      'ログイン後の女の子一覧としてログイン画面が返った＝ログインできていない',
    );
  }

  // ★ ログイン画面でもない＝読めたはずのページが読めていない。画面の作りが変わった疑い
  //   ★★ problems の本文には名前が混ざりうる。detail には件数だけ入れる（第44便の作法）
  return stop(
    [
      {
        event: 'read_girls',
        outcome: 'failed',
        summary: '駅ちかの女の子一覧を読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: {
          reason: page.rows.length === 0 ? 'parse_error' : 'page_broken',
          problems: page.problems.length,
          people: page.rows.length,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    '女の子一覧が読めない: ' + page.problems.join(' / ').slice(0, 300),
  );
}

/**
 * メールアドレス一覧の応答（第53便）。★ afterReadGirls と同じ順序の作法。
 *
 * ★★★ page.rows には【秘密値（投稿用アドレス）】が入る。
 *   ★ 監査ログにも note にも【値を出さない】。件数だけ。
 *   ★ 失敗の理由（problems）にもアドレスは混ざらない作りにしてある（パーサ側で castId しか出さない）。
 */
function afterReadMailList(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 300 && input.status < 400) {
    const location = String(input.headers['location'] ?? '');
    if (location.includes('/admin/login')) {
      return stop(
        [
          {
            event: 'login',
            outcome: 'failed',
            summary:
              '駅ちかにログインできませんでした（ログイン画面へ戻されました）。' +
              '店舗ID・ログインID・パスワードをご確認ください',
            detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
          },
        ],
        'ログイン後のメールアドレス一覧がログイン画面へ戻された＝ログインできていない',
      );
    }
    return stop(
      [
        {
          event: 'read_maillist',
          outcome: 'failed',
          summary: '駅ちかのメールアドレス一覧を開けませんでした（別の場所へ転送されました）',
          detail: { httpStatus: input.status, reason: 'redirected', flowId },
        },
      ],
      'メールアドレス一覧が想定外の場所へ転送された',
    );
  }

  if (input.status !== 200) {
    return stop(
      [
        {
          event: 'read_maillist',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      'メールアドレス一覧の応答が ' + input.status + ' だった',
    );
  }

  const page = parseEkichikaMailList(input.body);

  if (mailListUsable(page)) {
    return {
      kind: 'maillist',
      page,
      audits: [
        { event: 'login', outcome: 'ok', detail: { flowId } },
        {
          event: 'read_maillist',
          outcome: 'ok',
          // ★ 件数だけ。★ アドレスも名前も入れない
          // ★★ applied を入れない。入れないことが「読み取りの段」の目印になっている
          //   （mediaAudit.defaultAuditSummary が applied の有無で文言を分けている）
          detail: { people: page.rows.length, flowId },
        },
      ],
      note: 'メールアドレス一覧を読めた（' + page.rows.length + '名）。★ 駅ちかへは何も書いていない',
    };
  }

  if (looksLikeEkichikaLoginPage(input.body)) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary:
            '駅ちかにログインできませんでした（ログイン画面が返りました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: 200, reason: 'login_page', bytes: input.body.length, flowId },
        },
      ],
      'ログイン後のメールアドレス一覧としてログイン画面が返った＝ログインできていない',
    );
  }

  return stop(
    [
      {
        event: 'read_maillist',
        outcome: 'failed',
        summary:
          '駅ちかのメールアドレス一覧を読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: {
          reason: page.rows.length === 0 ? 'parse_error' : 'page_broken',
          problems: page.problems.length,
          people: page.rows.length,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    'メールアドレス一覧が読めない: ' + page.problems.join(' / ').slice(0, 300),
  );
}

/**
 * 出勤ページの応答。★ ここが【ログインの成否そのもの】。
 */
function afterReadWork(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 300 && input.status < 400) {
    const location = String(input.headers['location'] ?? '');
    if (location.includes('/admin/login')) {
      return stop(
        [
          {
            event: 'login',
            outcome: 'failed',
            summary:
              '駅ちかにログインできませんでした（ログイン画面へ戻されました）。' +
              '店舗ID・ログインID・パスワードをご確認ください',
            detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
          },
        ],
        'ログイン後の出勤ページがログイン画面へ戻された＝ログインできていない',
      );
    }
    return stop(
      [
        {
          event: 'read_work',
          outcome: 'failed',
          summary: '駅ちかの出勤ページを開けませんでした（別の場所へ転送されました）',
          detail: { httpStatus: input.status, reason: 'redirected', flowId },
        },
      ],
      '出勤ページが想定外の場所へ転送された',
    );
  }

  if (input.status !== 200) {
    return stop(
      [
        {
          event: 'read_work',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      '出勤ページの応答が ' + input.status + ' だった',
    );
  }

  // ★★★ 順序が大事。**まず「出勤ページとして読めるか」を試す。**
  //   読めた ＝ ログインできている。これがいちばん確かな証拠で、
  //   ログイン画面らしさの判定（誤検知しうるもの）を先に置いてはいけない。
  //   ★ 2026-08-28: 先に置いていたせいで「302で成功しているのに失敗と記録」した。
  let page: ReturnType<typeof parseWorkPage> | null = null;
  let parseError = '';
  try {
    page = parseWorkPage(input.body);
  } catch (e) {
    parseError = (e as Error).message.slice(0, 200);
  }

  const problems = page ? checkWorkPage(page) : ['読み取れなかった: ' + parseError];

  if (page && problems.length === 0) {
    // ★★ ここまで来て初めて「ログインできた」と言える
    const audits: FlowAudit[] = [
      { event: 'login', outcome: 'ok', detail: { flowId } },
      {
        event: 'read_work',
        outcome: 'ok',
        // ★ people は defaultAuditSummary が「（在籍N人）」に使う
        detail: { people: page.girls.length, days: page.dateLabels.length, flowId },
      },
    ];
    return finishRead(audits, ctx, page);
  }

  // ★ 読めなかった。ここで初めて「ログイン画面が返ったのか」を疑う
  if (looksLikeEkichikaLoginPage(input.body)) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary:
            '駅ちかにログインできませんでした（ログイン画面が返りました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: 200, reason: 'login_page', bytes: input.body.length, flowId },
        },
      ],
      'ログイン後の出勤ページとしてログイン画面が返った＝ログインできていない',
    );
  }

  // ★ ログイン画面でもない＝読めたはずのページが読めていない。画面の作りが変わった疑い
  return stop(
    [
      {
        event: 'read_work',
        outcome: 'failed',
        summary: '駅ちかの出勤ページを読み取れませんでした（画面の作りが変わった可能性があります）',
        // ★ problems の文面には駅ちかのURLが混ざる。detail には件数だけ入れる
        detail: {
          reason: page ? 'page_broken' : 'parse_error',
          problems: problems.length,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    '出勤ページが読めない: ' + problems.join(' / ').slice(0, 300),
  );
}

/** 読み取りまで成功したあと、intent ごとに次を決める。 */
function finishRead(audits: FlowAudit[], ctx: RelayFlowContext, page: WorkPage): FlowOutcome {

  switch (ctx.intent) {
    case 'connect_test':
      return {
        kind: 'done',
        audits,
        note: '接続テストに成功した（ログイン＋出勤ページの読み取りまで。書き換えはしていない）',
      };
    case 'work_dryrun':
      return {
        kind: 'plan_work',
        page,
        audits,
        note: '出勤ページを読めた。★ ここでフクエスの出勤と突き合わせる（送らない）',
      };
    case 'work_push':
      // ★ 送る側も、まず同じ形で計画を立て直す。**承認の時点ではなく、いま読んだページで組む。**
      //   指紋が承認時と違えば呼び出し側が止める（設計メモ §11-3）。
      return {
        kind: 'plan_work',
        page,
        audits,
        note: '出勤ページを読めた。★ 承認された内容と一致するか確かめてから送る',
      };
    case 'mail_dryrun':
    case 'mail_apply':
      // ★ ここへは来ない（メールの用事は出勤ページを読みに行かない）。★ 網羅は外さない
      return stop(audits, 'メールアドレスの取り込みは出勤ページを使わない（ここへは来ないはず）');
    case 'roster_read':
      // ★★ ここへは来ない（roster_read は出勤ページを読みに行かない）。
      //   ★ だが switch は網羅させる。網羅を外すと「足したのに繋いでいない」が静かに通る。
      return stop(audits, '名簿の読み取りは出勤ページを使わない（ここへは来ないはず）');
    case 'sokuhime_read':
    case 'sokuhime_push':
    case 'sokuhime_auto':
      // ★ ここへは来ない（即ヒメは出勤ページを読みに行かない）。★ 網羅は外さない（第213・214便）
      return stop(audits, '即ヒメは出勤ページを使わない（ここへは来ないはず）');
    case 'diary_read':
      // ★ ここへは来ない（写メ日記は出勤ページを読みに行かない）。★ 網羅は外さない
      //   ★★ この見張りが、いま実際に働いた: diary_read を足した時点でコンパイルが止まった（第94便）
      return stop(audits, '写メ日記の取り込みは出勤ページを使わない（ここへは来ないはず）');
    case 'photo_push':
      // ★ ここへは来ない（写真の送信は出勤ページを読みに行かない）。★ 網羅は外さない
      //   ★★ この見張りがまた働いた: photo_push を足した時点でコンパイルが止まった（第107便）
      return stop(audits, '写真の送信は出勤ページを使わない（ここへは来ないはず）');
    case 'diary_dryrun':
    case 'diary_push':
    case 'diary_auto':
    case 'sokusera_push':
    case 'sokusera_auto':
      // ★ ここへは来ない（エステ魂の日記は出勤ページを読みに行かない）。★ 網羅は外さない
      //   ★★★ 第130便でもこの見張りが働いた。★ intent を足した時点でコンパイルが止まった。
      return stop(audits, 'エステ魂の写メ日記は出勤ページを使わない（ここへは来ないはず）');
    case 'article_dryrun':
    case 'article_push':
    case 'article_slots':
    case 'article_auto':
      // ★★ ここへは来ない（新着情報は出勤ページを使わない）。
      //   ★ それでも【黙って通さない】。★ 来たら止める
      return stop(audits, '新着情報は出勤ページを使わない（ここへは来ないはず）');
    case 'girl_create':
      // ★ ここへは来ない（駅ちかの登録は女の子一覧しか使わない）。★ 網羅は外さない（第234便）
      //   ★★★ ここへ来たということは、登録の流れが出勤ページへ迷い込んだということ。
      //     ★ 人を増やす前に必ず止める
      return stop(audits, '駅ちかの登録は出勤ページを使わない（ここへは来ないはず）');
    case 'cast_create':
      // ★ ここへは来ない（エステ魂の登録は駅ちかの出勤ページを使わない）。★ 網羅は外さない（第232便）
      //   ★★★ 相手の媒体が違う。★ 人を増やす前に必ず止める
      return stop(audits, 'エステ魂の登録は駅ちかの出勤ページを使わない（ここへは来ないはず）');
    case 'cast_photo':
      // ★ ここへは来ない（エステ魂の写真は駅ちかの出勤ページを使わない）。★ 網羅は外さない（第243便）
      //   ★★★ 相手の媒体が違う。★ 1枚も送る前に必ず止める
      return stop(audits, 'エステ魂の写真は駅ちかの出勤ページを使わない（ここへは来ないはず）');
    case 'cast_hide':
      // ★ ここへは来ない（エステ魂の非表示は駅ちかの出勤ページを使わない）。★ 網羅は外さない（第229便）
      //   ★★★ ここへ来たということは、非表示の流れが駅ちかへ迷い込んだということ。
      //     ★ 相手の媒体が違う。★ 押す前に必ず止める
      return stop(audits, 'エステ魂の非表示は駅ちかの出勤ページを使わない（ここへは来ないはず）');
    case 'girl_delete':
      // ★ ここへは来ない（削除は女の子一覧しか使わない）。★ 網羅は外さない（第228便）
      //   ★★★ ここへ来たということは、削除の流れが出勤ページへ迷い込んだということ。
      //     ★ 消す前に必ず止める。★ 「たぶん大丈夫」で先へ進めない
      return stop(audits, '削除は出勤ページを使わない（ここへは来ないはず）');
    case 'work_auto':
      // ★★★ 自動反映（第48便）。組み立てから送信までを1回のフローで閉じる。
      //   ★ 指紋は突き合わせない（人が見た内容が無い・§53）。担保は厳しい方の blockers。
      return {
        kind: 'plan_work',
        page,
        audits,
        note: '出勤ページを読めた。★ 自動反映：厳しい方の見張りを通ったら送る',
      };
    default: {
      // ★★ intent を増やしたらここがコンパイルエラーになる。
      //   「足したのに繋いでいない」を静かに通さないための見張り（第40便 §4 と同じ形）
      const never: never = ctx.intent;
      return stop(audits, '扱い方の決まっていない intent: ' + String(never));
    }
  }
}

// ────────────────────────── 書き込みの応答 ──────────────────────────

/**
 * 出勤を書いたあとの応答（第46便）。
 *
 * ★★★ ここでは【成否を判定しない】。ログインのときとまったく同じ理由（このファイル冒頭）。
 *   駅ちかが更新に成功したとき何を返すか（302か200か・本文に何が出るか）は**未確認**。
 *   推測で「成功」と書くと、書けていないのに「更新しました」という監査ログが残る。
 *   → ★ **読み直して突き合わせた結果を、書き込みの成否そのものとする。**
 *
 * ★★ 失敗しても投げ直さない。全件上書きのフォームを再送するのは危険度が高い。
 *   人が画面を見て、もう一度承認するところからやり直す。
 */
function afterWriteWork(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 400) {
    return stop(
      [
        {
          event: 'write_work',
          outcome: 'failed',
          summary:
            '駅ちかの出勤を更新できませんでした（応答 ' + input.status + '）。' +
            '更新されたかどうかは確認が必要です',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      '書き込みの応答が ' + input.status + ' だった',
    );
  }

  // ★ ログイン画面へ戻された＝セッションが切れた。書けていない可能性が高いが、
  //   ★★ 「書けていない」と言い切らない。読み直して確かめる術がこの段では無い。
  const location = String(input.headers['location'] ?? '');
  if (input.status >= 300 && input.status < 400 && location.includes('/admin/login')) {
    return stop(
      [
        {
          event: 'write_work',
          outcome: 'failed',
          summary:
            '駅ちかの出勤を更新中にログイン画面へ戻されました。更新されたかどうかは確認が必要です',
          detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
        },
      ],
      '書き込み中にログイン画面へ戻された',
    );
  }

  // ★ ここで「成功」と書かない。次の段（読み直し）だけが成否を知っている。
  return {
    kind: 'next',
    next: {
      purpose: 'verify_work',
      method: 'GET',
      url: EKICHIKA_WORK_URL,
      headers: buildReadWorkRequest(ctx.cookie),
      body: '',
      context: ctx,
    },
    audits: [],
    note: '書き込みの応答を受け取った。★ 成否は読み直して突き合わせてから判定する',
  };
}

/**
 * 書いたあとに読み直したページ（第46便）。★ ここが【書き込みの成否そのもの】。
 *
 * 見ているのは3系統（verifyAfterWrite）:
 *   1. 人数        … 切り捨て（max_input_vars）の主症状
 *   2. セルの中身  … 1件ずつ
 *   3. 日別出勤人数… 画面側が自分で数えた値＝こちらの計算と独立した第2の目
 */
function afterVerifyWork(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const changed = ctx.changeCount ?? 0;

  const unknown = (reason: string, note: string): FlowOutcome =>
    stop(
      [
        {
          event: 'verify_work',
          outcome: 'failed',
          // ★★ 「更新できませんでした」と書かない。**確かめられなかった**が正確
          summary:
            '★ 駅ちかの出勤を更新後に読み直せませんでした。更新されたかどうかは確認が必要です',
          detail: { reason, flowId },
        },
      ],
      note,
    );

  if (input.status !== 200) return unknown('http_error', '読み直しの応答が ' + input.status + ' だった');

  let after: WorkPage | null = null;
  try {
    after = parseWorkPage(input.body);
  } catch {
    return unknown('parse_error', '読み直したページを解析できなかった');
  }
  if (checkWorkPage(after).length > 0) return unknown('page_broken', '読み直したページが読めない形だった');

  let sent: GirlWork[];
  try {
    sent = decodeGirlWork(ctx.sentPacked ?? '');
  } catch {
    return unknown('sent_broken', '送った内容を復元できなかった');
  }
  if (sent.length === 0) return unknown('sent_missing', '送った内容が文脈に残っていない');

  const v = verifyAfterWrite(sent, after, { expectedDateLabels: ctx.expectedDateLabels });

  if (v.ok) {
    // ★★ ここで初めて「更新した」と言える。write_work の 'ok' もこの瞬間に書く。
    return {
      kind: 'done',
      audits: [
        { event: 'write_work', outcome: 'ok', detail: { changed, people: sent.length, flowId } },
        { event: 'verify_work', outcome: 'ok', detail: { people: after.girls.length, flowId } },
      ],
      note: '書き込みと照合が終わった（変更' + changed + '件・' + sent.length + '名）',
    };
  }

  // ★★★ 一致しなかった。**ここは黙ってはいけない場所。**
  //   「送ったつもり」を作らないために、店舗に見える文言も強くしてある（mediaAudit）。
  return stop(
    [
      { event: 'write_work', outcome: 'ok', detail: { changed, people: sent.length, flowId } },
      {
        event: 'verify_work',
        outcome: 'failed',
        detail: { problems: v.problems.length, people: after.girls.length, flowId },
      },
    ],
    '書き込み後の照合が一致しない: ' + v.problems.map((p) => p.kind + ' ' + p.detail).join(' / ').slice(0, 300),
  );
}

// ══════════════════════════════════════════════════════════════════
// エステラブの段（第78便）
//
// ★★★ 駅ちかの段（login / read_work / …）には一切触れていない。
//   段の名前を分けることで、既存の判定に手を入れずに足せる。
//   ★ フロー文脈の形も変えていないので RELAY_FLOW_VERSION も据え置き。
//     → **走っている途中の駅ちかのジョブは、この便で止まらない。**
//
// ★★★ この2段でやるのは【ログインして名簿を読む】まで。**1文字も書き換えない。**
//   ★ 出勤を書く段（esulove_write_work）は、突き合わせ（mediaMatch）を挟んでから足す。
// ══════════════════════════════════════════════════════════════════

/**
 * エステラブのログインの応答。
 * ★ ここでは監査ログを書かない。まだ成否が分からないから（駅ちかの afterLogin と同じ作法）。
 */
function afterEsuloveLogin(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 400) {
    return stop(
      [{ event: 'login', outcome: 'failed', detail: { httpStatus: input.status, reason: 'http_error', flowId } }],
      'エステラブのログインの応答が ' + input.status + ' だった',
    );
  }

  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined);
  if (!cookie) {
    // ★ 解釈の余地なく失敗。セッションが無ければ次の GET は必ずログイン画面になる
    return stop(
      [{
        event: 'login',
        outcome: 'failed',
        summary:
          'エステラブにログインできませんでした（セッションが返りませんでした）。' +
          'ログインID・パスワードをご確認ください',
        detail: { httpStatus: input.status, reason: 'no_cookie', flowId },
      }],
      'エステラブのログインで Cookie が返らなかった',
    );
  }

  // ★★ エステラブは失敗しても 200 を返す作り。★ 本文でログイン画面かどうかを見る
  const judged = judgeEsuloveLogin(input.body);
  if (judged !== null && !judged.ok) {
    return stop(
      [{
        event: 'login',
        outcome: 'failed',
        summary:
          'エステラブにログインできませんでした（ログイン画面が返りました）。' +
          'ログインID・パスワードをご確認ください',
        detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
      }],
      'エステラブのログイン後にログイン画面が返った',
    );
  }
  // ★ judged === null は「見分けがつかない」。★ ここで止めない——次の一覧の応答で分かる。
  //   止めると、画面の作りが少し変わっただけで連携が全部止まる。★ 判断は材料が揃う段でする。

  const next = buildEsuloveTherapistListRequest(cookie);
  return {
    kind: 'next',
    audits: [],
    note: 'エステラブにログインできた（' + (judged === null ? '確証は次の段で' : '確認済み') + '）',
    next: {
      purpose: 'esulove_therapists',
      method: next.method,
      url: next.url,
      headers: next.headers,
      body: '',
      context: { ...ctx, cookie },
    },
  };
}

/**
 * エステラブのセラピスト一覧の応答。
 * ★★ 読めたら【次を積まない】。★ ここでエステラブとのやりとりは終わり。何も書き換えていない。
 */
function afterEsuloveTherapists(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;

  if (input.status >= 300 && input.status < 400) {
    const location = String(input.headers['location'] ?? '');
    if (location.includes('/admin/login')) {
      return stop(
        [{
          event: 'login',
          outcome: 'failed',
          summary:
            'エステラブにログインできませんでした（ログイン画面へ戻されました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: input.status, reason: 'back_to_login', flowId },
        }],
        'ログイン後のセラピスト一覧がログイン画面へ戻された＝ログインできていない',
      );
    }
    return stop(
      [{
        event: 'read_girls',
        outcome: 'failed',
        summary: 'エステラブのセラピスト一覧を開けませんでした（別の場所へ転送されました）',
        detail: { httpStatus: input.status, reason: 'redirected', flowId },
      }],
      'セラピスト一覧が ' + input.status + ' で転送された（' + ESULOVE_THERAPIST_URL + '）',
    );
  }

  if (input.status >= 400) {
    return stop(
      [{
        event: 'read_girls',
        outcome: 'failed',
        summary: 'エステラブのセラピスト一覧を開けませんでした',
        detail: { httpStatus: input.status, reason: 'http_error', flowId },
      }],
      'セラピスト一覧の応答が ' + input.status + ' だった',
    );
  }

  const parsed = parseEsuloveTherapists(input.body);
  if (parsed.rows.length === 0) {
    // ★★ 0人 と 読めなかった を混ぜない。★ ここへ来るのは「読めなかった」ほう
    //   （ログインできていない／画面の作りが変わった）。★ 「0人でした」と言わない
    return stop(
      [{
        event: 'read_girls',
        outcome: 'failed',
        summary: 'エステラブのセラピスト一覧を読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: { httpStatus: input.status, reason: 'parse_empty', flowId },
      }],
      'セラピスト一覧を1人も読み取れなかった: ' + (parsed.warnings[0] ?? '理由不明'),
    );
  }

  const dup = duplicateNames(parsed.rows);
  return {
    kind: 'esulove_roster',
    rows: parsed.rows,
    warnings: parsed.warnings,
    audits: [{
      event: 'read_girls',
      outcome: 'ok',
      // ★ 名前を監査ログに入れない。★ 件数だけ（mediaAudit の scrubAuditDetail と同じ考え）
      summary:
        'エステラブのセラピストを ' + parsed.rows.length + '人 読み取りました' +
        (dup.length > 0 ? '（★ 同じ名前が ' + dup.length + '組 あります）' : ''),
      detail: {
        count: parsed.rows.length,
        duplicates: dup.length,
        warnings: parsed.warnings.length,
        flowId,
      },
    }],
    note:
      'エステラブの名簿を ' + parsed.rows.length + '人 読めた' +
      (dup.length > 0 ? ' / ★ 同名 ' + dup.length + '組' : '') +
      (parsed.warnings.length > 0 ? ' / ★ 気になること ' + parsed.warnings.length + '件' : ''),
  };
}

// ────────────────────────── 写メ日記（第94便）──────────────────────────
//
// ★★★ この段は【読むだけ】。★ 駅ちかへ POST は1本も投げない。
// ★★ どの日記を開くかは、ここでは決めない。★ salon_diary_imports を読まないと決められないため、
//   一覧を読めたら呼び出し側へ返す（plan_work / maillist と同じ形）。

/** これから開く日記1件ぶん。★ 投稿日時は一覧でしか取れないので、ここで運ぶ。 */
export type DiaryQueueItem = { id: string; postedAt: string | null };

/** 一覧のNページ目を読む GET を組み立てる。★ 何ページ目かは文脈に残す。 */
export function buildReadDiaryListRequest(ctx: RelayFlowContext, pageNumber: number): FlowNextRequest {
  const n = Number.isFinite(pageNumber) && pageNumber > 1 ? Math.floor(pageNumber) : 1;
  return {
    purpose: 'read_diary_list',
    method: 'GET',
    url: ekichikaDiaryListUrl(n),
    headers: buildReadWorkRequest(ctx.cookie),
    body: '',
    // ★ diaryId は前の段の残りが混ざらないよう、ここで必ず消す
    context: { ...ctx, diaryPage: n, diaryId: undefined },
  };
}

/**
 * 日記1件を開く GET を組み立てる。
 * ★★★ 開きに行った日記IDを【文脈に残す】。★ 応答をパーサに渡すとき、突き合わせに使う。
 *   ★ 残さないと「別の日記が返ってきた」を見つけられない（＝Aさんの日記がBさんの名前で載る）。
 */
export function buildReadDiaryDetailRequest(
  ctx: RelayFlowContext,
  diaryId: string,
  postedAt?: string | null,
): FlowNextRequest {
  const url = ekichikaDiaryDetailUrl(diaryId); // ★ 数字でなければここで例外
  return {
    purpose: 'read_diary_detail',
    method: 'GET',
    url,
    headers: buildReadWorkRequest(ctx.cookie),
    body: '',
    context: { ...ctx, diaryId: String(diaryId), diaryPostedAt: postedAt ?? null },
  };
}

/**
 * ログインが切れていないかを見る（写メ日記の段で共通）。
 * ★ 転送でログイン画面へ戻された／本文がログイン画面だった、を1か所にまとめる。
 * ★ null なら「ログインは生きている」。
 */
function diaryLoginLost(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
  what: string,
): FlowOutcome | null {
  if (input.status >= 300 && input.status < 400) {
    const location = String(input.headers['location'] ?? '');
    if (location.includes('/admin/login')) {
      return stop(
        [
          {
            event: 'login',
            outcome: 'failed',
            summary:
              '駅ちかにログインできませんでした（ログイン画面へ戻されました）。' +
              '店舗ID・ログインID・パスワードをご確認ください',
            detail: { httpStatus: input.status, reason: 'back_to_login', flowId: ctx.flowId },
          },
        ],
        what + 'がログイン画面へ戻された＝ログインできていない',
      );
    }
    return null;
  }
  if (input.status === 200 && looksLikeEkichikaLoginPage(input.body)) {
    return stop(
      [
        {
          event: 'login',
          outcome: 'failed',
          summary:
            '駅ちかにログインできませんでした（ログイン画面が返りました）。' +
            'ログインID・パスワードをご確認ください',
          detail: { httpStatus: 200, reason: 'login_page', bytes: input.body.length, flowId: ctx.flowId },
        },
      ],
      what + 'としてログイン画面が返った＝ログインできていない',
    );
  }
  return null;
}

/**
 * 一覧の応答。
 * ★★ 読めなければ **止める**。★ 一覧が読めない＝この店では1件も進められない（全件に効く failure）。
 */
function afterReadDiaryList(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const pageNumber = Number.isFinite(ctx.diaryPage) && (ctx.diaryPage ?? 0) > 0 ? Number(ctx.diaryPage) : 1;

  const lost = diaryLoginLost(input, ctx, '写メ日記の一覧');
  if (lost) return lost;

  if (input.status >= 300 && input.status < 400) {
    return stop(
      [
        {
          event: 'read_diary_list',
          outcome: 'failed',
          summary: '駅ちかの写メ日記の一覧を開けませんでした（別の場所へ転送されました）',
          detail: { httpStatus: input.status, reason: 'redirected', page: pageNumber, flowId },
        },
      ],
      '写メ日記の一覧が想定外の場所へ転送された',
    );
  }

  if (input.status !== 200) {
    return stop(
      [
        {
          event: 'read_diary_list',
          outcome: 'failed',
          detail: { httpStatus: input.status, reason: 'http_error', page: pageNumber, flowId },
        },
      ],
      '写メ日記の一覧の応答が ' + input.status + ' だった',
    );
  }

  const page = parseEkichikaDiaryList(input.body);

  if (diaryListUsable(page)) {
    return {
      kind: 'diary_list',
      page,
      pageNumber,
      audits: [
        // ★ 一覧が読めた＝ログインできた（この作法は出勤・名簿と同じ）
        { event: 'login', outcome: 'ok', detail: { flowId } },
        {
          event: 'read_diary_list',
          outcome: 'ok',
          // ★ 件数とページ番号だけ。★ 日記の中身も名前も入れない
          detail: { diaries: page.rows.length, page: pageNumber, flowId },
        },
      ],
      note:
        '写メ日記の一覧を読めた（' + pageNumber + 'ページ目・' + page.rows.length + '件）。' +
        '★ 駅ちかへは何も書いていない。★ どれを開くかは呼び出し側が決める',
    };
  }

  return stop(
    [
      {
        event: 'read_diary_list',
        outcome: 'failed',
        summary: '駅ちかの写メ日記の一覧を読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: {
          reason: page.rows.length === 0 ? 'parse_error' : 'page_broken',
          problems: page.problems.length,
          diaries: page.rows.length,
          page: pageNumber,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    '写メ日記の一覧を読み取れなかった: ' + (page.problems[0] ?? '理由なし'),
  );
}

/**
 * 日記1件の応答。
 *
 * ★★★ 読めなかったときも 'diary_detail' で返す（stop にしない）。理由は FlowOutcome の説明のとおり。
 *   ★ 呼び出し側は必ず diaryDetailUsable() を見て、読めていないものは
 *     `skipped:unreadable` として記録すること（§375 のとおり1日1回だけ開き直る）。
 */
function afterReadDiaryDetail(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const flowId = ctx.flowId;
  const diaryId = String(ctx.diaryId ?? '');

  if (!diaryId) {
    // ★ どの日記を開いたのか分からない応答は、記録の書き先も決められない。★ 進めない
    return stop(
      [{ event: 'read_diary_detail', outcome: 'failed', detail: { reason: 'no_diary_id', flowId } }],
      '開きに行った日記IDが文脈に無い（buildReadDiaryDetailRequest を通していない）',
    );
  }

  const lost = diaryLoginLost(input, ctx, '写メ日記');
  if (lost) return lost;

  if (input.status !== 200) {
    // ★★ 1件のHTTP失敗で店ごと止めない。★ その日記だけ見送って、次の周へ回す
    const detail = parseEkichikaDiaryDetail('', diaryId);
    return {
      kind: 'diary_detail',
      detail,
      diaryId,
      audits: [
        {
          event: 'read_diary_detail',
          outcome: 'failed',
          summary: '駅ちかの写メ日記を1件開けませんでした',
          detail: { httpStatus: input.status, reason: 'http_error', flowId },
        },
      ],
      note: '日記 ' + diaryId + ' の応答が ' + input.status + ' だった。★ この1件だけ見送る',
    };
  }

  // ★★★ 開きに行った日記IDを必ず渡す（取り違えを見つけるため）
  const detail = parseEkichikaDiaryDetail(input.body, diaryId);

  if (diaryDetailUsable(detail)) {
    return {
      kind: 'diary_detail',
      detail,
      diaryId,
      audits: [
        {
          event: 'read_diary_detail',
          outcome: 'ok',
          // ★ 中身は入れない。★ 公開か・写真があるか、までにとどめる
          detail: {
            hasImage: detail.imageUrl !== null,
            isPublic: detail.isPublic === true,
            flowId,
          },
        },
      ],
      note:
        '日記 ' + diaryId + ' を読めた（' + (detail.isPublic ? '公開' : '非公開') + '・写真' +
        (detail.imageUrl ? 'あり' : 'なし') + '）。★ 駅ちかへは何も書いていない',
    };
  }

  return {
    kind: 'diary_detail',
    detail,
    diaryId,
    audits: [
      {
        event: 'read_diary_detail',
        outcome: 'failed',
        summary: '駅ちかの写メ日記を1件読み取れませんでした（画面の作りが変わった可能性があります）',
        detail: {
          reason: 'parse_error',
          problems: detail.problems.length,
          bytes: input.body.length,
          flowId,
        },
      },
    ],
    note: '日記 ' + diaryId + ' を読み取れなかった: ' + (detail.problems[0] ?? '理由なし'),
  };
}


// ────────────────────────── 写真の送信（第107便） ──────────────────────────
//
// ★★★ 3つの POST（upload / crop 3:4 / crop 正方形）のあいだに、必ず編集ページを読み直す。
//   ★ fuel_csrf_token をそのページから拾う。★ 使い捨てでも、cookie で回っていても、どちらでも壊れない。
//   ★ 代償は GET が2回増えるだけ。★ 写真の送信は1日に何度も無い。
//
// ★★ 応答は JSON。★ src が空なら message が理由（駅ちかの JS もそう読む）。
//   ★ JSON でなければ、ログイン画面が返った可能性 → diaryLoginLost と同じ形で止める。

function photoHeadersGet(ctx: RelayFlowContext): Record<string, string> {
  return {
    'user-agent': RELAY_USER_AGENT,
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    referer: EKICHIKA_LOGIN_URL,
    cookie: ctx.cookie,
  };
}

function photoHeadersPost(ctx: RelayFlowContext, urlencoded: boolean): Record<string, string> {
  const h: Record<string, string> = {
    'user-agent': RELAY_USER_AGENT,
    accept: 'application/json, text/javascript, */*; q=0.01',
    'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
    origin: EKICHIKA_ORIGIN,
    referer: ekichikaGirlEditUrl(ctx.photoGirlId ?? '0'),
    'x-requested-with': 'XMLHttpRequest',
    cookie: ctx.cookie,
  };
  // ★ ファイル付きのときは content-type を付けない（境界は curl が付ける・第106便）
  if (urlencoded) h['content-type'] = 'application/x-www-form-urlencoded';
  return h;
}

/** 編集ページを読みに行く。★ photoStage が「次に何をするか」を持っている。 */
export function buildReadPhotoPageRequest(ctx: RelayFlowContext): FlowNextRequest {
  if (!ctx.photoGirlId) throw new Error('photoGirlId が無い');
  return {
    purpose: 'read_photo_page',
    method: 'GET',
    url: ekichikaGirlEditUrl(ctx.photoGirlId),
    headers: photoHeadersGet(ctx),
    body: '',
    context: ctx,
  };
}

function photoStop(
  ctx: RelayFlowContext,
  reason: string,
  summary: string,
  note: string,
  extra?: Record<string, string | number | boolean | null>,
): FlowOutcome {
  return stop(
    [{ event: 'push_photo', outcome: 'stopped', summary, detail: { reason, slot: ctx.photoSlot ?? null, flowId: ctx.flowId, ...(extra ?? {}) } }],
    note,
  );
}

/**
 * ★★ 応答が読めなかったときに、原因を絞れるだけの材料を記録に残す（第107便の実弾で足りなかった）。
 *   ★ 2026-09-02 の初回: 大画像は駅ちかに入ったのに「応答が読めない」で止まり、番号しか残らず原因が絞れなかった。
 *   ★ 先頭100文字だけ。★ JSON なら { で始まるので、URL として落とされない（mediaAudit の scrub）。
 */
function responseClue(input: { status: number; headers: Record<string, string | string[]>; body: string }): Record<string, string | number | null> {
  const ct = input.headers['content-type'];
  return {
    httpStatus: input.status,
    responseType: Array.isArray(ct) ? String(ct[0] ?? '') : String(ct ?? ''),
    bodyBytes: input.body.length,
    bodyHead: input.body.slice(0, 100).replace(/\s+/g, ' '),
  };
}

/**
 * 編集ページの応答。★ 読めた＝ログインできている。★ ここから photoStage に応じて次の POST を組む。
 */
function afterReadPhotoPage(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const lost = diaryLoginLost(input, ctx, '編集ページ');
  if (lost) return lost;
  if (input.status !== 200) {
    return photoStop(ctx, 'http_' + input.status, '駅ちかの編集ページを開けませんでした（' + input.status + '）', '編集ページが ' + input.status);
  }
  const girlId = ctx.photoGirlId ?? '';
  const slot = ctx.photoSlot;
  const file = ctx.photoFile;
  if (!girlId || !isPhotoSlot(slot) || !file) {
    return photoStop(ctx, 'context_missing', '写真の送信に要る情報が揃っていません', '文脈に girlId / slot / file が無い');
  }

  const page = parsePhotoPage(input.body, girlId);
  if (page.problems.length > 0) {
    return stop(
      [{ event: 'read_photo_page', outcome: 'failed', summary: '駅ちかの編集ページの形が想定と違ったため止めました', detail: { reason: page.problems[0].slice(0, 100), slot, flowId: ctx.flowId } }],
      '編集ページが読めない: ' + page.problems.join(' / '),
    );
  }
  const ids = { girlId, shopId: page.shopId, slot, csrfToken: page.csrfToken };
  const stage = ctx.photoStage ?? 'upload';

  if (stage === 'upload') {
    // ★★ 枠に既に大画像があるかを見る。★ 上書きは呼び出し側が明示したときだけ…ではなく、
    //   第107便では【空き枠だけ】に送る（★ 初回の実弾は空き枠→目で見る→削除、の作法）。
    const target = page.slots.find((x) => x.slot === slot);
    if (target && target.hasImage) {
      return photoStop(ctx, 'slot_occupied', '指定した画像の枠（' + slot + '）には既に写真が入っているため送りませんでした', '枠 ' + slot + ' は使用中');
    }
    const multipart: RelayMultipart = {
      fields: buildUploadFields(ids),
      files: [{
        field: 'upfile',
        url: relayFileUrl(file.bucket, file.path),
        filename: file.filename,
        contentType: file.contentType,
      }],
    };
    return {
      kind: 'next',
      next: {
        purpose: 'upload_photo',
        method: 'POST',
        url: EKICHIKA_PHOTO_UPLOAD_URL,
        headers: photoHeadersPost(ctx, false),
        body: '',
        multipart,
        context: { ...ctx, photoStage: 'upload' },
      },
      audits: [{ event: 'read_photo_page', outcome: 'ok', detail: { slot, flowId: ctx.flowId } }],
      note: '編集ページを読めた（枠 ' + slot + ' は空き）。★ 次は大画像のアップロード',
    };
  }

  const src = ctx.photoSrc ?? '';
  if (!src) return photoStop(ctx, 'no_src', '前の段の応答に画像の場所がありませんでした', 'photoSrc が無い');

  if (stage === 'crop_main') {
    const rect = ctx.photoMainRect ?? centeredMainCrop(file.width, file.height);
    const fields = buildMainCropFields(ids, src, rect, { width: file.width, height: file.height });
    return {
      kind: 'next',
      next: {
        purpose: 'crop_photo',
        method: 'POST',
        url: EKICHIKA_PHOTO_CROP_URL,
        headers: photoHeadersPost(ctx, true),
        body: encodePayload(fields),
        context: { ...ctx, photoStage: 'crop_main' },
      },
      audits: [],
      note: '編集ページを読み直した。★ 次は大画像を 3:4 に切る（' + rect.w + '×' + rect.h + ' / 実寸 ' + file.width + '×' + file.height + '）',
    };
  }

  // crop_thumb
  const rect = ctx.photoThumbRect ?? { ...THUMB_DEFAULT_RECT };
  const fields = buildThumbCropFields(ids, src, rect);
  return {
    kind: 'next',
    next: {
      purpose: 'crop_photo',
      method: 'POST',
      url: EKICHIKA_PHOTO_CROP_URL,
      headers: photoHeadersPost(ctx, true),
      body: encodePayload(fields),
      context: { ...ctx, photoStage: 'crop_thumb' },
    },
    audits: [],
    note: '編集ページを読み直した。★ 次はサムネイルを正方形に切る（' + rect.w + '×' + rect.h + ' @ 300×400）',
  };
}

/** ①の応答。★ src と to_thumb を見て、②へ行くか③へ飛ぶかを決める。 */
function afterUploadPhoto(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const lost = diaryLoginLost(input, ctx, 'アップロードの応答');
  if (lost) return lost;
  const j = parsePhotoJson(input.body);
  if (j.problems.length > 0 || input.status !== 200) {
    return photoStop(
      ctx, 'upload_bad_response',
      '駅ちかへの写真のアップロードで想定外の応答がありました（' + input.status + '／' + (j.problems[0] ?? '形は読めたが番号が200ではない') + '）',
      'upload の応答が読めない: ' + (j.problems[0] ?? input.status),
      responseClue(input),
    );
  }
  if (!j.src) {
    return photoStop(ctx, 'upload_rejected', '駅ちかが写真を受け付けませんでした: ' + j.message.slice(0, 120), 'upload が断られた: ' + j.message);
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;
  const nextStage: 'crop_main' | 'crop_thumb' = j.toThumb ? 'crop_thumb' : 'crop_main';
  const next = buildReadPhotoPageRequest({ ...ctx, cookie, photoSrc: j.src, photoStage: nextStage });
  return {
    kind: 'next',
    next,
    audits: [{ event: 'push_photo', outcome: 'ok', summary: '駅ちかへ写真を1枚アップロードしました（切り抜きはこれから）', detail: { stage: 'upload', toThumb: j.toThumb, slot: ctx.photoSlot ?? null, flowId: ctx.flowId } }],
    note: '大画像を上げた（to_thumb=' + (j.toThumb ? 1 : 0) + '）。★ 次は ' + (j.toThumb ? 'サムネイル' : '3:4 の切り抜き') + 'のために編集ページを読み直す',
  };
}

/** ②③の応答。★ ②なら③へ、③なら終わり。 */
function afterCropPhoto(
  input: { status: number; headers: Record<string, string | string[]>; body: string },
  ctx: RelayFlowContext,
): FlowOutcome {
  const lost = diaryLoginLost(input, ctx, '切り抜きの応答');
  if (lost) return lost;
  const j = parsePhotoJson(input.body);
  const stage = ctx.photoStage;
  if (j.problems.length > 0 || input.status !== 200) {
    return photoStop(
      ctx, 'crop_bad_response',
      '駅ちかでの切り抜きで想定外の応答がありました（' + input.status + '／' + (j.problems[0] ?? '形は読めたが番号が200ではない') + '）',
      'crop の応答が読めない: ' + (j.problems[0] ?? input.status),
      responseClue(input),
    );
  }
  if (!j.src) {
    return photoStop(ctx, 'crop_rejected', '駅ちかが切り抜きを受け付けませんでした: ' + j.message.slice(0, 120), 'crop が断られた: ' + j.message);
  }
  const cookie = mergeCookies(ctx.cookie, input.headers['set-cookie'] as string | string[] | undefined) || ctx.cookie;

  if (stage === 'crop_main') {
    const next = buildReadPhotoPageRequest({ ...ctx, cookie, photoSrc: j.src, photoStage: 'crop_thumb' });
    return {
      kind: 'next',
      next,
      audits: [{ event: 'push_photo', outcome: 'ok', summary: '大画像を 3:4 に切り抜きました（サムネイルはこれから）', detail: { stage: 'crop_main', slot: ctx.photoSlot ?? null, flowId: ctx.flowId } }],
      note: '3:4 に切れた。★ 次はサムネイルのために編集ページを読み直す',
    };
  }
  if (stage === 'crop_thumb') {
    return {
      kind: 'done',
      audits: [{ event: 'push_photo', outcome: 'ok', summary: '駅ちかの画像の枠 ' + (ctx.photoSlot ?? '?') + ' に写真を1枚登録しました', detail: { stage: 'crop_thumb', slot: ctx.photoSlot ?? null, flowId: ctx.flowId } }],
      note: 'サムネイルまで切れた。★ 枠 ' + (ctx.photoSlot ?? '?') + ' に写真が入った',
    };
  }
  return photoStop(ctx, 'stage_unknown', '写真の送信の段が分からなくなったため止めました', 'photoStage が想定外: ' + String(stage));
}
