// ───────── ★★★ HTML のフォームを読む（第233便・2026-09-09）─────────
//
// ★★★ なぜ「読んでから送る」のか（カッキーさん決定・2026-09-09）
//   相手のフォームは部品が多い（エステ魂65／駅ちか110）。★ その形をこちらで決め打ちすると、
//   相手が項目を1つ増やしただけで**黙って壊れる**。
//   → 毎回読み、**こちらが決めた欄だけ差し替えて**、残りは読んだまま返す。
//
// ★★★ **この読み手は実物で確かめてある**（2026-09-09・エステ魂の追加フォーム）:
//   実物のページ上で「この読み手が出した並び」と「ブラウザが実際に送る並び（new FormData）」を
//   1つずつ突き合わせ、**31組・差分0**だった。★ だから媒体をまたいで使い回す。
//
// ★★ ブラウザと同じふるまいをする、が唯一の決めごと:
//   input    … name の無いもの・type=file・submit/button/image/reset は送らない
//              checkbox/radio は **checked のものだけ**（★ 未チェックは送らない）
//   select   … selected の option。★ 無ければ**先頭**（★ ブラウザと同じ。空にしない）
//   textarea … 中身
//
// ★ 通信も DB も触らない。★ 何を差し替えるかは呼び出し側が決める。

const ENTITIES: Record<string, string> = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&nbsp;': ' ',
};

function unescape(src: string): string {
  return String(src ?? '').replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (x) => ENTITIES[x] ?? x);
}

/** タグを落として実体参照を戻す */
function textOf(html: string): string {
  return String(html ?? '')
    .replace(/<[^>]*>/g, '')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (m) => ENTITIES[m] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** タグ1つの属性を読む。★ 並びに依存しない。値の無い属性（checked / selected）は '' */
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const body = tag.replace(/^<\s*[A-Za-z0-9]+/, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].toLowerCase();
    if (name === '/') continue;
    out[name] = unescape(m[3] ?? m[4] ?? m[5] ?? '');
  }
  return out;
}

export type HtmlFormField = { name: string; value: string };
export type HtmlFormOption = { value: string; label: string };

export type HtmlFormParse = {
  /** ★ そのまま送り返せる並び（ブラウザが送るのと同じ） */
  fields: HtmlFormField[];
  /** ★ 画面に在る入力の name ぜんぶ（★ 未チェックのチェックボックスも含む・重複なし）。
   *   ★★ 「相手の画面に無い欄を送らない」を確かめるのに使う */
  names: string[];
  /** ★ select の選択肢（value とラベル）。★★ **番号を決め打ちせずラベルで引く**ために要る */
  selectOptions: Record<string, HtmlFormOption[]>;
  /** ★ checkbox / radio の group ごとの value 一覧（★ チェックの有無によらず全部） */
  choiceValues: Record<string, string[]>;
  /**
   * ★★ 欄ごとの maxlength（画面に書いてあるもの）。
   *   ★★★ **文字数の上限を、こちらのコードに書き写さない**ための道具。
   *     ★ 相手が上限を変えても、読んだ値で判断できる。
   */
  maxLengths: Record<string, number>;
  /** ★ わざと送らないことにしたもの（黙って落とさない） */
  skipped: string[];
  warnings: string[];
};

export type ParseHtmlFormOptions = {
  /**
   * ★★★ **絶対に送らない欄の名前。**
   *   ★ 例: エステ魂の `set_up_limit`（「保存と同時に上位表示する・残り回数あり」＝店舗様の資源）。
   *   ★ ここに入れたものは fields に**入らない**。★ 外したことは skipped に残す。
   */
  skipNames?: readonly string[];
  /** 何番目の form を読むか（既定0＝最初）。★ 画面に検索フォームなどが在るとき用 */
  formIndex?: number;
  /**
   * ★★★ **この名前の欄を全部持っている form** を選ぶ（第233便）。
   *   ★ 「1ページに form は1つ」と決めつけないため。★ 検索窓やログアウトのフォームが混ざる画面が在る。
   *   ★ 見つからなければ **空で返して warnings に残す**（★ 別の form を「たぶんこれ」で読まない）。
   *   ★ formIndex より優先する。
   */
  containsNames?: readonly string[];
};

const NON_VALUE_INPUT = new Set(['submit', 'button', 'image', 'reset']);

/**
 * HTML の <form> を1つ読み、**ブラウザが送るのと同じ name/value の並び**にする。
 * ★ 読めないときは空で返さず、必ず warnings に理由を残す（「0件」で通さない）。
 */
