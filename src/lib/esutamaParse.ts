// エステ魂（estama.jp）の画面と応答の読み取り（第109便・純粋関数）。
//
// ★★★ 実測した形（設計メモ_エステ魂の出勤書き込み_2026-09-02）。通信もDBも触らない。
//
//   #csrf_footer            <input type="hidden" id="csrf_footer" value="…32文字…">
//   ログイン応答            JSON 配列 ['REDIRECT_OK', '/admin/…'] / ['OUT', {項目: 文言}]
//   名簿 /admin/schedule/list/
//                           <a href="/admin/schedule/757480/">れみ 本日の出勤：─ 次回出勤日：…</a>
//   出勤表 /admin/schedule/<id>/
//                           <form id="WorkScheduleForm">
//                             hidden  brws_shop_id / cast_id / week / _check
//                             日ごと  column[YYYY-MM-DD][select][select_start]  select
//                                     column[YYYY-MM-DD][select][select_end]    select
//                                     column[YYYY-MM-DD][work_status]           checkbox value=2（お休み）
//                                     column[YYYY-MM-DD][period][H:MM]          select 0=─ 1=○ 2=× 3=TEL 99=お休み
//   保存応答                JSON 配列 ['OK'] / ['ERROR', …]（data.text）/ ['REDIRECT', url]
//
// ★★★ 「読めなかった」と「無かった」を混ぜない（作法3-5）。
//   読めなかったものは null / warnings に残す。★ 推測で埋めない。

import { parseHtmlForm, type HtmlFormField } from './htmlForm';

// ────────────────────────────── 共通 ──────────────────────────────

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

/** タグを落として実体参照を戻す。★ 正規化はしない（照合は mediaMatch の仕事） */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** タグ1つの属性を読む。★ 属性の並びに依存しない。値の無い属性（checked / selected / disabled）は '' */
export function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  // 先頭の "<input" を飛ばす
  const body = tag.replace(/^<\s*[A-Za-z0-9]+/, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].toLowerCase();
    if (name === '/' ) continue;
    const val = m[3] ?? m[4] ?? m[5] ?? '';
    out[name] = val.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (x) => ENTITIES[x] ?? x);
  }
  return out;
}

/**
 * #csrf_footer の値。★ 無ければ null（「取れていない」を null で言う）。
 * ★ 2つ以上あって値が違うときも null（どれが正しいか決められない）。
 */
export function readEsutamaCsrf(html: string): string | null {
  if (typeof html !== 'string' || html.length === 0) return null;
  const found = new Set<string>();
  const re = /<input\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const a = attrsOf(m[0]);
    if (a['id'] !== 'csrf_footer') continue;
    const v = a['value'] ?? '';
    if (/^[A-Za-z0-9]{16,64}$/.test(v)) found.add(v);
  }
  if (found.size !== 1) return null;
  return Array.from(found)[0] ?? null;
}

// ────────────────────────────── JSON 応答 ──────────────────────────────

export type EsutamaJson =
  | { kind: 'redirect_ok'; url: string }        // ログイン成功
  | { kind: 'out'; messages: string[] }          // 入力の不備（バリデーション）
  | { kind: 'ok' }                               // 保存成功
  | { kind: 'error'; text: string }              // 保存失敗（サーバが理由を返した）
  | { kind: 'redirect'; url: string }            // ログイン切れなど
  | { kind: 'unknown'; head: string };           // ★ 読めない。決めつけない

