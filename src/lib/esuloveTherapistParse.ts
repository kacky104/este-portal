// エステラブ管理画面「セラピスト」(/admin/shop/therapist) の読み取り（第76便・純粋関数）。
//
// ★★★ なぜ要るか — 追記46 §244
//   エステラブは、同じ名前でもう一度登録すると **黙って2人になる**（2026-08-31 実測）。
//   → 送る前に必ず名簿を読み、突き合わせる（mediaMatch.ts）。★ その入口がこれ。
//
// ★★★ この便で読むのは【一覧だけ】。1文字も書き換えない。★ 削除URLは組み立てない。
//   /admin/shop/therapist/delete/{id} は **GETリンク**（追記46 §249）。
//   ★ 辿った瞬間に消える。**このファイルから delete という語を出さない。**
//
// ★★★ 実測でわかった行の形（2026-08-31・ラビリンス様・43名）:
//   div.leftCol
//     div.therapistBlock
//       a.thumbBlock  href="/admin/shop/therapist_image/{id}"
//         div.thumb > img
//       div.nameBlock
//         div.statusBlock
//           div.status.-show   "表示"
//         a.castName  href="/admin/shop/therapist/edit/{id}"   ← ★ 名前はここ
//
// ★★★ 落とし穴（実測）: 編集リンクは【1人につき2つ】ある。
//   名前のリンク（a.castName）と、鉛筆アイコンのリンク。★ 43人で 86本。
//   → **編集リンクの数で人数を数えると2倍になる。** 数えるのは a.castName。
//   ★ 削除リンクは43本（1人1本）だったので、突き合わせの材料に使う。
//
// ★★ 表示/非表示のクラスは `-show` しか見ていない（全員が表示中だったため）。
//   ★ 非表示のときの名前は**分からない**。→ 知らないクラスは null にする。
//     「-show でないから非表示」と決めないこと（§26 と同じ罠）。

export type EsuloveTherapistRow = {
  /** エステラブ側の castId（編集URLの番号）。★ mediaMatch.ts へ渡す値 */
  castId: string;
  /** 表示名。★ 照合用の正規化はしない（normalizeName は呼び出し側の仕事） */
  name: string;
  /** class に付いていた生の文字列。★ 見ていない値をそのまま残す */
  statusRaw: string | null;
  /**
   * 掲載ページに出ているか。
   *   true  … '-show' が付いていた（実測で確認した唯一の値）
   *   null  … ★ 分からない（'-show' 以外／付いていない）。false にしない
   */
  visible: boolean | null;
};

export type EsuloveTherapistParse = {
  rows: EsuloveTherapistRow[];
  /** ★ 読めたが怪しいこと。★ 呼び出し側は【必ず人に見せる】。黙って捨てない */
  warnings: string[];
};

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

/** タグを落として、実体参照を戻す。★ 中身の加工はここまで（正規化はしない）。 */
function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** 属性の中から href を取る。★ シングル/ダブルどちらの引用符でも取る */
function hrefOf(attrs: string): string | null {
  const m = /href\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
  if (!m) return null;
  return m[2] ?? m[3] ?? null;
}

/** class に指定の語が含まれるか（語単位）。 */
function hasClass(attrs: string, name: string): boolean {
  const m = /class\s*=\s*("([^"]*)"|'([^']*)')/i.exec(attrs);
  const cls = m ? (m[2] ?? m[3] ?? '') : '';
  return cls.split(/\s+/).includes(name);
}

const EDIT_PATH = /\/admin\/shop\/therapist\/edit\/(\d+)/;

/**
 * 一覧HTMLから、castId と名前の対を取り出す。
 *
 * ★★ 同じ名前が2人居ても【まとめない】。それが分かることが、この読み取りの目的。
 * ★ 出てきた順のまま返す（並べ替えない）。
 */
export function parseEsuloveTherapists(html: string): EsuloveTherapistParse {
  const rows: EsuloveTherapistRow[] = [];
  const warnings: string[] = [];
  if (typeof html !== 'string' || html.length === 0) {
    return { rows, warnings: ['一覧のHTMLが空でした'] };
  }

  // ★ a.castName だけを拾う。★ 鉛筆アイコンのリンクは castName が付いていないので混ざらない
  const anchor = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  let editLinks = 0;
  while ((m = anchor.exec(html)) !== null) {
    const attrs = m[1];
    const href = hrefOf(attrs) ?? '';
    const idMatch = EDIT_PATH.exec(href);
    if (idMatch) editLinks += 1;
    if (!hasClass(attrs, 'castName')) continue;
    if (!idMatch) {
      warnings.push('名前のリンクに編集URLが入っていません');
      continue;
    }
    const name = textOf(m[2]);
    if (name.length === 0) {
      // ★ 名前が空の行は castId だけ返しても突き合わせられない。★ 黙って捨てず、数える
      warnings.push('名前が空の行がありました（castId ' + idMatch[1] + '）');
      continue;
    }
    rows.push({ castId: idMatch[1], name, statusRaw: null, visible: null });
  }

  if (rows.length === 0) {
    warnings.push('セラピストを1人も読み取れませんでした');
    return { rows, warnings };
  }

  // ★★ 実測では 編集リンク＝人数×2（名前＋鉛筆）だった。
  //   ここが崩れたら【画面の作りが変わった】合図。★ 読めた数を信じる前に言う
  if (editLinks !== rows.length * 2) {
    warnings.push(
      '編集リンクの数（' + editLinks + '）が、読み取った人数（' + rows.length + '）の2倍ではありません。' +
      '管理画面の作りが変わった可能性があります',
    );
  }
  return { rows, warnings };
}

/**
 * 同じ名前が2人以上いる組を返す。★ ㉟ で実際に起きた形。
 * ★ 名前はそのまま比べる（正規化は mediaMatch.normalizeName の仕事）。
 */
export function duplicateNames(rows: readonly EsuloveTherapistRow[]): Array<{ name: string; castIds: string[] }> {
  const map = new Map<string, string[]>();
  for (const r of rows) {
    const list = map.get(r.name) ?? [];
    list.push(r.castId);
    map.set(r.name, list);
  }
  const out: Array<{ name: string; castIds: string[] }> = [];
  map.forEach((castIds, name) => {
    if (castIds.length > 1) out.push({ name, castIds });
  });
  return out;
}

/** 読み取りの結果を、店舗が読んで分かる1行にする。★ 0人のときに「一致」と言わない。 */
export function parseSummary(p: EsuloveTherapistParse): string {
  if (p.rows.length === 0) return 'エステラブのセラピストを読み取れませんでした';
  const dup = duplicateNames(p.rows);
  const head = 'エステラブに ' + p.rows.length + '人 登録されています';
  if (dup.length === 0) return head;
  return head + '（★ 同じ名前が ' + dup.length + '組 あります: ' + dup.map((d) => d.name).join('・') + '）';
}
