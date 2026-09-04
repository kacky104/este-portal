// 魂セラピスト アカウント管理（/admin/tamathera/therapist/）の読み取り（第129便・2026-09-04）。
// ★ 純粋関数（禁則180）。★ 通信もDBも触らない。
//
// ★★★ 2026-09-04 に実物で確かめた（ラビリンス様の許可のもと・GET だけ）
//   ★★ 「本人の代わりにログイン」のボタンは【利用中の人にしか存在しない】。
//     ★ 37人中12個だけ。★ 開始前・初回設定待ちの行は、文字は出ているがボタン要素が無い。
//   ★★★ だから **日本語（「利用中」）を読む必要が無い**。★ ボタンの有無と data 属性で足りる:
//     <button class="btn btn-default btn-proxy-login"
//             data-cast-id="757481" data-cast-name="さら" data-cast-state="active">
//
// ★★★ 「送れない理由」は3つあって、混ぜてはいけない（第118便の決めごと④）:
//     ① 了承がない          … こちらの記録の話（therapistMediaConsent）
//     ② そもそも始めていない … ここで分かる（ボタンが無い＝代理ログインできない）
//     ③ 名簿が結びついていない … cast_id が無い
//   ★ 店舗様の次の行動が違うので、画面でも分けて出すこと。

/** 代理ログインできる人。★ ここに入る＝ボタンがあった＝相手が「利用中」と認めている。 */
export type EsutamaProxyTherapist = {
  castId: string;
  name: string;
  /** 相手が付けている状態。★ 実測ではすべて 'active'。★ 知らない値も落とさずそのまま持つ。 */
  state: string;
};

/**
 * ★★★ 代理ログインできる人だけを拾う。
 *
 * ★ 判定はボタンの有無。★ 「利用中」という文字は読まない（言葉が変わっても壊れない）。
 * ★★ data-cast-state が 'active' でないものは【落とす】。
 *   ★ 実測ではすべて active だったが、別の値が来たら相手の仕様が変わった合図。
 *   ★ 知らない状態のまま代理ログインを試みない（黙って別の人に入らない）。
 */
export function parseEsutamaProxyTherapists(html: string): EsutamaProxyTherapist[] {
  const out: EsutamaProxyTherapist[] = [];
  const seen = new Set<string>();
  const src = String(html ?? '');
  // ★ 属性の並び順に依存しない。★ ボタン1つぶんのタグを取り出してから属性を読む
  const tagRe = /<button[^>]*class="[^"]*\bbtn-proxy-login\b[^"]*"[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = tagRe.exec(src)) !== null) {
    const tag = m[0];
    const id = /data-cast-id="([^"]*)"/i.exec(tag)?.[1] ?? '';
    const name = /data-cast-name="([^"]*)"/i.exec(tag)?.[1] ?? '';
    const state = /data-cast-state="([^"]*)"/i.exec(tag)?.[1] ?? '';
    if (!/^\d{1,12}$/.test(id)) continue;      // ★ 番号の形でないものは使わない
    if (state !== 'active') continue;          // ★★ 知らない状態では代理ログインしない
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ castId: id, name: decodeEntities(name), state });
  }
  return out;
}

/** ごく基本的な実体参照だけ戻す。★ 名前に使われる範囲。 */
function decodeEntities(s: string): string {
  return String(s ?? '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'");
}

/**
 * ページから ctk（CSRF）を拾う。★ 見つからなければ null。
 *
 * ★★★ null を「空文字」にしない。★ 見つからなかったことを呼び出し側に伝える。
 *   ★ 空で送ると相手が弾き、理由が分からないまま止まる（引き継ぎメモ 3-5）。
 * ★ 実測では 32文字の hidden input（name="ctk"）。★ 属性の並び順に依存しない形で拾う。
 */
export function parseEsutamaCtk(html: string): string | null {
  const src = String(html ?? '');
  const inputRe = /<input[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = inputRe.exec(src)) !== null) {
    const tag = m[0];
    if (!/name="ctk"/i.test(tag)) continue;
    const v = /value="([^"]*)"/i.exec(tag)?.[1] ?? '';
    if (/^[A-Za-z0-9]{16,64}$/.test(v)) return v;
  }
  return null;
}

