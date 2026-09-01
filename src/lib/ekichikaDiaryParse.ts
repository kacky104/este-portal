// 駅ちか管理画面「写メ日記」の読み取り（第92便・純粋関数）。
//
// ★ このファイルは純粋関数のみ。Supabase も React も import しない（禁則180）。
//   中継役VPSが取ってきた生HTMLを、フクエス側がこれで解析する。
//   駅ちかのレイアウトが変わったら直すのはこのファイルだけ（VPSは触らない）。
//
// ★★★ 何のために読むか（設計メモ_駅ちかの写メ日記取り込み_2026-09-01）
//   店舗オーナー様のご依頼で【駅ちか → フクエス】に写メ日記を取り込む。
//   採ったのは②ベンリー方式＝管理画面を15分ごとに読む（§1）。店舗様の手間はゼロ。
//   ★ 出勤と違い、写メ日記は【管理画面】なので鍵が要る。★ いま動くのは1店だけ。
//
// ★★★★ このファイルの立場（2026-09-01 時点）
//   ★ **実物のHTMLはまだ1枚も読んでいない。** 形は設計メモ §3 の採録だけを見て組んである。
//   ★ _fixtures/ に一覧と詳細を1枚ずつ保存して突き合わせるまで、**本番の巡回に載せない**。
//   ★ 第53便で同じ落とし穴を踏んでいる（ekichikaMailListParse.ts の頭）:
//     「作り物の点検は通るのに、実物では0件」。★ タグの並びは想像で当たらない。
//   → だから、このパーサは【想像した形に寄りかからない】作りにしてある:
//       ・一覧から取るのは **日記IDと投稿日時だけ**。名前・タイトル・本文は一覧から取らない。
//         ★ 日記IDは編集リンク（/admin/maildiary/edit/<日記ID>/）に必ず入っている＝
//           クラス名にも列の順番にも依存しない。★ 名前とタイトルは詳細から取る（そちらは欄の名前で取れる）。
//       ・詳細は **input/textarea の name 属性** で取る。★ 位置・順番・クラス名では取らない。
//       ・読めなかったものは黙って落とさず、必ず problems に理由を積む。
//
// ★★★ 空を成功として返さない（禁則207）。★ problems が空でなければ **使わせない**。
//
// ★★ 決めごと（設計メモ §4・引き継ぎメモ §16-4）
//   §367  照合は girls_id（＝castId）。★ 名前で照合しない（同名の取り違えが起きない）
//   §368  本文は HTML → 素のテキスト。<p><br> を改行に、他のタグは落とす
//   §369  二重取り込みは【日記ID】で防ぐ。★ 取り込んだIDは日記本体と別に持ち、消さない
//   §370  1投稿1画像として作る。★ 複数枚の枝を作らない
//         → ★ 2枚以上見つかったら **黙って1枚目を採らない**。problems に積んで気づけるようにする。
//   §371  巡回は15分。一覧だけ読み、【新着があるときだけ】詳細を開く
//         → ★ その「新着だけ」を決めるのが selectDiariesToFetch()。

// ────────────────────────────────────────────────────────────
// 型
// ────────────────────────────────────────────────────────────

/** 一覧の1行ぶん。★ 取るのは日記IDと投稿日時だけ（上記の理由）。 */
export type EkichikaDiaryListRow = {
  /** 日記ID。★ 二重取り込みを防ぐ鍵（§369） */
  diaryId: string;
  /** 駅ちか側の投稿日時（JST）。'YYYY-MM-DDTHH:mm:00+09:00'。★ 読めなければ null */
  postedAt: string | null;
  /** 画面に出ていた原文（例 '2026 08/31 17:12'）。★ 人が突き合わせるためだけに持つ */
  postedAtText: string | null;
};

export type EkichikaDiaryListPage = {
  rows: EkichikaDiaryListRow[];
  /** ページ送りに出ていたページ番号（/admin/maildiary/2 など）。★ 遡るときに使う */
  pageNumbers: number[];
  /** ★★★ 読めたが信用できない理由。空でなければ使わせない */
  problems: string[];
};

