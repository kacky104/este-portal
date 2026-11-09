// 全国エステランキングへセラピストを1人 登録する（第1865便・2026-11-10・カッキーさん・オイルクエスト様のご要望）。★ 純粋関数だけ。
//
// ★★★ 相手の画面（11/10 0:0x・読むだけで確かめた）:
//   新規追加 GET  /shop/image/girl/upload/detail/new/
//            POST /shop/image/girl/upload/detail/new/（urlencoded）
//              _method=POST・nickname（30文字・必須）・age・tall・bust・waist・hip（数字）・cup（''／A〜M・N~）・description（お店からのコメント）・
//              girl_social_accounts[1][user_name]・girl_social_accounts[2][user_name]・user_id（hidden）・file1〜file3（hidden）
//            ★「先にお名前等情報を登録し保存してください。保存後、画像アップロード項目が表示されます」
//            ★「必ず店舗様ホームページに登録されているお名前と同じお名前で登録してください」
//   写真    POST /shop/girl_image/change_file/<番号>/（multipart）_method=POST・file[1]〜file[3]（空いている枠だけ入力欄がある）
//   一覧    GET  /shop/image/girl/upload/all/（tr data-girl-id）
// ★ 送るのは名前・年齢・身長・スリーサイズ・カップだけ。コメント・SNS は空（あとで全国の画面で入れられる）。

import { RELAY_USER_AGENT } from './relayUserAgent';
import { ZENKOKU_ORIGIN, ZENKOKU_GIRLS_URL } from './zenkokuRequests';
import type { RelayMultipart } from './relayMultipart';

export const ZENKOKU_GIRL_NEW_URL = ZENKOKU_ORIGIN + '/shop/image/girl/upload/detail/new/';
export const zenkokuGirlDetailUrl = (gid: string) => ZENKOKU_ORIGIN + '/shop/image/girl/upload/detail/' + gid + '/';
export const zenkokuGirlPhotoPostUrl = (gid: string) => ZENKOKU_ORIGIN + '/shop/girl_image/change_file/' + gid + '/';
export const ZENKOKU_PHOTO_MAX = 3;
export const ZENKOKU_NAME_MAX = 30;

export type ZenkokuCreateValues = { nickname: string; age: string; tall: string; bust: string; waist: string; hip: string; cup: string };

export const normZenkokuName = (s: string) => String(s ?? '').normalize('NFKC').replace(/\s+/g, '');

function baseHeaders(cookie: string, referer: string): Record<string, string> {
  return { 'user-agent': RELAY_USER_AGENT, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'ja,en-US;q=0.9,en;q=0.8', referer, cookie };
}
const dec = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');

