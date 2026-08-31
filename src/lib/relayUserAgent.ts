// 中継が名乗る User-Agent（第78便で1か所に集めた）。
//
// ★★★ なぜ別ファイルにしたか
//   もとは relayFlow.ts にあり、esuloveRequests.ts がそこから import していた。
//   ★ relayFlow.ts が esuloveRequests.ts を import した瞬間に **循環参照**になる。
//   → 両方が依存する定数だけを、依存の無いファイルへ出した。
//   ★ relayFlow.ts は再エクスポートしているので、既存の import 元は変えなくてよい。
//
// ★ relay-selftest と同じものを使う。★ 片方だけ変えない。
export const RELAY_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';
