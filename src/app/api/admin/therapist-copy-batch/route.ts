import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServiceClient } from '@/app/lib/supabase/service';
import { generateCopyForTherapist } from '@/app/lib/therapistCopyCore';
import { MIN_PROFILE_LEN } from '@/lib/therapistCopyPrompt';
import { parseAdminBody, truthy, num } from '@/lib/adminBody';
import { tallyPhrases, allSharedPhrases } from '@/lib/therapistCopyTally';

// ── 運営用: セラピスト紹介文の一括生成（第30便・2026-08-24）────────────
// 店舗の紹介文がまとめて短い・薄いときに、運営が一括で作り直すためのルート。
// 初出のきっかけ: アイリス（salon_id=3）134名の紹介文が平均47〜75字と短かったため。
//
//   POST /api/admin/therapist-copy-batch  (Authorization: Bearer <CRON_SECRET>)
//
// ★★★ 叩き方（第120便でフォーム形式に揃えた・2026-09-03）
//   curl ... -d salonId=12 -d limit=3            … 試し打ち（保存しない）
//   curl ... -d salonId=12 -d therapistId=483    … 1人だけ試す
//   curl ... -d salonId=12 -d limit=5 -d apply=true
//   ★★ それまで req.json() だけだったので、PowerShell → ssh → bash → curl の道では
//     JSON の " が落ちて【必ず invalid json】になっていた（引き継ぎメモ 作法 3-10）。
//     ★ 逃がし方で直さない。★ 動いている形（work-flow / badge-batch）に揃えるのが正解。
//   ★ JSON もクエリ文字列も引き続き受ける（adminBody.parseAdminBody）。
//
//   受け取る値:
//     salonId       対象店舗（必須）
//     therapistId?  ★ 1人だけ試す。★ 指定すると limit は無視する
//     limit?        1回で処理する人数（既定3・最大5）
//     apply?        true で DB に保存。既定 false（試し打ち＝生成して返すだけ）
//     minLen?       この字数未満の紹介文だけ対象にする（既定 MIN_PROFILE_LEN=150）
//     useImage?     写真も見て書く（既定 true）
//
// ★ Vercel の実行上限が60秒なので、1回では全員を処理できない。
//   「まだ残っている人数（remaining）」を返すので、呼び出し側で 0 になるまで繰り返す。
//   途中で落ちても、保存済みの人は次回の対象から外れるので続きから再開できる。
//
// ★ 対象の条件（素材ゼロには当てない）:
//   - 紹介文が minLen 未満（既に十分な人は触らない）
//   - 写真かバッジのどちらかがある（年齢・サイズだけでは当たり障りのない文章にしかならない）
//
// ★ 利用ログは by_admin=true で記録する＝店舗の月間枠を消費しない。

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 5;

type Row = {
  id: number;
  name: string | null;
  profile_text: string | null;
  feature_badges: unknown;
  profile_image_url: string | null;
  profile_images: unknown;
};

/** 素材（写真かバッジ）を持っているか。 */
function hasMaterial(r: Row): boolean {
  const badges = Array.isArray(r.feature_badges) ? r.feature_badges.filter(Boolean) : [];
  const imgs = Array.isArray(r.profile_images) ? r.profile_images.filter(Boolean) : [];
  return badges.length > 0 || imgs.length > 0 || !!r.profile_image_url;
}

