// ───────── ★★★ エステ魂のセラピストのプロフィールを更新する（第430便・2026-09-17）─────────
//
// ★★ 何のため … コネックエフ「基本情報／コメント／各サイト項目（エステ魂）」の内容を、
//   登録済みのセラピストの編集ページ `/admin/cast_edit/<castId>/` へ送る。★ 駅ちかの girl_edit（第415便）のエステ魂版。
//
// ★★★ 実物（2026-09-17・見るだけ・設計メモ_女性プロフィールをサイトごとに §5）:
//   フォーム1枚・65部品・POST（urlencoded）・hidden に cast_id / ctk / order_cast_images[]
//   欄: name(10) / description(500) / cast_pr(500) / type[]（候補27・4つ以内） / experience(2) / qualified(200)
//       age / tall / body_style / size_b / size_w / size_h / size_cup / blood
//       forte_procedure / food / man_like_type / like_talent / holiday / vogue（各20）
//       blog / twitter / bluesky_url / instagram（255） / set_up_limit（★ 絶対に送らない）
//
// ★★★ 決めごと（駅ちかと同じ・★ 迷ったら送らない／触らない）
//   ① 編集ページを毎回読み、読んだ65部品を土台にする（★ 写真の order_cast_images[] もそのまま返す）
//   ② コネックエフで空の欄は、エステ魂の今の値のまま（★ 消さない）
//   ③ 上限を超える欄は、その欄だけ送らない（★ 切り詰めない・理由を残す）
//   ④ 特徴（type[]）は、コネックエフで1つ以上選んでいるときだけ丸ごと差し替え（★ 4つまで・画面に在るラベルだけ）
//   ⑤ 名前は送らない ／ set_up_limit は送らない（★ 上位表示の残り回数は店舗様の資源）
//   ⑥ 読んだフォームの cast_id が相手と違えば送らない（★ 別人を上書きしない）
//
// ★ このファイルは通信も DB も触らない。

import { parseHtmlForm, optionValueByLabel, type HtmlFormOption } from './htmlForm';
import { ESUTAMA_NEVER_SEND } from './esutamaParse';
import { sameText, diffHint } from './ekichikaGirlEdit';

export type EsutamaCastEditValues = {
  age?: string | null; tall?: string | null; bust?: string | null; waist?: string | null; hip?: string | null;
  /** 'A'〜'L'（1文字） */
  cup?: string | null;
  /** 'A' | 'B' | 'O' | 'AB' */
  blood?: string | null;
  /** ショップコメント（★ コネックエフのお店コメント） */
  description?: string | null;
  /** セラピストコメント（★ コネックエフの女の子コメント） */
  castPr?: string | null;
  /** 特徴のラベル（★ ESUTAMA_TYPES の語） */
  types?: string[] | null;
  experience?: string | null;
  qualified?: string | null;
  /** 'スレンダー' | '普通' | 'グラマー' | '少しぽっちゃり' | 'ぽっちゃり' */
  bodyStyle?: string | null;
  /** ★ conecfSiteFields の ESUTAMA_QUESTIONS のキー → 値 */
  answers?: Record<string, string> | null;
  /** ★ ESUTAMA_SNS のキー → 値 */
  sns?: Record<string, string> | null;
};

export const ESUTAMA_EDIT_LIMITS = { description: 500, cast_pr: 500, qualified: 200, question: 20, sns: 255 } as const;
export const ESUTAMA_EDIT_TYPE_MAX = 4;
/** ★ コネックエフの質問キー → エステ魂の欄名 */
export const ESUTAMA_ANSWER_FIELD: Readonly<Record<string, string>> = {
  forte: 'forte_procedure', food: 'food', manType: 'man_like_type', likeTalent: 'like_talent', holiday: 'holiday', hobby: 'vogue',
};
export const ESUTAMA_ANSWER_LABEL: Readonly<Record<string, string>> = {
  forte: '得意な施術', food: '好きな食べ物', manType: '好きな男性のタイプ', likeTalent: '似ている芸能人', holiday: '休みの日は何してる？', hobby: '趣味・特技',
};
export const ESUTAMA_SNS_FIELD: Readonly<Record<string, string>> = { blog: 'blog', twitter: 'twitter', bluesky: 'bluesky_url', instagram: 'instagram' };
export const ESUTAMA_SNS_LABEL: Readonly<Record<string, string>> = { blog: '外部ブログ', twitter: 'X', bluesky: 'Bluesky', instagram: 'Instagram' };

