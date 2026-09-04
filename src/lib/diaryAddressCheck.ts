// 写メ日記の投稿先アドレスの見張り（第133-4便・2026-09-04）。★ 純粋関数（禁則180）。
//
// ★★★ なぜ要るか（2026-09-04・ラビリンス様で実際に起きていた）
//   サラさんのアドレスだけドメインが違っていた:
//       正しい   shame.rank in g-deli.jp
//       入っていた shame.rank    g-deli.jp in   ← 'in' が真ん中から末尾へ
//   ★ 文字数は同じ21文字。★ 同じ文字が並び替わっただけ＝**打ち間違い**。
//   ★★ 記録で裏が取れた: 他36名は 8/29 10:21 に一括（取り込み）、
//     サラさんだけ 8/31 13:09 に単独 ＝ **個人画面から手で保存された**。
//
// ★★★ なぜ素通りしたか
//   保存の検査は looksLikeEmail（形が整っているか）だけだった。
//   ★ `@shame.rankg-deli.jpin` は**形としては正しいメールアドレス**。★ 弾けない。
//
// ★★★ 何が起きるはずだったか
//   正本をフクエスに切り替えた瞬間、サラさんの日記だけ**存在しないドメインへ飛ぶ**。
//   ★ 失敗は Resend 側にしか出ないので、画面は「送りました」のまま。
//   ★★ **静かに1人だけ届かない**——この案件でいちばん避けたい形。
//
// ★★★ どう見張るか: **ドメインを決め打ちしない。**
//   ★ 'shame.ranking-deli.jp' と書いてしまうと、媒体が変えた日に全員保存できなくなる。
//   → **同じ店・同じ媒体の他の在籍と見比べて、1人だけ違うなら止める。**
//   ★ 他が少ないとき（3人未満）は判断しない。★ 分からないときは通す（保存を止めない）。

/** アドレスの @ より後ろ。★ 小文字に揃える（ドメインは大小を区別しない） */
export function domainOf(address: string): string {
  const s = String(address ?? '').trim();
  const at = s.lastIndexOf('@');
  if (at < 0 || at === s.length - 1) return '';
  return s.slice(at + 1).toLowerCase();
}

export type AddressDomainVerdict =
  | { ok: true }
  | { ok: false; message: string; majority: string; got: string };

/** ★ これ未満しか他が居なければ、多数派を決めない（＝通す） */
const MIN_OTHERS = 3;
/** ★ 他のうちこの割合以上が同じドメインのときだけ「多数派」と呼ぶ */
const MAJORITY_RATIO = 0.8;

/**
 * ★★★ 1人だけドメインが違わないか。
 *
 * ★ 通す側に倒す条件（★ 保存を止めるのは確信があるときだけ）:
 *   ・他が3人未満        … 比べる相手が居ない
 *   ・多数派が8割未満     … そもそも揃っていない店
 *   ・ドメインが同じ      … 問題なし
 */
export function checkAddressDomain(input: {
  address: string;
  /** 同じ店・同じ媒体の【他の】在籍のアドレス。★ 本人は含めない */
  others: readonly string[];
}): AddressDomainVerdict {
  const got = domainOf(input.address);
  if (!got) return { ok: true };   // ★ 形の検査は別の場所（looksLikeEmail）の仕事

  const domains = input.others.map(domainOf).filter((d) => d.length > 0);
  if (domains.length < MIN_OTHERS) return { ok: true };

  const count = new Map<string, number>();
  for (const d of domains) count.set(d, (count.get(d) ?? 0) + 1);

  let majority = '';
  let best = 0;
  // ★ 同数のときは五十音順で固定（★ 毎回同じ結果にする＝点検で固定できる）
  for (const [d, n] of [...count.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))) {
    if (n > best) { best = n; majority = d; }
  }
  if (best / domains.length < MAJORITY_RATIO) return { ok: true };
  if (got === majority) return { ok: true };

  return {
    ok: false,
    majority,
    got,
    // ★★ 「間違っています」と決めつけない。★ 打ち間違いが圧倒的に多いが、断定はしない
    message:
      'この店舗の他の方は「@' + majority + '」宛です。入力されたのは「@' + got + '」で、'
      + '1文字違いの打ち間違いの可能性があります。'
      + 'アドレスをもう一度お確かめください（このドメインで合っている場合は運営までご連絡ください）',
  };
}
