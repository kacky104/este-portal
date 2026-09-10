// ───────── ★★★ エステ魂にセラピストの写真を送る（第240便・2026-09-10）─────────
//
// ★★★★★ この便で作るのは **読む部品と組み立てる部品だけ**。★ **1枚も送らない。**
//   ★ 流れに繋ぐのは第241便。★ 登録（第231便→第232便）とまったく同じ刻み方。
//
// ★★★★ 実物で確かめた形（2026-09-10 10:19〜10:44・設計メモ §25）
//
//   【2段構え】
//     ① 仮置きへ上げる（JavaScript が XHR で送っている）
//        POST https://estama.jp/file_upload/therapist_tmp/cast_icon_<枠>/
//        multipart/form-data … file / dir / ctk / id / page_type
//        → 応答は HTML の断片。その中の hidden に **/temp/<ファイル名>** が入っている
//     ② セラピスト編集フォームを保存する
//        その hidden（`cast_icon_<枠>-imgupload`）を一緒に送ると、写真が本紐づけされる
//     ★★★ **①だけでは付かない。②まで行って初めて写真になる。**
//
//   【応答の実物】
//     <div class="tmp_photo_block">
//       <input type="hidden" name="cast_icon_1-imgupload" value="/temp/file_7ny79_20260910101958.jpg">
//       <img class="tmp_img" src="/temp/file_7ny79_20260910101958.jpg" width="357">
//       …
//     </div>
//
// ★★★★★ 送り先は【画面の `data-post_url` 属性】。★ **決め打ちにしない。**
//   ★ 2026-09-10 未明の駅ちかの削除（`&gl=` 付きの href）とまったく同じ作法。
//   ★★ 「そういう URL のはず」で組み立てると、相手が変えた日に黙って壊れる。
//
// ★★★ 送る欄は **5つだけ**（`canvas_fileupload.js` v1.0.3 の Handler 5 を読んだ）。
//   ★ `image_type` と `target` は **別の画面用の関数**のもの。★ ここでは送っていない。
//   ★ 教訓: 同じファイルに似た関数が6つ在った。★ 「それらしい関数」で決めない。
//
// ★ このファイルは通信も DB も触らない。★ 画像そのものも運ばない（★ 第106便・案B）。

import { resolveUrl, hostOf } from './htmlForm';
import { RELAY_USER_AGENT } from './relayUserAgent';
import { assertRelayFileUrl, type RelayMultipart } from './relayMultipart';

export const ESUTAMA_ORIGIN = 'https://estama.jp';
export const ESUTAMA_CAST_EDIT_URL = 'https://estama.jp/admin/cast_edit/';

/** ★ 写真の枠は6つ（2026-09-10 実測）。★ 画面から読んだ枠がこれを超えたら、こちらの思い込みを疑う */
export const ESUTAMA_PHOTO_SLOT_MAX = 6;

/**
 * ★★★★★ 相手が求める画像の形（`canvasDraw(file, 0, 0, 357, 556)` の実装を読んだ・§25-7）。
 *
 *   get_draw_size(org_w, org_h, 0, 0, 357, 556) は:
 *     dh = org_h × (357/org_w)                  // 幅を357に合わせたときの高さ
 *     if (dh < 556) 高さを556に合わせる else 幅を357に合わせる
 *   canvas は 357×556 固定、描画は **原点(0,0)から**。
 *
 * → ★★★ **「357×556 を覆うように（cover）縮小し、左上を基準に切り取る」。**
 *   ★ 引き伸ばし（歪み）ではない。★ 中央基準でもない。**左上基準**。
 *   ★ そのあと JPEG（品質1.0／2MB超なら品質を落とす）。
 *
 * ★★ この値は **画像を作る側（フクエスの取り出し口）が守る**。★ この部品は数を持つだけ。
 */
export const ESUTAMA_PHOTO_FIT = { width: 357, height: 556, position: 'left top' as const };

/** ★ multipart の項目名（実測）。★ 5つ。★ 増やさない */
export const ESUTAMA_PHOTO_FIELD_FILE = 'file';
export const ESUTAMA_PHOTO_PAGE_TYPE = 'admin';

export type EsutamaPhotoSlot = {
  /** 1〜6 */
  slot: number;
  /** ファイル入力の id（実測 `cast_icon_<枠>`）。★ multipart の `id` に入る */
  id: string;
  /** ファイル入力の data-input（実測 `cast_icon_<枠>`）。★ multipart の `dir` に入る */
  dir: string;
  /** data-post_url を絶対に直したもの（実測 `https://estama.jp/file_upload/therapist_tmp/cast_icon_<枠>/`） */
  postUrl: string;
};

export type EsutamaPhotoPage = {
  slots: EsutamaPhotoSlot[];
  /** ★ 読めたが信用できない理由。★ 空でなければ**使わせない** */
  warnings: string[];
};

