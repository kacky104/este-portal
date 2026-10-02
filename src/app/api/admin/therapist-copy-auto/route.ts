import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { generateCopyForTherapist } from '@/app/lib/therapistCopyCore';
import { MIN_PROFILE_LEN } from '@/lib/therapistCopyPrompt';
import { parseAdminBody, truthy, num } from '@/lib/adminBody';
import { isAutoCopyTarget, copyMaterialBadge, profileTextLen, hasPhotoLookBadge } from '@/lib/badgeTargets';
import { NUMERIC_BADGES } from '@/lib/therapistBadgePrompt';

// ── キャッチフレーズ・紹介文の自動作成（第1104便・2026-10-02・カッキーさん）────────────────
//
// 特徴バッジを自動で付けた方（駅ちかから取り込んだ方）に、写真とスリーサイズからキャッチフレーズと紹介文も作る。
// ★ 運営の口（therapist-copy-batch）は店舗を指定して手で流す。★ こちらは全店舗を見て、VPS の cron から自動で呼ぶ。
// ★ 順番: 先に自動バッジ（therapist-badge-auto）が付く → その方がここで対象になる。
//
//   POST /api/admin/therapist-copy-auto  (Authorization: Bearer <CRON_SECRET>)
//     apply?   true で DB に保存。既定 false（試し打ち＝作って返すだけ・印も付けない）
//     limit?   1回で処理する人数（既定2・最大3。★ 紹介文は作り直しが走ると1人で何回も AI を呼ぶ）
//
// ★★★ 対象（src/lib/badgeTargets.ts の isAutoCopyTarget）
//   ① 公開中（is_active）で、非表示でない店舗の方
//   ② 特徴バッジを自動で付けた方（feature_badges_auto_at が入っている）
//   ③ まだ一度も自動で作っていない（profile_copy_auto_at が null・★ 1人1回だけ）
//   ④ 紹介文が MIN_PROFILE_LEN（150）字未満（★ 店舗様が書いた紹介文は上書きしない）
//   ★ 新しい方から順（id の大きい順）。
//
// ★★★ カッキーさんの決定（2026-10-02）
//   ・バッジが3つ未満（写真が無くて2個の方）でも作る（★ 画面の「3つ以上」の条件は、自動の口では外す）。
//   ・くじで付けた語（ランク・人気／雰囲気・性格／スキル）は文章の材料にしない。★ 材料は外見・タイプのバッジ＋写真＋年齢・サイズ。
//     ★ 写真も外見のバッジも無い方は、年齢とサイズだけから書くことになる（allowNoMaterial）。
//     ★ 試し打ちで「想像で書いた文になる」ことを見たうえでの決め（業界では許容範囲・違うときは店舗様が直す・フクエスリンクに案内あり）。
//   ・★ 第1105便: 写真から外見の語が選ばれなかった方（No photo の画像など）には、写真を見せずに書かせる（無い写真の描写を書かせない）。
//
// ★★★ 保存するもの
//   ・紹介文（profile_text）。★ 保存の直前に見直して、店舗様が書き足していたら触らない。
//   ・キャッチフレーズ（catchphrase）は【空のときだけ】入れる（★ 店舗様が入れたキャッチは残す）。
//   ・profile_copy_auto_at に日時（★ 入っている方は二度と対象にならない）。
//   ★ AI が落ちた方には印を付けない（次の回でもう一度試す）。
//
// ★ Vercel の実行上限が60秒。★ 25秒を過ぎたら新しい人を始めない（残りは次の回）。
// ★ 利用ログは by_admin=true・kind は 'image' / 'text'（運営の口と同じ・店舗の月間枠は使わない）。
// ★ 列 profile_copy_auto_at は 追加SQL_第1104便_紹介文の自動作成の印_2026-10-02.sql。流す前は「列が無い」と返して止まる。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_LIMIT = 2;
const MAX_LIMIT = 3;
const BUDGET_MS = 25_000;

