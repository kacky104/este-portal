import type { createServiceClient } from '@/app/lib/supabase/service';
import {
  SYSTEM_PROMPT,
  buildUserPrompt,
  parseCopyResponse,
  isLongEnough,
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
  | { ok: true; catchphrase: string; profileText: string; tries: number; short: boolean; usedImage: boolean }
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
    // レスポンス本文にキーが混ざることは無いが、念のため生のまま画面に出さない。
    const status = res.status;
    if (status === 401) return { error: 'AIの認証に失敗しました（管理者にお問い合わせください）' };
    if (status === 429) return { error: 'AIが混み合っています。少し待ってから試してください' };
    if (status >= 500) return { error: 'AI側で一時的な障害が起きています。時間をおいて試してください' };
    return { error: `AIの呼び出しに失敗しました（${status}）` };
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

    const r = await callClaude(apiKey, blocks);
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
    if (isLongEnough(parsed.profileText)) break;

    retryReason =
      `前回の紹介文は${parsed.profileText.replace(/\s/g, '').length}文字で短すぎました。` +
      `${MIN_PROFILE_LEN}文字以上になるよう、容姿・雰囲気・人柄の描写を厚くして書き直してください。`;
  }

  if (!last) return { ok: false, error: 'AIが下書きを作れませんでした。もう一度試してください' };

  return {
    ok: true,
    catchphrase: last.catchphrase,
    profileText: last.profileText,
    tries,
    short: !isLongEnough(last.profileText),
    usedImage: hasImage,
  };
}