/** タグ1つの属性を読む。★ 並びに依存しない。値の無い属性は '' */
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([A-Za-z_:][-A-Za-z0-9_:.]*)(?:\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  const body = tag.replace(/^<\s*[A-Za-z0-9]+/, '');
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const name = m[1].toLowerCase();
    if (name === '/') continue;
    out[name] = (m[3] ?? m[4] ?? m[5] ?? '').replace(/&amp;/g, '&');
  }
  return out;
}

/**
 * ★★★ セラピスト編集ページから【写真の枠】を読む。
 *
 * ★★ 目印は **`id="cast_icon_<数字>"` と `data-post_url` を持つ input**。
 *   ★ クラス名は**当てにしない**（★ 2026-09-10、私が読んだ JS のクラスはこの画面に無かった。
 *     `.upload_photo_input_admin_therapist` は 0 個、実際は別のハンドラだった）。
 *   ★★★ §11-2 の教訓: **タグ名やクラスを当てにしない。実測で確かめた目印だけを使う。**
 *
 * @param pageUrl この HTML を取ってきた URL（★ data-post_url を絶対に直す土台）
 */
export function parseEsutamaPhotoSlots(html: string, pageUrl: string = ESUTAMA_CAST_EDIT_URL): EsutamaPhotoPage {
  const src = typeof html === 'string' ? html : '';
  const slots: EsutamaPhotoSlot[] = [];
  const warnings: string[] = [];
  if (!src) return { slots, warnings: ['本文が空'] };

  const seen = new Set<number>();
  const re = /<input\b[^>]*>/gi;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const a = attrsOf(m[0]);
    const id = String(a.id ?? '');
    const hit = /^cast_icon_(\d+)$/.exec(id);
    if (!hit) continue;
    const rawPost = String(a['data-post_url'] ?? '').trim();
    if (!rawPost) {
      warnings.push(id + ' に data-post_url が無い');
      continue;
    }
    const slot = Number(hit[1]);
    if (!Number.isInteger(slot) || slot < 1 || slot > ESUTAMA_PHOTO_SLOT_MAX) {
      warnings.push('見たことのない枠番号: ' + id);
      continue;
    }
    if (seen.has(slot)) {
      warnings.push('枠 ' + slot + ' が2回出てくる');
      continue;
    }
    const postUrl = resolveUrl(pageUrl, rawPost);
    const host = hostOf(postUrl);
    // ★★★★ 送り先がエステ魂でなければ**使わない**。★ 店舗様の Cookie を他所へ飛ばさない
    if (host !== 'estama.jp' && host !== 'www.estama.jp') {
      warnings.push('枠 ' + slot + ' の送り先がエステ魂ではない（' + String(host) + '）');
      continue;
    }
    // ★★ 枠番号と送り先の番号が食い違っていたら使わない（★ 別の枠へ送らない）
    if (!new RegExp('/cast_icon_' + slot + '/?$').test(postUrl.replace(/\?.*$/, ''))) {
      warnings.push('枠 ' + slot + ' の送り先が枠の番号と食い違う: ' + postUrl.slice(0, 80));
      continue;
    }
    seen.add(slot);
    slots.push({ slot, id, dir: String(a['data-input'] ?? id), postUrl });
  }

  if (slots.length === 0 && warnings.length === 0) {
    warnings.push('写真の枠（id="cast_icon_N"）が1つも見つからない。取得失敗か画面の作りが変わった疑い');
  }
  slots.sort((x, y) => x.slot - y.slot);
  return { slots, warnings };
}

export type EsutamaPhotoUpload = {
  method: 'POST';
  url: string;
  headers: Record<string, string>;
  multipart: RelayMultipart;
  /** ★ 記録のため。★ 何をどこへ送ったかが後から読めるように（第236便の作法） */
  meta: { slot: number; id: string; dir: string; filename: string; contentType: string };
};

/**
 * ★★★ 仮置きへ上げる POST を組み立てる（①）。★ **相手に画像が1枚増える**（ただし仮置き）。
 *
 * ★ 画像そのものはここを通さない（第106便・案B）。★ VPS がフクエスの口から取りに行く。
 *
 * ★★★ 止める条件（★ 迷ったら送らない）:
 *   ・Cookie が無い ／ 使い捨てトークンが無い
 *   ・その枠が画面に無い（★ 枠番号から URL を組み立てない）
 *   ・画像の取り先がフクエスの口ではない（`assertRelayFileUrl` が見る）
 *   ・ファイル名や種類が相手の決まりから外れている
 */
