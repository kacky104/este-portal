// 駅ちか管理画面「女の子一覧」(/admin/girls/) の読み取り（第50便・純粋関数）。
//
// ★★★ なぜ要るか — 設計メモ 追記18 §81 の1番目
//   いま「駅ちかにいてフクエスにいない人」は、1日1回の取り込みの未照合からしか分からず、
//   最大24時間古い（追記17 §72）。★ しかも公開ページ経由なので、
//   **駅ちか側に登録されているが公開ページに出ていない子は、そもそも見えない。**
//   → 管理画面の一覧を直接読めば、駅ちかの名簿そのものが取れる。
//
// ★★★ この便で読むのは【一覧だけ】。1文字も書き換えない。
//   削除・登録は追記18 §81 の3番目と4番目。★ 順番を崩さない。
//
// ★★★ 実測でわかった行の形（2026-08-29・掲載A shopid 37168・37人）:
//   <li class="girls-cell  state-later ui-sortable-handle">
//     <input type="hidden" name="girls_id[5232208]" value="5232208">      並び順
//     <div class="customer_checkbox_wrapper">
//       <input class="chck_girls_id" name="chck_girls_id[5232208]" type="checkbox" value="5232208">
//     <p class="girl-name">さら</p>
//     <div class="girl-image"><img src="...img<数字>s_<数字>.jpg"></div>
//     <div class="girl-btn">
//       <a href=".../admin/girls/edit/5232208"><img alt="編集"></a>
//       <a href=".../admin/girls/delete/5232208"><img alt="削除"></a>
//     <div class="girl-btn2"><a ...><img alt="出勤登録"></a>
//
//   ★ 37件すべてで chck_girls_id の添字＝値＝girls_id＝編集URL＝削除URL＝castId が一致した。
//
// ★★★ state-XXX は【出勤の状態】であって公開/非公開ではない。
//   ページの凡例（実測）: 「※赤：即ヒメ!! ピンク：現在出勤中 ブルー：本日出勤」
//   ★ 実際に見えたのは state-later（＝ブルー＝本日出勤）だけ。
//   → **見ていない名前を勝手に決めない。** 生の文字列を残し、later だけ意味を付ける。
//
// ★★ 写真の有無は【この一覧からは判定できない】。
//   「NO PHOTO」の子も同じ形式（img<数字>s_<数字>.jpg）の画像を持っている＝
//   店舗が置いた差し替え画像で、欠落とは区別が付かない。★ 推測で hasPhoto を作らない。

/** 一覧の1人ぶん。 */
export type EkichikaGirlRow = {
  /** 駅ちかの castId（＝管理画面の girl_id ＝公開ページの番号）。実測で3か所一致 */
  castId: string;
  /** 表示名。★ 照合用の正規化はしない（normalizeName は呼び出し側の仕事） */
  name: string;
  /**
   * 出勤の状態。★ 公開/非公開ではない。
   *   'today'   … state-later（ブルー＝本日出勤）。実測で確認した唯一の値
   *   null      … state-* が付いていない
   *   その他    … 見たことがない state-*。★ raw に生の文字列が入る
   */
  workState: 'today' | 'unknown' | null;
  /** state-XXX の XXX をそのまま。★ 知らない状態が来たとき、あとから読めるように残す */
  raw: string | null;
  /**
   * ★★★★★ **削除リンクの行き先そのまま**（第238便・2026-09-10）。
   *   実測（ブラウザで手押し削除・2026-09-10 02:13）:
   *     `GET https://ranking-deli.jp/admin/girls/delete/5810254&gl=Hdly` → 302 → /admin/girls
   *   ★★★ **駅ちかの削除は POST ではなく GET。** ★ 一括削除フォームの POST では消えない（実弾で確認）。
   *   ★★ 末尾の `&gl=XXXX` は**毎回変わる**（§2-5）。★ だから**組み立てず、読んだ href をそのまま使う。**
   *   ★ 読めなければ null。★ そのときは**削除しない**（★ 番号だけで URL を作らない）。
   */
  deleteHref: string | null;
};

export type EkichikaGirlsPage = {
  rows: EkichikaGirlRow[];
  /**
   * ★★★ 一覧ページの中にある一括操作フォームの使い捨てトークン（第228便・2026-09-09）。
   *   ★ 削除（POST /admin/girls/ ＋ girls_list_action=delete_girl）に要る。
   *   ★ 読み取りだけの用（roster_read）には要らないので、**無くても problems には足さない**。
   *     ★ 足すと「名簿を読む」が使えなくなる。★ 要るかどうかは呼び出し側が決める。
   */
  csrfToken: string | null;
  /**
   * ★★★★ 一括操作フォームの **action 属性**（第235便・2026-09-10・設計メモ §17-8）。
   *   ★ 削除は `EKICHIKA_GIRLS_URL` を決め打ちしていた。★ 動いている出勤だけが
   *     「読んだフォームの action」へ送っていた。→ 削除も読んだ action へ送れるようにする。
   *   ★ 相対なら `https://ranking-deli.jp/admin/girls/` を土台に絶対へ直す。
   *   ★ 見つからなければ null（★ そのときは呼び出し側が決め打ちに落とす）。
   */
  formAction: string | null;
  /**
   * ★★★ 読めたが信用できない理由。空でなければ **使わせない**。
   *   数を返して黙るのが一番危ない（第35便の反省6・第43便-b §26）。
   */
  problems: string[];
};

