import type { createServiceClient } from '@/app/lib/supabase/service';
import { sanitizeApiErrorMessage } from '@/lib/apiErrorMessage';
import {
  SYSTEM_PROMPT,
  buildSystemPrompt,
  buildUserPrompt,
  parseCopyResponse,
  isLongEnough,
  hasSizeExpression,
  findForbiddenInText,
  MAX_RETRY,
  MIN_PROFILE_LEN,
  type CopyInput,
  type CopyOutput,
} from '@/lib/therapistCopyPrompt';

// ── AI紹介文の生成本体（第30便・2026-08-24）──────────────────────
// 「素材を集めて Claude を叩き、短ければ作り直す」だけを担う。
// 認可・枠の管理・保存はしない（呼び出し側の責任）。
//
// 使う側は2つ:
//   - app/actions/therapistCopy.ts   … 店舗が /mypage から1人ずつ（枠を消費）
//   - app/api/admin/therapist-copy-batch … 運営が店舗まるごと一括（枠を消費しない）
//
// ⚠ ANTHROPIC_API_KEY はサーバー専用。このファイルはクライアントから import しないこと。

export const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1500;
/** Anthropic API が受ける画像の上限に対する安全側の自主制限（バイト）。 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

type Svc = ReturnType<typeof createServiceClient>;

export type CoreResult =
  | {
      ok: true;
      catchphrase: string;
      profileText: string;
      tries: number;
      short: boolean;
      usedImage: boolean;
      /** ★ キャッチにサイズ表現が残ったので空にした（第122便）。★ 黙って消さないための印。 */
      catchDropped: boolean;
      /** ★ やり直しても紹介文に残った「使わないと決めた語」（第123便）。★ 空なら守られた。 */
      forbiddenLeft: string[];
    }
  | { ok: false; error: string };

/** 画像URLを取得して base64 に変換する。失敗しても null を返すだけ（写真なしで生成を続ける）。
 *  ★ 第113便でバッジ生成（therapistBadgeCore）からも使うので export した。★ 複製しない。 */
export async function fetchImageAsBase64(url: string): Promise<{ mediaType: string; data: string } | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    // Anthropic が受けるのは jpeg / png / gif / webp のみ。
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type)) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength === 0 || buf.byteLength > MAX_IMAGE_BYTES) return null;
    return { mediaType: type, data: buf.toString('base64') };
  } catch {
    return null;
  }
}

export type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** Anthropic Messages API を1回叩いて、本文テキストを返す。
 *  ★ 第113便で system と max_tokens を引数にした（バッジ生成は別の system・短い出力）。
 *    ★ 省略時はこれまでどおり紹介文の設定。★ 呼び出し側は1文字も変えなくてよい。 */
export async function callClaude(
  apiKey: string,
  userBlocks: AnthropicBlock[],
  system: string = SYSTEM_PROMPT,
  maxTokens: number = MAX_TOKENS,
): Promise<{ text: string } | { error: string }> {
  let res: Response;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        system,
        messages: [{ role: 'user', content: userBlocks }],
      }),
    });
  } catch {
    return { error: 'AIサービスに接続できませんでした。時間をおいて試してください' };
  }

  if (!res.ok) {
    const status = res.status;
    if (status === 401) return { error: 'AIの認証に失敗しました（管理者にお問い合わせください）' };
    if (status === 429) return { error: 'AIが混み合っています。少し待ってから試してください' };
    if (status >= 500) return { error: 'AI側で一時的な障害が起きています。時間をおいて試してください' };

    // ★★★ 400 は「何が悪いか」が本文に書いてある（第125便・2026-09-04）。
    //   ★ 以前はここで本文を捨てていたので、止まった理由が永久に分からなかった。
    //   ★★ 心配していた「キーが混ざる」は sanitizeApiErrorMessage が伏せ字にする。
    //     ★ 消すのではなく【隠して出す】。★ 見せないと原因を追えなくなる。
    let detail: string | null = null;
    try { detail = sanitizeApiErrorMessage(await res.text()); } catch { detail = null; }
    return { error: `AIの呼び出しに失敗しました（${status}）${detail ? '：' + detail : ''}` };
  }

  try {
    const json = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = (json.content ?? [])
      .filter((b) => b.type === 'text' && typeof b.text === 'string')
      .map((b) => b.text as string)
      .join('\n')
      .trim();
    if (!text) return { error: 'AIの応答が空でした。もう一度試してください' };
    return { text };
  } catch {
    return { error: 'AIの応答を読み取れませんでした' };
  }
}

/**
 * セラピスト1人分のキャッチ・紹介文を生成する。DBへの保存はしない。
 * 素材はここで引き直す（呼び出し側から渡された値は信用しない）。
 */