/** エステ魂の JSON 応答を読む。★ 形が違えば unknown（先頭100文字を添える） */
export function parseEsutamaJson(body: string): EsutamaJson {
  const head = typeof body === 'string' ? body.slice(0, 100) : '';
  if (typeof body !== 'string' || body.trim().length === 0) return { kind: 'unknown', head };
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    return { kind: 'unknown', head };
  }
  if (!Array.isArray(data) || data.length === 0) {
    // ★ jQuery の success で data.text を読む分岐があるので、object も一応見る
    if (data && typeof data === 'object' && typeof (data as { text?: unknown }).text === 'string') {
      return { kind: 'error', text: String((data as { text: string }).text).slice(0, 200) };
    }
    return { kind: 'unknown', head };
  }
  const tag = String(data[0]);
  const second = data[1];
  switch (tag) {
    case 'REDIRECT_OK':
      return { kind: 'redirect_ok', url: typeof second === 'string' ? second : '' };
    case 'OUT': {
      const messages: string[] = [];
      if (second && typeof second === 'object') {
        for (const v of Object.values(second as Record<string, unknown>)) {
          if (typeof v === 'string') messages.push(v.slice(0, 200));
          else if (Array.isArray(v)) for (const x of v) if (typeof x === 'string') messages.push(x.slice(0, 200));
        }
      } else if (typeof second === 'string') messages.push(second.slice(0, 200));
      return { kind: 'out', messages };
    }
    case 'OK':
      return { kind: 'ok' };
    case 'ERROR': {
      const t = typeof second === 'string' ? second
        : (data as { text?: unknown }).text !== undefined ? String((data as { text?: unknown }).text)
        : '';
      return { kind: 'error', text: t.slice(0, 200) };
    }
    case 'REDIRECT':
      return { kind: 'redirect', url: typeof second === 'string' ? second : '' };
    default:
      return { kind: 'unknown', head };
  }
}

// ────────────────────────────── 名簿 ──────────────────────────────

export type EsutamaRosterRow = { castId: string; name: string };
export type EsutamaRosterParse = { rows: EsutamaRosterRow[]; warnings: string[] };

/**
 * /admin/schedule/list/ から 名前 → cast_id を読む。
 * ★ 行の形: <a href="/admin/schedule/757480/">れみ 本日の出勤：─ 次回出勤日：…</a>
 * ★ 名前は「本日の出勤」の手前まで。それが無い行は【読めなかった】として warnings に残す。
 */
export function parseEsutamaRoster(html: string): EsutamaRosterParse {
  const rows: EsutamaRosterRow[] = [];
  const warnings: string[] = [];
  if (typeof html !== 'string' || html.length === 0) return { rows, warnings: ['本文が空'] };
  const seen = new Map<string, string>();
  const re = /<a\b[^>]*href\s*=\s*["']\/admin\/schedule\/(\d+)\/?["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const castId = m[1];
    const text = textOf(m[2]);
    const cut = text.indexOf('本日の出勤');
    if (cut < 0) {
      warnings.push('cast_id ' + castId + ' の行に「本日の出勤」が無い（名前を切り出せない）');
      continue;
    }
    const name = text.slice(0, cut).trim();
    if (!name) {
      warnings.push('cast_id ' + castId + ' の名前が空');
      continue;
    }
    const prev = seen.get(castId);
    if (prev !== undefined) {
      if (prev !== name) warnings.push('cast_id ' + castId + ' が2回出て名前が違う');
      continue;
    }
    seen.set(castId, name);
    rows.push({ castId, name });
  }
  if (rows.length === 0 && warnings.length === 0) warnings.push('出勤設定の行（/admin/schedule/<番号>/）が1つも無い');
  return { rows, warnings };
}

// ───────────── ★★★ セラピスト設定の一覧（/admin/cast/・第229便・2026-09-09） ─────────────
//
// ★★★ 出勤の名簿（/admin/schedule/list/）とは【別のページ】。
//   ★ 表示／非表示の状態は、こちらにしか無い（2026-09-09 実測）。
//
// ★★ 実物の形（1人ぶん）★ 2026-09-09（第232便）に実物で数え直して訂正した:
//   <li class="item tg_block ">                        ← 表示中
//   <li class="item tg_block disabled">                ← ★ 非表示（クラスに disabled が付く）
//   ★★★ **`<li>` である。** ★ 第229便では `<div>` と書いていた。★ これが原因で
//     実弾のとき1件も読めず、登録の流れが1段目で止まった（2026-09-09 12:41）。
//     ★ 教訓: **タグ名は当てにしない。** ★ 目印はクラスだけにする。
//     <span class="tag-disabled">非表示</span>          ← ★ 非表示のときだけ在る
//     <a class="btn btn-warning card-btn1" href="/shop/<店舗>/cast/<castId>/">なまえ</a>
//     <a class="btn btn-success" href="/admin/cast_edit/<castId>/">編集</a>
//     <a class="send-easy_confirm_post ..." data-post="cast_disabled" data-row="<castId>">非表示</a>
//        ★ 非表示のときは data-post="cast_enable"（★ **口が別**。トグルではない）
//     <a class="btn btn-danger send-post_delete" data-delete="cast,<castId>,">削除</a>
//
// ★★★ 押す口が状態ごとに分かれているので、**間違えて逆にする事故が起きない**。
//   ★ それでも状態を読むのは、①記録に「すでに非表示です」と書くため ②消したあとの照合のため。

