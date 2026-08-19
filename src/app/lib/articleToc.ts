// コラム記事本文（Markdown）の目次（もくじ）を作るための共通ロジック。
// 本体 /column/[slug] と求人 /jobs/column/[slug] の両方がここを読む（2026-08-19 第24便）。
//
// ★ 設計の要点
//   - id は「見出しの文言」から作る（並び順からは作らない）。
//     途中に見出しを1本足しても、既存の見出しの id は変わらない＝共有されたURLが死なない。
//   - id は必ず ASCII（日本語をそのまま id にすると、URLの # が処理系によって
//     パーセントエンコードされたりされなかったりして一致しなくなる）。
//   - 目次側（Markdown文字列から抽出）と本文側（描画された見出し）が、
//     同じ関数 headingId() で同じ id を作る。だから片方だけずれることが無い。
//   - JavaScript は一切使わない。素の <a href="#id"> と id 属性だけで動く。

export type ArticleHeading = { id: string; text: string };

// FNV-1a（32bit）→ 36進。短くて衝突しにくく、同じ文字列なら常に同じ値になる。
function hash32(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    // 32bit の FNV 素数 16777619 倍。オーバーフローを避けるため分けて掛ける。
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * 見出しの文言から id を作る。
 * seen は「同じ文言が2回以上出たとき」に -2 -3 と枝番を付けるための持ち回り。
 * 目次側・本文側とも、記事の先頭から順に呼ぶこと（枝番の付き方を揃えるため）。
 */
export function headingId(text: string, seen: Map<string, number>): string {
  const key = text.replace(/\s+/g, ' ').trim();
  const n = (seen.get(key) ?? 0) + 1;
  seen.set(key, n);
  return n === 1 ? `h-${hash32(key)}` : `h-${hash32(key)}-${n}`;
}

// 見出し行に残る行内記法（強調・リンク・インラインコード）を落として、
// 描画後の見出しテキストと同じ文字列にする。
function headingTextFromMarkdown(raw: string): string {
  return raw
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`+([^`]*)`+/g, '$1')
    .replace(/\*{1,3}/g, '')
    .replace(/(^|[\s(（「『【])_{1,3}(?=\S)/g, '$1')
    .replace(/(?<=\S)_{1,3}(?=[\s)）」』】.,、。!?！？]|$)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 本文 Markdown から h2 見出し（`## 〜`）だけを出現順に取り出す。
 * h3 は入れない（用語解説のように h3 が20本ある記事で目次が本文より長くなるため）。
 */
export function extractArticleHeadings(body: string | null | undefined): ArticleHeading[] {
  if (!body) return [];
  const seen = new Map<string, number>();
  const out: ArticleHeading[] = [];
  let inFence = false;
  let fence = '';

  for (const line of body.split(/\r?\n/)) {
    // コードフェンスの中は見出しとして数えない。
    const fenceHit = /^[ \t]*(`{3,}|~{3,})/.exec(line);
    if (fenceHit) {
      if (!inFence) {
        inFence = true;
        fence = fenceHit[1][0];
      } else if (fenceHit[1][0] === fence) {
        inFence = false;
      }
      continue;
    }
    if (inFence) continue;

    // 引用（>）の中に書かれた見出しも h2 として描画されるので、引用記号を外してから判定する。
    // ★ ここを外すと「目次の項目数」と「本文の h2 の数」がずれる（第24便の検証で実際に踏んだ）。
    const unquoted = line.replace(/^[ \t]*(?:>[ \t]?)+/, '');

    // 「## 見出し」だけを拾う（### は h3 なので拾わない）。
    const m = /^[ \t]{0,3}##[ \t]+(.+?)[ \t]*#*[ \t]*$/.exec(unquoted);
    if (!m) continue;
    const text = headingTextFromMarkdown(m[1]);
    if (!text) continue;
    out.push({ id: headingId(text, seen), text });
  }
  return out;
}

/** 目次を出す最低本数。これ未満の記事では目次を描画しない（短い記事では邪魔なため）。 */
export const TOC_MIN_HEADINGS = 3;
