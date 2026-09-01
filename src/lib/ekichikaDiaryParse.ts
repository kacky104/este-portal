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
// ★★★★ 実物と突き合わせた（2026-09-01・第92便の直し）
//   ★ 最初は設計メモ §3 の採録だけを見て組んだ。★ 実物を1枚ずつ保存して流したら **2か所が違った**。
//
//   ① 写真のURLに `/diary/` が挟まる（★ 設計メモ §3-3 の記述と違う）
//        メモ  files.ranking-deli.jp/<日記ID>/diaries_<日記ID>_file_name….jpeg
//        実物  files.ranking-deli.jp/**diary**/<日記ID>/diaries_<日記ID>_file_name….jpeg
//      ★★★ この1つで、写真が1枚ある日記を **「写真 0枚」と答えていた**。
//        ★ しかも problems は空だった＝【読めなかったのに、無いと言った】。作法の芯に反する。
//      → 直し方: 見つけたURLは **組み立て直さず、そのまま使う**。
//        ★ 組み立ては「欄しか無い」ときの最後の手段にする（形が変わると壊れるのは組み立てのほう）。
//      ★ おまけに紛らわしいホストが同居している: `systemfiles.ranking-deli.jp`（cloudfront）。
//        ★ ホストの境目まで見る（`…/files.` か `.files.` の直前が / か . であること）。
//
//   ② 一覧の投稿日時を、**本文の中の日付**と取り違えた（30件中2件）
//        本文に「8月28日(金)12:00～19:00」のような出勤の案内が入っていた。
//        ★ 行の中の【最後の日付】を採っていたため、本文の日付を拾った。
//      → 直し方: 日付は【日付の列】から取る（実物 `md_date_column`）。
//        ★ 無ければ行の【最初の日付】。★ 本文は日付の列より後ろにあるので、最初なら当たる。
//
//   ★★ 実物の1行はこの形（2026-09-01・ラビリンス様の管理画面・30件）:
//     <li class="md_list_column_disp clearfix">
//       <div class="md_column md_delete_column"><input name="delete[]" value="414840669" …></div>
//       <div class="md_column md_date_column">2026 08/31 17:12</div>
//       <div class="md_column md_poster_column">さくら</div>
//       <div class="md_column md_img_column"><img src="…/diary/414840669/diaries_…jpeg" /></div>
//       <div class="md_column md_diary_column"><span class="title">…</span><span class="body">…</span></div>
//       <div class="md_column md_edit_column"><a href='…/admin/maildiary/edit/414840669/'>編集する</a></div>
//     </li>
//   ★ 30件すべてで 編集リンク・md_date_column・delete[]・「編集する」が **どれも30** で揃っていた。
//     → ★★ delete[] の日記IDを【2通り目の数え方】に使う（第53便の作法）。
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

/**
 * 駅ちかの写メ日記の画像置き場（★ 2026-09-01 実測）。
 * ★★ `diary/` を含む。★ 設計メモ §3-3 にはこれが無かった（実物に合わせてある）。
 * ★ 組み立てに使うのは【欄にファイル名しか無いとき】だけ。★ 実物のURLはそのまま使う。
 */
export const EKICHIKA_DIARY_IMAGE_BASE =
  'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/diary/';

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
  // ★ 属性名に記号が入ることがある（実物の `delete[]`）。★ 正規表現として解釈させない
  const esc = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('[\\s]' + esc + '\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s"\'>]+))', 'i');
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

    const stampText = rowStamp(chunk);
    const postedAt = diaryStampToIso(stampText);
    if (postedAt !== null) stampCount++;

    rows.push({ diaryId: a.id, postedAt, postedAtText: stampText });
  }

  // 2. ★★★ 数を2通りで数えて突き合わせる（第53便の気づき方を検査として残す）
  //   ★ 1通りだけだと、その1通りが間違っていても気づけない。
  //
  // ★★ 2-1. 削除欄の日記ID（実物 `<input name="delete[]" value="414840669">`）と突き合わせる。
  //   ★ 2026-09-01 の実物では 編集リンク30・delete[]30 で【中身も完全に一致】していた。
  //   ★ 片方にしか無いIDが出たら、行の切り出しがずれている。
  const delIds = new Set<string>();
  for (const tag of inputsNamed(src, 'delete[]')) {
    const v = (attrOf(tag, 'value') ?? '').trim();
    if (/^\d+$/.test(v)) delIds.add(v);
  }
  if (delIds.size > 0) {
    const linkIds = new Set(anchors.map((a) => a.id));
    const onlyDel = Array.from(delIds).filter((id) => !linkIds.has(id));
    const onlyLink = Array.from(linkIds).filter((id) => !delIds.has(id));
    if (onlyDel.length > 0 || onlyLink.length > 0) {
      problems.push(
        '数が合わない: 削除欄の日記IDは ' + delIds.size + ' 件、編集リンクは ' + linkIds.size +
          ' 件で中身が違う（削除欄だけ ' + onlyDel.length + ' 件 / リンクだけ ' + onlyLink.length +
          ' 件）。★ 行を取りこぼしている可能性がある',
      );
    }
  }

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