/** 空白を除いた字数。 */
function len(s: string | null): number {
  return (s ?? '').replace(/\s/g, '').length;
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

  // ★ 1人だけ試す口。★ 読めない値は 0 と混ぜずに弾く
  const onlyId = body.therapistId != null ? num(body.therapistId) : null;
  if (body.therapistId != null && onlyId === null)
    return NextResponse.json({ ok: false, error: 'therapistId が不正です' }, { status: 400 });

  const limitRaw = num(body.limit);
  const limit = Math.min(MAX_LIMIT, Math.max(1, limitRaw ?? DEFAULT_LIMIT));
  const apply = truthy(body.apply);
  const minLen = num(body.minLen) ?? MIN_PROFILE_LEN;
  // ★ 書いていなければ true（写真を見る）。★ はっきり false と書いたときだけ止める
  const useImage = body.useImage == null ? true : truthy(body.useImage);

  const svc = createServiceClient();

  const { data: salon } = await svc.from('salons').select('name').eq('id', salonId).maybeSingle();
  if (!salon) return NextResponse.json({ ok: false, error: '店舗が見つかりません' }, { status: 404 });

  const { data: rows, error } = await svc
    .from('therapists')
    .select('id, name, profile_text, feature_badges, profile_image_url, profile_images')
    .eq('salon_id', salonId)
    .eq('is_active', true)
    .order('id', { ascending: true });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const all = (rows ?? []) as Row[];
  // 対象＝「紹介文が短い」かつ「素材がある」人。
  const targets = all.filter((r) => len(r.profile_text) < minLen && hasMaterial(r));
  // 素材が無くて手を付けられない人は、件数だけ返して気づけるようにする。
  const skippedNoMaterial = all.filter((r) => len(r.profile_text) < minLen && !hasMaterial(r)).length;

  // ★★★ 数えるだけ（tally=true）。★ ここで返す＝AIを1回も叩かない・1行も書かない
  //   ★ 返事の1行目（数えただけ:true）が、新しいコードが動いている証拠にもなる（第114便）
  if (tallyOnly) {
    const t = tallyPhrases(all.map((r) => r.profile_text));
    return NextResponse.json(
      {
        ok: true,
        salon: salon.name,
        数えただけ: true,
        在籍: all.length,
        紹介文が短い: all.filter((r) => len(r.profile_text) < minLen).length,
        ...t,
        全員に出た言い回し: allSharedPhrases(t),
      },
      { headers: { 'content-type': 'application/json; charset=utf-8' } },
    );
  }

  // ★ 1人だけ試す口。★ 対象外なら理由を返して止まる（黙って別の人を処理しない）
  let batch: Row[];
  if (onlyId !== null) {
    const one = all.find((r) => Number(r.id) === onlyId);
    if (!one)
      return NextResponse.json({ ok: false, error: 'そのセラピストはこの店舗に居ません（または非公開）' }, { status: 404 });
    if (len(one.profile_text) >= minLen)
      return NextResponse.json(
        { ok: false, error: `そのセラピストの紹介文は既に ${len(one.profile_text)} 字あります（minLen=${minLen}・触りません）` },
        { status: 409 },
      );
    if (!hasMaterial(one))
      return NextResponse.json({ ok: false, error: '写真もバッジも無いため、書く材料がありません' }, { status: 409 });
    batch = [one];
  } else {
    batch = targets.slice(0, limit);
  }

  const results: Array<Record<string, unknown>> = [];

  for (const t of batch) {
    const gen = await generateCopyForTherapist(svc, salonId, t.id, useImage);
    if (!gen.ok) {
      results.push({ id: t.id, name: t.name, ok: false, error: gen.error });
      continue;
    }

    if (apply) {
      const { error: upErr } = await svc
        .from('therapists')
        .update({
          catchphrase: gen.catchphrase ? gen.catchphrase.slice(0, 16) : null,
          profile_text: gen.profileText,
        })
        .eq('id', t.id);
      if (upErr) {
        results.push({ id: t.id, name: t.name, ok: false, error: `保存に失敗: ${upErr.message}` });
        continue;
      }
    }

    // 利用ログ（運営実行なので店舗の枠は消費しない）。
    await svc.from('ai_copy_usage').insert({
      salon_id: salonId,
      therapist_id: t.id,
      kind: gen.usedImage ? 'image' : 'text',
      api_calls: gen.tries,
      by_admin: true,
    });

    results.push({
      id: t.id,
      name: t.name,
      ok: true,
      saved: apply,
      usedImage: gen.usedImage,
      tries: gen.tries,
      beforeLen: len(t.profile_text),
      afterLen: len(gen.profileText),
      catchphrase: gen.catchphrase,
      profileText: gen.profileText,
    });
  }

  // 保存したぶんだけ公開ページを無効化する（試し打ちのときは触らない）。
  //
  // ★★ 第31便で修正: 実URL指定（`/salon/${salonId}`・`/therapist/${id}`）は【効かない】。
  //   Next 16.2.9 では generateStaticParams を空配列にした動的ページに対し、
  //   実URLの revalidatePath が 'layout'・'page'・型無しの全てで効かない（第25便の実測）。
  //   このサイトは全ページがその作りなので、ルート雛形指定に揃える必要がある。
  //   第30便の初版は実URL指定のままで、一括生成しても即時反映されていなかった。
  //   ingest ルート（/api/import/ingest）と同じ書き方に統一する。
  //   紹介文は公式HP（/hp/[slug]）にも出るので、そちらも無効化する。
  if (apply && results.some((r) => r.ok)) {
    revalidatePath('/salon/[id]', 'layout');
    revalidatePath('/therapist/[id]', 'layout');
    revalidatePath('/hp/[slug]', 'layout');
  }

  const done = apply ? results.filter((r) => r.ok).length : 0;

  // ★★★ 今回書いたぶんの偏りを、その場で数える（第114便の作法）。
  //   ★ 試し打ちは保存しないので tally では出てこない。★ ここで見るしかない。
  //   ★★ 3人とも同じ言い回しなら、相手の性質ではなく【こちらのプロンプト】を疑う。
  const 今回 = tallyPhrases(results.filter((r) => r.ok).map((r) => r.profileText as string));
  return NextResponse.json(
    {
      ok: true,
      salon: salon.name,
      apply,
      在籍: all.length,
      今回処理: batch.length,
      成功: results.filter((r) => r.ok).length,
      失敗: results.filter((r) => !r.ok).length,
      // apply=false のときは保存していないので remaining は減らない（試し打ちの目安として返す）。
      remaining: Math.max(0, targets.length - done),
      素材なしで対象外: skippedNoMaterial,
      今回の頻出: 今回.頻出,
      // ★ 全員に出た言い回しがあれば名指しで返す。★ 黙って通さない
      今回全員に出た言い回し: allSharedPhrases(今回),
      results,
    },
    // ★ charset を明示する（第30便・禁則209）。
    //   これが無いと Windows PowerShell 5.1 の Invoke-RestMethod が
    //   UTF-8 を ISO-8859-1 として読み、日本語が全部文字化けする。
    { headers: { 'content-type': 'application/json; charset=utf-8' } },
  );
}