/** create_shop_token の応答。★ token は【この場で使うだけ】。保存しない・記録しない。 */
export type ShopTokenResult =
  | { ok: true; token: string; expiresAt: string | null }
  | { ok: false; error: string };

/**
 * ★★★ 代理ログイン用トークンの応答を読む。
 *
 * ★ 相手は {"success":true,"login_token":"…","login_url":"…","expires_at":"…"} を返す（実測）。
 * ★★ login_url は使わない。★ token だけ取り、こちらでURLを組み立てる
 *   （相手が返したURLへ素直に飛ばない＝知らない宛先へ行かないため）。
 * ★★★ success が true でないときは【理由をそのまま返す】。★ 握りつぶさない。
 */
export function parseEsutamaShopToken(bodyText: string): ShopTokenResult {
  const raw = String(bodyText ?? '').trim();
  if (raw.length === 0) return { ok: false, error: '応答が空でした' };
  let j: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: '応答が JSON ではありませんでした' };
    }
    j = parsed as Record<string, unknown>;
  } catch {
    return { ok: false, error: '応答を読み取れませんでした（JSON ではありません）' };
  }
  if (j.success !== true) {
    const msg = typeof j.message === 'string' && j.message.trim() ? j.message.trim() : '発行を断られました';
    return { ok: false, error: msg };
  }
  const token = typeof j.login_token === 'string' ? j.login_token : '';
  // ★ 形を確かめる。★ 変な値でURLを組み立てない
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(token)) return { ok: false, error: 'トークンの形が違います' };
  const exp = typeof j.expires_at === 'string' && j.expires_at.trim() ? j.expires_at.trim() : null;
  return { ok: true, token, expiresAt: exp };
}

/**
 * ★★ 代理ログインが張れたか。★ 画面に「【◯◯】さんにログイン中です」が出る（実測）。
 * ★ 名前まで確かめる。★ **別の人に入っていないこと**を必ず見る。
 *   ★ 2026-09-04 に、探す道具が「さら」を探して「さくら」を返した。★ 人違いは起こる。
 */
export function isProxyLoggedInAs(html: string, name: string): boolean {
  const src = String(html ?? '');
  const n = String(name ?? '').trim();
  if (!n) return false;
  return src.includes('【' + n + '】さんにログイン中です');
}

/**
 * ★★★ 投稿 POST の応答から【合図】だけ取り出す（第133便・2026-09-04）。
 *
 * ★★ ここでは **成否を決めない。** ★ 相手が成功時に何を返すかを、まだ実物で見ていない。
 *   ★ 推測で「送れました」と書かない（第46便の作法）。
 * ★ 何のためにあるか: **1通目を撃ったときに、何が起きたかを人が読めるようにする。**
 *   ★ 監査ログにこの3つが残っていれば、次の便で判定を書ける。
 *   ★★ 合図が無いまま status だけ残すと、「200なのに載っていない」の原因を追えない。
 */
export type EsutamaDiaryPostSignals = {
  /** 投稿フォーム（name="ctk"）がまだ出ている＝弾かれて書き直しを求められた可能性 */
  formStillThere: boolean;
  /** 「エラー」「必須」「してください」等の差し戻しらしい語があるか */
  hasErrorWord: boolean;
  /** 応答の長さ（★ 空・極端に短いのも合図） */
  length: number;
};

const ERROR_WORDS = ['エラー', '必須', '入力してください', '選択してください', '失敗'];

export function esutamaDiaryPostSignals(body: string): EsutamaDiaryPostSignals {
  const src = String(body ?? '');
  return {
    formStillThere: /name="ctk"/i.test(src),
    hasErrorWord: ERROR_WORDS.some((w) => src.includes(w)),
    length: src.length,
  };
}

