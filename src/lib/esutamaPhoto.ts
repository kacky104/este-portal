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
  /**
   * ★★★★★ その枠の状態（2026-09-10 11:38・実測で見分け方が決まった）。
   *   'empty'   … 空き。★ `upload_area--complete` が付いていない・画像も無い
   *   'saved'   … **保存済み**。★ `upload_area--complete` ＋ `https://img.estama.jp/…/357x556/…`
   *   'pending' … **仮置き（未保存）**。★ さらに `cast_icon_<枠>-imgupload` の hidden が在る
   *
   * ★★★ これが要る理由: **店舗様の本物の写真を、こちらの都合で上書きしない**（駅ちか第107便と同じ決め）。
   *   ★ 送ってよいのは 'empty' だけ。★ 'saved' へ送るのは、人がはっきりそう言ったときだけ。
   */
  state: 'empty' | 'saved' | 'pending';
  /** いま表示されている画像の場所。★ 空きなら null */
  imgSrc: string | null;
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

  // ★★★ 枠ごとの区画に切る。★ `<div class="… upload_area …">` から次の同じ印までを1枠とみなす。
  //   ★ 実測（2026-09-10 11:38）: 1枠は
  //     <div class="upload_area l-edit_upload_area">
  //       <div class="upload_area__results upload_area--complete">   ← ★ 埋まっている印
  //         … <img class="tmp_img" src="…"> …
  //         （仮置きのときだけ）<input type="hidden" name="cast_icon_<枠>-imgupload" value="/temp/…">
  //       <label … for="cast_icon_<枠>">
  //       <input type="file" id="cast_icon_<枠>" data-input="…" data-post_url="…">
  //   ★★ 区画に `id="cast_icon_N"` が無ければ**この枠ではない**（★ 表紙画像など別の upload_area を拾わない）
  const heads: number[] = [];
  const areaRe = /<div\b[^>]*\bclass\s*=\s*"[^"]*\bupload_area\b[^"]*"[^>]*>/gi;
  for (let m = areaRe.exec(src); m !== null; m = areaRe.exec(src)) heads.push(m.index);

  const seen = new Set<number>();
  for (let h = 0; h < heads.length; h++) {
    const chunk = src.slice(heads[h], h + 1 < heads.length ? heads[h + 1] : src.length);
    const fileTag = /<input\b[^>]*\bid\s*=\s*"cast_icon_(\d+)"[^>]*>/i.exec(chunk);
    if (!fileTag) continue;                       // ★ 写真の枠ではない区画
    const a = attrsOf(fileTag[0]);
    const id = String(a.id ?? '');
    const slot = Number(fileTag[1]);
    if (!Number.isInteger(slot) || slot < 1 || slot > ESUTAMA_PHOTO_SLOT_MAX) {
      warnings.push('見たことのない枠番号: ' + id);
      continue;
    }
    if (seen.has(slot)) { warnings.push('枠 ' + slot + ' が2回出てくる'); continue; }

    const rawPost = String(a['data-post_url'] ?? '').trim();
    if (!rawPost) { warnings.push(id + ' に data-post_url が無い'); continue; }
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

    // ── 状態を見分ける（★ 実測どおり・推測しない）──
    const complete = /class\s*=\s*"[^"]*\bupload_area--complete\b[^"]*"/i.test(chunk);
    const imgTag = /<img\b[^>]*\bclass\s*=\s*"[^"]*\btmp_img\b[^"]*"[^>]*>/i.exec(chunk);
    const imgSrc = imgTag ? (attrsOf(imgTag[0]).src ?? '').trim() || null : null;
    const pendingRe = new RegExp('name\\s*=\\s*"cast_icon_' + slot + '-imgupload"', 'i');
    const pending = pendingRe.test(chunk);
    const state: 'empty' | 'saved' | 'pending' = pending ? 'pending' : (complete && imgSrc ? 'saved' : 'empty');
    // ★ 印はあるのに画像が読めない、のような食い違いは黙って通さない
    if (complete && !imgSrc) warnings.push('枠 ' + slot + ' は埋まっている印があるのに画像が読めない');

    seen.add(slot);
    slots.push({ slot, id, dir: String(a['data-input'] ?? id), postUrl, state, imgSrc });
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
  meta: { slot: number; id: string; dir: string; filename: string; contentType: string; wasState: string };
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
  v: {
    slot: number; ctk: string; fileUrl: string; filename: string; contentType: string;
    /**
     * ★★★★★★ 【第245便・2026-09-10 実弾3発で確定】エステ魂では **差し替えにならない**。
     *   ★ 相手は `cast_icon_<枠>-imgupload` の枠番号を見ておらず、**いちばん小さい空き枠へ詰める**。
     *     ★ 枠6を指名した2発が、実際には枠4・枠5に入った。
     *   → ★★★ 埋まった枠を指名しても、その枠は差し替わらない。★ 空き枠が1つ埋まるだけ。
     *   ★★ だから **true は受け付けない**（★ 下で止める）。★ 差し替えは店舗様の画面から。
     *   ★ 欄を残しているのは **止めるために要る**から。★ 消すと黙って通ってしまう。
     */
    replace?: boolean;
  },
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

  // ★★★★★★ 第245便: 差し替えは受け付けない。★ エステ魂は詰めるので「差し替え」にならない
  if (v.replace === true) {
    throw new Error('エステ魂は空き枠へ詰めるため、写真の差し替えはできません。★ 差し替えは店舗様の画面から');
  }
  // ★★★★★ 空き枠にだけ送る（第107便と同じ決め）。★ 店舗様の写真を上書きしない
  if (target.state !== 'empty') {
    throw new Error('枠 ' + String(v.slot) + ' には既に写真が入っています（'
      + (target.state === 'pending' ? '仮置き' : '保存済み') + '）。★ 空き枠にだけ送ります');
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
    meta: { slot: target.slot, id: target.id, dir: target.dir, filename, contentType, wasState: target.state },
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

/**
 * ★★★★★★ 空いている枠のうち、いちばん小さい番号を返す（★ 無ければ null）。
 *
 * ★★★ 第245便（2026-09-10 実弾3発）で、これが **唯一の送り先**になった。
 *   ★ エステ魂は `cast_icon_<枠>-imgupload` の枠番号を見ておらず、**いちばん小さい空き枠へ詰める**。
 *     ★ 枠6を指名した2発が、実際には枠4・枠5に入った（★ 照合は枠6を見て `not_saved` と申告）。
 *   → ★★ ここが返す番号は「送り先」であると同時に **「相手が入れる先」**でもある。
 *     ★ だから照合がこの番号で合う。★ 別の番号を指名すると、必ず食い違う。
 *
 *   ★★ 枠1（トップ画像）から順に埋める。★ 駅ちかは枠1を別扱いにしていたが（第142便）、
 *     エステ魂は**枠1がトップ画像そのもの**（`cast/main/`。★ 枠2以降は `cast/sub/`）なので、1から埋めてよい。
 */
export function firstEmptyEsutamaPhotoSlot(page: EsutamaPhotoPage): number | null {
  if (page.warnings.length > 0) return null;   // ★ 読み切れていない画面では決めない
  const hit = page.slots.find((s) => s.state === 'empty');
  return hit ? hit.slot : null;
}

// ───────── ★★★ ②の段: 保存して本紐づけする（第242便・2026-09-10）─────────
//
// ★★★★★ ①（仮置き）だけでは写真は付かない。★ **編集フォームを保存して初めて付く**（§25-1）。
//   ★ 実測: 保存フォームに `cast_icon_<枠>-imgupload=/temp/<ファイル名>` を足すと紐づく。
//
// ★★★ ここは **既存のセラピストの編集フォームを保存する**ところ。★ いちばん気をつける段。
//   ★ 読んだ65部品を**そのまま返し**、写真の1組だけを足す。★ ほかの値には触らない。
//   ★★ 作法は追加（第231便）と同じ。★ 相手が項目を増やしても黙って壊れない。

/** 既存セラピストの編集ページ。★ 追加フォーム（`/admin/cast_edit/`）とは別物 */
export function esutamaCastEditUrl(castId: string): string {
  const id = String(castId ?? '').trim();
  if (!/^\d{1,12}$/.test(id)) throw new Error('castId の形が不正です（' + id.slice(0, 20) + '）');
  return ESUTAMA_CAST_EDIT_URL + id + '/';
}

/** 既存セラピストの編集フォームを読む GET。★ 読むだけ */
export function buildEsutamaCastEditFormRequest(cookie: string, castId: string): { method: 'GET'; url: string; headers: Record<string, string> } {
  if (!cookie) throw new Error('Cookie が無いまま編集フォームを読みに行かない');
  const url = esutamaCastEditUrl(castId);
  return {
    method: 'GET',
    url,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      referer: 'https://estama.jp/admin/cast/',
      cookie,
    },
  };
}

/** ★ 仮置きの結果（`readEsutamaTmpPhoto` が返したもの）を、そのまま渡す */
export type EsutamaPhotoAttach = { field: string; value: string; slot: number };

/**
 * ★★★★★ 編集フォームを保存して、仮置きの写真を本紐づけする。
 *
 * @param form `parseEsutamaCastForm` が読んだもの（★ `set_up_limit` と file は既に外れている）
 * @param castId 保存する相手。★ **読んだフォームの cast_id と一致していること**を確かめる
 * @param attach 足す写真の組（★ 1枚以上）
 *
 * ★★★ 止める条件（★ 迷ったら送らない）:
 *   ・Cookie が無い ／ 読んだフォームに `ctk` が無い
 *   ・★★★★★ **読んだフォームの `cast_id` が、保存するつもりの castId と違う**
 *     → ★ **別人の設定を上書きしに行かない。** ★ ここがこの段でいちばん怖いところ
 *   ・`cast_id` が `0`（＝追加フォームを掴んでいる）
 *   ・★★★ **`set_up_limit` が混じっている**（「保存と同時に上位表示」＝店舗様の残り回数を使う・§9-2）
 *   ・足す組が0個 ／ 形が違う ／ 同じ枠が2回 ／ 読んだフォームに既に同じ欄が在る
 *   ・送信ボタンが2つ以上（★ どれを押すかをこちらで決めない）
 */
export function buildEsutamaCastPhotoSaveRequest(
  cookie: string,
  form: {
    fields: Array<{ name: string; value: string }>;
    castIdHidden: string | null;
    submits?: Array<{ name: string; value: string }>;
  },
  castId: string,
  attach: readonly EsutamaPhotoAttach[],
): { method: 'POST'; url: string; headers: Record<string, string>; body: string; meta: { castId: string; slots: number[]; pairs: number } } {
  if (!cookie) throw new Error('Cookie が無いまま保存しない');
  const id = String(castId ?? '').trim();
  const url = esutamaCastEditUrl(id);

  const fields = form.fields ?? [];
  if (fields.length === 0) throw new Error('編集フォームを読めていないので保存しない');
  if (!fields.some((f) => f.name === 'ctk')) throw new Error('ctk が無いまま保存しない');

  // ★★★★★ 別人を上書きしに行かないための止め（★ この段でいちばん怖いところ）
  const hidden = String(form.castIdHidden ?? '').trim();
  if (hidden === '0') throw new Error('追加フォーム（cast_id=0）を掴んでいます。★ 保存しません');
  if (hidden !== id) {
    throw new Error('読んだフォームの cast_id（' + (hidden || '無し') + '）が保存する相手（' + id + '）と違います。★ 保存しません');
  }

  // ★★★ 上位表示の残り回数を使わない（二重の見張り・§9-2）
  if (fields.some((f) => f.name === 'set_up_limit')) {
    throw new Error('set_up_limit が混じっています。★ 上位表示の残り回数は店舗様の資源なので送りません');
  }

  const list = Array.isArray(attach) ? attach : [];
  if (list.length === 0) throw new Error('足す写真が1枚もありません。★ 保存しません');
  const seen = new Set<number>();
  for (const a of list) {
    const slot = Number(a?.slot);
    if (!Number.isInteger(slot) || slot < 1 || slot > ESUTAMA_PHOTO_SLOT_MAX) {
      throw new Error('枠の番号が不正です（' + String(a?.slot) + '）');
    }
    if (seen.has(slot)) throw new Error('枠 ' + slot + ' が2回あります');
    seen.add(slot);
    if (a?.field !== 'cast_icon_' + slot + '-imgupload') {
      throw new Error('枠 ' + slot + ' の欄名が違います（' + String(a?.field) + '）');
    }
    if (!/^\/temp\/[A-Za-z0-9_\-]{1,80}\.(jpg|jpeg|png)$/i.test(String(a?.value ?? ''))) {
      throw new Error('枠 ' + slot + ' の値が仮置きの形ではありません（' + String(a?.value).slice(0, 40) + '）');
    }
    // ★ 読んだフォームに既に同じ欄が在るなら、こちらが足すと2つ飛ぶ。★ 黙って重ねない
    if (fields.some((f) => f.name === a.field)) {
      throw new Error('枠 ' + slot + ' の欄が既にフォームに在ります。★ 二重に送りません');
    }
  }

  const out: Array<[string, string]> = [];
  for (const f of fields) out.push([f.name, f.value]);          // ★ 読んだまま返す（★ 触らない）
  for (const a of list) out.push([a.field, a.value]);            // ★ 足すのは写真の組だけ

  // ★★★★ 押したボタンを送る（第234便でそろえた作法）。★ 2つ以上あったら送らない
  const submits = form.submits ?? [];
  if (submits.length > 1) {
    throw new Error('送信ボタンが' + submits.length + '個あります（' + submits.map((b) => b.name).join(' / ')
      + '）。★ どれを押すか決められないので送りません');
  }
  if (submits.length === 1) out.push([submits[0].name, submits[0].value]);

  const body = out
    .map(([k, v]) => encodeURIComponent(k).replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+')
      + '=' + encodeURIComponent(v).replace(/[!'()*~]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase()).replace(/%20/g, '+'))
    .join('&');

  return {
    method: 'POST',
    url,
    headers: {
      'user-agent': RELAY_USER_AGENT,
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'ja,en-US;q=0.9,en;q=0.8',
      'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
      referer: url,
      origin: ESUTAMA_ORIGIN,
      cookie,
    },
    body,
    meta: { castId: id, slots: [...seen].sort((a, b) => a - b), pairs: out.length },
  };
}