export type EkichikaDiaryDetail = {
  /** このページ自身が名乗っている日記ID（フォームの action か画像URLから） */
  diaryId: string | null;
  /** ★★★ 照合はこれだけで行う（§367）。駅ちかの girls_id ＝ フクエスの castId */
  castId: string | null;
  /** タイトル。★ null は【欄が見つからなかった】。'' は【空だった】。混ぜない */
  title: string | null;
  /** 本文のHTML。★ null は【欄が見つからなかった】 */
  bodyHtml: string | null;
  /** 本文を素のテキストにしたもの（§368）。★ 欄が無ければ '' */
  bodyText: string;
  /** 駅ちかで公開されているか（display_flg）。★★ null は【読めなかった】。true と混ぜない */
  isPublic: boolean | null;
  /** 写真1枚（§370）。★ 無い日記もある */
  imageUrl: string | null;
  problems: string[];
};

/** 駅ちかの写メ日記の画像置き場。★ 一覧・詳細のどちらにも出てくる形。 */
export const EKICHIKA_DIARY_IMAGE_BASE =
  'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/';

// ────────────────────────────────────────────────────────────
// 小道具
// ────────────────────────────────────────────────────────────

function codePoint(n: number): string {
  if (!Number.isFinite(n) || n < 0 || n > 0x10ffff) return '';
  try {
    return String.fromCodePoint(n);
  } catch {
    return '';
  }
}

/**
 * 文字参照をほどく。
 * ★ &amp; は **いちばん最後**にほどく。先にほどくと `&amp;lt;` が `<` になってしまう。
 */
function decodeEntities(input: string): string {
  return String(input ?? '')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#x([0-9a-f]+);/gi, (_m, h: string) => codePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_m, d: string) => codePoint(Number(d)))
    .replace(/&amp;/gi, '&');
}

/**
 * タグ1個から属性を取る。
 * ★ 前に空白を要求する（`\bname` にすると `data-name=` や `file_name=` を拾いうる）。
 */
function attrOf(tag: string, name: string): string | null {
  const re = new RegExp('[\\s]' + name + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i');
  const m = re.exec(String(tag ?? ''));
  if (!m) return null;
  const raw = m[1] ?? m[2] ?? m[3] ?? '';
  return decodeEntities(raw);
}

/** `<input>` を name で拾う。★ 順番や位置では拾わない。 */
function inputsNamed(html: string, name: string): string[] {
  const out: string[] = [];
  const re = /<input\b[^>]*>/gi;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    if (attrOf(m[0], 'name') === name) out.push(m[0]);
  }
  return out;
}

/** `<textarea name="…">…</textarea>` の中身を返す。無ければ null。 */
function textareaNamed(html: string, name: string): string | null {
  const re = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>/gi;
  for (let m = re.exec(html); m !== null; m = re.exec(html)) {
    if (attrOf('<textarea' + m[1] + '>', 'name') === name) return m[2];
  }
  return null;
}

// ────────────────────────────────────────────────────────────
// 投稿日時
// ────────────────────────────────────────────────────────────

/**
 * 一覧の投稿日時「2026 08/31 17:12」を ISO（JST）にする。
 *
 * ★ 区切りは実物を見ていないので幅を持たせる（空白・全角空白・年月日）。
 * ★★ ただし **数字の並びは変えない**。★ 月日を取り違えると、初回40日の範囲がずれる。
 * ★ 実在しない日付（2026 02/31）は null。★ 「読めた」と言わない。
 */
export function diaryStampToIso(text: string | null | undefined): string | null {
  const s = String(text ?? '');
  const m = /(\d{4})[^\d]{0,4}(\d{1,2})[^\d]{1,3}(\d{1,2})[^\d]{0,10}?(\d{1,2}):(\d{2})/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  // ★ 実在する日か確かめる（2/31 を通さない）
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const p2 = (n: number): string => String(n).padStart(2, '0');
  return y + '-' + p2(mo) + '-' + p2(d) + 'T' + p2(h) + ':' + p2(mi) + ':00+09:00';
}

// ────────────────────────────────────────────────────────────
// 本文（§368）
// ────────────────────────────────────────────────────────────