// ── 小道具 ─────────────────────────────────────────────────────────────

const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
};

/** タグを落として実体参照を戻し、前後の空白を畳む。★ 表示名を作るだけ。 */
export function textOf(htmlFragment: string): string {
  return String(htmlFragment ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, n: string) => ENTITIES[n.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** class 属性から state-XXX を1つ取る。 */
function stateOf(classAttr: string): { workState: EkichikaGirlRow['workState']; raw: string | null } {
  const m = /\bstate-([A-Za-z0-9_-]+)/.exec(classAttr);
  if (!m) return { workState: null, raw: null };
  const raw = m[1];
  // ★ 実測で意味が確かめられているのは later（ブルー＝本日出勤）だけ。
  //   他は「知らない」と言う。★ 勝手に「出勤中」などと名付けない。
  return { workState: raw === 'later' ? 'today' : 'unknown', raw };
}

// ── 本体 ───────────────────────────────────────────────────────────────

/** 行の頭。★ class に girls-cell を含む <li> を探す（他の属性の順番に依存しない）。 */
const CELL_HEAD = /<li\b[^>]*\bclass="([^"]*\bgirls-cell\b[^"]*)"[^>]*>/gi;

/**
 * 女の子一覧を読む。
 *
 * ★★★ この関数は「読めたか」を厳しく言う。**空を成功として返さない。**
 *   一覧が空＝取得失敗かレイアウト変更（禁則207・ingest-list と同じ作法）。
 *
 * ★★★ 番号の一致を必ず検査する。
 *   chck_girls_id の添字は【削除で送る番号】。編集URLの番号と食い違ったまま通すと、
 *   将来ここを削除に使ったときに **別人を消す**。★ 読み取りの段で弾いておく。
 */
/**
 * 一括操作フォームの使い捨てトークンを拾う（★ name / value の順が入れ替わっても読めるように2通り見る）。
 * ★ 見つからなければ null。★ ここでは警告を出さない（上の型のコメント参照）。
 */
export function readGirlsCsrfToken(html: string): string | null {
  const src = String(html ?? '');
  const a = /name="fuel_csrf_token"[^>]*?value="([^"]*)"/i.exec(src)?.[1];
  if (a) return a;
  const b = /value="([^"]*)"[^>]*?name="fuel_csrf_token"/i.exec(src)?.[1];
  return b ? b : null;
}

/** 一括操作フォームの送り先（action）。★ `girls_list_action` を持つ form を選ぶ。★ 無ければ null */
export function readGirlsFormAction(html: string, baseUrl = 'https://ranking-deli.jp/admin/girls/'): string | null {
  const src = String(html ?? '');
  const opens = /<form\b[^>]*>/gi;
  for (let m = opens.exec(src); m !== null; m = opens.exec(src)) {
    const st = m.index + m[0].length;
    const ce = src.toLowerCase().indexOf('</form>', st);
    const inner = src.slice(st, ce >= 0 ? ce : src.length);
    // ★ 一括操作のフォームだけが持っている欄（削除・一括公開などの指示を入れる欄）
    if (!/name="girls_list_action"/i.test(inner) && !/name="chck_girls_id\[/i.test(inner)) continue;
    const raw = /\baction\s*=\s*"([^"]*)"/i.exec(m[0])?.[1]?.trim()
      ?? /\baction\s*=\s*'([^']*)'/i.exec(m[0])?.[1]?.trim() ?? '';
    return resolveGirlsUrl(baseUrl, raw);
  }
  return null;
}

/** ★ href の実体参照（`&amp;` など）を戻す。★ `&gl=` が `&amp;gl=` で書かれていることがある */
function unescapeHref(href: string): string {
  return String(href ?? '').replace(/&amp;/g, '&').trim();
}