/** 新規追加のフォーム（nickname を持つフォーム）の hidden と、カップの選択肢 */
export function readZenkokuNewForm(html: string): { hidden: Array<[string, string]>; cups: string[] } | null {
  const s = String(html ?? '');
  const forms = s.match(/<form\b[\s\S]*?<\/form>/gi) ?? [];
  const f = forms.find((x) => /name=["']nickname["']/.test(x));
  if (!f) return null;
  const hidden: Array<[string, string]> = [];
  for (const m of f.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/type=["']?hidden/i.test(tag)) continue;
    const n = /name=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!n) continue;
    hidden.push([n, dec(/value=["']([^"']*)["']/i.exec(tag)?.[1] ?? '')]);
  }
  const cupSel = /<select\b[^>]*name=["']cup["'][^>]*>([\s\S]*?)<\/select>/i.exec(f)?.[1] ?? '';
  const cups = [...cupSel.matchAll(/<option\b[^>]*value=["']([^"']*)["']/gi)].map((m) => dec(m[1]));
  if (!hidden.some(([k]) => k === 'user_id')) return null;
  return { hidden, cups };
}

export function buildZenkokuNewFormGet(cookie: string) {
  if (!cookie) throw new Error('Cookie が無いまま読みに行かない');
  return { method: 'GET' as const, url: ZENKOKU_GIRL_NEW_URL, headers: baseHeaders(cookie, ZENKOKU_GIRLS_URL), body: '' as const };
}
export function buildZenkokuDetailGet(cookie: string, gid: string) {
  if (!/^\d{1,12}$/.test(gid)) throw new Error('番号の形が違います');
  return { method: 'GET' as const, url: zenkokuGirlDetailUrl(gid), headers: baseHeaders(cookie, ZENKOKU_GIRLS_URL), body: '' as const };
}

/** ★★ 保存（相手に人が1人増える）。★ 送るのは名前・年齢・サイズ・カップだけ */
export function buildZenkokuCreateSave(cookie: string, form: { hidden: Array<[string, string]>; cups: string[] }, v: ZenkokuCreateValues) {
  if (!cookie) throw new Error('Cookie が無いまま登録しない');
  const name = String(v.nickname ?? '').trim();
  if (!name) throw new Error('名前が空のまま登録しない');
  if ([...name].length > ZENKOKU_NAME_MAX) throw new Error('名前が30文字を超えています');
  const num = (x: string) => (/^\d{1,3}$/.test(String(x ?? '').trim()) ? String(x).trim() : '');
  const cup = form.cups.includes(v.cup) ? v.cup : '';
  const own = new Set(['nickname', 'age', 'tall', 'bust', 'waist', 'hip', 'cup', 'description', 'girl_social_accounts[1][user_name]', 'girl_social_accounts[2][user_name]']);
  const parts: Array<[string, string]> = [
    ...form.hidden.filter(([k]) => k === '_method'),
    ['nickname', name], ['age', num(v.age)], ['tall', num(v.tall)], ['bust', num(v.bust)], ['waist', num(v.waist)], ['hip', num(v.hip)], ['cup', cup],
    ['description', ''], ['girl_social_accounts[1][user_name]', ''], ['girl_social_accounts[2][user_name]', ''],
    ...form.hidden.filter(([k]) => k !== '_method' && !own.has(k)),
  ];
  return {
    method: 'POST' as const, url: ZENKOKU_GIRL_NEW_URL,
    // ★ expect を空に（第1861便と同じ・curl の Expect: 100-continue を付けない）
    headers: { ...baseHeaders(cookie, ZENKOKU_GIRL_NEW_URL), 'content-type': 'application/x-www-form-urlencoded', origin: ZENKOKU_ORIGIN, expect: '' },
    body: parts.map(([k, val]) => encodeURIComponent(k) + '=' + encodeURIComponent(val)).join('&'),
  };
}

/** 編集ページで、まだ写真の入っていない枠（file[n] の入力欄がある枠） */
export function zenkokuFreePhotoSlots(html: string): number[] {
  return [...new Set([...String(html ?? '').matchAll(/name=["']file\[(\d)\]["']/g)].map((m) => Number(m[1])))].sort((a, b) => a - b);
}

/** ★★ 写真を1枚（multipart）。★ 中身は VPS が fileUrl から取って送る */
export function buildZenkokuPhotoUpload(cookie: string, gid: string, index: number, fileUrl: string) {
  if (!cookie) throw new Error('Cookie が無いまま写真を送らない');
  if (!/^\d{1,12}$/.test(gid)) throw new Error('番号の形が違います');
  if (!Number.isInteger(index) || index < 1 || index > ZENKOKU_PHOTO_MAX) throw new Error('写真の枠は1〜3');
  const multipart: RelayMultipart = {
    fields: { _method: 'POST' },
    files: [{ field: 'file[' + index + ']', url: fileUrl, filename: 'photo' + index + '.jpg', contentType: 'image/jpeg' }],
  };
  return {
    method: 'POST' as const, url: zenkokuGirlPhotoPostUrl(gid),
    headers: { ...baseHeaders(cookie, zenkokuGirlDetailUrl(gid)), origin: ZENKOKU_ORIGIN, expect: '' },
    body: '', multipart,
  };
}
