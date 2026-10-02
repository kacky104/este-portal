import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { generateBadgesForTherapist } from '@/app/lib/therapistBadgeCore';
import { parseAdminBody, truthy, num } from '@/lib/adminBody';
import { isAutoBadgeTarget, isEmptyBadges } from '@/lib/badgeTargets';

// ── 特徴バッジの自動選択（第1098便・2026-10-02・カッキーさん）────────────────
//
// 駅ちかから取り込んだセラピストで、バッジが空の方に、写真とサイズから特徴バッジを付ける。
// ★ 運営の口（therapist-badge-batch）は店舗を指定して手で流す。★ こちらは全店舗を見て、VPS の cron から自動で呼ぶ。
//
//   POST /api/admin/therapist-badge-auto  (Authorization: Bearer <CRON_SECRET>)
//     apply?   true で DB に保存。既定 false（試し打ち＝選んで返すだけ・印も付けない）
//     limit?   1回で処理する人数（既定5・最大8）
//
// ★★★ 対象（src/lib/badgeTargets.ts の isAutoBadgeTarget）
//   ① 公開中（is_active）で、非表示でない店舗の方
//   ② 駅ちかの取り込み対象（駅ちかの castId を持っている）
//   ③ バッジが空（★ 店舗様・本人が付けたバッジは上書きしない）
//   ④ まだ一度も自動で選んでいない（feature_badges_auto_at が null）
//   ⑤ 材料（写真かサイズ）がある
//   ★ 新しい方から順に処理する（id の大きい順）。★ 取り込んだばかりの方に先に付く。
//
// ★★★ 1人1回だけ
//   保存するときに feature_badges_auto_at に日時を入れる。★ 選んだ結果が0個でも入れる。
//   ★ 入っている方は二度と対象にならない（店舗様がバッジを全部外した方に、勝手に付け直さない）。
//   ★ AI が落ちた方には入れない（次の回でもう一度試す）。★ 材料が無い方にも入れない（材料が入ってから選ぶ）。
//
// ★★★ 選び方は運営の口と同じ（generateBadgesForTherapist）
//   数値（低身長153未満・高身長165以上・巨乳G以上）＋ AI（写真・髪の色の決まり）＋ ランク・人気のくじ（30%）。
//
// ★ Vercel の実行上限が60秒。★ 40秒を過ぎたら新しい人を始めない（残りは次の回）。
// ★ 利用ログは by_admin=true・kind は 'badge_image' / 'badge_text'（運営の口と同じ・店舗の枠は使わない）。
// ★ 列 feature_badges_auto_at は 追加SQL_第1098便_特徴バッジの自動選択の印_2026-10-02.sql。流す前は「列が無い」と返して止まる。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 8;
const BUDGET_MS = 40_000;
const PAGE = 1000;
const MAX_PAGES = 5;

type Row = {
  id: number;
  salon_id: number | null;
  name: string | null;
  body_type: string | null;
  feature_badges: unknown;
  profile_image_url: string | null;
  profile_images: unknown;
  import_cast_id: string | null;
  feature_badges_auto_at: string | null;
  salons: { name: string | null; is_hidden: boolean | null } | Array<{ name: string | null; is_hidden: boolean | null }> | null;
};