export function buildEsutamaPhotoUploadRequest(
  cookie: string,
  page: EsutamaPhotoPage,
  v: { slot: number; ctk: string; fileUrl: string; filename: string; contentType: string },
): EsutamaPhotoUpload {
  if (!cookie) throw new Error('Cookie が無いまま写真を送らない');
  if (page.warnings.length > 0) {
    throw new Error('写真の枠を読み切れていないので送りません（' + page.warnings[0] + '）');
  }
  const ctk = String(v.ctk ?? '').trim();
  if (!ctk) throw new Error('使い捨てトークン（ctk）が無いまま写真を送らない');

  const target = page.slots.find((s) => s.slot === v.slot);
  if (!target) {
    throw new Error('枠 ' + String(v.slot) + ' が画面にありません。★ 枠の番号から送り先を組み立てません');
  }

  // ★★★ 取り先はフクエスの口だけ（★ VPS を「何でも取りに行く道具」にしない）
  assertRelayFileUrl(v.fileUrl);

  const contentType = String(v.contentType ?? '');
  if (contentType !== 'image/jpeg') {
    // ★★ 相手は canvas で JPEG にしてから送っている（§25-7）。★ こちらも JPEG にそろえる
    throw new Error('エステ魂へ送る写真は JPEG にしてから渡してください（' + contentType + '）');
  }
  const filename = String(v.filename ?? '');
  if (!/^[A-Za-z0-9_\-]{1,64}\.(jpg|jpeg)$/.test(filename)) {
    throw new Error('ファイル名の形が不正です（' + filename.slice(0, 40) + '）');
  }

  const multipart: RelayMultipart = {
    // ★★★ 実測の5つ。★ 増やさない・減らさない
    fields: {
      dir: target.dir,
      ctk,
      id: target.id,
      page_type: ESUTAMA_PHOTO_PAGE_TYPE,
    },
    files: [{ field: ESUTAMA_PHOTO_FIELD_FILE, url: v.fileUrl, filename, contentType }],
  };

  return {
    method: 'POST',
    url: target.postUrl,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      // ★ jQuery の ajax（dataType:'text'）と同じ見た目（実測）
      accept: 'text/plain, */*; q=0.01',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      'x-requested-with': 'XMLHttpRequest',
      referer: ESUTAMA_CAST_EDIT_URL,
      origin: ESUTAMA_ORIGIN,
      cookie,
      // ★★ content-type は付けない。★ multipart の境界は中継役（curl）が決める
    },
    multipart,
    meta: { slot: target.slot, id: target.id, dir: target.dir, filename, contentType },
  };
}

export type EsutamaTmpPhoto = {
  /** 保存フォームに足す欄の名前（実測 `cast_icon_<枠>-imgupload`） */
  field: string;
  /** その値（実測 `/temp/file_xxxxx_20260910101958.jpg`） */
  value: string;
  /** 枠番号（★ 欄名から取り出したもの。★ 送ったつもりの枠と突き合わせる） */
  slot: number;
};

/**
 * ★★★★ 仮置きの応答（HTML の断片）から、保存フォームに足す1組を取り出す。
 *
 * ★★ 実物（2026-09-10 10:19）:
 *   <input type="hidden" name="cast_icon_1-imgupload" value="/temp/file_7ny79_20260910101958.jpg">
 *
 * ★★★ 取れなければ **null**。★ 「たぶんこれ」で近いものを返さない。
 *   ★ 相手が失敗しているのに成功と読み違えるのが、いちばん危ない。
 */
export function readEsutamaTmpPhoto(html: string): EsutamaTmpPhoto | null {
  const src = typeof html === 'string' ? html : '';
  if (!src) return null;
  const re = /<input\b[^>]*>/gi;
  for (let m = re.exec(src); m !== null; m = re.exec(src)) {
    const a = attrsOf(m[0]);
    const name = String(a.name ?? '');
    const hit = /^cast_icon_(\d+)-imgupload$/.exec(name);
    if (!hit) continue;
    const value = String(a.value ?? '').trim();
    // ★★★ 値の形も確かめる。★ 空や見たことのない形を通さない
    if (!/^\/temp\/[A-Za-z0-9_\-]{1,80}\.(jpg|jpeg|png)$/i.test(value)) continue;
    const slot = Number(hit[1]);
    if (!Number.isInteger(slot) || slot < 1 || slot > ESUTAMA_PHOTO_SLOT_MAX) continue;
    return { field: name, value, slot };
  }
  return null;
}

/**
 * ★★★ 応答が「失敗」に見えるかを1行で残す（★ 記録のためだけ・判定には使わない）。
 *   ★ 設計メモ §2-6 / §17-7「**書き込みのあとは必ず画面のメッセージを読む**」。
 *   ★★ 2026-09-09 に、これをやらずに実弾を3回むだにした。
 */
export function describeEsutamaPhotoResponse(status: number, html: string): string {
  const src = typeof html === 'string' ? html : '';
  const got = readEsutamaTmpPhoto(src);
  const looksLogin = /name\s*=\s*["']?(?:login_id|password|shop_id)/i.test(src);
  return 'HTTP ' + status
    + ' ／ 仮置きの hidden ' + (got ? 'あり（' + got.field + '）' : '**なし**')
    + (looksLogin ? ' ／ ★ ログイン画面らしい' : '')
    + ' ／ 本文 ' + src.length + '字';
}