type Row = {
  id: number;
  salon_id: number | null;
  name: string | null;
  catchphrase: string | null;
  profile_text: string | null;
  feature_badges: unknown;
  feature_badges_auto_at: string | null;
  profile_copy_auto_at: string | null;
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

  // 1. 自動でバッジを付けた・まだ紹介文を自動で作っていない・公開中の方を、新しい順に読む
  const { data, error } = await svc
    .from('therapists')
    .select('id, salon_id, name, catchphrase, profile_text, feature_badges, feature_badges_auto_at, profile_copy_auto_at, salons!therapists_salon_id_fkey!inner(name, is_hidden)')
    .eq('is_active', true)
    .not('feature_badges_auto_at', 'is', null)
    .is('profile_copy_auto_at', null)
    .eq('salons.is_hidden', false)
    .order('id', { ascending: false })
    .limit(1000);
  if (error) {
    const missing = /profile_copy_auto_at|feature_badges_auto_at/.test(error.message);
    return json({
      ok: false,
      error: missing
        ? '印の列がありません。追加SQL_第1104便_紹介文の自動作成の印_2026-10-02.sql（と第1098便の SQL）を流してください'
        : error.message,
    }, 500);
  }
  const rows = (data ?? []) as unknown as Row[];
  const targets = rows.filter((r) => isAutoCopyTarget(r, MIN_PROFILE_LEN));
  // ★ 自動バッジは付いたが、紹介文がもう十分ある方（店舗様が書いた）。★ 触らない人数として返す
  const alreadyWritten = rows.length - targets.length;

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

    // ★★ 第1105便: 写真から外見の語が1つも選ばれなかった方（＝人物が写っていない画像・No photo など）には、写真を見せない。
    //   ★ 見せると「柔らかな笑みを浮かべた写真が印象的」のように、写っていない写真の描写を書く（試し打ちで実測）。
    const showPhoto = hasPhotoLookBadge(t.feature_badges, NUMERIC_BADGES);
    const gen = await generateCopyForTherapist(svc, salonId, Number(t.id), showPhoto, {
      badgeFilter: copyMaterialBadge,   // ★ くじで付けた語は材料にしない（外見・タイプだけ）
      minBadges: 0,                     // ★ 3つ未満でも作る
      allowNoMaterial: true,            // ★ 写真も外見のバッジも無い方も作る（年齢・サイズだけ）
    });
    if (!gen.ok) {
      // ★ 印を付けない＝次の回でもう一度試す
      failed++;
      results.push({ ...base, ok: false, error: gen.error });
      continue;
    }

    let didSave = false;
    let note: string | null = null;
    let keptCatch = false;
    if (apply) {
      // ★★ 直前にもう一度見る（★ 作っている間に店舗様が紹介文を書いていたら触らない）
      const { data: now } = await svc.from('therapists').select('catchphrase, profile_text, profile_copy_auto_at').eq('id', t.id).maybeSingle();
      if (!now || now.profile_copy_auto_at !== null || profileTextLen(now.profile_text) >= MIN_PROFILE_LEN) {
        note = '直前に紹介文が入っていた（または印が付いていた）ので触りませんでした';
      } else {
        const patch: Record<string, unknown> = {
          profile_text: gen.profileText,
          profile_copy_auto_at: new Date().toISOString(),
        };
        // ★ キャッチは空のときだけ入れる（店舗様が入れたキャッチは残す）。★ 上限16字は運営の口と同じ
        const hasCatch = typeof now.catchphrase === 'string' && now.catchphrase.trim() !== '';
        if (hasCatch) keptCatch = true;
        else if (gen.catchphrase) patch.catchphrase = gen.catchphrase.slice(0, 16);
        const { error: upErr } = await svc.from('therapists').update(patch).eq('id', t.id).is('profile_copy_auto_at', null);
        if (upErr) {
          failed++;
          results.push({ ...base, ok: false, error: `保存に失敗: ${upErr.message}` });
          continue;
        }
        didSave = true;
        saved++;
      }
    }

    // 利用ログ（運営実行なので店舗の枠は消費しない）。★ 失敗しても本筋は止めないが、黙らない
    const { error: logErr } = await svc.from('ai_copy_usage').insert({
      salon_id: salonId,
      therapist_id: t.id,
      kind: gen.usedImage ? 'image' : 'text',
      api_calls: gen.tries,
      by_admin: true,
    });
    if (logErr) console.error('[copy-auto] 利用ログを書けなかった', t.id, logErr.message);

    results.push({
      ...base,
      ok: true,
      saved: didSave,
      ...(note ? { 注意: note } : {}),
      ...(keptCatch ? { キャッチ: '店舗様のキャッチを残しました' } : {}),
      usedImage: gen.usedImage,
      材料にしたバッジ: gen.materialBadges,
      tries: gen.tries,
      catchDropped: gen.catchDropped,
      禁止語が残った: gen.forbiddenLeft,
      beforeLen: profileTextLen(t.profile_text),
      afterLen: profileTextLen(gen.profileText),
      catchphrase: gen.catchphrase,
      profileText: gen.profileText,
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
    紹介文が十分あるので触らない: alreadyWritten,
    今回処理: results.length,
    保存: saved,
    失敗: failed,
    // ★ 試し打ちでは印を付けないので、remaining は減らない
    remaining: targets.length - saved,
    時間切れ: timedOut,
    results,
  });
}