export type EsutamaCastRow = {
  /** エステ魂の cast_id */
  castId: string;
  /** 表示名。★ 照合用の正規化はしない（呼び出し側の仕事） */
  name: string;
  /** ★ true＝いま非表示。★ 判定は tg_block のクラスに disabled が在るかどうかの1点 */
  disabled: boolean;
};

export type EsutamaCastListParse = { rows: EsutamaCastRow[]; warnings: string[] };

/**
 * /admin/cast/ から castId・名前・表示状態を読む。
 * ★ 1人ぶんの塊は「data-post="cast_disabled" か "cast_enable" を持つ <a>」を目印に切り出す。
 *   ★ そこに data-row=<castId> が必ず在る（★ 表示中・非表示のどちらでも）。
 * ★ 読めない行は捨てて warnings に残す。★ 数だけ返して黙らない。
 */
export function parseEsutamaCastList(html: string): EsutamaCastListParse {
  const rows: EsutamaCastRow[] = [];
  const warnings: string[] = [];
  if (typeof html !== 'string' || html.length === 0) return { rows, warnings: ['本文が空'] };

  // 1. tg_block の開始位置を全部拾い、隣どうしで切る（駅ちかの girls-cell と同じやり方）
  //   ★ 目印は **クラスだけ**。★ タグ名（li/div）は見ない
  const heads: Array<{ end: number; index: number; classAttr: string }> = [];
  // ★★★ タグ名で決め打ちしない（第232便で踏んだ）。★ 実物は <li>。★ <div> だと決めつけて0件になった。
  const re = /<[a-zA-Z][a-zA-Z0-9]*\b[^>]*class\s*=\s*"([^"]*\btg_block\b[^"]*)"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) heads.push({ index: m.index, end: m.index + m[0].length, classAttr: m[1] });

  if (heads.length === 0) {
    warnings.push('セラピスト設定の行（tg_block）が1件も見つからない。取得失敗かレイアウト変更を疑うこと');
    return { rows, warnings };
  }

  const seen = new Set<string>();
  for (let i = 0; i < heads.length; i++) {
    const chunk = html.slice(heads[i].end, i + 1 < heads.length ? heads[i + 1].index : html.length);

    // ★ castId は data-row から。★ 表示中でも非表示でも同じ場所に在る
    const castId = /data-row\s*=\s*"(\d+)"/.exec(chunk)?.[1] ?? null;
    if (!castId) { warnings.push(heads.length + '件中' + (i + 1) + '件目に data-row が無い'); continue; }

    // ★★ 番号の突き合わせ。編集リンクの番号と食い違えば、その行は使わない（駅ちかと同じ作法）
    const editId = /\/admin\/cast_edit\/(\d+)/.exec(chunk)?.[1] ?? null;
    if (editId !== null && editId !== castId) {
      warnings.push('cast_id ' + castId + ' と編集リンクの番号 ' + editId + ' が食い違う（使わない）');
      continue;
    }

    // 名前は公開ページへのリンクの中身
    const nameHtml = /<a\b[^>]*href\s*=\s*"[^"]*\/cast\/\d+\/?"[^>]*>([\s\S]*?)<\/a>/i.exec(chunk)?.[1] ?? '';
    const name = textOf(nameHtml);
    if (!name) { warnings.push('cast_id ' + castId + ' の名前を切り出せない'); continue; }

    if (seen.has(castId)) { warnings.push('cast_id ' + castId + ' が2回出てくる'); continue; }
    seen.add(castId);

    // ★★★ 状態は tg_block のクラスの disabled ただ1点で決める。
    //   ★ バッジ（tag-disabled）やボタンの文言では決めない。★ 文言は変わりうる
    rows.push({ castId, name, disabled: /\bdisabled\b/.test(heads[i].classAttr) });
  }
  return { rows, warnings };
}

