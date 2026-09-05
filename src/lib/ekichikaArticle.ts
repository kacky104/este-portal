// 駅ちかの「ニュース編集」（新着情報）への投稿（第154便・2026-09-05）。
//
// ★ このファイルは通信もDBも触らない。★ 時刻も受け取らない（判断は articleRotation.ts）。
//   ekichikaWorkParse.ts / esutamaRequests.ts と同じ作法。
//
// ★★★ 相手の形（2026-09-05 に実物を1回手で送って実測）
//   駅ちかのニュースは【カテゴリー5枠を上書きする】形。★ 積まない。
//     速報NEWS / 新人速報 / 激アツ割引情報 / イベント速報 / 緊急出勤速報
//   1枠に1記事。★ 枠ごとに記事ID（hidden の id）が固定で、それが「上書き」の鍵。
//
//   POST https://ranking-deli.jp/admin/articles/category{1..5}/
//     Content-Type: application/x-www-form-urlencoded
//     title / body / girl_id / img_flg / display_flg / id / g_image1 / g_image1s
//   ★★★ 8項目だけ。**fuel_csrf_token は送られていない**（フォームにも無い）。
//     ★ ただし言えるのは「フォームからは送っていない」まで。★ 実弾で最終確認する（第145便の反省）。
//
// ★★ 相手が言っている制限（画面の注記より）
//     ・記事タイトル … ※全角70文字以内
//     ・記事本文 …… ※画像追加はできません ／ ※外部リンクの設置はできません
//   ★ 本文は CKEditor が吐く HTML（実測で出たタグは <p> <br> <b>）。
//
// ★★★ 上位表示（ランキング）とは【別物】（2026-09-05・カッキーさんのご指摘で訂正）
//   ・新着は **何回でも上げられる**。回数制限は無い
//   ・上位表示は TOPの店舗カードの表示順を上げる別のボタン。1日◯回・00:00リセット
//   ★ 私（Claude）は「注意書きの文言が同じ」→「同じ回数を消費している」と推して間違えた。

// ────────────────────────────── 枠（カテゴリー） ──────────────────────────────

/**
 * 駅ちかのニュースの枠。★ 5つで固定。★ 番号とラベルは実測（2026-09-05）。
 * ★ 増やすものではない。★ 相手が増やしたら、ここを直す。
 */
export const EKICHIKA_ARTICLE_SLOTS = [
  { slot: 1, label: '速報NEWS' },
  { slot: 2, label: '新人速報' },
  { slot: 3, label: '激アツ割引情報' },
  { slot: 4, label: 'イベント速報' },
  { slot: 5, label: '緊急出勤速報' },
] as const;

export type EkichikaArticleSlot = 1 | 2 | 3 | 4 | 5;

export function isArticleSlot(v: unknown): v is EkichikaArticleSlot {
  return v === 1 || v === 2 || v === 3 || v === 4 || v === 5;
}

/** 画面に出す枠の名前。★ 知らない番号は「未設定」（勝手に読み替えない） */
export function articleSlotLabel(v: unknown): string {
  const hit = EKICHIKA_ARTICLE_SLOTS.find((s) => s.slot === v);
  return hit ? hit.label : '未設定';
}

/** 編集ページのURL。★ 枠の番号は 1〜5 だけ（それ以外は組み立てない） */
export function ekichikaArticleEditUrl(slot: unknown): string {
  if (!isArticleSlot(slot)) throw new Error('駅ちかのニュースの枠が 1〜5 ではありません（' + String(slot) + '）');
  return 'https://ranking-deli.jp/admin/articles/category' + slot + '/';
}

/** 一覧のURL。★ 送ったあと「載ったか」を読み返すのに使う */
export const EKICHIKA_ARTICLE_LIST_URL = 'https://ranking-deli.jp/admin/articles/';

// ────────────────────────────── 文字数と中身の検査 ──────────────────────────────

