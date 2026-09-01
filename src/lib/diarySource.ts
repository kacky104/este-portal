// 写メ日記の【入口】を1つに絞る判定（第99便・純粋関数）。
//
// ★★★ なぜ要るか —— 入口が2系統になっていた（第92〜98便の見落とし）
//   ベンリー経由のメール受信と、駅ちかからの取り込みを両方設定した店舗では、
//   同じ日記が diary_posts に2件並ぶ。
//     女の子が投稿 → ベンリーが駅ちかへ載せる
//                  → ベンリーがメールでフクエスへ送る    → 1件目
//                  → 15分後、フクエスが駅ちかを読む      → 2件目（同じ日記）
//   ★ 二重投稿の見張りは互いを知らない（メールは email_id・取り込みは日記ID）。
//
// ★★★ 受け取ってから重複判定する形にしてはいけない（第36便）。
//   本文が媒体側で整形されたり、時刻が数分ずれたりして、判定は必ずどこかで外れる。
//   「入口を1つに絞る」という一本の線で切るのが唯一確実。
//   ★ 30分以内の同タイトルを弾く案は【見送った】（本物が黙って落ちるため。第98便のメモ §1-2）。
//
// ★★ このファイルは通信もDBも触らない（mediaLinkMode.ts と同じ作法）。
//   ★ 入口の判定をここ1か所に集め、【3つの口が同じ物差しを見る】ようにする。
//     口ごとに条件を書くと、片方だけ直す日が必ず来る。

/**
 * 写メ日記の正本＝どこから受け取るか。★ 1列の別の値なので、2つ同時には立たない。
 *   benry    … 他媒体で書いた日記を、代行システム経由でメールで受け取る
 *   ekichika … 駅ちかの管理画面から取り込む（第92〜98便）
 *   fukues   … フクエスで書いて各媒体へ送る（＝受け取らない）
 */
export const DIARY_SOURCES = ['benry', 'ekichika', 'fukues'] as const;
export type DiarySource = (typeof DIARY_SOURCES)[number];

/** 列の既定値（salons.diary_source の default と同じ）。 */
export const DIARY_SOURCE_DEFAULT: DiarySource = 'benry';

export function isDiarySource(v: unknown): v is DiarySource {
  return typeof v === 'string' && (DIARY_SOURCES as readonly string[]).includes(v);
}

/**
 * 保存されている値を読む。
 * ★ 空（列が無い・null）は既定の 'benry'。★ 列の default と同じ読み方にする。
 * ★★★ 知らない値は 'unknown' のまま返す。【勝手に読み替えない】。
 *   読み替えると、値が壊れている店で静かに受け取ったり静かに取り込んだりする。
 *   'unknown' はどの入口も開かないが、呼ぶ側が【理由を記録できる】形にしてある（§372）。
 */
export function readDiarySource(v: unknown): DiarySource | 'unknown' {
  if (v === null || v === undefined || v === '') return DIARY_SOURCE_DEFAULT;
  return isDiarySource(v) ? v : 'unknown';
}

/** ★ メールで受け取る店か（/api/webhooks/resend-inbound）。 */
export function acceptsDiaryMail(source: unknown): boolean {
  return readDiarySource(source) === 'benry';
}

/** ★ 駅ちかから取り込む店か（/api/admin/diary-import）。 */
export function importsDiaryFromEkichika(source: unknown): boolean {
  return readDiarySource(source) === 'ekichika';
}

/** ★ フクエスが正本＝各媒体へ送る店か（forwardDiary.ts）。 */
export function forwardsDiaryFromFukues(source: unknown): boolean {
  return readDiarySource(source) === 'fukues';
}

/**
 * ★★★ 開いている入口の数。点検で「必ず1つ以下」を固定するためにある。
 *   ★ 入口を足す人は、ここに足して点検を通すこと。通らなければ線を引き忘れている。
 */
export function openDiaryEntrances(source: unknown): number {
  return [acceptsDiaryMail(source), importsDiaryFromEkichika(source), forwardsDiaryFromFukues(source)]
    .filter(Boolean).length;
}

/** 画面に出す名前。★ 知らない値は「未設定」（勝手に読み替えない）。 */
export function diarySourceTitle(source: unknown): string {
  switch (readDiarySource(source)) {
    case 'benry': return '他媒体で書く（代行システム経由で受け取る）';
    case 'ekichika': return '他媒体で書く（駅ちかから取り込む）';
    case 'fukues': return 'フクエスで書く（各媒体へ送る）';
    default: return '未設定';
  }
}

/** 記録に残す理由。★「受け取らなかった」を一緒くたにしない（§372 と同じ芯）。 */
export function diaryMailRejectReason(source: unknown): string {
  return 'rejected:source_is_' + readDiarySource(source);
}
