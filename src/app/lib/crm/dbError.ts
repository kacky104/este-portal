// フクエスCRM: DB（PostgREST）のエラーを、店舗様の画面に出せる日本語にする（2026-10-09 点検・低）。
// ★ 前は `error: error.message` で Postgres の英語（表名・制約名・列名）がそのまま画面に出ていた。受付スタッフには読めない。
// ★ 生の文は console.error に残す（Vercel のログで見られる）。23505/23P01（重なり）など、呼び出し側で先に日本語にしている所はそのまま。
const CODE_TEXT: Record<string, string> = {
  '23505': '同じものがすでにあります',
  '23P01': 'ほかの予約と重なっています',
  '23503': '関連する記録が見つかりません',
  '23514': '入力の値が決まりに合いません',
  '22001': '文字が長すぎます',
  '22P02': '入力の形が正しくありません',
  '42501': '権限がありません',
  '57014': '時間がかかりすぎて止まりました',
  PGRST301: 'ログインの期限が切れました（画面を更新してください）',
};

export function dbMessage(e: { message?: string | null; code?: string | null; details?: string | null } | null | undefined, what = '処理'): string {
  const code = e?.code ? String(e.code) : '';
  const raw = e?.message ? String(e.message) : '';
  console.error(`[crm] db error ${code}: ${raw}${e?.details ? ' / ' + String(e.details) : ''}`);
  // 日本語の文（アプリ側の RAISE や既に訳した文）はそのまま
  if (/[぀-ヿ一-龯]/.test(raw)) return raw;
  const hint = CODE_TEXT[code];
  return hint
    ? `${what}できませんでした（${hint}）。もう一度お試しください`
    : `${what}できませんでした${code ? `（コード ${code}）` : ''}。もう一度お試しください`;
}