/**
 * ★★ 全角換算の文字数。★ 半角の英数記号を 0.5 として数える。
 *
 * ★★★ 「※全角70文字以内」が【何を数えているか】は相手にしか分からない。
 *   ★ こちらは**厳しめ**に数える（★ 通ると思って送って断られるより、送る前に気づけるほうがよい）。
 *   ★ 絵文字は「1文字」として数える（★ サロゲートペアで2に数えない）。
 */
export function titleWidth(s: unknown): number {
  const t = typeof s === 'string' ? s : '';
  let w = 0;
  for (const ch of t) {                       // ★ コードポイント単位。★ 絵文字を2に数えない
    // ★ 半角の英数・記号・スペースだけ 0.5。★ 半角カナは全角扱い（幅は狭いが、相手の数え方が不明なので厳しめ）
    w += /^[\x20-\x7E]$/.test(ch) ? 0.5 : 1;
  }
  return w;
}

export const ARTICLE_TITLE_MAX_WIDTH = 70;

export type ArticleCheck = { ok: boolean; message: string };

/** タイトルの検査。★ 送る前に弾く。★ 弾いた理由を店舗様の言葉で返す */
export function checkArticleTitle(title: unknown): ArticleCheck {
  const t = typeof title === 'string' ? title.trim() : '';
  if (t.length === 0) return { ok: false, message: 'タイトルが空です' };
  const w = titleWidth(t);
  if (w > ARTICLE_TITLE_MAX_WIDTH) {
    return { ok: false, message: 'タイトルが長すぎます（全角' + ARTICLE_TITLE_MAX_WIDTH + '文字までのところ、およそ' + Math.ceil(w) + '文字ぶんあります）' };
  }
  // ★ 改行はタイトルに入らない（相手は1行の input）
  if (/[\r\n]/.test(t)) return { ok: false, message: 'タイトルに改行は入れられません' };
  return { ok: true, message: '' };
}

/**
 * 本文の検査。★ 相手が「できません」と書いていることを、送る前に弾く。
 *   ・画像（<img>）は入れられない
 *   ・外部リンク（<a href>）は入れられない
 * ★★ さらに、こちらの都合で危ないものも弾く（script / iframe / on〜= / javascript:）。
 *   ★ 相手が受け取るかどうかに関わらず、**送らない**。
 */
export function checkArticleBody(body: unknown): ArticleCheck {
  const b = typeof body === 'string' ? body : '';
  if (b.trim().length === 0) return { ok: false, message: '本文が空です' };
  if (/<img\b/i.test(b)) return { ok: false, message: '本文に画像は入れられません（駅ちかの決まり）' };
  if (/<a\b/i.test(b)) return { ok: false, message: '本文にリンクは入れられません（駅ちかの決まり）' };
  if (/<(script|iframe|object|embed|form)\b/i.test(b)) return { ok: false, message: '本文に使えないタグが入っています' };
  if (/\son[a-z]+\s*=/i.test(b)) return { ok: false, message: '本文に使えない書き方が入っています' };
  if (/javascript:/i.test(b)) return { ok: false, message: '本文に使えない書き方が入っています' };
  return { ok: true, message: '' };
}

// ────────────────────────────── 編集ページを読む ──────────────────────────────

/**
 * 編集ページから、上書きに要る値を読む。
 *
 * ★★★ **決め打ちしない。** ★ id も画像も、相手のページに書いてあるものをそのまま持ち帰る。
 *   ★ id を間違えると【別の枠を上書きする】。★ 画像を落とすと【いまの画像が消える】。
 * ★ 読めなければ null。★ 「読めなかった」と「無かった」を混ぜない（呼ぶ側が止める）。
 */
