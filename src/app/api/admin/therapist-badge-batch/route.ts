import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { generateBadgesForTherapist } from '@/app/lib/therapistBadgeCore';
import { parseAdminBody, truthy, num } from '@/lib/adminBody';
import { tallyBadges } from '@/lib/therapistBadgePrompt';

// ── 運営用: 特徴バッジの一括生成（第113便・2026-09-03）────────────────
//
// 写真とサイズを見て、フクエスの語彙から特徴バッジを選んで入れる。
// きっかけ: AROMAMay（salon_id=12）の101人が、駅ちかの取り込みで作られたためバッジが空（[]）。
//
//   POST /api/admin/therapist-badge-batch  (Authorization: Bearer <CRON_SECRET>)
//     salonId       対象店舗（必須）
//     therapistId?  ★ 1人だけ試す
//     limit?        1回で処理する人数（既定3・最大10）
//     apply?        true で DB に保存。既定 false（試し打ち＝選んで返すだけ）
//     useImage?     写真も見る（既定 true）
//     tally?        ★ 数えるだけ（AIを叩かない・保存しない・API キーも要らない）
//
// ★★★ 数える口（第114便・2026-09-03）
//   -d salonId=12 -d tally=true  … いま入っているバッジの分布を返す。
//   ★ 第113便は【流し切ってから】偏りに気づいた（スレンダー59%）。
//     ★ 数えるのを毎回 SQL でやると、忙しい日に数えなくなる。→ 口にした。
//   ★ 試し打ち（apply なし）の返事にも「今回の分布」を入れてある。
//     ★★ 試し打ちは保存しないので、この分布は tally では出てこない。★ その場で見る。
//
// ★★★ フォーム形式で渡すこと（2026-09-03 実測）。★ JSON も受けるが PowerShell からは渡せない。
//   ★ PowerShell 5.1 が ssh.exe へ渡すときに JSON の " を落とし、`invalid json` になる。
//   ★ work-flow の口と同じ形に揃えた（第109便からの実績がある形）:
//     curl ... -d salonId=12 -d limit=1
//     curl ... -d salonId=12 -d limit=3 -d apply=true
//
// ★★★ 守り（ここが本体）
//   ① 対象は【バッジが空の子だけ】。★ null でも [] でも空として扱う。
//      ★ 2026-09-03 に実測: この列は default '[]'::jsonb らしく、新しい行は null ではなく []。
//        ★ `is null` だけで書くと **1人も対象にならず、黙って素通りする**。
//   ② 保存は jsonb。★ この列は text[] ではない（HANDOVER-22 の記述は誤り・2026-09-03 実測）。
//   ③ 既定は apply=false（試し打ち）。★ まず目で見てから流す。
//   ④ 知らない語は sanitizeBadges が落とす（generateBadgesForTherapist の中）。
//
// ★ Vercel の実行上限が60秒なので、1回では全員を処理できない。
//   remaining が 0 になるまで繰り返す。★ 保存済みの人は対象から外れるので続きから再開できる。
//
// ★ 利用ログは by_admin=true・kind は 'badge_image' / 'badge_text'。
//   ★ 紹介文の 'image' / 'text' に混ぜない（20260903_ai_copy_usage_badge.sql）。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

type Row = {
  id: number;
  name: string | null;
  body_type: string | null;
  feature_badges: unknown;
  profile_image_url: string | null;
  profile_images: unknown;
};

/**
 * ★★★ バッジが空か。★ null と [] の【両方】を空として扱う。
 *   ★ ここを `is null` だけにすると、default '[]' の行が1つも当たらない（2026-09-03 実測）。
 */
function isEmptyBadges(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (Array.isArray(v)) return v.filter(Boolean).length === 0;
  // ★ 配列でも null でもない値が入っていたら、空と決めつけない（触らない側に倒す）
  return false;
}