// ───────── ★★★ セラピスト追加フォーム（/admin/cast_edit/・第231便・2026-09-09）─────────
//
// ★★★ 2026-09-09 に実物を読んで確かめた（ラビリンス様の許可のもと・**読むだけ・保存は押していない**）:
//   ・題は「エステ魂 管理画面｜セラピストの追加」。★ `<form method="POST">` が1つだけ・**65部品**
//   ・action は自分自身（`https://estama.jp/admin/cast_edit/`）／ enctype は既定（urlencoded）
//   ・**必須は2つだけ**（ページ全体で「必須」の字は2か所）: `name`(10文字以内) と `type[]`
//   ・hidden: `cast_id="0"`（★ **0 が「新規」の印**）／ `ctk`（★ `#csrf_footer` と同じ値）
//   ・`type[]` は **27種**（チェックボックス）
//   ・「※3サイズのB(バスト)が未入力の場合、表示されません」→ ★ size_b を送らないと公開ページに出ない
//
// ★★★ **`set_up_limit` は絶対に送らない。**
//   ★ 実物の見出しは「**保存と同時に上位表示する (残り7回)**」。★ **回数に限りのある店舗様の資源。**
//   ★ こちらの都合で1回でも減らしてはいけない。→ この読み手が【最初から外して返す】。
//
// ★★ `input[type=file]`（写真6枚）は **name 属性が無い**（id は cast_icon_1..6）。
//   ★ どう送るのかは**未調査**。★ だから写真はこの便では扱わない。★ 分からないものを送らない。

/**
 * ★★★★ **絶対に送らない欄**（エステ魂）。
 *   `set_up_limit` … 実物の見出しは「**保存と同時に上位表示する (残り7回)**」。
 *   ★ **回数に限りのある店舗様の資源。** ★ こちらの都合で1回でも減らしてはいけない。
 */
export const ESUTAMA_NEVER_SEND = ['set_up_limit'] as const;

export type EsutamaFormField = HtmlFormField;

export type EsutamaCastFormParse = {
  /** ★ そのまま送り返せる形。★ file と set_up_limit は**入っていない** */
  fields: EsutamaFormField[];
  /** hidden の ctk（★ 無ければ null） */
  ctk: string | null;
  /** hidden の cast_id（★ 新規フォームは '0'） */
  castIdHidden: string | null;
  /** ★ 画面に実在する特徴タグの番号。★ 「相手に無い番号を送らない」ための照合に使う */
  typeIds: string[];
  /** ★ name つきの送信ボタン（★ 2026-09-09 時点のエステ魂には無い） */
  submits: EsutamaFormField[];
  /** ★ わざと外したもの（見えるようにして残す） */
  skipped: string[];
  warnings: string[];
};

/**
 * セラピスト追加／編集フォームを読み、**送り返せる name/value の並び**にする。
 *
 * ★★★ 読む仕事そのものは `htmlForm.parseHtmlForm` が持つ（第233便で1か所にまとめた）。
 *   ★ ここは **エステ魂の事情**だけを足す薄い包み:
 *     ・`set_up_limit` を絶対に送らない
 *     ・`ctk` / `cast_id` / 実在する `type[]` の番号 を取り出す
 *   ★★ 共通の読み手は **実物と31組・差分0** で確かめてある（2026-09-09）。
 */
export function parseEsutamaCastForm(
  html: string,
  // ★ action を絶対に直す土台（第235便）。★ エステ魂の追加フォームは action が自分自身（§9-1）
  pageUrl: string = 'https://estama.jp/admin/cast_edit/',
): EsutamaCastFormParse {
  const f = parseHtmlForm(html, { skipNames: ESUTAMA_NEVER_SEND, baseUrl: pageUrl });
  const ctk = f.fields.find((x) => x.name === 'ctk')?.value ?? null;
  const castIdHidden = f.fields.find((x) => x.name === 'cast_id')?.value ?? null;
  const typeIds = f.choiceValues['type[]'] ?? [];
  const warnings = [...f.warnings];
  if (f.fields.length > 0) {
    if (!ctk) warnings.push('ctk が見つからない');
    if (!f.fields.some((x) => x.name === 'name')) warnings.push('name の欄が見つからない');
    if (typeIds.length === 0) warnings.push('特徴タグ（type[]）が1つも見つからない');
  }
  return { fields: f.fields, ctk, castIdHidden, typeIds, submits: f.submits, skipped: f.skipped, warnings };
}
