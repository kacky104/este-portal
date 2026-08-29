// 駅ちか管理画面「メールアドレス一覧」(/admin/maillist/) の読み取り（第53便・純粋関数）。
//
// ★★★ なぜ要るか — 設計メモ 追記26 §119・§123
//   写メ日記の転送には、セラピスト様ごとに【駅ちかが発行した投稿用メールアドレス】が要る。
//   これを手で登録させると、40名の店で40回の入力になる。
//   ★★ 設計メモ §2-2「『簡単さ』の本体は操作回数がゼロになること」に真っ向から反する。
//   ★ 店舗が「面倒だから他社のままでいい」と思った時点で負ける。だから自動で取り込む。
//
// ★★★ この便で読むのは【一覧だけ】。駅ちかへは1文字も書かない。
//
// ★★★ 実測でわかった形（2026-08-29・掲載A shopid 37168・37行）:
//   <ul class="md_list">
//     <li class="md_list_column_disp clearfix">      ← ★ クラス名が2種類ある（下記）
//       <div class="md_column md_poster_column">えま …</div>
//       <img src="…/files.ranking-deli.jp/37168/5232208/img1_20260729000849.jpg">
//       <div class="md_column md_mail_column">
//         メールアドレス：xxxx@shame.ranking-deli.jp
//         ガラケーメールアドレス：xxxx@s.ranking-deli.jp
//       </div>
//     </li> … ×37
//
// ★★★★ ここが今回いちばん危なかった所（追記26 §123-1）
//   最初 li.md_list_column_disp で数えたら【19行】だった。だがアドレスは74件（＝37名分）。
//     ul.md_list > li            = 37
//       class "…_disp clearfix"   = 19
//       class "…_column clearfix" = 18   ← ★ クラス名が2種類混在している
//   ★ クラス名で絞っていたら 37人中19人しか読まず、**静かに間違っていた。**
//   → ★★ だからこのパーサは **クラス名で行を絞らない**。ul の直下の li をすべて取る。
//   → ★★★ そして **数を2通りで数えて突き合わせる**（行数 × 2 と、アドレスの総数）。
//     1通りだけだと、その1通りが間違っていても気づけない。
//
// ★ castId は画像URLの中にある。★ 名前ではなく castId で結びつけられる＝取り違えに強い。
//
// ★★ アドレスは秘密値（therapist_diary_forward のコメント）。
//   ★ このファイルは値を加工しない。ログにも出さない。呼び出し側の責任で扱うこと。

/** 一覧の1人ぶん。 */
export type EkichikaMailRow = {
  /** 駅ちかの castId（画像URLから取る） */
  castId: string;
  /** 表示名。★ 照合には使わない（castId があるため）。人が見て分かるように持つだけ */
  name: string;
  /** 「メールアドレス」欄。★ 実測では @shame.ranking-deli.jp（shame＝写メ） */
  address: string;
  /** 「ガラケーメールアドレス」欄。★ 実測では @s.ranking-deli.jp。無いこともありうる */
  mobileAddress: string | null;
};

export type EkichikaMailListPage = {
  rows: EkichikaMailRow[];
  /**
   * ★★★ 読めたが信用できない理由。空でなければ **使わせない**。
   *   ★ 特に「数が合わない」は、取りこぼしの唯一の手がかり。
   */
  problems: string[];
};

const MAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const MAIL_G = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/**
 * ラベル付きのアドレス。
 *
 * ★ 「ガラケーメールアドレス」は「メールアドレス」を含むので、**先に書く**こと。
 *   順番を入れ替えると、ガラケーの方が「メールアドレス」として取れてしまう。
 *
 * ★★★ ラベルとアドレスの【あいだにタグが入る】（2026-08-29・実物で判明）:
 *     <span class="title">メールアドレス：</span>xxxx@shame.ranking-deli.jp<br>
 *   ★ ラベルは span の中、アドレスはその外の текст。あいだに </span> が挟まる。
 *   ★★ 最初これを詰めて書いていたため、作り物の点検は通るのに **実物では0件**だった。
 *     → relayFlow.ts の「HTMLに文字列が在るかで構造を判断しない」と同じ話。
 *     → ★ タグと空白の並びを飛ばしてから拾う。
 */
