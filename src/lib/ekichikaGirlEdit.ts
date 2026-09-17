// ───────── ★★★ 駅ちかの女の子プロフィールを更新する（第415便・2026-09-17）─────────
//
// ★★ 何のため … コネックエフ「コメント／各サイト項目／Q&A」（第414便）で入れた内容を、
//   登録済みの女の子の編集ページ `/admin/girls/edit/<castId>` へ送る。
//
// ★★★ 実物で確かめた形（2026-09-17・ラビリンス様の管理画面を見るだけ・設計メモ §4）:
//   フォーム1枚・129部品・action は同じ URL・`fuel_csrf_token`・送信ボタン `update-btn`
//   欄: name / cup / catchcopy / age / tall / bust / waist / hip / bloodtype / constellation /
//       girl_comments / title / comments / questions[1..10] / answers[1..10] / options /
//       p_genre[<id>]（3まで） / genre[<id>]（19まで・候補61） / rookie_flg（radio 1/2）
//   ★ ジャンルの番号（id）とラベルの対応は実物の画面で控えた（下の EKICHIKA_GENRE_ID）
//
// ★★★ 決めごと（★ 迷ったら送らない／触らない）
//   ① 編集ページを**毎回読み**、読んだ値を土台にする。★ こちらが持っている欄だけ差し替える
//   ② コネックエフで**空の欄は、駅ちかの今の値のまま**（★ 消さない）
//   ③ 文字数が駅ちかの上限を超える欄は**その欄だけ送らない**（★ 切り詰めない・理由を残す）
//   ④ ジャンル・優先タグは、コネックエフで1つ以上選んでいるときだけ**丸ごと差し替え**。★ 0個なら今のまま
//   ⑤ Q&A は、コネックエフに1問でもあるときだけ**10問まとめて差し替え**（★ ベンリーと同じ）
//   ⑥ 名前は送らない（★ 名簿の結び付けがずれるため・今の値のまま）
//   ⑦ ジャンルは `genre2[<id>]` も同じ並びで送る（★ JS が足している・第237便の教訓）
//   ⑧ 送り先のホストが ranking-deli.jp でなければ送らない
//
// ★ このファイルは通信も DB も触らない。

import { hostOf, optionValueByLabel } from './htmlForm';
import { parseEkichikaGirlForm, type EkichikaGirlFormParse, type RelayRequest } from './ekichikaGirlCreate';
import { RELAY_USER_AGENT } from './relayUserAgent';

export const EKICHIKA_GIRL_EDIT_URL_PREFIX = 'https://ranking-deli.jp/admin/girls/edit/';
export const ekichikaGirlEditUrl = (castId: string) => EKICHIKA_GIRL_EDIT_URL_PREFIX + encodeURIComponent(castId);

/** ★ ジャンルのラベル → 駅ちかの番号（2026-09-17 実物・メンズエステの画面） */
export const EKICHIKA_GENRE_ID: Readonly<Record<string, string>> = {
  'no1': '1', 'no2': '2', 'no3': '3', 'プレミア': '4', '店長オススメ': '5', '素人': '38', '未経験': '40', '禁煙': '46', '要予約': '51',
  '顔出し': '59', 'エステ経験者': '77', 'エステ未経験': '78', '資格あり': '80', 'インテリ': '84', 'ツンデレ': '85', '話し上手': '86',
  '聞き上手': '87', 'リピート高確率': '89', '好感度抜群': '90', '礼儀正しい': '92', '好奇心旺盛': '93',
  'アイドル系': '7', 'お姉さん系': '8', 'お嬢様': '9', '可愛い系': '10', 'ロリ系': '11', 'ギャル系': '14', 'キレカワ': '15', '美少女系': '21', '綺麗系': '23', 'ハーフ': '56',
  'グラマー': '16', 'スレンダー': '17', 'ぽっちゃり': '19', 'ミニマム': '27', '美肌': '33', '美脚': '34', '色白': '36', 'スタイル抜群': '42', 'モデル系': '45', '高身長': '58', '低身長': '65', 'ﾀﾄｩｰ・刺青': '67',
  'OL系': '6', '女子大生': '12', 'キャバ系': '13', 'セクシー系': '18', '癒し系': '22', '清楚': '49', '萌え系': '50', 'おっとり': '52', '天然': '54', '真面目': '88',
  'テクニシャン': '25', 'サービス抜群': '41', '愛嬌抜群': '43', 'マッサージが得意': '79', '極液施術可能': '81', 'バリエーション豊富': '82', '出張サービス可能': '83', '丁寧な施術': '91',
};

