// ★ 第1469便（2026-10-14・カッキーさん）: お店の画面に出すセラピストのメールアドレスは、@ の前の後ろ半分を伏せ字にする。
//   例: abcdef@gmail.com → abc***@gmail.com ／ ab@x.jp → a*@x.jp ／ a@x.jp → *@x.jp
//   ★ 見た目だけ（招待の再送・取り消しなどの処理はそのまま）。純粋な関数。
export function maskEmail(email: string | null | undefined): string {
  const s = String(email ?? '').trim();
  const at = s.lastIndexOf('@');
  if (at <= 0) return s ? '***' : '';
  const local = [...s.slice(0, at)];
  const keep = Math.floor(local.length / 2);
  return local.slice(0, keep).join('') + '*'.repeat(local.length - keep) + s.slice(at);
}
