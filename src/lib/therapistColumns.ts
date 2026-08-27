// therapists テーブルから引く列名を1か所にまとめる（第40便 §7-1）。
//
// ★★★ なぜこのファイルが要るか
//   「今すぐ」は枠が増える。2枠（オーナー・キャスト）→ 3枠（＋駅ちか取り込み・第39便）と増えた。
//   列名は .select('…') の【ただの文字列】なので、足し忘れてもコンパイルは通る。
//   通ったうえで読み出しが undefined になり、「駅ちかで即ヒメなのにフクエスに出ない」という
//   ★ 気づきにくい形で外れる。第39便メモが「今回いちばん危ない残り」と書いたのはこれ。
//   → 列名を1か所に集め、次に枠が増えるときに触るのを【このファイルだけ】にする。
//
// ★★ 1本の巨大定数にまとめないこと。
//   画面ごとに要る列は違う（salons!inner(is_hidden) の有無、user_id / catchphrase / body_type の有無）。
//   無理に統一すると全画面で要らない列を引くことになる。
//   → 【共通部分だけ】を定数にし、各 select はそれを埋め込む形にする。
//
// ★ 列名を実際に見張っているのは tools-test-imasugu-columns.mjs。
//   src 配下の .select( 文字列を走査して、今すぐ列の書き漏らしをテストで落とす。
//   （Supabase の生成型が無いので、DB境界は型では捕まえられない。テストが唯一の防御。）

/**
 * 「今すぐ」3枠の列名。
 * ★ 枠を増やすときに触るのはここ。ここを直せば下の各定数と、埋め込んでいる select が全部追随する。
 *
 *   is_available_now        / available_until          … オーナーが押した枠
 *   is_available_now_cast   / available_until_cast     … キャスト本人が押した枠
 *   is_available_now_import / available_until_import   … 駅ちかの「即ヒメ」から取り込んだ枠（第39便）
 *
 * ★ 3枠は【和集合】であって排他ではない。どれか1つでもライブなら「今すぐ」。
 *   判定は src/lib/imasugu.ts に集約してある。ここは列名だけを持つ。
 */
export const IMASUGU_COLUMNS =
  'is_available_now, available_until, is_available_now_cast, available_until_cast, is_available_now_import, available_until_import';

/**
 * 横スクロール・検索・新人・出勤中で使う共通のカード列。
 * 使用: TherapistScroller / TherapistSearch / newFaceTherapists / WorkingTherapists / therapistPool
 * ★ salons!inner(is_hidden) を含む（非公開店を除くため）。
 */
export const THERAPIST_CARD_COLUMNS =
  `id, name, work_hours, area, comment, salon_id, profile_image_url, age, ${IMASUGU_COLUMNS}, is_new_face, new_face_since, feature_badges, salons!inner(is_hidden)` as const;

/**
 * 店舗ページのセラピスト一覧で使う列。
 * 使用: components/SalonTherapists.tsx（4か所）/ app/lib/salonTherapists.ts
 * ★ salon_id で絞ってから引くので salons!inner は要らない。user_id / catchphrase を含む。
 */
export const SALON_THERAPIST_COLUMNS =
  `id, name, age, work_hours, area, comment, profile_image_url, ${IMASUGU_COLUMNS}, is_new_face, new_face_since, body_type, feature_badges, user_id, catchphrase` as const;

// ── ★★★ リテラル型が保たれていることのコンパイル時の見張り ────────────────
//
// ★ 第40便で分かった一番大事な事実:
//   supabase-js は .select() に渡された文字列を【型レベルで解析】して行の型を作る。
//   （Database の生成型が無くてもこれは効く。）
//   そのため定数の型が string に広がると、行の型が丸ごと GenericStringError に落ちて
//   「Property 'name' does not exist」がファイル全体に噴き出す。
//
//   ★ 文字列の連結（'a' + 'b'）やテンプレートリテラルは、そのままだと string に広がる。
//     だから上の2本には `as const` が要る。★ これを外さないこと。
//
//   下の型は、広がった瞬間に never になってコンパイルエラーになる。
//   ★ エラーが出たら「as const が外れた」か「+ で連結した」かのどちらか。
type AssertLiteral<T extends string> = string extends T ? never : T;
const _imasuguIsLiteral: AssertLiteral<typeof IMASUGU_COLUMNS> = IMASUGU_COLUMNS;
const _cardIsLiteral: AssertLiteral<typeof THERAPIST_CARD_COLUMNS> = THERAPIST_CARD_COLUMNS;
const _salonIsLiteral: AssertLiteral<typeof SALON_THERAPIST_COLUMNS> = SALON_THERAPIST_COLUMNS;
void _imasuguIsLiteral; void _cardIsLiteral; void _salonIsLiteral;