/** ★ 駅ちかの上限（画面の注記・実物）。★ maxlength が画面にあればそちらを優先する */
export const EKICHIKA_EDIT_LIMITS = { catchcopy: 15, girl_comments: 200, title: 80, comments: 2000, qa: 50, options: 145 } as const;
export const EKICHIKA_EDIT_GENRE_MAX = 19;
export const EKICHIKA_EDIT_P_GENRE_MAX = 3;

export type EkichikaGirlEditValues = {
  age?: string | null; tall?: string | null; bust?: string | null; waist?: string | null; hip?: string | null;
  /** ★ 1文字（A〜Z）。★ 番号は読んだ選択肢からラベルで引く */
  cup?: string | null;
  /** 'A' | 'B' | 'O' | 'AB' */
  bloodtype?: string | null;
  /** 'おひつじ'…'うお' */
  constellation?: string | null;
  catchcopy?: string | null;
  girlComments?: string | null;
  title?: string | null;
  comments?: string | null;
  qa?: Array<{ q: string; a: string }> | null;
  options?: string | null;
  /** ★ ラベル（EKICHIKA_GENRE_ID のキー）。★ 並び順どおりに送る */
  genres?: string[] | null;
  pGenres?: string[] | null;
  /** '' ＝触らない ／ '1' 新人 ／ '2' 体験入店＋新人 */
  rookie?: string | null;
};

export type EditChange = { field: string; label: string; before: string; after: string };
export type EditPlan = {
  /** 送る組（★ 送信ボタン込み） */
  pairs: Array<[string, string]>;
  /** 変わる欄（★ 画面・記録に出す） */
  changes: EditChange[];
  /** 送らなかった欄と理由 */
  skipped: string[];
  csrfToken: string | null;
  action: string | null;
};

const len = (s: string) => [...s].length;

/**
 * ★★★ 比べるときの形をそろえる（第416便・2026-09-17 の実弾で踏んだ）。
 *   ★ お店コメント（textarea）が、送ったのに「変わっていない」と3回出た。
 *   ★ 駅ちかは改行を \r\n で持ち、数値の実体参照（&#12316; など）で返すことがある。★ 中身は同じでも文字列は違う。
 *   → 改行・数値参照・行末の空白・前後の空白をそろえてから比べる。★ 送る値そのものは変えない。
 */
export function sameText(a: string, b: string): boolean {
  return normText(a) === normText(b);
}
export function normText(v: string): string {
  return String(v ?? '')
    .replace(/&hellip;/g, '…').replace(/&amp;/g, '&')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t　]+\n/g, '\n')
    .replace(/ /g, ' ')
    .trim();
}
/** ★ 食い違いの手がかり（記録用）：長さと最初に違う位置 */
export function diffHint(sent: string, got: string): string {
  const a = normText(sent), b = normText(got);
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  const cp = (x: string) => (x ? 'U+' + x.codePointAt(0)!.toString(16).toUpperCase() : 'なし');
  return '送った' + a.length + '字/読んだ' + b.length + '字・' + i + '字目から違う（送った ' + cp(a.slice(i, i + 1)) + ' / 読んだ ' + cp(b.slice(i, i + 1)) + '）';
}
const firstValue = (form: EkichikaGirlFormParse, name: string): string => form.fields.find((f) => f.name === name)?.value ?? '';
const labelOfValue = (form: EkichikaGirlFormParse, name: string, value: string): string =>
  form.selectOptions[name]?.find((o) => o.value === value)?.label ?? value;