export type EsutamaCastEditForm = {
  action: string | null;
  fields: Array<{ name: string; value: string }>;
  names: string[];
  selectOptions: Record<string, HtmlFormOption[]>;
  maxLengths: Record<string, number>;
  submits: Array<{ name: string; value: string }>;
  ctk: string | null;
  castIdHidden: string | null;
  /** ★ 特徴の番号 → 画面のラベル（★ 画面から読む・番号を決め打ちしない） */
  typeLabels: Record<string, string>;
  warnings: string[];
};

const stripTags = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

/**
 * ★ 特徴（type[]）のチェックボックスのラベルを読む。
 *   ① <label>…<input name="type[]" value="N">ラベル</label>
 *   ② <input id="x" …><label for="x">ラベル</label>
 *   ③ <input …>ラベル（★ 次のタグまでの文字）
 */
export function readEsutamaTypeLabels(html: string): Record<string, string> {
  const out: Record<string, string> = {};
  const src = String(html ?? '');
  const re = /<input\b[^>]*name\s*=\s*["']type\[\]["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const tag = m[0];
    const value = /value\s*=\s*["']([^"']*)["']/i.exec(tag)?.[1];
    if (!value || out[value]) continue;
    const after = src.slice(m.index + tag.length, m.index + tag.length + 400);
    // ① 包んでいる label（★ input のあと </label> までの文字）
    const before = src.slice(Math.max(0, m.index - 300), m.index);
    const openLabel = before.lastIndexOf('<label');
    const closeLabelBefore = before.lastIndexOf('</label');
    if (openLabel > closeLabelBefore) {
      const end = after.search(/<\/label>/i);
      if (end >= 0) {
        const t = stripTags(after.slice(0, end));
        if (t) { out[value] = t; continue; }
      }
    }
    // ② label for=id
    const id = /\bid\s*=\s*["']([^"']+)["']/i.exec(tag)?.[1];
    if (id) {
      const lf = new RegExp('<label\\b[^>]*for\\s*=\\s*["\']' + id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '["\'][^>]*>([\\s\\S]*?)<\\/label>', 'i').exec(src);
      if (lf) { const t = stripTags(lf[1]); if (t) { out[value] = t; continue; } }
    }
    // ③ 次のタグまで
    const t = stripTags(after.split(/<(?:input|br|\/li|\/div|\/td|\/p)\b/i)[0] ?? '');
    if (t) out[value] = t;
  }
  return out;
}

/** 編集ページを読む（★ set_up_limit は最初から外す） */
export function parseEsutamaCastEditForm(html: string, pageUrl: string): EsutamaCastEditForm {
  const f = parseHtmlForm(html, { skipNames: ESUTAMA_NEVER_SEND, baseUrl: pageUrl });
  const ctk = f.fields.find((x) => x.name === 'ctk')?.value ?? null;
  const castIdHidden = f.fields.find((x) => x.name === 'cast_id')?.value ?? null;
  const warnings = [...f.warnings];
  if (f.fields.length > 0) {
    if (!ctk) warnings.push('ctk が見つからない');
    if (!f.names.includes('name')) warnings.push('name の欄が見つからない');
    if ((f.choiceValues['type[]'] ?? []).length === 0) warnings.push('特徴タグ（type[]）が1つも見つからない');
  }
  return {
    action: f.action, fields: f.fields, names: f.names, selectOptions: f.selectOptions, maxLengths: f.maxLengths,
    submits: f.submits, ctk, castIdHidden, typeLabels: readEsutamaTypeLabels(html), warnings,
  };
}

export type EsutamaEditChange = { field: string; label: string; before: string; after: string };
export type EsutamaEditPlan = { pairs: Array<[string, string]>; changes: EsutamaEditChange[]; skipped: string[] };

const len = (s: string) => [...s].length;
const firstValue = (form: { fields: Array<{ name: string; value: string }> }, name: string) => form.fields.find((f) => f.name === name)?.value ?? '';
const checkedTypes = (form: { fields: Array<{ name: string; value: string }> }) => form.fields.filter((f) => f.name === 'type[]').map((f) => f.value);

function pickOption(options: HtmlFormOption[] | undefined, candidates: string[]): string | null {
  for (const c of candidates) {
    const v = optionValueByLabel(options, c);
    if (v !== null) return v;
  }
  return null;
}