/**
 * ★★★ いま【誰として】ログインしているかを、画面から読み取る（第134便・2026-09-04）。
 *
 * ★★ なぜ要るか（2026-09-04 の1通目で実際に詰まった）
 *   代理ログインの突き合わせに失敗して止まった。★ 安全側に倒れたのは正しい。
 *   ★ しかし記録には「入れませんでした」としか残らず、**なぜかが分からない**:
 *     ・別の人に入った？
 *     ・そもそもログインできていない？
 *     ・名前の表記が違うだけ？（サラ／さら）
 *   → **画面に出ていた名前をそのまま記録に残す。** ★ 次に見たときに理由が読める。
 *
 * ★ 見つからなければ null（★ 空文字にしない）。★ 「読めなかった」と「空だった」を混ぜない。
 */
export function parseProxyLoggedInName(html: string): string | null {
  const m = /【([^】]{1,40})】さんにログイン中です/.exec(String(html ?? ''));
  const name = m?.[1]?.trim() ?? '';
  return name.length > 0 ? name : null;
}

/**
 * ★★★ 投稿の応答を【判定する】（第136便・2026-09-04）。
 *
 * ★★ 第133便では判定しなかった。★ 相手が成功時に何を返すかを知らなかったから。
 *   ★ 「推測で『送れました』と書かない」を守って、合図だけ残していた。
 *
 * ★★★ 2026-09-04 16:42、**1通目が実際に載った**。★ そのときの応答:
 *     status 303 ／ formStillThere false ／ hasErrorWord false ／ bodyLength 0
 *   ★ 303 See Other ＝ 受け取って別のページへ送り返す（POST後のリダイレクト）。
 *   ★★ **実測1件。★ これを「成功の姿」とする。**
 *
 * ★★★ 逆に、弾かれたときは **200 で投稿フォームが戻ってくる**はず（未実測）。
 *   ★ だから 200 + フォーム = 差し戻し と読む。★ ここはまだ推測を含む。
 *
 * ★★★ 3つに分ける理由（★ 2値に潰さない）
 *   sent     … 送れた           → 印を残す
 *   rejected … 送れていない     → ★ 印を外す（もう一度送れるようにする）
 *   unknown  … 分からない       → ★★ 印は【残す】
 *       ★ エステ魂は店舗側から消せない。★ 分からないまま二度送るほうが害が大きい。
 *       ★ 「分からない」と書いて人に判断してもらう。★ 黙って成功にしない。
 */
export type EsutamaPostVerdict = 'sent' | 'rejected' | 'unknown';

export function judgeEsutamaDiaryPost(
  status: number,
  signals: EsutamaDiaryPostSignals,
): { verdict: EsutamaPostVerdict; reason: string } {
  // ★ 通信そのものが失敗。★ 相手は受け取っていない
  if (status >= 400 || status < 200) {
    return { verdict: 'rejected', reason: '応答が ' + status + ' でした' };
  }
  // ★★★ 実測の成功の形: 3xx（303）で本文が空
  if (status >= 300 && status < 400) {
    return { verdict: 'sent', reason: '受け取られました（' + status + '）' };
  }
  // ★★ 200 で投稿フォームが戻ってきた ＝ 書き直しを求められた
  if (signals.formStillThere) {
    return {
      verdict: 'rejected',
      reason: '投稿フォームが戻ってきました'
        + (signals.hasErrorWord ? '（差し戻しらしい語もあります）' : ''),
    };
  }
  if (signals.hasErrorWord) {
    // ★ フォームは無いが差し戻しらしい語がある。★ どちらとも言えない
    return { verdict: 'unknown', reason: '応答に差し戻しらしい語がありました' };
  }
  // ★ 200 でフォームも無い。★ 実測していない形なので決めつけない
  return { verdict: 'unknown', reason: '見たことのない応答でした（' + status + '・' + signals.length + '文字）' };
}