/** ★ 相対 action を絶対へ。★ 分からない形はそのまま返す（★ 組み立て直さない） */
function resolveGirlsUrl(base: string, href: string): string {
  const h = String(href ?? '').trim();
  if (!h) return base;                                          // ★ action="" ＝ そのページ自身
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(h)) return h;
  const m = /^([a-zA-Z][a-zA-Z0-9+.-]*:\/\/[^/?#]+)([^?#]*)/.exec(base);
  if (!m) return h;
  if (h.startsWith('//')) return (/^([a-zA-Z][a-zA-Z0-9+.-]*:)/.exec(base)?.[1] ?? 'https:') + h;
  if (h.startsWith('/')) return m[1] + h;
  return m[1] + (m[2] || '/').replace(/[^/]*$/, '') + h;
}

export function parseEkichikaGirls(html: string): EkichikaGirlsPage {
  const src = String(html ?? '');
  const problems: string[] = [];
  const rows: EkichikaGirlRow[] = [];

  // 1. 行の開始位置を全部拾い、隣どうしで切る（</li> の対応を数えなくて済む）
  const heads: Array<{ index: number; end: number; classAttr: string }> = [];
  CELL_HEAD.lastIndex = 0;
  for (let m = CELL_HEAD.exec(src); m !== null; m = CELL_HEAD.exec(src)) {
    heads.push({ index: m.index, end: m.index + m[0].length, classAttr: m[1] });
  }

  if (heads.length === 0) {
    // ★ ログイン画面が返っている／作りが変わった、のどちらか。数を返して黙らない
    problems.push('女の子一覧の行（girls-cell）が1件も見つからない。取得失敗かレイアウト変更を疑うこと');
    return { rows, problems, csrfToken: readGirlsCsrfToken(src), formAction: readGirlsFormAction(src) };
  }

  const seen = new Set<string>();

  for (let i = 0; i < heads.length; i++) {
    const chunk = src.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].index : src.length);

    const castId = /name="chck_girls_id\[(\d+)\]"/.exec(chunk)?.[1] ?? null;
    if (!castId) {
      problems.push(heads.length + '件中' + (i + 1) + '件目に chck_girls_id が無い');
      continue;
    }

    // ★★★ 番号の突き合わせ。1つでも食い違えば、その行は使わない
    const editId = /\/admin\/girls\/edit\/(\d+)/.exec(chunk)?.[1] ?? null;
    // ★★★★ 削除リンクは **href をまるごと**拾う（第238便）。★ `&gl=` が付いていて毎回変わる
    const delHrefRaw = /href="([^"]*\/admin\/girls\/delete\/\d+[^"]*)"/i.exec(chunk)?.[1]
      ?? /href='([^']*\/admin\/girls\/delete\/\d+[^']*)'/i.exec(chunk)?.[1] ?? null;
    const delId = /\/admin\/girls\/delete\/(\d+)/.exec(chunk)?.[1] ?? null;
    const orderId = /name="girls_id\[(\d+)\]"/.exec(chunk)?.[1] ?? null;
    const mismatch = [
      editId !== null && editId !== castId ? '編集URL(' + editId + ')' : '',
      delId !== null && delId !== castId ? '削除URL(' + delId + ')' : '',
      orderId !== null && orderId !== castId ? '並び順(' + orderId + ')' : '',
    ].filter(Boolean);
    if (mismatch.length > 0) {
      problems.push(
        'castId ' + castId + ' の行で番号が食い違っている: ' + mismatch.join('・') +
          '。★ 削除に使うと別人を消すので、この一覧は使わない',
      );
      continue;
    }

    if (seen.has(castId)) {
      problems.push('castId ' + castId + ' が一覧に2回出てくる');
      continue;
    }
    seen.add(castId);

    const nameHtml = /<p\b[^>]*\bclass="[^"]*\bgirl-name\b[^"]*"[^>]*>([\s\S]*?)<\/p>/i.exec(chunk)?.[1] ?? '';
    const name = textOf(nameHtml);
    if (!name) {
      // ★ 名前が読めない子は落とすが、黙って落とさない（何人落ちたかが分かるように）
      problems.push('castId ' + castId + ' の名前が読めない');
      continue;
    }

    const { workState, raw } = stateOf(heads[i].classAttr);
    // ★ 相対なら絶対へ。★ 読めなければ null のまま（★ 番号から組み立てない）
    const deleteHref = delHrefRaw
      ? resolveGirlsUrl('https://ranking-deli.jp/admin/girls/', unescapeHref(delHrefRaw))
      : null;
    rows.push({ castId, name, workState, raw, deleteHref });
  }

  // 2. 取りこぼしの見張り。★ 半分以上落ちたら、部分的な成功として使わせない
  if (rows.length === 0) {
    problems.push('行は見つかったが、1件も読み取れなかった');
  } else if (rows.length * 2 < heads.length) {
    problems.push(
      '一覧の行 ' + heads.length + ' 件のうち ' + rows.length + ' 件しか読めなかった（半分未満）',
    );
  }

  return { rows, problems, csrfToken: readGirlsCsrfToken(src), formAction: readGirlsFormAction(src) };
}

/**
 * 読み取り結果を使ってよいか。
 * ★ problems が空であることが条件。★ 「0人だが問題なし」は起こらない
 *   （0人なら parseEkichikaGirls が必ず problem を積む）。
 */
export function girlsPageUsable(page: EkichikaGirlsPage): boolean {
  return page.problems.length === 0 && page.rows.length > 0;
}