export async function generateCopyForTherapist(
  svc: Svc,
  salonId: number,
  therapistId: number,
  useImage: boolean,
): Promise<CoreResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'AI機能が未設定です（管理者にお問い合わせください）' };

  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, catchphrase, profile_text, feature_badges, profile_image_url, profile_images')
    .eq('id', therapistId)
    .maybeSingle();
  if (tErr || !t) return { ok: false, error: 'セラピストが見つかりません' };
  if (Number(t.salon_id) !== Number(salonId)) return { ok: false, error: '対象セラピストが不正です' };

  const { data: salon } = await svc.from('salons').select('name').eq('id', salonId).maybeSingle();

  const badges = Array.isArray(t.feature_badges)
    ? (t.feature_badges as unknown[]).filter((b): b is string => typeof b === 'string')
    : [];

  const input: CopyInput = {
    name: String(t.name ?? ''),
    age: (t.age as string | null) ?? null,
    bodyType: (t.body_type as string | null) ?? null,
    badges,
    salonName: (salon?.name as string | undefined) ?? null,
    currentCatch: (t.catchphrase as string | null) ?? null,
    currentText: (t.profile_text as string | null) ?? null,
  };

  // 写真は1枚目だけ使う（複数枚渡してもコストが増えるわりに描写は良くならない）。
  let image: { mediaType: string; data: string } | null = null;
  if (useImage) {
    const imgs = Array.isArray(t.profile_images)
      ? (t.profile_images as unknown[]).filter((u): u is string => typeof u === 'string' && !!u)
      : [];
    const first = imgs[0] ?? ((t.profile_image_url as string | null) ?? null);
    if (first) image = await fetchImageAsBase64(first);
  }
  const hasImage = image !== null;

  // 素材ゼロなら叩かない。年齢・サイズだけでは誰にでも当てはまる文章にしかならない。
  if (!hasImage && badges.length === 0) {
    return { ok: false, error: 'プロフィール写真を登録するか、特徴バッジを選んでから作成してください' };
  }

  // 生成 →（短ければ）作り直し。最大 1 + MAX_RETRY 回。
  let last: CopyOutput | null = null;
  let tries = 0;
  let retryReason: string | undefined;

  for (let i = 0; i <= MAX_RETRY; i++) {
    tries++;
    const blocks: AnthropicBlock[] = [];
    if (image) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.data },
      });
    }
    blocks.push({ type: 'text', text: buildUserPrompt(input, { hasImage, retryReason }) });

    // ★★★ お手本は【この人に決まった3本】だけ渡す（第126便）。
    //   ★ seed に therapistId を使う＝同じ人には毎回同じお手本。★ 点検で固定できる。
    //   ★★ 全員に同じ6本を見せると、AIが平均を取って人物像が揃う（2026-09-04 実測）。
    const r = await callClaude(apiKey, blocks, buildSystemPrompt(therapistId));
    // 1回目で通信・認証エラーなら諦める。2回目以降なら手前の結果を活かす。
    if ('error' in r) {
      if (last) break;
      return { ok: false, error: r.error };
    }

    const parsed = parseCopyResponse(r.text);
    if (!parsed) {
      retryReason = '前回の出力がJSON形式ではありませんでした。指定のJSONだけを返してください。';
      continue;
    }
    last = parsed;

    // ★★★ 直すべき点を【1回にまとめて】伝える（第123便）。
    //   ★ 1つずつ continue すると、やり直しの回数（最大3回）を1項目で使い切ってしまう。
    //   ★★ 決まるものはコードで決める。★ プロンプトに書いただけでは守られなかった（第122便で実測）。
    const problems: string[] = [];

    // ★ キャッチのサイズ表現（第122便）。★ 紹介文の中で触れるのは止めない
    if (hasSizeExpression(parsed.catchphrase)) {
      problems.push(
        `・キャッチフレーズ「${parsed.catchphrase}」にサイズ表現が入っていました。` +
          'カップ・スリーサイズ・身長の数値・「巨乳」などをキャッチに入れないでください' +
          '（紹介文の中で触れるのは構いません）。',
      );
    }

    // ★★★ 使わないと決めた言い回し（第123便）。★ 入っていた語をそのまま見せる
    const forbidden = findForbiddenInText(parsed.profileText);
    if (forbidden.length > 0) {
      problems.push(
        `・紹介文に、使わないと決めた言い回しが入っていました: ${forbidden.map((w) => `「${w}」`).join('')}。` +
          'これらは誰の体型にも当てはまる要約です。' +
          '★ 別の似た語に置き換えるのではなく、要約するのをやめて、' +
          '写真に実際に見えるもの（姿勢・手足の見え方・服の印象・髪の落ち方など）を具体的に書いてください。',
      );
    }

    if (!isLongEnough(parsed.profileText)) {
      problems.push(
        `・紹介文が${parsed.profileText.replace(/\s/g, '').length}文字で短すぎました。` +
          `${MIN_PROFILE_LEN}文字以上になるよう、容姿・雰囲気・人柄の描写を厚くしてください。`,
      );
    }

    if (problems.length === 0) break;
    retryReason = problems.join('\n');
  }

  if (!last) return { ok: false, error: 'AIが下書きを作れませんでした。もう一度試してください' };

  // ★★★ やり直しても直らなかったら、キャッチは【空で返す】。
  //   ★ 「迷ったら、間違った値を書くより何も書かないほうを選ぶ」（第36便）。
  //   ★★ ただし黙って消さない。★ catchDropped で理由が読み取れるようにする。
  const catchDropped = hasSizeExpression(last.catchphrase);

  // ★★ 紹介文は空にできない（本体なので）。★ だが黙って通さない。
  //   ★ 残った語を返して、あとで数えられるようにする（第123便）。
  const forbiddenLeft = findForbiddenInText(last.profileText);

  return {
    ok: true,
    catchDropped,
    forbiddenLeft,
    catchphrase: catchDropped ? '' : last.catchphrase,
    profileText: last.profileText,
    tries,
    short: !isLongEnough(last.profileText),
    usedImage: hasImage,
  };
}