export type EkichikaArticlePage = {
  slot: EkichikaArticleSlot;
  /** 記事ID（hidden の id）。★ 枠ごとに固定 */
  id: string;
  /** いまの画像の識別子。★ そのまま返す */
  gImage1: string;
  gImage1s: string;
  /** いま選ばれている女の子（駅ちかの castId）。★ 空のこともある */
  girlId: string;
  /** 選べる女の子（駅ちかの castId） */
  girlIds: string[];
  /** いまの画像の出どころ。'1' = 女の子の画像を使う ／ '0' = 別の画像 */
  imgFlg: string;
  /** いまのタイトル（★ 「本当に載ったか」の読み返しに使う） */
  title: string;
};

function pickAttr(html: string, name: string): string | null {
  // ★ name="x" の input の value を読む。★ 属性の並びはどちらでもよいように2通り見る
  const a = new RegExp('<input[^>]*name="' + name + '"[^>]*value="([^"]*)"', 'i').exec(html);
  if (a) return a[1];
  const b = new RegExp('<input[^>]*value="([^"]*)"[^>]*name="' + name + '"', 'i').exec(html);
  return b ? b[1] : null;
}

export function parseEkichikaArticlePage(html: unknown, slot: unknown): EkichikaArticlePage | null {
  const s = typeof html === 'string' ? html : '';
  if (!isArticleSlot(slot)) return null;
  const form = /<form[^>]*id="article_form"[\s\S]*?<\/form>/i.exec(s)?.[0] ?? s;

  const id = pickAttr(form, 'id');
  const gImage1 = pickAttr(form, 'g_image1');
  const gImage1s = pickAttr(form, 'g_image1s');
  // ★ id が無いページは「編集ページではない」。★ 空文字と読み間違えない
  if (id === null || !/^\d{1,12}$/.test(id)) return null;

  // ★ 選ばれているラジオ
  const imgFlg = /<input[^>]*name="img_flg"[^>]*value="([01])"[^>]*checked/i.exec(form)?.[1]
    ?? /<input[^>]*checked[^>]*name="img_flg"[^>]*value="([01])"/i.exec(form)?.[1]
    ?? '';

  // ★ 女の子の選択肢と、選ばれているもの
  const girlIds: string[] = [];
  const optRe = /<option[^>]*value="(\d{1,12})"([^>]*)>/gi;
  let m: RegExpExecArray | null;
  let selected = '';
  while ((m = optRe.exec(form)) !== null) {
    girlIds.push(m[1]);
    if (/\bselected\b/i.test(m[2])) selected = m[1];
  }

  const title = /<input[^>]*name="title"[^>]*value="([^"]*)"/i.exec(form)?.[1] ?? '';

  return {
    slot,
    id,
    gImage1: gImage1 ?? '',
    gImage1s: gImage1s ?? '',
    girlId: selected,
    girlIds,
    imgFlg,
    title,
  };
}

// ────────────────────────────── 一覧を読む（第156便） ──────────────────────────────

/**
 * ★★★ なぜ一覧が要るか（2026-09-05 に実弾を撃って分かった）
 *
 *   実弾は通り、編集ページを読み返してタイトルも一致した。★ なのに**公開ページに出ていなかった。**
 *   ★★ 枠そのものの表示/非表示が【別のところ】にあった。
 *
 *   ★★★ 確認は3段階だった:
 *     ① 送った            … 302 が返った
 *     ② 管理画面に入った  … 編集ページのタイトルが一致
 *     ③ 公開ページに出た  … ★ **枠が表示中かどうか**  ← ここを見ていなかった
 *
 * ★★ 一覧（/admin/articles/）の各行にトグルのフォームがある:
 *     <input type="hidden" name="article_id">
 *     <input type="hidden" name="news_display_flg">
 *     <input type="submit" name="change_display" value="表示">   ← ★ value = **いまの状態**
 *
 *   ★ 実測: 新人速報が公開ページに出ていないとき value="非表示"、
 *     カッキーさんが押して公開ページに出たあと value="表示"。★ だから value は【いまの状態】。
 *   ★★★ hidden の news_display_flg は【押したら送る値】かもしれない（＝いまの逆）。★ **未確認なので使わない。**
 *
 * ★★ 記事が無い枠は `<input type="button" name="dammybtn" value="非表示">`（★ ただの飾り）。
 *   ★ 押すと「表示する記事が存在しません。」と出るだけ。★ これを状態と読み違えないこと。
 *
 * ★★★ 日時の欄の `(表示)` は【公開状態ではない】。
 *   ★ 実測: 新人速報は `(表示)` なのに公開ページに出ていなかった。★ 別のものを指している（未確認）。
 */