export function parseHtmlForm(html: string, opts: ParseHtmlFormOptions = {}): HtmlFormParse {
  const fields: HtmlFormField[] = [];
  const nameSet = new Set<string>();
  const selectOptions: Record<string, HtmlFormOption[]> = {};
  const choiceValues: Record<string, string[]> = {};
  const maxLengths: Record<string, number> = {};
  const skipped: string[] = [];
  const warnings: string[] = [];
  const skip = new Set(opts.skipNames ?? []);
  const src = typeof html === 'string' ? html : '';
  const empty = (): HtmlFormParse => ({ fields, names: [...nameSet], selectOptions, choiceValues, maxLengths, skipped, warnings });

  if (!src) { warnings.push('本文が空'); return empty(); }

  // ── form の中身を切り出す ───────────────────────────────
  const opens = /<form\b[^>]*>/gi;
  const heads: Array<{ end: number }> = [];
  let om: RegExpExecArray | null;
  while ((om = opens.exec(src)) !== null) heads.push({ end: om.index + om[0].length });
  if (heads.length === 0) {
    warnings.push('フォームが見つからない。取得失敗かレイアウト変更を疑うこと');
    return empty();
  }
  const bodyOf = (h: number): string => {
    const st = heads[h].end;
    const ce = src.toLowerCase().indexOf('</form>', st);
    return src.slice(st, ce >= 0 ? ce : src.length);
  };

  let pick = -1;
  const must = opts.containsNames ?? [];
  if (must.length > 0) {
    // ★★★ 「この欄を持っている form」を選ぶ。★ 見つからなければ読まない
    for (let h = 0; h < heads.length; h++) {
      const b = bodyOf(h);
      if (must.every((n) => new RegExp('name\\s*=\\s*"' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(b))) { pick = h; break; }
    }
    if (pick < 0) {
      warnings.push('指定の欄（' + must.join(' / ') + '）を持つフォームが ' + heads.length + ' 個の中に無い。画面の作りが変わった可能性がある');
      return empty();
    }
  } else {
    const want = Math.max(0, Math.floor(opts.formIndex ?? 0));
    if (want >= heads.length) {
      warnings.push('フォームが ' + heads.length + ' 個しかないので ' + (want + 1) + ' 番目は読めない');
      return empty();
    }
    pick = want;
  }
  const inner = bodyOf(pick);
  if (src.toLowerCase().indexOf('</form>', heads[pick].end) < 0) {
    warnings.push('</form> が見つからないので、ページの終わりまでを form として読んだ');
  }

  const re = /<textarea\b([^>]*)>([\s\S]*?)<\/textarea>|<select\b([^>]*)>([\s\S]*?)<\/select>|<input\b([^>]*)>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    // ── textarea ──
    if (m[1] !== undefined) {
      const a = attrsOf('<textarea' + m[1] + '>');
      if (!a.name) continue;
      nameSet.add(a.name);
      if (a.maxlength && /^\d+$/.test(a.maxlength)) maxLengths[a.name] = Number(a.maxlength);
      if (skip.has(a.name)) { skipped.push(a.name); continue; }
      fields.push({ name: a.name, value: unescape(m[2]).replace(/^\r?\n/, '') });
      continue;
    }
    // ── select ──
    if (m[3] !== undefined) {
      const a = attrsOf('<select' + m[3] + '>');
      if (!a.name) continue;
      nameSet.add(a.name);
      const opts2: Array<{ value: string; label: string; selected: boolean }> = [];
      const ore = /<option\b([^>]*)>([\s\S]*?)(?=<option\b|<\/select>|$)/gi;
      let am: RegExpExecArray | null;
      while ((am = ore.exec(m[4])) !== null) {
        const oa = attrsOf('<option' + am[1] + '>');
        const label = textOf(am[2]);
        opts2.push({ value: oa.value !== undefined ? oa.value : label, label, selected: 'selected' in oa });
      }
      selectOptions[a.name] = opts2.map((o) => ({ value: o.value, label: o.label }));
      if (skip.has(a.name)) { skipped.push(a.name); continue; }
      if (opts2.length === 0) { warnings.push(a.name + ' の選択肢が1つも無い'); continue; }
      // ★ selected が無ければ先頭。★ ブラウザと同じ（ここを空にすると値が消える）
      fields.push({ name: a.name, value: (opts2.find((o) => o.selected) ?? opts2[0]).value });
      continue;
    }
    // ── input ──
    const a = attrsOf('<input' + m[5] + '>');
    const type = String(a.type ?? 'text').toLowerCase();
    if (type === 'file') { skipped.push(a.name ? a.name : '(name の無い file)'); continue; }
    if (!a.name) continue;
    nameSet.add(a.name);
    if (a.maxlength && /^\d+$/.test(a.maxlength)) maxLengths[a.name] = Number(a.maxlength);
    if (type === 'checkbox' || type === 'radio') {
      const list = choiceValues[a.name] ?? (choiceValues[a.name] = []);
      const v = a.value !== undefined ? a.value : 'on';
      if (!list.includes(v)) list.push(v);
    }
    if (skip.has(a.name)) { skipped.push(a.name); continue; }
    if (NON_VALUE_INPUT.has(type)) continue;
    if (type === 'checkbox' || type === 'radio') {
      if (!('checked' in a)) continue;                 // ★ 未チェックは送らない
      fields.push({ name: a.name, value: a.value !== undefined ? a.value : 'on' });
      continue;
    }
    fields.push({ name: a.name, value: a.value !== undefined ? a.value : '' });
  }

  return empty();
}

/**
 * ★★★ **選択肢を「ラベル」で引く**（第233便）。
 *   ★ 番号を決め打ちしないための道具。
 *   ★★ 第230便で「エステ魂は27種だから番号は1〜27」と決めつけて転んだ（実際は31まで在った）。
 *     ★ 数と番号は別物。★ 相手が持っている番号は、相手の画面から取る。
 *
 * @param want 探すラベル（例 'Dカップ'）。★ 前後の空白は無視して**完全一致**で探す
 * @returns 見つからなければ null（★ 「たぶんこれ」で近いものを返さない）
 */
export function optionValueByLabel(
  options: readonly HtmlFormOption[] | undefined,
  want: string,
): string | null {
  if (!options || options.length === 0) return null;
  const key = String(want ?? '').trim();
  if (!key) return null;
  const hit = options.find((o) => o.label.trim() === key);
  return hit ? hit.value : null;
}
