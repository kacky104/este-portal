// コラム月1自動リライトの「歯止め」（純関数だけ）。カッキーさん決定 2026-10-16。
//
// ★ 使い方（2か所から同じ関数を使う）:
//   ・実行時: scripts/column-refresh.mjs が node のネイティブ型ストリップで直接 import する
//     （node 23.6+ / CI は node 24。追加の依存・ビルドは要らない）。
//   ・番人: scripts/columnrefresh-selftest.js が tsc で _tmpcheck に出してから require する
//     （npm run check:columnrefresh）。
//
// ★ 方針: どれか1つでも引っかかったら「公開しない」＝ ok:false と理由を返す。
//   呼び出し側（スクリプト）は ok:false なら理由を出して exit 1 し、ファイルを書かない。
//   DB・Storage・認証には触れない。本文の Markdown だけを相手にする。
//
// ★ 列挙できる型（enum）や namespace は使わない（node の型ストリップで直接動かすため、
//   消せる型注釈だけで書く）。

export const MIN_RATIO = 0.7; // 新本文がこれ未満に縮んだら不合格
export const MAX_RATIO = 1.5; // 新本文がこれを超えて膨らんだら不合格

// 性的サービスを連想させる語。新本文に1つでもあれば不合格（健全なメンズエステ・
// リラクゼーションの範囲を外れる語をはじく）。
// ※「抜き」は「息抜き」等も巻き込むが、スペック通り保守的に倒す（誤検知なら人が確認する）。
export const BANNED_WORDS: string[] = [
  '抜き',
  '本番',
  '裏オプ',
  '基盤',
  '円盤',
  '手コキ',
  'フェラ',
  '射精',
  '中出し',
  '生中',
  'ゴックン',
  '即尺',
];

export interface GuardResult {
  ok: boolean;
  reason: string; // ok:false のときだけ中身が入る
}

// 文字数（絵文字なども1字で数えるためコードポイント単位）。
export function charCount(s: string): number {
  return Array.from(s).length;
}

// 内部リンク（](/ で始まるもの）の「](/…)」部分を重複なしで列挙する。
// リンク文字（[表示名] の側）が変わっても行き先が同じなら同じものとして扱える。
export function internalLinks(s: string): string[] {
  const out: string[] = [];
  const re = /\]\(\/[^)\s]*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (!out.includes(m[0])) out.push(m[0]);
  }
  return out;
}

// 「◯円」= 数字（半角/全角・区切り・小数点・万）＋円。空白を除いて正規化して列挙する。
export function moneyAmounts(s: string): string[] {
  const out: string[] = [];
  const re = /[0-9０-９][0-9０-９,，.．万]*\s*円/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    const norm = m[0].replace(/\s+/g, '');
    if (!out.includes(norm)) out.push(norm);
  }
  return out;
}

// 行頭の「## 」見出しの数（### 以下は数えない）。
export function headingCount(s: string): number {
  const m = s.match(/^##(?!#)\s/gm);
  return m ? m.length : 0;
}

// 電話番号らしき並び（日本の番号＝先頭0）。ハイフン区切り、または0始まりの長い数字列。
// 本文中の西暦日付（2026-… のように0始まりでない）は拾わない。
export function hasPhoneLike(s: string): boolean {
  if (/0\d{1,4}-\d{1,4}-\d{3,4}/.test(s)) return true; // 03-1234-5678 / 090-1234-5678 等
  if (/0\d{9,10}(?!\d)/.test(s)) return true; // 0312345678 のような連続10〜11桁
  return false;
}

// 歯止め本体。original（元の本文）と next（新しい本文）を比べ、公開してよいか返す。
// チェック順は「空・frontmatter → 文字数 → 内部リンク → 外部リンク → 電話 → 金額 → 見出し → 禁止語」。
export function checkRefresh(original: string, next: string): GuardResult {
  const ng = (reason: string): GuardResult => ({ ok: false, reason });

  // frontmatter を含んで返ってきた／空
  const trimmed = next.trim();
  if (trimmed === '') return ng('新本文が空');
  if (trimmed.startsWith('---')) return ng('新本文に frontmatter が含まれている（--- で始まっている）');

  // 文字数が元の MIN_RATIO 倍未満 or MAX_RATIO 倍超
  const on = charCount(original);
  const nn = charCount(next);
  if (on > 0 && nn < on * MIN_RATIO) return ng(`新本文が短すぎる（元 ${on} 字 → 新 ${nn} 字・${MIN_RATIO} 倍未満）`);
  if (on > 0 && nn > on * MAX_RATIO) return ng(`新本文が長すぎる（元 ${on} 字 → 新 ${nn} 字・${MAX_RATIO} 倍超）`);

  // 内部リンクが1つでも消えた
  for (const link of internalLinks(original)) {
    if (!next.includes(link)) return ng(`内部リンクが消えた: ${link}`);
  }

  // 新本文に http(s):// のリンク
  if (/https?:\/\//.test(next)) return ng('新本文に http(s):// のリンクがある');

  // 電話番号らしき並び
  if (hasPhoneLike(next)) return ng('新本文に電話番号らしき並びがある');

  // 元に無い「◯円」が増えた
  const origMoney = moneyAmounts(original);
  for (const money of moneyAmounts(next)) {
    if (!origMoney.includes(money)) return ng(`元に無い金額が増えた: ${money}`);
  }

  // ## 見出しの数が元より減った
  const oh = headingCount(original);
  const nh = headingCount(next);
  if (nh < oh) return ng(`## 見出しが減った（元 ${oh} → 新 ${nh}）`);

  // 禁止語リストに当たる
  for (const w of BANNED_WORDS) {
    if (next.includes(w)) return ng(`禁止語が含まれている: ${w}`);
  }

  return { ok: true, reason: '' };
}