export type EkichikaArticleRow = {
  slot: EkichikaArticleSlot;
  /** 相手の言葉のカテゴリー名（★ 画面や記録にはこちらを出す） */
  label: string;
  /** その枠に記事があるか。★ 無ければ上書きできない（新規の道はまだ無い） */
  hasArticle: boolean;
  /**
   * ★★★ 公開ページに出るか。
   *   ★ 記事が無ければ null（★ 「出ない」ではなく【分からない】。飾りのボタンを読まない）
   */
  visible: boolean | null;
  /** いまのタイトル（記事が無ければ空） */
  title: string;
  /** 'YYYY-MM-DD HH:MM:SS'（記事が無ければ空） */
  updatedAt: string;
};

function stripTags(s: string): string {
  return s.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * 一覧から枠ごとの状態を読む。
 *
 * ★★ 並び順は【更新の新しい順】でカテゴリー順ではない。
 *   → ★ 枠は必ず **編集／新規リンクの href** から決める（★ 並びから決めない）。
 * ★ 1つも読めなければ空配列。★ 呼ぶ側が「読めなかった」として止める。
 */
export function parseEkichikaArticleList(html: unknown): EkichikaArticleRow[] {
  const s = typeof html === 'string' ? html : '';
  const out: EkichikaArticleRow[] = [];
  const seen = new Set<number>();
  for (const m of s.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)) {
    const row = m[1];
    const slotM = /\/admin\/articles\/category(\d)\//.exec(row);
    if (!slotM) continue;
    const slot = Number(slotM[1]);
    if (!isArticleSlot(slot) || seen.has(slot)) continue;

    const tds = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((t) => stripTags(t[1]));
    const label = (tds[1] ?? '').trim();
    const hasArticle = !/記事がありません/.test(row);

    // ★★ 公開状態は change_display の value だけから読む（★ 飾りの dammybtn は読まない）
    let visible: boolean | null = null;
    if (hasArticle) {
      const btn = /name="change_display"[^>]*value="([^"]*)"/.exec(row)
        ?? /value="([^"]*)"[^>]*name="change_display"/.exec(row);
      const v = btn?.[1]?.trim() ?? '';
      // ★ 知らない文字は null（★ 勝手に「出ている」側へ倒さない）
      visible = v === '表示' ? true : (v === '非表示' ? false : null);
    }

    const title = hasArticle ? (tds[2] ?? '').trim() : '';
    const when = hasArticle ? (tds[3] ?? '') : '';
    const wm = /(\d{4}-\d{2}-\d{2})\s*(\d{2}:\d{2}:\d{2})/.exec(when);
    const updatedAt = wm ? wm[1] + ' ' + wm[2] : '';

    seen.add(slot);
    out.push({ slot, label: label || articleSlotLabel(slot), hasArticle, visible, title, updatedAt });
  }
  return out.sort((a, b) => a.slot - b.slot);
}

/** その枠の行を1つ取り出す。★ 無ければ null（★ 「無い」と「読めなかった」は呼ぶ側で分ける） */
export function findArticleRow(rows: readonly EkichikaArticleRow[], slot: unknown): EkichikaArticleRow | null {
  if (!isArticleSlot(slot)) return null;
  return (Array.isArray(rows) ? rows : []).find((r) => r.slot === slot) ?? null;
}

/** 一覧のURLを読む GET を組み立てる */
export function buildEkichikaArticleListRequest(cookie: string, userAgent: string): RelayRequest {
  return {
    method: 'GET',
    url: EKICHIKA_ARTICLE_LIST_URL,
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      ...(cookie ? { cookie } : {}),
    },
  };
}

