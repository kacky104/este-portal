'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
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

// ── AI紹介文生成（第30便・2026-08-24）────────────────────────────
// /mypage/therapist/[id] の「AIで下書き」ボタンから呼ぶ server action。
// セラピストの素材（名前・年齢・サイズ・特徴バッジ・プロフィール写真）を Claude に渡し、
// キャッチフレーズと詳細プロフィールの下書きを作る。保存はしない（フォームに入れるだけ）。
//
// ⚠ セキュリティ（therapistAdmin.ts と同方針・厳守）:
//  - ANTHROPIC_API_KEY はこのサーバー専用モジュール内でのみ使用。クライアントへ出さない。
//  - 先頭で assertOwner（salons.owner_id === auth.uid() または ADMIN_UUID）を再検証。
//  - 対象セラピストが本当にその salon のものかも確認する（他店のIDを渡されても拾わない）。
//
// ★ 品質ルール（第29便オーナー確定）:
//  - 字数の上限は指定しない。下限（150字）だけここで担保し、足りなければ作り直す（最大2回）。
//  - 2回作り直しても短ければ、そのまま下書きとして返して人の目に委ねる（無限ループ防止）。

const MODEL = 'claude-sonnet-4-5';
const MAX_TOKENS = 1500;
/** Anthropic API が受ける画像の上限に対する安全側の自主制限（バイト）。 */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export type GenerateResult =
  | {
      ok: true;
      catchphrase: string;
      profileText: string;
      tries: number;
      short: boolean;
      usedImage: boolean;
      /** 消費後の残り回数（画面表示用） */
      quota: QuotaState;
    }
  | { ok: false; error: string; quota?: QuotaState };

/** 今月の利用状況。text=写真なし / image=写真あり。 */
export type QuotaState = {
  textUsed: number;
  textLimit: number;
  imageUsed: number;
  imageLimit: number;
};

/**
 * カレンダー月の初日（JST）を UTC の ISO 文字列で返す。
 * ★ Vercel のサーバーは UTC で動くので、素直に new Date() の月で切ると
 *   毎月1日の 00:00〜09:00(JST) が前月扱いになる。JST に寄せてから月初を作る。
 */
function monthStartIsoJst(now = new Date()): string {
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  // JST での年月を取り、その月初 00:00(JST) = 前月末日 15:00(UTC)。
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), 1, -9, 0, 0)).toISOString();
}

/** 今月の利用件数と店舗の枠を引く。 */
async function loadQuota(
  svc: ReturnType<typeof createServiceClient>,
  salonId: number,
): Promise<QuotaState> {
  const since = monthStartIsoJst();
  const [salonRes, usageRes] = await Promise.all([
    svc.from('salons').select('ai_copy_quota_text, ai_copy_quota_image').eq('id', salonId).maybeSingle(),
    svc.from('ai_copy_usage').select('kind').eq('salon_id', salonId).gte('created_at', since),
  ]);

  const rows = (usageRes.data ?? []) as Array<{ kind: string }>;
  return {
    textUsed:   rows.filter((r) => r.kind === 'text').length,
    imageUsed:  rows.filter((r) => r.kind === 'image').length,
    // 列が無い/引けない場合でも機能を止めないよう既定値に倒す（マイグレーション前でも動く）。
    textLimit:  Number(salonRes.data?.ai_copy_quota_text  ?? 20),
    imageLimit: Number(salonRes.data?.ai_copy_quota_image ?? 5),
  };
}

/** 店舗オーナー向けに今月の残り回数だけを返す（/mypage の表示用）。 */
export async function getTherapistCopyQuota(
  salonId: number,
): Promise<{ ok: true; quota: QuotaState } | { ok: false; error: string }> {
  const auth = await assertOwner(salonId);
  if ('error' in auth) return { ok: false, error: auth.error };
  try {
    return { ok: true, quota: await loadQuota(createServiceClient(), salonId) };
  } catch {
    return { ok: false, error: '利用状況を取得できませんでした' };
  }
}

// ログインユーザーがその salon の owner（または管理者UID）かをサーバー側で検証。
async function assertOwner(salonId: number): Promise<{ userId: string } | { error: string }> {
  if (!Number.isFinite(salonId)) return { error: '対象店舗が不正です' };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'ログインが必要です' };

  const { data: salon, error } = await supabase
    .from('salons')
    .select('owner_id, name')
    .eq('id', salonId)
    .maybeSingle();
  if (error || !salon) return { error: '店舗が見つかりません' };

  const ownerId = (salon.owner_id as string | null) ?? null;
  if (ownerId !== user.id && user.id !== ADMIN_UUID) {
    return { error: 'この店舗の操作権限がありません' };
  }
  return { userId: user.id };
}