/** 読んだフォームで今チェックが入っているジャンル番号（並び順） */
function checkedIds(form: EkichikaGirlFormParse, prefix: 'genre' | 'p_genre' | 'genre2'): string[] {
  const re = new RegExp('^' + prefix + '\\[(\\d+)\\]$');
  const out: string[] = [];
  for (const f of form.fields) {
    const m = re.exec(f.name);
    if (m && !out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

const idToLabel = (id: string) => Object.keys(EKICHIKA_GENRE_ID).find((k) => EKICHIKA_GENRE_ID[k] === id) ?? '#' + id;

export function planEkichikaGirlEdit(form: EkichikaGirlFormParse, v: EkichikaGirlEditValues): EditPlan {
  const skipped: string[] = [];
  const changes: EditChange[] = [];
  const ov: Record<string, string> = {};

  const limitOf = (name: string, fallback: number) => {
    const m = form.maxLengths[name];
    return typeof m === 'number' && m > 0 ? m : fallback;
  };
  const setText = (name: string, label: string, raw: string | null | undefined, max: number) => {
    const val = String(raw ?? '').replace(/\r\n/g, '\n').trim();
    if (!val) return; // ② 空は今のまま
    if (!form.names.includes(name)) { skipped.push(label + '（駅ちかの画面に欄が無い）'); return; }
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
    const before = firstValue(form, name);
    if (before === val) return;
    ov[name] = val;
    changes.push({ field: name, label, before, after: val });
  };
  const setSelect = (name: string, label: string, wantLabel: string | null) => {
    if (!wantLabel) return;
    const found = optionValueByLabel(form.selectOptions[name], wantLabel);
    if (found === null) { skipped.push(label + '（駅ちかの選択肢に「' + wantLabel + '」が無い）'); return; }
    const before = firstValue(form, name);
    if (before === found) return;
    ov[name] = found;
    changes.push({ field: name, label, before: labelOfValue(form, name, before), after: wantLabel });
  };

  setNum('age', '年齢', v.age, 2);
  setNum('tall', '身長', v.tall, 3);
  setNum('bust', 'バスト', v.bust, 3);
  setNum('waist', 'ウエスト', v.waist, 3);
  setNum('hip', 'ヒップ', v.hip, 3);
  const cup = String(v.cup ?? '').trim().toUpperCase();
  setSelect('cup', 'カップ', /^[A-Z]$/.test(cup) ? cup + 'カップ' : null);
  const blood = String(v.bloodtype ?? '').trim().toUpperCase();
  setSelect('bloodtype', '血液型', ['A', 'B', 'O', 'AB'].includes(blood) ? blood : null);
  setSelect('constellation', '星座', String(v.constellation ?? '').trim() || null);

  setText('catchcopy', 'キャッチコピー', v.catchcopy, EKICHIKA_EDIT_LIMITS.catchcopy);
  setText('girl_comments', '女の子からのメッセージ', v.girlComments, EKICHIKA_EDIT_LIMITS.girl_comments);
  setText('title', 'お店からのメッセージ（タイトル）', v.title, EKICHIKA_EDIT_LIMITS.title);
  setText('comments', 'お店からのメッセージ（本文）', v.comments, EKICHIKA_EDIT_LIMITS.comments);
  setText('options', '可能オプション', v.options, EKICHIKA_EDIT_LIMITS.options);

  // ⑤ Q&A：1問でもあれば 10問まとめて
  const qa = (v.qa ?? []).filter((x) => x && (String(x.q ?? '').trim() || String(x.a ?? '').trim())).length > 0 ? (v.qa ?? []) : [];
  if (qa.length > 0) {
    let bad = false;
    const next: Record<string, string> = {};
    for (let i = 1; i <= 10; i++) {
      const q = String(qa[i - 1]?.q ?? '').trim();
      const a = String(qa[i - 1]?.a ?? '').trim();
      if (len(q) > EKICHIKA_EDIT_LIMITS.qa || len(a) > EKICHIKA_EDIT_LIMITS.qa) { bad = true; break; }
      next['questions[' + i + ']'] = q;
      next['answers[' + i + ']'] = a;
    }
    if (bad) skipped.push('女の子へ質問（' + EKICHIKA_EDIT_LIMITS.qa + '文字を超える問いがある）');
    else if (!form.names.includes('questions[1]')) skipped.push('女の子へ質問（駅ちかの画面に欄が無い）');
    else {
      let changed = 0;
      for (const [k, val] of Object.entries(next)) {
        if (!sameText(firstValue(form, k), val)) changed++;
        ov[k] = val;
      }
      if (changed > 0) changes.push({ field: 'questions', label: '女の子へ質問', before: '', after: qa.filter((x) => x.q || x.a).length + '問（' + changed + '欄が変わる）' });
    }
  }

  // ④ ジャンル・優先タグ
  const toIds = (labels: string[] | null | undefined, max: number, what: string): string[] | null => {
    const ls = (labels ?? []).filter((x) => typeof x === 'string' && x);
    if (ls.length === 0) return null;
    const ids: string[] = [];
    for (const l of ls) {
      const id = EKICHIKA_GENRE_ID[l];
      if (!id) { skipped.push(what + '「' + l + '」（駅ちかの番号が分からない）'); continue; }
      if (!ids.includes(id)) ids.push(id);
    }
    if (ids.length > max) { skipped.push(what + '（' + max + 'つを超えている）'); return null; }
    return ids.length > 0 ? ids : null;
  };
  const genreIds = toIds(v.genres, EKICHIKA_EDIT_GENRE_MAX, 'ジャンル');
  const currentGenres = checkedIds(form, 'genre');
  let sendGenres = currentGenres;
  if (genreIds) {
    const unknown = genreIds.filter((id) => !form.genreIds.includes(id));
    if (unknown.length > 0) skipped.push('ジャンル（駅ちかの画面に無い番号 ' + unknown.join(',') + '）');
    else {
      sendGenres = genreIds;
      if (genreIds.join(',') !== currentGenres.join(',')) {
        changes.push({ field: 'genre', label: 'ジャンル', before: currentGenres.map(idToLabel).join('・'), after: genreIds.map(idToLabel).join('・') });
      }
    }
  }
  const pAll = form.names.filter((n) => /^p_genre\[\d+\]$/.test(n)).map((n) => /\d+/.exec(n)![0]);
  const pIds = toIds(v.pGenres, EKICHIKA_EDIT_P_GENRE_MAX, '優先タグ');
  const currentP = checkedIds(form, 'p_genre');
  let sendP = currentP;
  if (pIds) {
    const unknown = pIds.filter((id) => !pAll.includes(id));
    if (unknown.length > 0) skipped.push('優先タグ（駅ちかの画面に無い番号 ' + unknown.join(',') + '）');
    else {
      sendP = pIds;
      if (pIds.join(',') !== currentP.join(',')) {
        changes.push({ field: 'p_genre', label: '優先タグ', before: currentP.map(idToLabel).join('・'), after: pIds.map(idToLabel).join('・') });
      }
    }
  }

  // 新人・体験入店
  const rookie = String(v.rookie ?? '');
  const currentRookie = firstValue(form, 'rookie_flg');
  let sendRookie = currentRookie;
  if (rookie === '1' || rookie === '2') {
    if (!form.names.includes('rookie_flg')) skipped.push('新人・体験入店（駅ちかの画面に欄が無い）');
    else if (rookie !== currentRookie) {
      sendRookie = rookie;
      changes.push({ field: 'rookie_flg', label: '新人・体験入店', before: currentRookie === '1' ? '新人' : currentRookie === '2' ? '体験入店＋新人' : 'なし', after: rookie === '1' ? '新人' : '体験入店＋新人' });
    }
  }

  // ── 組み立て：読んだ並びを土台に、差し替え・ジャンル類は作り直す ──
  const pairs: Array<[string, string]> = [];
  const used = new Set<string>();
  for (const f of form.fields) {
    if (/^(genre|genre2|p_genre)\[\d+\]$/.test(f.name) || f.name === 'rookie_flg') continue;
    if (Object.prototype.hasOwnProperty.call(ov, f.name)) { if (!used.has(f.name)) { pairs.push([f.name, ov[f.name]]); used.add(f.name); } continue; }
    pairs.push([f.name, f.value]);
  }
  for (const k of Object.keys(ov)) if (!used.has(k)) pairs.push([k, ov[k]]);
  for (const id of sendP) pairs.push(['p_genre[' + id + ']', '1']);
  for (const id of sendGenres) pairs.push(['genre2[' + id + ']', '1']);
  for (const id of sendGenres) pairs.push(['genre[' + id + ']', '1']);
  if (sendRookie === '1' || sendRookie === '2') pairs.push(['rookie_flg', sendRookie]);
  if (form.submits.length === 1) pairs.push([form.submits[0].name, form.submits[0].value]);

  return { pairs, changes, skipped, csrfToken: form.csrfToken, action: form.action };
}

function formEncode(sIn: string): string {
  return encodeURIComponent(String(sIn ?? ''))
    .replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, '+');
}

/** 編集ページを読む GET。★ 読むだけ */
export function buildEkichikaGirlEditFormRequest(cookie: string, castId: string): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま編集ページを読みに行かない');
  if (!/^\d{1,12}$/.test(castId)) throw new Error('駅ちかの番号が不正です（' + castId + '）');
  return {
    method: 'GET',
    url: ekichikaGirlEditUrl(castId),
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      referer: 'https://ranking-deli.jp/admin/girls/',
      cookie,
    },
  };
}