const STAMP = /\d{4}[^\d]{0,4}\d{1,2}[^\d]{1,3}\d{1,2}[^\d]{0,10}?\d{1,2}:\d{2}/;

/** 行の始まりまで詰める。★ 先頭の行に、上のメニューや見出しが混ざるのを防ぐ。 */
function rowStartOf(chunk: string): string {
  const re = /<(?:li|tr)\b/gi;
  let last = -1;
  for (let m = re.exec(chunk); m !== null; m = re.exec(chunk)) last = m.index;
  return last >= 0 ? chunk.slice(last) : chunk;
}

/**
 * 【日付の列】から取る（実物 `<div class="md_column md_date_column">2026 08/31 17:12</div>`）。
 * ★ クラス名に頼りきらないよう、これは【優先】でしかない。無ければ呼び出し側が別の手で拾う。
 * ★★ 'update' のように date を含むだけの語に釣られないよう、語の区切りまで見る。
 */
function stampFromDateCell(chunk: string): string | null {
  const re = /<(div|td|th|span|p)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
  for (let m = re.exec(chunk); m !== null; m = re.exec(chunk)) {
    const cls = attrOf('<x' + m[2] + '>', 'class') ?? '';
    if (!/(^|[^a-z])date([^a-z]|$)/i.test(cls)) continue;
    const hit = STAMP.exec(m[3]);
    if (hit) return hit[0];
  }
  return null;
}

/**
 * 1行ぶんの投稿日時。
 *
 * ★★★ 【最初の日付】を採る。★ 最後ではない（2026-09-01・実物で30件中2件を取り違えた）。
 *   ★ 本文に「8月28日(金)12:00～19:00」のような出勤の案内が入っていることがある。
 *   ★ 本文は日付の列より後ろにあるので、最初を採れば当たる。
 */