/** 画像URLを取得して base64 に変換する。失敗しても null を返すだけ（写真なしで生成を続ける）。 */
async function fetchImageAsBase64(
  url: string,
): Promise<{ mediaType: string; data: string } | null> {
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

type AnthropicBlock =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } };

/** Anthropic Messages API を1回叩いて、本文テキストを返す。 */
async function callClaude(
  apiKey: string,
  userBlocks: AnthropicBlock[],
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
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
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
 * セラピストのキャッチ・紹介文の下書きを生成する。DBには保存しない。
 * @param salonId  対象店舗
 * @param therapistId  対象セラピスト（salonId 配下であることを検証する）
 * @param useImage  プロフィール写真をAIに渡すか（店舗が都度選べる）
 */
export async function generateTherapistCopy(
  salonId: number,
  therapistId: number,
  useImage: boolean,
): Promise<GenerateResult> {
  const auth = await assertOwner(salonId);
  if ('error' in auth) return { ok: false, error: auth.error };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'AI機能が未設定です（管理者にお問い合わせください）' };

  // 素材はサーバー側で引き直す（クライアントから渡された値を信用しない）。
  const svc = createServiceClient();
  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, catchphrase, profile_text, feature_badges, profile_image_url, profile_images')
    .eq('id', therapistId)
    .maybeSingle();
  if (tErr || !t) return { ok: false, error: 'セラピストが見つかりません' };
  if (Number(t.salon_id) !== Number(salonId)) return { ok: false, error: '対象セラピストが不正です' };

  const { data: salon } = await svc.from('salons').select('name').eq('id', salonId).maybeSingle();

  // ── 月間枠のチェック（第30便）───────────────────────────────
  // ★ 写真の取得に成功したかどうかで消費する枠が変わるので、
  //   「写真ありのつもりが読み込めなかった」場合は text 枠を使う（下で kind を確定させる）。
  //   ここでは希望どおりに枠が残っているかだけを先に見る。
  const quota = await loadQuota(svc, salonId);
  if (useImage && quota.imageUsed >= quota.imageLimit) {
    // 画像枠が尽きていても文章枠が残っていれば、写真なしで作れることを案内する。
    const hint = quota.textUsed < quota.textLimit
      ? '「プロフィール写真も見て書く」のチェックを外せば、文章のみの枠で作成できます。'
      : '来月1日に回数がリセットされます。';
    return {
      ok: false,
      error: `今月の写真ありの作成回数（${quota.imageLimit}回）を使い切りました。${hint}`,
      quota,
    };
  }
  if (!useImage && quota.textUsed >= quota.textLimit) {
    return {
      ok: false,
      error: `今月の作成回数（${quota.textLimit}回）を使い切りました。来月1日にリセットされます。`,
      quota,
    };
  }

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

    // 短い → 理由を添えて作り直す。
    retryReason =
      `前回の紹介文は${parsed.profileText.replace(/\s/g, '').length}文字で短すぎました。` +
      `${MIN_PROFILE_LEN}文字以上になるよう、容姿・雰囲気・人柄の描写を厚くして書き直してください。`;
  }

  // 失敗した回は記録しない＝枠を消費しない（オーナー確定のルール）。
  if (!last) return { ok: false, error: 'AIが下書きを作れませんでした。もう一度試してください', quota };

  // ★ 消費する枠は「実際に写真を渡せたか」で決める。写真ありのつもりでも
  //   画像が読めなかったときは文章のみの生成なので text 枠を使う。
  const kind: 'text' | 'image' = hasImage ? 'image' : 'text';
  const { error: logErr } = await svc.from('ai_copy_usage').insert({
    salon_id: salonId,
    therapist_id: Number(therapistId),
    kind,
    api_calls: tries,
  });
  // 記録に失敗しても下書きは返す（店舗の作業を止めない）。枠の取りこぼしは許容する。
  if (logErr) console.error('[therapistCopy] usage log failed:', logErr.message);

  const after: QuotaState = {
    ...quota,
    textUsed:  quota.textUsed  + (kind === 'text'  && !logErr ? 1 : 0),
    imageUsed: quota.imageUsed + (kind === 'image' && !logErr ? 1 : 0),
  };

  return {
    ok: true,
    catchphrase: last.catchphrase,
    profileText: last.profileText,
    tries,
    short: !isLongEnough(last.profileText),
    usedImage: hasImage,
    quota: after,
  };
}
