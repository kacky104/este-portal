import type { createServiceClient } from '@/app/lib/supabase/service';
import { fetchImageAsBase64, callClaude, type AnthropicBlock } from './therapistCopyCore';
import { sanitizeBadges } from '@/lib/therapistBadges';
import {
  SYSTEM_PROMPT_BADGE,
  buildBadgeUserPrompt,
  parseBadgeResponse,
  badgesFromNumbers,
  MAX_RETRY_BADGE,
  MAX_PICK,
  type BadgeInput,
} from '@/lib/therapistBadgePrompt';

// ── 特徴バッジの生成本体（第113便・2026-09-03）────────────────────────
//
// ★★★ なぜ作ったか
//   AROMAMay 様（salon_id 12）の101人は、駅ちかの取り込みで作られたのでバッジが空（[]）。
//   ★ 画面で1人ずつ選ぶと101回。★ 写真は96人ぶん入っている（手で入れていただいた）。
//   → 写真＋年齢＋サイズを見て選ばせる。
//
// ★★★ 数値で決まるものはAIに聞かない（therapistBadgePrompt.badgesFromNumbers）。
//   低身長・高身長・巨乳は body_type から決まる。★ AIは毎回同じ答えを返さないので、
//   そこに混ぜると点検で固定できなくなる。★ 決まるものは決めてから、AIの答えと合わせる。
//
// ★★ 保存はしない。呼び出し側（運営ルート）の責任。
//   ★ 「空の子だけ」の判定も呼び出し側。★ ここは1人ぶんを組み立てるだけ。
//
// ⚠ ANTHROPIC_API_KEY はサーバー専用。クライアントから import しないこと。

const MAX_TOKENS_BADGE = 300;

type Svc = ReturnType<typeof createServiceClient>;

export type BadgeResult =
  | { ok: true; badges: string[]; fromNumbers: string[]; fromAI: string[]; tries: number; usedImage: boolean }
  | { ok: false; error: string };

/**
 * セラピスト1人分のバッジを選ぶ。DBへの保存はしない。
 * 素材はここで引き直す（呼び出し側から渡された値は信用しない）。
 */
export async function generateBadgesForTherapist(
  svc: Svc,
  salonId: number,
  therapistId: number,
  useImage: boolean,
): Promise<BadgeResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, error: 'AI機能が未設定です（管理者にお問い合わせください）' };

  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, name, age, body_type, profile_image_url, profile_images')
    .eq('id', therapistId)
    .maybeSingle();
  if (tErr || !t) return { ok: false, error: 'セラピストが見つかりません' };
  if (Number(t.salon_id) !== Number(salonId)) return { ok: false, error: '対象セラピストが不正です' };

  const { data: salon } = await svc.from('salons').select('name').eq('id', salonId).maybeSingle();

  const bodyType = (t.body_type as string | null) ?? null;

  // ★★★ 先に数値で決まるぶんを出す。★ AIが落ちてもここは残る
  const fromNumbers = badgesFromNumbers(bodyType);

  const input: BadgeInput = {
    name: String(t.name ?? ''),
    age: (t.age as string | null) ?? null,
    bodyType,
    salonName: (salon?.name as string | undefined) ?? null,
  };

  // 写真は1枚目だけ（copyCore と同じ考え方。複数枚渡しても判断は良くならない）
  let image: { mediaType: string; data: string } | null = null;
  if (useImage) {
    const imgs = Array.isArray(t.profile_images)
      ? (t.profile_images as unknown[]).filter((u): u is string => typeof u === 'string' && !!u)
      : [];
    const first = imgs[0] ?? ((t.profile_image_url as string | null) ?? null);
    if (first) image = await fetchImageAsBase64(first);
  }
  const hasImage = image !== null;

  // ★★ 写真もサイズも無いなら叩かない。★ 材料ゼロで選ばせると当てずっぽうになる
  if (!hasImage && !bodyType) {
    return { ok: false, error: '写真もサイズも無いため、判断する材料がありません' };
  }

  let fromAI: string[] | null = null;
  let tries = 0;
  let retryReason: string | undefined;

  for (let i = 0; i <= MAX_RETRY_BADGE; i++) {
    tries++;
    const blocks: AnthropicBlock[] = [];
    if (image) {
      blocks.push({
        type: 'image',
        source: { type: 'base64', media_type: image.mediaType, data: image.data },
      });
    }
    blocks.push({ type: 'text', text: buildBadgeUserPrompt(input, { hasImage, retryReason }) });

    const r = await callClaude(apiKey, blocks, SYSTEM_PROMPT_BADGE, MAX_TOKENS_BADGE);
    if ('error' in r) {
      // ★ 1回目で通信・認証エラーなら諦める。★ 数値ぶんだけで返さない
      //   （AIが動いていないのに「選びました」と見えるのを避ける）
      return { ok: false, error: r.error };
    }

    const parsed = parseBadgeResponse(r.text);
    if (parsed) { fromAI = parsed; break; }
    retryReason = '前回の出力がJSON形式ではありませんでした。指定のJSONだけを返してください。';
  }

  if (fromAI === null) return { ok: false, error: 'AIの返答を読み取れませんでした' };

  // ★★★ 数値ぶんを先に置く。★ sanitizeBadges が並べ替えと上限6の切り詰めをする。
  //   ★ 知らない語（AIが作った語）はここで落ちる。★ 語彙を持つ場所を増やさない。
  const badges = sanitizeBadges([...fromNumbers, ...fromAI]);

  return {
    ok: true,
    badges,
    fromNumbers,
    // ★ AIが返した生の語も返す。★ 落ちた語を運営が目で見られるようにする
    fromAI,
    tries,
    usedImage: hasImage,
  };
}

/** ★ 画面・記録に出す用。★ 上限を1か所から出す（プロンプトと同じ値） */
export const BADGE_MAX_PICK = MAX_PICK;