/**
 * ★★★ 更新の POST。★ 変わる欄が無ければ例外（＝送らない）
 */
export function buildEkichikaGirlEditRequest(cookie: string, castId: string, form: EkichikaGirlFormParse, plan: EditPlan): RelayRequest {
  if (!cookie) throw new Error('Cookie が無いまま更新しない');
  if (plan.changes.length === 0) throw new Error('変わる欄が無いので送らない');
  if (!plan.csrfToken) throw new Error('fuel_csrf_token が無いまま更新しない');
  if (form.submits.length > 1) throw new Error('送信ボタンが' + form.submits.length + '個あり、どれを押すか決められないので送らない');
  const url = form.action ?? ekichikaGirlEditUrl(castId);
  const host = hostOf(url);
  if (host !== 'ranking-deli.jp' && host !== 'www.ranking-deli.jp') throw new Error('編集フォームの送り先が駅ちかではありません（' + String(host) + '）');
  if (!url.includes('/admin/girls/edit/' + castId)) throw new Error('編集フォームの送り先が別の人です（' + url + '）');
  const body = plan.pairs.map(([k, val]) => formEncode(k) + '=' + formEncode(val)).join('&');
  return {
    method: 'POST',
    url,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded',
      referer: ekichikaGirlEditUrl(castId),
      origin: 'https://ranking-deli.jp',
      cookie,
    },
    body,
    meta: { sentTo: 'action', formAction: form.action, rookie: plan.pairs.some(([k]) => k === 'rookie_flg'), pairs: plan.pairs.length, body },
  };
}