export function planEsutamaCastEdit(form: EsutamaCastEditForm, v: EsutamaCastEditValues): EsutamaEditPlan {
  const skipped: string[] = [];
  const changes: EsutamaEditChange[] = [];
  const ov: Record<string, string> = {};
  const limitOf = (name: string, fallback: number) => {
    const m = form.maxLengths[name];
    return typeof m === 'number' && m > 0 ? m : fallback;
  };
  const setText = (name: string, label: string, raw: string | null | undefined, max: number) => {
    const val = String(raw ?? '').replace(/\r\n/g, '\n').trim();
    if (!val) return;
    if (!form.names.includes(name)) { skipped.push(label + '（エステ魂の画面に欄が無い）'); return; }
    const lim = limitOf(name, max);
    if (len(val) > lim) { skipped.push(label + '（' + lim + '文字を超えている・' + len(val) + '文字）'); return; }
    const before = firstValue(form, name);
    if (sameText(before, val)) return;
    ov[name] = val;
    changes.push({ field: name, label, before, after: val });
  };
  const setNum = (name: string, label: string, raw: string | null | undefined, digits: number) => {
    const val = String(raw ?? '').trim();
    if (!val) return;
    if (!new RegExp('^\\d{1,' + digits + '}$').test(val)) { skipped.push(label + '（数字' + digits + 'けたまで）'); return; }
    if (!form.names.includes(name)) { skipped.push(label + '（エステ魂の画面に欄が無い）'); return; }
    const before = firstValue(form, name);
    if (before === val) return;
    ov[name] = val;
    changes.push({ field: name, label, before, after: val });
  };
  const setSelect = (name: string, label: string, candidates: string[] | null, shown: string) => {
    if (!candidates) return;
    if (!form.names.includes(name)) { skipped.push(label + '（エステ魂の画面に欄が無い）'); return; }
    const found = pickOption(form.selectOptions[name], candidates);
    if (found === null) { skipped.push(label + '（エステ魂の選択肢に「' + shown + '」が無い）'); return; }
    const before = firstValue(form, name);
    if (before === found) return;
    ov[name] = found;
    const beforeLabel = form.selectOptions[name]?.find((o) => o.value === before)?.label ?? before;
    changes.push({ field: name, label, before: beforeLabel, after: shown });
  };

  setNum('age', '年齢', v.age, 2);
  setNum('tall', '身長', v.tall, 3);
  setNum('size_b', 'バスト', v.bust, 3);
  setNum('size_w', 'ウエスト', v.waist, 3);
  setNum('size_h', 'ヒップ', v.hip, 3);
  const cup = String(v.cup ?? '').trim().toUpperCase();
  setSelect('size_cup', 'カップ', /^[A-Z]$/.test(cup) ? [cup, cup + 'カップ'] : null, cup);
  const blood = String(v.blood ?? '').trim().toUpperCase();
  setSelect('blood', '血液型', ['A', 'B', 'O', 'AB'].includes(blood) ? [blood, blood + '型'] : null, blood);
  const bodyStyle = String(v.bodyStyle ?? '').trim();
  setSelect('body_style', '体型', bodyStyle ? [bodyStyle] : null, bodyStyle);

  setText('description', 'ショップコメント', v.description, ESUTAMA_EDIT_LIMITS.description);
  setText('cast_pr', 'セラピストコメント', v.castPr, ESUTAMA_EDIT_LIMITS.cast_pr);
  setNum('experience', 'エステ歴', v.experience, 2);
  setText('qualified', '資格', v.qualified, ESUTAMA_EDIT_LIMITS.qualified);
  for (const [k, field] of Object.entries(ESUTAMA_ANSWER_FIELD)) {
    setText(field, ESUTAMA_ANSWER_LABEL[k], v.answers?.[k], ESUTAMA_EDIT_LIMITS.question);
  }
  for (const [k, field] of Object.entries(ESUTAMA_SNS_FIELD)) {
    setText(field, ESUTAMA_SNS_LABEL[k], v.sns?.[k], ESUTAMA_EDIT_LIMITS.sns);
  }

  // ④ 特徴
  const current = checkedTypes(form);
  let sendTypes = current;
  const wantLabels = (v.types ?? []).filter((x) => typeof x === 'string' && x);
  if (wantLabels.length > 0) {
    if (wantLabels.length > ESUTAMA_EDIT_TYPE_MAX) skipped.push('特徴（' + ESUTAMA_EDIT_TYPE_MAX + 'つを超えている）');
    else {
      const byLabel = new Map(Object.entries(form.typeLabels).map(([id, l]) => [l, id]));
      const ids: string[] = [];
      const unknown: string[] = [];
      for (const l of wantLabels) {
        const id = byLabel.get(l);
        if (!id) unknown.push(l); else if (!ids.includes(id)) ids.push(id);
      }
      if (unknown.length > 0) skipped.push('特徴（エステ魂の画面に「' + unknown.join('・') + '」が見つからない）');
      else {
        sendTypes = ids;
        if ([...ids].sort().join(',') !== [...current].sort().join(',')) {
          const lab = (id: string) => form.typeLabels[id] ?? '#' + id;
          changes.push({ field: 'type[]', label: '特徴', before: current.map(lab).join('・'), after: ids.map(lab).join('・') });
        }
      }
    }
  }

  // ── 組み立て：読んだ並びを土台に（★ type[] は作り直す・set_up_limit は読んだ時点で無い）──
  const pairs: Array<[string, string]> = [];
  const used = new Set<string>();
  let typeDone = false;
  for (const f of form.fields) {
    if (f.name === 'type[]') {
      if (!typeDone) { typeDone = true; for (const id of sendTypes) pairs.push(['type[]', id]); }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(ov, f.name)) {
      if (!used.has(f.name)) { pairs.push([f.name, ov[f.name]]); used.add(f.name); }
      continue;
    }
    pairs.push([f.name, f.value]);
  }
  if (!typeDone) for (const id of sendTypes) pairs.push(['type[]', id]);
  for (const k of Object.keys(ov)) if (!used.has(k)) pairs.push([k, ov[k]]);
  if (form.submits.length === 1) pairs.push([form.submits[0].name, form.submits[0].value]);
  return { pairs, changes, skipped };
}

