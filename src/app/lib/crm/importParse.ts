// フクエスCRM：顧客の取り込み（第566便・2026-09-20）。スマホの連絡先（.vcf）と CSV から「名前・電話番号」を読む。
// ★ ブラウザの中で読む（ファイルそのものはサーバーへ送らない。送るのは名前と番号だけ）。
// ★ 風俗CTIv2 の画面からの貼り付けは作らない（カッキーさん 2026-09-20・移行作業の代行を頼まれないように）。

export type ImportRow = { name: string; phones: string[] };

/** 電話番号を数字だけに（+81 → 0・全角 → 半角・ハイフン/空白/括弧を除く） */
export function importPhone(raw: string): string {
  let s = String(raw ?? '')
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[＋]/g, '+')
    .replace(/[\s　\-‐‑‒–—―−ー－ｰ()（）.]/g, '');
  if (s.startsWith('+81')) s = '0' + s.slice(3).replace(/^0/, '');
  else if (s.startsWith('81') && s.length >= 11 && s.length <= 12) s = '0' + s.slice(2);
  return s.replace(/[^0-9]/g, '');
}

/** ファイルの中身を文字に（UTF-8 で読めなければ Shift_JIS＝Excel の CSV） */
export function decodeText(buf: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buf);
  if (!utf8.includes('�')) return utf8.replace(/^﻿/, '');
  try { return new TextDecoder('shift_jis').decode(buf); } catch { return utf8; }
}

function decodeQuotedPrintable(s: string): string {
  const bytes: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; }
    else bytes.push(s.charCodeAt(i) & 0xff);
  }
  try { return new TextDecoder('utf-8').decode(new Uint8Array(bytes)); } catch { return s; }
}

function unescapeVcard(v: string): string {
  return v.replace(/\\n/gi, ' ').replace(/\\([,;\\])/g, '$1').trim();
}

/** vCard（.vcf）を読む。FN（なければ N）と TEL（複数）だけ使う */
export function parseVcf(text: string): ImportRow[] {
  // 行の折り返し（次の行が空白で始まる）と quoted-printable のソフト改行（行末 =）をつなぐ
  const raw = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines: string[] = [];
  for (const line of raw.split('\n')) {
    const prev = lines[lines.length - 1];
    if (prev !== undefined && /QUOTED-PRINTABLE/i.test(prev) && prev.endsWith('=')) { lines[lines.length - 1] = prev.slice(0, -1) + line; continue; }
    if (prev !== undefined && (line.startsWith(' ') || line.startsWith('\t'))) { lines[lines.length - 1] = prev + line.slice(1); continue; }
    lines.push(line);
  }
  const out: ImportRow[] = [];
  let cur: { fn: string; n: string; tels: string[] } | null = null;
  for (const line of lines) {
    const up = line.toUpperCase();
    if (up.startsWith('BEGIN:VCARD')) { cur = { fn: '', n: '', tels: [] }; continue; }
    if (up.startsWith('END:VCARD')) {
      if (cur) {
        const name = cur.fn || cur.n;
        out.push({ name, phones: cur.tels });
      }
      cur = null;
      continue;
    }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const head = line.slice(0, idx);
    let val = line.slice(idx + 1);
    const key = head.split(';')[0].split('.').pop()!.toUpperCase();
    if (/ENCODING=QUOTED-PRINTABLE/i.test(head)) val = decodeQuotedPrintable(val);
    if (key === 'FN') cur.fn = unescapeVcard(val);
    else if (key === 'N') {
      const [family = '', given = ''] = val.split(';');
      cur.n = unescapeVcard(`${family} ${given}`).replace(/\s+/g, ' ').trim();
    } else if (key === 'TEL') {
      const p = importPhone(val.replace(/^tel:/i, ''));
      if (p) cur.tels.push(p);
    }
  }
  return out;
}

/** CSV を1行ずつ（ダブルクォート対応） */
function splitCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let f = '';
  let q = false;
  const t = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) {
      if (c === '"' && t[i + 1] === '"') { f += '"'; i++; }
      else if (c === '"') q = false;
      else f += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t') { row.push(f); f = ''; }
    else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
    else f += c;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows.filter((r) => r.some((v) => v.trim()));
}

/**
 * CSV を読む。1行目に「名前」「電話」などの見出しがあればその列を使う。
 * 見出しが無ければ、電話番号らしい列を電話、それ以外の最初の列を名前にする。
 */
export function parseCsv(text: string): ImportRow[] {
  const rows = splitCsv(text);
  if (rows.length === 0) return [];
  const head = rows[0].map((h) => h.trim().toLowerCase());
  const isName = (h: string) => /名前|氏名|お名前|顧客名|name|表示名/.test(h) && !/フリガナ|ふりがな|kana|よみ/.test(h);
  const isPhone = (h: string) => /電話|tel|phone|携帯|番号/.test(h);
  const nameCol = head.findIndex(isName);
  const phoneCols = head.map((h, i) => (isPhone(h) ? i : -1)).filter((i) => i >= 0);
  if (nameCol >= 0 || phoneCols.length > 0) {
    return rows.slice(1).map((r) => ({
      name: nameCol >= 0 ? String(r[nameCol] ?? '').trim() : '',
      phones: phoneCols.map((i) => importPhone(r[i] ?? '')).filter(Boolean),
    }));
  }
  return rows.map((r) => {
    const phones: string[] = [];
    let name = '';
    for (const v of r) {
      const p = importPhone(v);
      if (/^\d{10,13}$/.test(p) && /[0-9]/.test(v) && !/[^\d\s\-‐‑‒–—―−ー－ｰ()（）+＋０-９.]/.test(v)) phones.push(p);
      else if (!name && v.trim()) name = v.trim();
    }
    return { name, phones };
  });
}