const LABELLED = /(ガラケーメールアドレス|メールアドレス)\s*[：:]\s*(?:<[^>]*>|\s|&nbsp;)*([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

/** タグを落として空白を畳む。 */
function textOf(html: string): string {
  return String(html ?? '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * `<ul class="md_list">` の中身を取り出す。
 * ★ 入れ子の <ul> があっても正しく閉じを見つけるため、深さを数える。
 *   ★ 正規表現で最初の </ul> を取ると、入れ子があったとき途中で切れる。
 */
function extractListBlock(html: string): string | null {
  const open = /<ul\b[^>]*\bclass="[^"]*\bmd_list\b[^"]*"[^>]*>/i.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const tag = /<(\/?)ul\b/gi;
  tag.lastIndex = start;
  let depth = 1;
  for (let m = tag.exec(html); m !== null; m = tag.exec(html)) {
    depth += m[1] === '/' ? -1 : 1;
    if (depth === 0) return html.slice(start, m.index);
  }
  return html.slice(start);            // ★ 閉じが無い。あとの検査で弾く
}

/**
 * メールアドレス一覧を読む。
 *
 * ★★★ 空を成功として返さない（禁則207・ingest-list と同じ作法）。
 * ★★★ 数が合わなければ problems に積む。★ これが取りこぼしの唯一の手がかり。
 */
export function parseEkichikaMailList(html: string): EkichikaMailListPage {
  const src = String(html ?? '');
  const problems: string[] = [];
  const rows: EkichikaMailRow[] = [];

  const block = extractListBlock(src);
  if (block === null) {
    problems.push('メールアドレス一覧（md_list）が見つからない。取得失敗かレイアウト変更を疑うこと');
    return { rows, problems };
  }

  // 1. li の開始位置を全部拾い、隣どうしで切る。★ クラス名で絞らない（§123-1）
  const head = /<li\b[^>]*>/gi;
  const heads: Array<{ end: number; index: number }> = [];
  head.lastIndex = 0;
  for (let m = head.exec(block); m !== null; m = head.exec(block)) {
    heads.push({ index: m.index, end: m.index + m[0].length });
  }
  if (heads.length === 0) {
    problems.push('一覧の行（li）が1件も見つからない');
    return { rows, problems };
  }

  const seen = new Set<string>();

  for (let i = 0; i < heads.length; i++) {
    const chunk = block.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].index : block.length);

    const castId = /files\.ranking-deli\.jp\/\d+\/(\d+)\//.exec(chunk)?.[1] ?? null;
    if (!castId) {
      problems.push(heads.length + '件中' + (i + 1) + '件目から castId を取れない（画像のURLが変わった可能性）');
      continue;
    }
    if (seen.has(castId)) {
      problems.push('castId ' + castId + ' が一覧に2回出てくる');
      continue;
    }

    // ラベルで拾う。★ 位置や順番ではなくラベルで決める（欄が増減しても壊れにくい）
    let address: string | null = null;
    let mobileAddress: string | null = null;
    LABELLED.lastIndex = 0;
    for (let m = LABELLED.exec(chunk); m !== null; m = LABELLED.exec(chunk)) {
      // ★ (?:…) は捕捉しないので、番号は 1=ラベル / 2=アドレス のまま。増えない
      if (m[1] === 'ガラケーメールアドレス') { if (!mobileAddress) mobileAddress = m[2]; }
      else if (!address) address = m[2];
    }
    if (!address) {
      problems.push('castId ' + castId + ' のメールアドレスが読めない');
      continue;
    }

    // 名前。★ 読めなくても落とさない（castId があれば結びつけられる）
    const nameHtml = /<div\b[^>]*\bclass="[^"]*\bmd_poster_column\b[^"]*"[^>]*>([\s\S]*?)<\/div>/i.exec(chunk)?.[1] ?? '';
    const name = textOf(nameHtml).split(' ')[0] ?? '';

    seen.add(castId);
    rows.push({ castId, name, address, mobileAddress });
  }

  // 2. ★★★ 数を2通りで数えて突き合わせる。
  //   ★ クラス名で絞って19行しか取れなかったとき、アドレスの総数（74）とのズレで気づいた。
  //     その気づき方を、検査として残す。
  const totalMails = (block.match(MAIL_G) ?? []).length;
  const fromRows = rows.reduce((n, r) => n + 1 + (r.mobileAddress ? 1 : 0), 0);
  if (rows.length > 0 && totalMails !== fromRows) {
    problems.push(
      '数が合わない: 一覧の中のアドレスは ' + totalMails + ' 件だが、' +
        '読み取れた行から数えると ' + fromRows + ' 件。★ 行を取りこぼしている可能性がある',
    );
  }

  if (rows.length === 0) problems.push('行は見つかったが、1件も読み取れなかった');
  else if (rows.length * 2 < heads.length) {
    problems.push('一覧の行 ' + heads.length + ' 件のうち ' + rows.length + ' 件しか読めなかった（半分未満）');
  }

  return { rows, problems };
}

/** 読み取り結果を使ってよいか。★ problems が空で、1件以上あること。 */
export function mailListUsable(page: EkichikaMailListPage): boolean {
  return page.problems.length === 0 && page.rows.length > 0;
}

/** アドレスのドメインだけ返す（記録・画面用）。★ 局所部は秘密なので出さない。 */
export function mailDomainOf(address: string): string {
  const m = MAIL.exec(String(address ?? ''));
  if (!m) return '(不明)';
  return '@' + m[0].split('@')[1];
}