function formEncode(s: string): string {
  return encodeURIComponent(String(s ?? '')).replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+');
}

/**
 * ★★★ 保存の本文を作る（★ 止める条件は写真の保存と同じ考え方）。
 *   ・変わる欄が無い ／ ctk が無い ／ cast_id が 0 か相手と違う ／ set_up_limit が混じる ／ 送信ボタンが2つ以上 ／ 特徴が0個
 */
export function buildEsutamaCastEditBody(form: EsutamaCastEditForm, castId: string, plan: EsutamaEditPlan): string {
  const id = String(castId ?? '').trim();
  if (!/^\d{1,12}$/.test(id)) throw new Error('castId の形が不正です');
  if (plan.changes.length === 0) throw new Error('変わる欄が無いので送らない');
  if (!form.ctk) throw new Error('ctk が無いまま保存しない');
  const hidden = String(form.castIdHidden ?? '').trim();
  if (hidden === '0') throw new Error('追加フォーム（cast_id=0）を掴んでいます。★ 保存しません');
  if (hidden !== id) throw new Error('読んだフォームの cast_id（' + (hidden || '無し') + '）が相手（' + id + '）と違います。★ 保存しません');
  if (plan.pairs.some(([k]) => k === 'set_up_limit')) throw new Error('set_up_limit が混じっています。★ 送りません');
  if (form.submits.length > 1) throw new Error('送信ボタンが' + form.submits.length + '個あり、どれを押すか決められないので送らない');
  if (!plan.pairs.some(([k]) => k === 'type[]')) throw new Error('特徴（必須）が0個になるので送らない');
  return plan.pairs.map(([k, val]) => formEncode(k) + '=' + formEncode(val)).join('&');
}

/** ★★★ 読み直して、変えたはずの欄が変わったかを数える（★ 成否はここで決める） */
export function verifyEsutamaCastEdit(after: EsutamaCastEditForm, plan: EsutamaEditPlan): { ok: number; ng: string[]; hints: string[] } {
  const sent = new Map<string, string>();
  for (const [k, val] of plan.pairs) if (k !== 'type[]' && !sent.has(k)) sent.set(k, val);
  let ok = 0;
  const ng: string[] = [];
  const hints: string[] = [];
  for (const c of plan.changes) {
    if (c.field === 'type[]') {
      const want = plan.pairs.filter(([k]) => k === 'type[]').map(([, x]) => x).sort().join(',');
      const got = checkedTypes(after).sort().join(',');
      if (want === got) ok++; else ng.push(c.label);
      continue;
    }
    const want = sent.get(c.field) ?? '';
    const got = firstValue(after, c.field);
    if (sameText(got, want)) ok++;
    else { ng.push(c.label); hints.push(c.label + '：' + diffHint(want, got)); }
  }
  return { ok, ng, hints };
}