/** 編集ページの HTML を読む（★ create と同じ読み手・土台 URL だけ違う） */
export function parseEkichikaGirlEditForm(html: string, castId: string): EkichikaGirlFormParse {
  return parseEkichikaGirlForm(html, ekichikaGirlEditUrl(castId));
}

/**
 * ★★★ 送ったあと、編集ページを読み直して**変えたはずの欄が変わったか**を数える。
 *   ★ 成否は応答ではなくここで決める（第46便 §35）。
 */
export function verifyEkichikaGirlEdit(after: EkichikaGirlFormParse, plan: EditPlan): { ok: number; ng: string[]; hints: string[] } {
  const sent = new Map<string, string>();
  for (const [k, v] of plan.pairs) if (!sent.has(k)) sent.set(k, v);
  let ok = 0;
  const ng: string[] = [];
  const hints: string[] = [];
  for (const c of plan.changes) {
    if (c.field === 'genre' || c.field === 'p_genre') {
      const prefix = c.field as 'genre' | 'p_genre';
      const want = plan.pairs.filter(([k]) => new RegExp('^' + prefix + '\\[\\d+\\]$').test(k)).map(([k]) => /\d+/.exec(k)![0]).sort().join(',');
      const got = checkedIds(after, prefix).sort().join(',');
      if (want === got) ok++; else ng.push(c.label);
      continue;
    }
    if (c.field === 'questions') {
      const allSame = [...sent.entries()].filter(([k]) => /^(questions|answers)\[\d+\]$/.test(k)).every(([k, v]) => sameText(firstValue(after, k), v));
      if (allSame) ok++; else ng.push(c.label);
      continue;
    }
    const want = sent.get(c.field) ?? '';
    const got = firstValue(after, c.field);
    if (sameText(got, want)) ok++;
    else { ng.push(c.label); hints.push(c.label + '：' + diffHint(want, got)); }
  }
  return { ok, ng, hints };
}