/**
 * 本文のHTMLを素のテキストにする。
 *
 * ★ `<p>…</p><br>` が1行ぶん、という形で来る（設計メモ §3-2）。
 *   ★★ この2つを**続けて1つの改行**として扱う。別々に数えると、1行おきに空行が入る。
 * ★ `<br>` 単体は改行。★ それ以外のタグは落とす。★ 文字参照はほどく。
 * ★★ 空行は本文の一部なので潰さない。★ ただし3行以上の連続は2行にそろえる。
 */
export function diaryBodyToText(html: string | null | undefined): string {
  let s = String(html ?? '');
  if (s === '') return '';
  s = s.replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, '');
  s = s.replace(/\r\n?/g, '\n');
  // ★ </p><br> は合わせて1つの改行（上記）
  s = s.replace(/<\/p\s*>\s*<br\s*\/?>/gi, '\n');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<\/(p|div|li|h[1-6]|tr)\s*>/gi, '\n');
  s = s.replace(/<[^>]*>/g, '');
  s = decodeEntities(s);
  s = s.replace(/[ \t\u3000]+\n/g, '\n'); // 行末の空白だけ落とす（行の中の全角空白は残す）
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

// ────────────────────────────────────────────────────────────
// 一覧　/admin/maildiary/
// ────────────────────────────────────────────────────────────

const EDIT_LINK = /\/admin\/maildiary\/edit\/(\d+)\/?/gi;
const PAGE_LINK = /\/admin\/maildiary\/(\d+)\/?/gi;

/**
 * 一覧を読む。★ 取るのは【日記IDと投稿日時】だけ。
 *
 * ★★ 行の切り方: 編集リンクを目印にして、**前のリンクの終わりから今回のリンクの終わりまで**を
 *   1行ぶんとみなす。★ クラス名では絞らない（第53便 §123-1・クラス名が2種類混在していた）。
 * ★★ 投稿日時は、その塊の中の **いちばん後ろの日付** を採る。
 *   ★ 先頭の塊にはページの見出しが紛れ込むので、リンクに近いほうを信じる。
 */
export function parseEkichikaDiaryList(html: string | null | undefined): EkichikaDiaryListPage {
  const src = String(html ?? '');
  const problems: string[] = [];
  const rows: EkichikaDiaryListRow[] = [];

  if (src.trim() === '') {
    problems.push('一覧のHTMLが空。取得に失敗している');
    return { rows, pageNumbers: [], problems };
  }

  // 1. 編集リンクの位置を全部拾う
  const anchors: Array<{ id: string; end: number }> = [];
  EDIT_LINK.lastIndex = 0;
  for (let m = EDIT_LINK.exec(src); m !== null; m = EDIT_LINK.exec(src)) {
    anchors.push({ id: m[1], end: m.index + m[0].length });
  }
  if (anchors.length === 0) {
    problems.push(
      '編集リンク（/admin/maildiary/edit/<日記ID>/）が1件も無い。' +
        'ログインできていないか、レイアウトが変わった可能性',
    );
    return { rows, pageNumbers: pageNumbersOf(src), problems };
  }

  const seen = new Set<string>();
  let prevEnd = 0;
  let stampCount = 0;

  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const chunk = src.slice(prevEnd, a.end);
    prevEnd = a.end;

    if (seen.has(a.id)) {
      // ★ 詳細への導線が1行に2本あるだけかもしれない。落とさず理由だけ残す
      problems.push('日記ID ' + a.id + ' が一覧に2回出てくる');
      continue;
    }
    seen.add(a.id);

    const stampText = lastStampIn(chunk);
    const postedAt = diaryStampToIso(stampText);
    if (postedAt !== null) stampCount++;

    rows.push({ diaryId: a.id, postedAt, postedAtText: stampText });
  }

  // 2. ★★★ 数を2通りで数えて突き合わせる（第53便の気づき方を検査として残す）
  //   ★ 1通りだけだと、その1通りが間違っていても気づけない。
  const editWords = (src.match(/編集する/g) ?? []).length;
  if (editWords > 0 && editWords !== anchors.length) {
    problems.push(
      '数が合わない: 「編集する」は ' + editWords + ' 個だが、編集リンクは ' + anchors.length + ' 本。' +
        '★ 行を取りこぼしている可能性がある',
    );
  }

  // 3. 投稿日時が1件も読めない ＝ 一覧の形が変わった（★ 1件も、で判断する。1件欠けは責めない）
  if (rows.length > 0 && stampCount === 0) {
    problems.push('投稿日時が1件も読めない。一覧の日付の書き方が変わった可能性');
  }

  if (rows.length === 0) problems.push('編集リンクは見つかったが、1件も読み取れなかった');

  return { rows, pageNumbers: pageNumbersOf(src), problems };
}