// ────────────────────────────── 送るものを組み立てる ──────────────────────────────

export type RelayRequest = {
  method: 'GET' | 'POST';
  url: string;
  headers: Record<string, string>;
  body?: string;
};

function encodePayload(fields: ReadonlyArray<readonly [string, string]>): string {
  return fields.map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v)).join('&');
}

/** 編集ページを読む GET。★ 読むだけ */
export function buildEkichikaArticleReadRequest(cookie: string, slot: unknown, userAgent: string): RelayRequest {
  return {
    method: 'GET',
    url: ekichikaArticleEditUrl(slot),
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      ...(cookie ? { cookie } : {}),
    },
  };
}

export type ArticleWrite = {
  title: string;
  /** 本文HTML */
  body: string;
  /**
   * 誰の紹介か（駅ちかの castId）。
   * ★ null なら【読んだページの選択をそのまま返す】。★ 勝手に変えない。
   */
  girlId?: string | null;
  /**
   * 画像をどうするか。
   *   'keep'  … 読んだページのまま（既定）★ いまの画像を落とさない
   *   'girl'  … 女の子の1枚目の写真を使う（img_flg=1）★ girlId が要る
   */
  image?: 'keep' | 'girl';
};

/**
 * 保存の POST を組み立てる。
 *
 * ★★★ **読んだページ（page）が無ければ組み立てない。** ★ id を決め打ちすると別の枠を壊す。
 * ★★ display_flg は必ず '1'（表示）を明示する。★ 黙って非表示にしない。
 * ★ 検査に落ちたら投げる。★ 「送ってから断られる」のではなく、送る前に止める。
 */
export function buildEkichikaArticleSaveRequest(
  cookie: string,
  page: EkichikaArticlePage,
  write: ArticleWrite,
  userAgent: string,
): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま保存しない');
  if (!page || !isArticleSlot(page.slot)) throw new Error('読んだ編集ページが要ります（枠が分かりません）');
  if (!/^\d{1,12}$/.test(page.id)) throw new Error('読んだ編集ページの記事IDが読めていません');

  const t = checkArticleTitle(write.title);
  if (!t.ok) throw new Error('タイトルを送れません: ' + t.message);
  const b = checkArticleBody(write.body);
  if (!b.ok) throw new Error('本文を送れません: ' + b.message);

  const image = write.image ?? 'keep';
  // ★ 女の子の写真を使うなら、その子が選択肢に居ること（★ 居ない番号を送らない）
  const girlId = write.girlId ?? page.girlId;
  if (image === 'girl') {
    if (!girlId) throw new Error('女の子の写真を使うには、どなたの紹介かが要ります');
    if (page.girlIds.length > 0 && !page.girlIds.includes(girlId)) {
      throw new Error('駅ちかの選択肢に無い方です（' + girlId + '）');
    }
  }

  const fields: Array<[string, string]> = [
    ['title', write.title.trim()],
    ['body', write.body],
    ['girl_id', girlId],
    // ★ 'girl' なら 1（女の子の画像を使う）。★ 'keep' は読んだ値をそのまま返す
    ['img_flg', image === 'girl' ? '1' : page.imgFlg],
    ['display_flg', '1'],
    ['id', page.id],
    // ★★ 画像の識別子は【読んだものをそのまま返す】。★ 落とすと、いまの画像が消える
    ['g_image1', page.gImage1],
    ['g_image1s', page.gImage1s],
    ['post_edit_data', '入力内容を登録する'],
  ];

  return {
    method: 'POST',
    url: ekichikaArticleEditUrl(page.slot),
    headers: {
      'user-agent': userAgent,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded',
      referer: ekichikaArticleEditUrl(page.slot),
      origin: 'https://ranking-deli.jp',
      cookie,
    },
    body: encodePayload(fields),
  };
}
