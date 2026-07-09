// metadata の description 用：改行・連続空白を1スペースに畳んだプレーンテキストを N 字で切り詰める。
// 切り詰めた場合は末尾に「…」を付ける（jobs 詳細のローカル実装を共通化したもの）。
export function truncatePlain(text: string | null | undefined, max: number): string {
  if (!text) return '';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max)}…` : flat;
}