/** 塊の中のいちばん後ろの日付らしき文字列。 */
function lastStampIn(chunk: string): string | null {
  const re = /\d{4}[^\d]{0,4}\d{1,2}[^\d]{1,3}\d{1,2}[^\d]{0,10}?\d{1,2}:\d{2}/g;
  let last: string | null = null;
  for (let m = re.exec(chunk); m !== null; m = re.exec(chunk)) last = m[0];
  return last;
}

/** ページ送りに出ている番号（重複を除いて昇順）。 */
function pageNumbersOf(src: string): number[] {
  const nums = new Set<number>();
  PAGE_LINK.lastIndex = 0;
  for (let m = PAGE_LINK.exec(src); m !== null; m = PAGE_LINK.exec(src)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && n > 0) nums.add(n);
  }
  return Array.from(nums).sort((a, b) => a - b);
}

/** 一覧を使ってよいか。★ problems が空で、1件以上あること。 */
export function diaryListUsable(page: EkichikaDiaryListPage): boolean {
  return page.problems.length === 0 && page.rows.length > 0;
}

// ────────────────────────────────────────────────────────────
// 詳細　/admin/maildiary/edit/<日記ID>/
// ────────────────────────────────────────────────────────────

const IMG_IN_URL = /https?:\/\/[^\s"'<>]*files\.ranking-deli\.jp\/(\d+)\/(diaries_\d+_file_name\d+\.(?:jpe?g|png|webp))/gi;
const IMG_FILE_ONLY = /^diaries_(\d+)_file_name\d+\.(?:jpe?g|png|webp)$/i;

/** 日記IDとファイル名から画像URLを組み立てる。 */
export function diaryImageUrl(diaryId: string, fileName: string): string {
  return EKICHIKA_DIARY_IMAGE_BASE + diaryId + '/' + fileName;
}

/**
 * 詳細を読む。
 *
 * @param expectedDiaryId 開きに行った日記ID。★ 渡すと【別の日記を読んでいないか】を突き合わせる。
 *   ★★ 取り違えると、Aさんの日記がBさんの名前で載る。★ 渡せるときは必ず渡すこと。
 */
export function parseEkichikaDiaryDetail(
  html: string | null | undefined,
  expectedDiaryId?: string | null,
): EkichikaDiaryDetail {
  const src = String(html ?? '');
  const problems: string[] = [];

  const empty: EkichikaDiaryDetail = {
    diaryId: null, castId: null, title: null, bodyHtml: null,
    bodyText: '', isPublic: null, imageUrl: null, problems,
  };
  if (src.trim() === '') {
    problems.push('詳細のHTMLが空。取得に失敗している');
    return empty;
  }

  // 1. このページ自身の日記ID（フォームの action）
  const actionId = /\/admin\/maildiary\/edit\/(\d+)\/?/i.exec(src)?.[1] ?? null;

  // 2. 画像（§370・1投稿1画像）
  const urls = new Set<string>();
  IMG_IN_URL.lastIndex = 0;
  for (let m = IMG_IN_URL.exec(src); m !== null; m = IMG_IN_URL.exec(src)) {
    urls.add(diaryImageUrl(m[1], m[2]));
  }
  // ★ 欄にファイル名だけが入っている形もありうる（設計メモ §3-2 の img）
  for (const tag of inputsNamed(src, 'img')) {
    const v = (attrOf(tag, 'value') ?? '').trim();
    const fm = IMG_FILE_ONLY.exec(v);
    if (fm) urls.add(diaryImageUrl(actionId ?? fm[1], v));
  }
  let imageUrl: string | null = null;
  if (urls.size === 1) imageUrl = Array.from(urls)[0];
  else if (urls.size > 1) {
    // ★★ 黙って1枚目を採らない。★ §370 は「1投稿1画像として作る」＝出てきたらその日に足す、という約束
    problems.push('写真が ' + urls.size + ' 枚ある。★ 1投稿1画像の前提（§370）と違う。設計を見直すこと');
  }

  // 3. 日記IDの突き合わせ（★ 2通りで数える）
  const imgId = imageUrl ? /files\.ranking-deli\.jp\/(\d+)\//.exec(imageUrl)?.[1] ?? null : null;
  const diaryId = actionId ?? imgId;
  if (actionId && imgId && actionId !== imgId) {
    problems.push('日記IDが食い違う（フォーム ' + actionId + ' / 写真 ' + imgId + '）');
  }
  const want = expectedDiaryId == null ? '' : String(expectedDiaryId);
  if (want !== '' && diaryId !== null && diaryId !== want) {
    problems.push('★ 開きに行った日記 ' + want + ' と、開けたページの日記 ' + diaryId + ' が違う');
  }

  // 4. girls_id（★ 照合はこれだけ・§367）
  let castId: string | null = null;
  const girlsTags = inputsNamed(src, 'girls_id');
  const girlsValues = new Set<string>();
  for (const tag of girlsTags) {
    const v = (attrOf(tag, 'value') ?? '').trim();
    if (/^\d+$/.test(v)) girlsValues.add(v);
  }
  if (girlsValues.size === 1) castId = Array.from(girlsValues)[0];
  else if (girlsValues.size === 0) {
    problems.push('女の子の番号（girls_id）が読めない。★ 名前では照合しない（§367）ので、この日記は取り込めない');
  } else {
    problems.push('girls_id が ' + girlsValues.size + ' 種類ある。誰の日記か決められない');
  }

  // 5. 公開・非公開（display_flg）★ 読めなかったを「公開」と混ぜない
  const isPublic = readDisplayFlg(src, problems);

  // 6. タイトルと本文　★ null（欄が無い）と ''（空だった）を分ける
  let title: string | null = null;
  const titleTags = inputsNamed(src, 'title');
  if (titleTags.length > 0) title = (attrOf(titleTags[0], 'value') ?? '').trim();
  else {
    const ta = textareaNamed(src, 'title');
    if (ta !== null) title = decodeEntities(ta).trim();
  }
  if (title === null) problems.push('タイトルの欄（name="title"）が見つからない');

  let bodyHtml: string | null = textareaNamed(src, 'body');
  if (bodyHtml === null) {
    const bodyTags = inputsNamed(src, 'body');
    if (bodyTags.length > 0) bodyHtml = attrOf(bodyTags[0], 'value') ?? '';
  }
  if (bodyHtml === null) problems.push('本文の欄（name="body"）が見つからない');

  return {
    diaryId,
    castId,
    title,
    bodyHtml,
    bodyText: diaryBodyToText(bodyHtml),
    isPublic,
    imageUrl,
    problems,
  };
}

/**
 * display_flg を読む。ラジオ（1|0）が本命。★ select の形も一応見る。
 * ★★ 「どれも選ばれていない」を **公開** と読まない。null を返して呼び出し側に止めさせる。
 */
function readDisplayFlg(src: string, problems: string[]): boolean | null {
  const radios = inputsNamed(src, 'display_flg');
  if (radios.length > 0) {
    const checked = radios.filter((t) => /[\s]checked\b/i.test(t));
    if (checked.length === 1) {
      const v = (attrOf(checked[0], 'value') ?? '').trim();
      if (v === '1') return true;
      if (v === '0') return false;
      problems.push('display_flg の値が 1 でも 0 でもない（' + v + '）');
      return null;
    }
    if (checked.length === 0) {
      problems.push('display_flg がどれも選ばれていない。★ 公開・非公開を決められない');
      return null;
    }
    problems.push('display_flg が ' + checked.length + ' 個選ばれている');
    return null;
  }

  const sel = /<select\b([^>]*)>([\s\S]*?)<\/select>/gi;
  for (let m = sel.exec(src); m !== null; m = sel.exec(src)) {
    if (attrOf('<select' + m[1] + '>', 'name') !== 'display_flg') continue;
    const opt = /<option\b([^>]*)>/gi;
    const picked: string[] = [];
    for (let o = opt.exec(m[2]); o !== null; o = opt.exec(m[2])) {
      if (/[\s]selected\b/i.test('<option' + o[1] + '>')) {
        picked.push((attrOf('<option' + o[1] + '>', 'value') ?? '').trim());
      }
    }
    if (picked.length === 1) {
      if (picked[0] === '1') return true;
      if (picked[0] === '0') return false;
    }
    problems.push('display_flg（select）から公開・非公開を決められない');
    return null;
  }

  problems.push('display_flg の欄が見つからない。★ 非公開の日記まで取り込んでしまうので止める');
  return null;
}

/**
 * 詳細を使ってよいか。
 *
 * ★★★ 【非公開だから入れない】は、ここでは false にしない。
 *   ★ 「読めなかった（＝直さないといけない）」と「読めたが入れないと決めた」は別のこと。
 *   ★ 作法 3-5「0件と分からないを混ぜない」と同じ形。★ 非公開の判定は shouldImportDiary()。
 */
export function diaryDetailUsable(d: EkichikaDiaryDetail): boolean {
  if (d.problems.length > 0) return false;
  if (d.castId === null) return false;
  if (d.isPublic === null) return false;
  if (d.bodyHtml === null) return false;
  // ★ 本文も写真も無いものは、取れていない疑いのほうが強い
  return d.bodyText !== '' || d.imageUrl !== null;
}

/** 取り込んでよいか。★ 使ってよい かつ 駅ちかで公開されていること（設計メモ §6 ②）。 */
export function shouldImportDiary(d: EkichikaDiaryDetail): boolean {
  return diaryDetailUsable(d) && d.isPublic === true;
}

// ────────────────────────────────────────────────────────────
// 巡回のときに「どれを開くか」（§369・§371・初回40日）
// ────────────────────────────────────────────────────────────

export type DiaryFetchPlan = {
  /** これから詳細を開く行。★ 一覧の並びのまま */
  fetch: EkichikaDiaryListRow[];
  /** 取り込み済みなので開かない（§369） */
  skippedKnown: string[];
  /** 期間の外なので開かない（初回40日ぶん） */
  skippedOld: string[];
};

/**
 * 一覧から【詳細を開くもの】だけを選ぶ。
 *
 * ★★★ §369 の芯: known に入っている日記IDは **二度と開かない**。
 *   ★ known には「取り込んだ」だけでなく「取り込んで、そのあと店舗様が消した」も入れること。
 *   ★ 消えたことを known から外すと、次の巡回で必ず戻ってくる。
 * ★★ since を渡すと、それより古い投稿は開かない（初回40日ぶん・設計メモ §6 ①）。
 *   ★ 投稿日時が読めなかった行（postedAt=null）は **落とさずに開く**。
 *     ★ 「日付が読めない」を「古い」と読み替えると、取りこぼしが黙って起きる。
 */
export function selectDiariesToFetch(
  page: EkichikaDiaryListPage,
  options?: { known?: Iterable<string> | null; since?: string | null },
): DiaryFetchPlan {
  const known = new Set<string>(options?.known ?? []);
  const sinceMs = options?.since ? Date.parse(options.since) : Number.NaN;

  const fetch: EkichikaDiaryListRow[] = [];
  const skippedKnown: string[] = [];
  const skippedOld: string[] = [];

  for (const row of page.rows) {
    if (known.has(row.diaryId)) {
      skippedKnown.push(row.diaryId);
      continue;
    }
    if (!Number.isNaN(sinceMs) && row.postedAt !== null) {
      const t = Date.parse(row.postedAt);
      if (!Number.isNaN(t) && t < sinceMs) {
        skippedOld.push(row.diaryId);
        continue;
      }
    }
    fetch.push(row);
  }

  return { fetch, skippedKnown, skippedOld };
}
