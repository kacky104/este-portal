import type { RelayFlowContext, FlowNextRequest } from './relayFlow';
import { buildEsutamaRosterRequest } from './esutamaRequests';

// ── 登録のあと、名簿を読み直す段を積む（第270便・2026-09-11）─────────────────
//
// ★★★ なぜ要るか
//   登録の流れは「名簿を読む → 作る → 写真」の順。★ 画面（セラピスト一覧）が見ている名簿の写しは**作る前**のまま。
//   ★ 店舗様が開き直すと、登録できた方が「いません」に見える（2026-09-11 16:15・カッキーさんも踏んだ）。
//   → ★ 流れの最後に**名簿をもう一度読む**。★ 読めれば呼び出し側が写しを保存する（saveEsutamaRoster・第109便のまま）。
//
// ★★ なぜ別ファイルか … esutamaFlow.ts と esutamaPhotoFlow.ts の**両方**から呼ぶ（写真ありは写真の照合のあと、写真なしは登録の照合のあと）。
//   ★ esutamaFlow → esutamaPhotoFlow の向きに import があるので、逆向きに足すと輪になる。★ 小さい第三の場所に置く。
//
// ★★ 相手に何も書かない（GET 1回）。★ 失敗しても登録・写真はもう終わっている（★ 記録には残る）。

export function buildEsutamaRosterRefreshStep(cookie: string, ctx: RelayFlowContext): FlowNextRequest {
  const r = buildEsutamaRosterRequest(cookie);
  return {
    purpose: 'esutama_roster',
    method: r.method,
    url: r.url,
    headers: r.headers,
    body: '',
    // ★ 段が変わるのでトークンは持ち回らない（cast_photo の入口と同じ）。★ 印を付けて、名簿の段の記録を1行にする
    context: { ...ctx, cookie, esutamaCsrf: undefined, createRosterRefresh: true },
  };
}