/** 判断する材料（写真かサイズ）を持っているか。 */
function hasMaterial(r: Row): boolean {
  const imgs = Array.isArray(r.profile_images) ? r.profile_images.filter(Boolean) : [];
  return imgs.length > 0 || !!r.profile_image_url || !!r.body_type;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  // ★★★ フォーム形式・JSON・クエリ文字列のどれでも受ける（adminBody.parseAdminBody）
  const body = parseAdminBody(await req.text(), req.url);
  if (body === null)
    return NextResponse.json({ ok: false, error: '本文を読み取れませんでした（JSONのつもりなら形が壊れています）' }, { status: 400 });

  // ★★ 数えるだけなら AI を使わない。★ キーが無くても数えられる（確認の口を止めない）
  const tallyOnly = truthy(body.tally);
  if (!tallyOnly && !process.env.ANTHROPIC_API_KEY)
    return NextResponse.json({ ok: false, error: 'ANTHROPIC_API_KEY is not set' }, { status: 500 });

  const salonId = num(body.salonId);
  if (salonId === null) return NextResponse.json({ ok: false, error: 'salonId が不正です' }, { status: 400 });

  const onlyId = body.therapistId != null ? num(body.therapistId) : null;
  if (body.therapistId != null && onlyId === null)
    return NextResponse.json({ ok: false, error: 'therapistId が不正です' }, { status: 400 });

  const limitRaw = num(body.limit);
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw ?? DEFAULT_LIMIT));
  const apply = truthy(body.apply);
  // ★ 書いていなければ true（写真を見る）。★ はっきり false と書いたときだけ止める
  const useImage = body.useImage == null ? true : truthy(body.useImage);

  const svc = createServiceClient();

  const { data: salon } = await svc.from('salons').select('name').eq('id', salonId).maybeSingle();
  if (!salon) return NextResponse.json({ ok: false, error: '店舗が見つかりません' }, { status: 404 });

  const { data: rows, error } = await svc
    .from('therapists')
    .select('id, name, body_type, feature_badges, profile_image_url, profile_images')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const all = (rows ?? []) as Row[];

  // ★★★ 対象＝「バッジが空」かつ「材料がある」人。★ 既に入っている子は触らない
  const empty = all.filter((r) => isEmptyBadges(r.feature_badges));
  const targets = empty.filter(hasMaterial);
  const skippedNoMaterial = empty.length - targets.length;

  // ★★★ 数えるだけ（tally=true）。★ ここで返す＝AIを1回も叩かない・1行も書かない
  if (tallyOnly) {
    return NextResponse.json(
      {
        ok: true,
        salon: salon.name,
        数えただけ: true,
        在籍: all.length,
        バッジが空: empty.length,
        分布: tallyBadges(all.map((r) => r.feature_badges)),
      },
      { headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }

  // ★ 1人だけ試す口。★ 対象外なら理由を返して止まる（黙って別の人を処理しない）
  let batch: Row[];
  if (onlyId !== null) {
    const one = all.find((r) => Number(r.id) === onlyId);
    if (!one) return NextResponse.json({ ok: false, error: 'そのセラピストはこの店舗に居ません（または非公開）' }, { status: 404 });
    if (!isEmptyBadges(one.feature_badges))
      return NextResponse.json({ ok: false, error: 'そのセラピストには既にバッジが入っています（触りません）' }, { status: 409 });
    if (!hasMaterial(one))
      return NextResponse.json({ ok: false, error: '写真もサイズも無いため、判断する材料がありません' }, { status: 409 });
    batch = [one];
  } else {
    batch = targets.slice(0, limit);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const t of batch) {
    const gen = await generateBadgesForTherapist(svc, salonId, t.id, useImage);
    if (!gen.ok) {
      results.push({ id: t.id, name: t.name, ok: false, error: gen.error });
      continue;
    }

    // ★ 1個も選べなかった子は保存しない。★ [] を書き戻しても何も変わらない
    if (apply && gen.badges.length > 0) {
      const { error: upErr } = await svc
        .from('therapists')
        // ★★ jsonb。★ text[] ではない（2026-09-03 実測）
        .update({ feature_badges: gen.badges })
        .eq('id', t.id);
      if (upErr) {
        results.push({ id: t.id, name: t.name, ok: false, error: `保存に失敗: ${upErr.message}` });
        continue;
      }
    }

    // ★★ 記録に失敗しても本筋は止めない。★ ただし黙らない（mediaAudit と同じ作法）。
    //   ★ 20260903_ai_copy_usage_badge.sql を流す前は CHECK に弾かれてここが失敗する。
    //     ★ 握りつぶすと「記録が無い＝何もしていない」と見分けがつかなくなる。
    const { error: logErr } = await svc.from('ai_copy_usage').insert({
      salon_id: salonId,
      therapist_id: t.id,
      kind: gen.usedImage ? 'badge_image' : 'badge_text',
      api_calls: gen.tries,
      by_admin: true,
    });
    if (logErr) console.error('[badge-batch] 利用ログを書けなかった', t.id, logErr.message);

    results.push({
      id: t.id,
      name: t.name,
      ok: true,
      saved: apply && gen.badges.length > 0,
      usedImage: gen.usedImage,
      tries: gen.tries,
      // ★ 記録できたか。★ migration 前は false になる（気づけるように返す）
      記録: logErr === null,
      サイズ: t.body_type,
      数値から: gen.fromNumbers,
      AIが選んだ: gen.fromAI,
      // ★ 落ちた語（フクエスの語彙に無い＝AIが作った語）。★ 黙って消さずに見せる
      落ちた語: gen.fromAI.filter((b) => !gen.badges.includes(b)),
      保存する内容: gen.badges,
    });
  }

  if (apply && results.some((r) => r.saved === true)) {
    revalidatePath('/salon/[id]', 'layout');
    revalidatePath('/therapist/[id]', 'layout');
    revalidatePath('/hp/[slug]', 'layout');
  }

  const done = results.filter((r) => r.saved === true).length;
  return NextResponse.json(
    {
      ok: true,
      salon: salon.name,
      apply,
      在籍: all.length,
      バッジが空: empty.length,
      対象: targets.length,
      今回処理: batch.length,
      成功: results.filter((r) => r.ok).length,
      失敗: results.filter((r) => !r.ok).length,
      remaining: Math.max(0, targets.length - done),
      材料なしで対象外: skippedNoMaterial,
      // ★★★ 今回選んだぶんの偏り。★ 試し打ちは保存しないので、ここでしか見られない
      //   ★ 3人では見えない。★ 10人×何回かを見て、同じ語が並んでいたら線引きを疑う
      今回の分布: tallyBadges(results.map((r) => r.保存する内容)),
      results,
    },
    // ★ charset を明示する（第30便・禁則209）。PowerShell 5.1 の文字化け防止
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