function rowStamp(chunk: string): string | null {
  const row = rowStartOf(chunk);
  const cell = stampFromDateCell(row);
  if (cell !== null) return cell;
  return STAMP.exec(row)?.[0] ?? null;
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

// ★★ ホストの境目まで見る。★ `systemfiles.ranking-deli.jp` という別のホストが同居している。
//   ★ `files.ranking-deli.jp` の直前が / か . であることを要求する（`systemfiles.` は m なので当たらない）。
// ★★ `diary/` は【あってもなくても】読む。★ 実物には有る（2026-09-01）。設計メモには無かった。
const IMG_IN_URL =
  /https?:\/\/[^\s"'<>]*[/.]files\.ranking-deli\.jp\/(?:diary\/)?\d+\/diaries_\d+_file_name\d+\.(?:jpe?g|png|webp)/gi;
// ★ 欄の値。実物は `414840669/diaries_414840669_file_name….jpeg`（日記ID付き）。★ ファイル名だけの形も許す。
const IMG_FIELD = /^(?:(\d+)\/)?(diaries_(\d+)_file_name\d+\.(?:jpe?g|png|webp))$/i;
const IMG_ID_IN_URL = /\/(?:diary\/)?(\d+)\/diaries_\d+_file_name/;

/**
 * 日記IDとファイル名から画像URLを組み立てる。
 * ★★ これを使うのは【URLがどこにも無く、欄しか無い】ときだけ。
 *   ★ 実物のURLがあるなら、そのまま使う。★ 組み立てはホストや階層が変わると黙って壊れる。
 */
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
    urls.add(m[0]); // ★★ 見つけたURLは、そのまま使う（組み立て直さない）
  }
  // ★ URLがどこにも無いときだけ、欄の値から組み立てる（実物の img 欄は `<日記ID>/<ファイル名>`）
  if (urls.size === 0) {
    for (const tag of inputsNamed(src, 'img')) {
      const v = (attrOf(tag, 'value') ?? '').trim();
      const fm = IMG_FIELD.exec(v);
      if (fm) urls.add(diaryImageUrl(fm[1] ?? actionId ?? fm[3], fm[2]));
    }
  }
  let imageUrl: string | null = null;
  if (urls.size === 1) imageUrl = Array.from(urls)[0];
  else if (urls.size > 1) {
    // ★★ 黙って1枚目を採らない。★ §370 は「1投稿1画像として作る」＝出てきたらその日に足す、という約束
    problems.push('写真が ' + urls.size + ' 枚ある。★ 1投稿1画像の前提（§370）と違う。設計を見直すこと');
  }

  // 3. 日記IDの突き合わせ（★ 2通りで数える）
  const imgId = imageUrl ? IMG_ID_IN_URL.exec(imageUrl)?.[1] ?? null : null;
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

/** 取り込み済みの記録1行ぶん（salon_diary_imports の行に当たる）。 */
export type KnownDiary = {
  diaryId: string;
  /** 'imported' | 'skipped:private' | 'skipped:no_match' */
  status: string;
  /** 最後に詳細を開いた時刻（ISO）。★ 開き直しの判断に使う。分からなければ null */
  checkedAt?: string | null;
};

/**
 * 開き直しの間隔（時間）。★ **1日1回**（2026-09-01・カッキーさんの判断・§375）。
 *
 * ★★ なぜ「毎回」でも「二度と」でもないか:
 *   毎回  … 非公開の日記があるだけで、その店は毎周ずっと詳細を開き続ける（駅ちかへの負担・§6-2 と逆向き）
 *   二度と… 店舗様が公開に切り替えても、二度と載らない（黙って落ちる）
 *   1日1回… 遅くとも翌日には載る。★ 詳細を開くのは1日1回だけ増える
 */
export const DIARY_RECHECK_HOURS = 24;

export type DiaryFetchPlan = {
  /** これから詳細を開く行。★ 一覧の並びのまま */
  fetch: EkichikaDiaryListRow[];
  /** 取り込み済みなので二度と開かない（§369） */
  skippedDone: string[];
  /** 開き直す相手だが、まだその時刻ではない（1日1回・§375） */
  skippedWaiting: string[];
  /** 期間の外なので開かない（初回40日ぶん） */
  skippedOld: string[];
};

function normalizeKnown(v: string | KnownDiary): KnownDiary {
  // ★ 文字列で渡されたら【取り込み済み】とみなす（いちばん安全なほう＝もう開かない）
  return typeof v === 'string' ? { diaryId: v, status: 'imported', checkedAt: null } : v;
}

/**
 * その記録を、もう一度開きに行くか。
 *
 * ★★★ 'imported' は **二度と開かない**（§369）。
 *   ★ 取り込んだあと店舗様が消したものも 'imported' のまま。★ ここが消した日記を戻さない芯。
 * ★ それ以外（非公開だった・当たるセラピストが居なかった）は【1日1回だけ】開き直す。
 * ★★ 最後に開いた時刻が分からないときは **開く**。
 *   ★ 「分からない」を「まだ待て」と読み替えない（作法 3-5）。
 */
export function shouldRecheckDiary(known: KnownDiary, nowIso?: string | null): boolean {
  if (known.status === 'imported') return false;
  const last = known.checkedAt ? Date.parse(known.checkedAt) : Number.NaN;
  if (Number.isNaN(last)) return true;
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  if (Number.isNaN(now)) return true;
  return now - last >= DIARY_RECHECK_HOURS * 60 * 60 * 1000;
}

/**
 * 一覧から【詳細を開くもの】だけを選ぶ。
 *
 * ★★★ §369 の芯: 取り込み済み（'imported'）の日記IDは **二度と開かない**。
 *   ★ 「取り込んで、そのあと店舗様が消した」も 'imported' のまま渡すこと。
 *   ★ 消えたことを理由に記録を外すと、次の巡回で必ず戻ってくる。
 * ★★ 'skipped:…' の記録は【1日1回だけ】開き直す（§375）。
 *   ★ 非公開だった日記が公開に変わる／居なかったセラピストが登録される、を拾うため。
 * ★★ since を渡すと、それより古い投稿は開かない（初回40日ぶん・設計メモ §6 ①）。
 *   ★ ただし **開き直しの相手には since を当てない**。★ こちらが一度わざと見送ったものなので、
 *     期間で二重に落とすと、いつまでも拾えない。
 * ★★★ 投稿日時が読めなかった行（postedAt=null）は **落とさずに開く**。
 *   ★ 「日付が読めない」を「古い」と読み替えると、取りこぼしが黙って起きる。
 */
export function selectDiariesToFetch(
  page: EkichikaDiaryListPage,
  options?: {
    known?: Iterable<string | KnownDiary> | null;
    since?: string | null;
    /** いまの時刻（ISO）。★ 渡さなければ実時刻。点検で固定するために受け取る */
    now?: string | null;
  },
): DiaryFetchPlan {
  const known = new Map<string, KnownDiary>();
  for (const k of options?.known ?? []) {
    const n = normalizeKnown(k);
    if (n && typeof n.diaryId === 'string') known.set(n.diaryId, n);
  }
  const sinceMs = options?.since ? Date.parse(options.since) : Number.NaN;

  const fetch: EkichikaDiaryListRow[] = [];
  const skippedDone: string[] = [];
  const skippedWaiting: string[] = [];
  const skippedOld: string[] = [];

  for (const row of page.rows) {
    const rec = known.get(row.diaryId);
    if (rec) {
      if (!shouldRecheckDiary(rec, options?.now)) {
        if (rec.status === 'imported') skippedDone.push(row.diaryId);
        else skippedWaiting.push(row.diaryId);
        continue;
      }
      fetch.push(row); // ★ 開き直し。★ since は当てない（上記）
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

  return { fetch, skippedDone, skippedWaiting, skippedOld };
}

// ────────────────────────────────────────────────────────────
// 初回の遡り（ページ送り）
// ────────────────────────────────────────────────────────────

/** あと何ページまで遡ってよいか。★ 暴走の歯止め（実物は5ページ以上あった）。 */
export const DIARY_MAX_PAGES = 10;

/**
 * 次のページを読みに行くか。
 *
 * ★★★ 止める条件を【3つとも】持つ。★ 1つだけだと、どれかが効かない日に止まらない。
 *   ① そのページに【期間の外】が出てきた … もう古い方しか無い＝遡り終わり
 *   ② 次のページ番号が一覧に出ていない   … これ以上のページが無い
 *   ③ 残りページ数を使い切った           … ★ 相手の作りが変わっても必ず止まる歯止め
 *
 * ★★ 通常運転（since を渡さない周）では、そもそも呼ばない＝1ページ目だけ読む（§371）。
 */
export function planDiaryPaging(input: {
  /** いま読んだページ番号（1始まり） */
  pageNumber: number;
  /** 一覧に出ていたページ番号 */
  pageNumbers: number[];
  /** そのページで「期間の外」として見送った件数 */
  skippedOldCount: number;
  /** あと何ページ読んでよいか */
  pagesLeft: number;
}): { next: number | null; reason: string } {
  const here = Math.floor(Number(input.pageNumber));
  const want = (Number.isFinite(here) ? here : 1) + 1;

  if (input.skippedOldCount > 0) {
    return { next: null, reason: '期間より古い投稿が出てきたので、これ以上は遡らない' };
  }
  if (!Number.isFinite(input.pagesLeft) || input.pagesLeft <= 0) {
    return { next: null, reason: '★ 遡ってよいページ数を使い切った（歯止め）' };
  }
  if (!input.pageNumbers.includes(want)) {
    return { next: null, reason: want + 'ページ目が一覧に出ていないので、これで最後' };
  }
  return { next: want, reason: want + 'ページ目へ遡る' };
}