const json = (body: unknown, status = 200) =>
  NextResponse.json(body, { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return json({ ok: false, error: 'CRON_SECRET is not set' }, 500);
  if (req.headers.get('authorization') !== `Bearer ${secret}`) return json({ ok: false, error: 'unauthorized' }, 401);
  if (!process.env.ANTHROPIC_API_KEY) return json({ ok: false, error: 'ANTHROPIC_API_KEY is not set' }, 500);

  const body = parseAdminBody(await req.text(), req.url);
  if (body === null) return json({ ok: false, error: '本文を読み取れませんでした（JSONのつもりなら形が壊れています）' }, 400);
  const apply = truthy(body.apply);
  const limit = Math.min(MAX_LIMIT, Math.max(1, num(body.limit) ?? DEFAULT_LIMIT));

  const startedMs = Date.now();
  const svc = createServiceClient();

  // 1. まだ自動で選んでいない公開中の方を、新しい順に読む（★ 1000件ずつ・最大5回）
  const unmarked: Row[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await svc
      .from('therapists')
      .select('id, salon_id, name, body_type, feature_badges, profile_image_url, profile_images, import_cast_id, feature_badges_auto_at, salons!therapists_salon_id_fkey!inner(name, is_hidden)')
      .eq('is_active', true)
      .is('feature_badges_auto_at', null)
      .eq('salons.is_hidden', false)
      .order('id', { ascending: false })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) {
      const missing = /feature_badges_auto_at/.test(error.message);
      return json({
        ok: false,
        error: missing
          ? '列 feature_badges_auto_at がありません。追加SQL_第1098便_特徴バッジの自動選択の印_2026-10-02.sql を流してください'
          : error.message,
      }, 500);
    }
    const rows = (data ?? []) as unknown as Row[];
    unmarked.push(...rows);
    if (rows.length < PAGE) break;
  }

  // 2. バッジが空の方だけに絞り、駅ちかの castId を持っているかを調べる（旧列 import_cast_id ＋ 新しい表 therapist_media_ids）
  const empties = unmarked.filter((r) => isEmptyBadges(r.feature_badges));
  const withMediaId = new Set<number>();
  const needLookup = empties.filter((r) => !r.import_cast_id).map((r) => Number(r.id));
  for (let i = 0; i < needLookup.length; i += 200) {
    const { data, error } = await svc
      .from('therapist_media_ids')
      .select('therapist_id, external_cast_id')
      .eq('provider', 'ekichika')
      .in('therapist_id', needLookup.slice(i, i + 200));
    if (error) return json({ ok: false, error: 'therapist_media_ids を読めませんでした: ' + error.message }, 500);
    for (const r of data ?? []) if (r.external_cast_id) withMediaId.add(Number(r.therapist_id));
  }

  const targets = empties.filter((r) => isAutoBadgeTarget({
    feature_badges: r.feature_badges,
    body_type: r.body_type,
    profile_image_url: r.profile_image_url,
    profile_images: r.profile_images,
    feature_badges_auto_at: r.feature_badges_auto_at,
    hasCastId: !!r.import_cast_id || withMediaId.has(Number(r.id)),
  }));

  const results: Array<Record<string, unknown>> = [];
  let saved = 0;
  let failed = 0;
  let timedOut = false;

  for (const t of targets.slice(0, limit)) {
    // ★ 60秒の上限に近づいたら、新しい人を始めない（残りは次の回）
    if (Date.now() - startedMs > BUDGET_MS) { timedOut = true; break; }
    const salonId = Number(t.salon_id);
    const rel = Array.isArray(t.salons) ? t.salons[0] : t.salons;
    const base = { id: t.id, name: t.name, 店舗: rel?.name ?? null };

    const gen = await generateBadgesForTherapist(svc, salonId, Number(t.id), true);
    if (!gen.ok) {
      // ★ 印を付けない＝次の回でもう一度試す
      failed++;
      results.push({ ...base, ok: false, error: gen.error });
      continue;
    }

    let didSave = false;
    let note: string | null = null;
    if (apply) {
      // ★★ 直前にもう一度見る（★ 選んでいる間に店舗様がバッジを入れていたら触らない）
      const { data: now } = await svc.from('therapists').select('feature_badges, feature_badges_auto_at').eq('id', t.id).maybeSingle();
      if (!now || now.feature_badges_auto_at !== null || !isEmptyBadges(now.feature_badges)) {
        note = '直前にバッジが入っていた（または印が付いていた）ので触りませんでした';
      } else {
        const patch: Record<string, unknown> = { feature_badges_auto_at: new Date().toISOString() };
        // ★ 1個も選べなかった方は、印だけ付ける（★ [] を書き戻さない）
        if (gen.badges.length > 0) patch.feature_badges = gen.badges;   // ★★ jsonb（text[] ではない）
        const { error: upErr } = await svc.from('therapists').update(patch).eq('id', t.id).is('feature_badges_auto_at', null);
        if (upErr) {
          failed++;
          results.push({ ...base, ok: false, error: `保存に失敗: ${upErr.message}` });
          continue;
        }
        didSave = true;
        saved++;
      }
    }

    // ★★ 記録に失敗しても本筋は止めない。★ ただし黙らない（運営の口と同じ作法）
    const { error: logErr } = await svc.from('ai_copy_usage').insert({
      salon_id: salonId,
      therapist_id: t.id,
      kind: gen.usedImage ? 'badge_image' : 'badge_text',
      api_calls: gen.tries,
      by_admin: true,
    });
    if (logErr) console.error('[badge-auto] 利用ログを書けなかった', t.id, logErr.message);

    results.push({
      ...base,
      ok: true,
      saved: didSave,
      ...(note ? { 注意: note } : {}),
      usedImage: gen.usedImage,
      サイズ: t.body_type,
      くじ: gen.fromRank,
      数値から: gen.fromNumbers,
      AIが選んだ: gen.fromAI,
      髪の色: gen.hair,
      保存する内容: gen.badges,
    });
  }

  if (saved > 0) {
    revalidatePath('/salon/[id]', 'layout');
    revalidatePath('/therapist/[id]', 'layout');
    revalidatePath('/hp/[slug]', 'layout');
  }

  return json({
    ok: true,
    apply,
    対象: targets.length,
    今回処理: results.length,
    保存: saved,
    失敗: failed,
    // ★ 試し打ちでは印を付けないので、remaining は減らない
    remaining: targets.length - saved,
    時間切れ: timedOut,
    results,
  });
}
