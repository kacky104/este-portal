import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { shouldPostXWeekly, xAnnounceBody, xWeeklyLabel } from '@/lib/xAnnounceWeekly';

// ★★ 第1189便（2026-10-05・カッキーさん）: お店のお知らせ（新着情報）を、週に1回、そのお店のフクエックスの店舗アカウントへ自動投稿する周。
//   POST /api/admin/x-announce-weekly  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean }
//
// ★ 対象: 「自動投稿」に印の付いた公開中のお知らせがあり（announcements.auto_rotate）、
//   フクエックスの店舗アカウント（オーナーと同じログイン・承認済みの kind='shop'）を開設しているお店すべて。
//   ★ 店舗様の設定は無い。★ 印を全部外せば、そのお店は止まる。
// ★ 何を出すか: 印の付いたお知らせを、週ごとに1本ずつ順番に（並びは created_at 昇順 → id 昇順＝毎日の自動投稿と同じ）。
//   本文は手で「fukuX 同時投稿」したときと同じ（題名＋空行＋本文・画像1枚）。★ お店自身の名義で出る。
// ★ いつ: 曜日・時刻はお店ごとにばらばら（店舗IDから決まる・10:00〜21:50）。判断は src/lib/xAnnounceWeekly.ts。
//   ★ 順番（x_rotation_index）と「今週は出した」（x_last_week）は salon_announce_state に持つ（追加SQL_第1189便）。
//     ★ 毎日の自動投稿の順番（rotation_index）とは別に進む。
//   ★★ SQL を流す前は、状態を読めないので【何もしない】（failed に数えるだけ・投稿はしない）。
// ★ apply 既定 false（試し打ち）: 何件やるつもりかだけ返す。
// ★ 知っておくこと: この投稿も、おすすめランキングの「フクエックス投稿の点（1日10点まで）」に数えられる（週に +1）。
//
//   crontab（VPS・10分ごと。★ お店ごとの時刻は10分きざみなので、これより粗くしない）:
//   7-59/10 * * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/x-announce-weekly -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Pick = { id: string; title: string | null; content: string | null; image_url: string | null };

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body なしでも動く */ }
  const apply = body.apply === true;

  const svc = createServiceClient();
  const now = new Date();

  // 「自動投稿」に印の付いた、公開中のお知らせを持つ店（★ 非表示の店は外す）
  const { data: rows, error } = await svc
    .from('announcements')
    .select('salon_id, salons!inner(id, is_hidden, owner_id)')
    .eq('auto_rotate', true)
    .eq('is_published', true)
    .eq('salons.is_hidden', false);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  const ownerBySalon = new Map<number, string | null>();
  for (const r of (rows ?? []) as unknown as { salon_id: number; salons: { owner_id: string | null } | { owner_id: string | null }[] | null }[]) {
    const s = Array.isArray(r.salons) ? r.salons[0] : r.salons;
    ownerBySalon.set(Number(r.salon_id), s?.owner_id ?? null);
  }
  const salonIds = [...ownerBySalon.keys()].sort((a, b) => a - b);

  // フクエックスの店舗アカウント（オーナーと同じログイン・承認済み）
  const ownerIds = [...new Set([...ownerBySalon.values()].filter((v): v is string => !!v))];
  const profileByOwner = new Map<string, string>();
  if (ownerIds.length > 0) {
    const { data: shops, error: shopErr } = await svc
      .from('x_profiles')
      .select('id, auth_user_id')
      .in('auth_user_id', ownerIds)
      .eq('kind', 'shop')
      .eq('status', 'approved');
    // ★ 読めなかったときは何もしない（「開設していない」と混ぜない）
    if (shopErr) return NextResponse.json({ ok: false, error: shopErr.message }, { status: 500 });
    for (const x of (shops ?? []) as { id: string; auth_user_id: string | null }[]) {
      if (x.auth_user_id && !profileByOwner.has(x.auth_user_id)) profileByOwner.set(x.auth_user_id, String(x.id));
    }
  }

  const posted: string[] = [];
  const skipped: Array<{ salonId: number; why: string }> = [];
  const failed: Array<{ salonId: number; why: string }> = [];

  for (const salonId of salonIds) {
    const owner = ownerBySalon.get(salonId) ?? null;
    const profileId = owner ? profileByOwner.get(owner) : undefined;
    if (!profileId) { skipped.push({ salonId, why: 'no_fukux_shop' }); continue; }

    const { count, error: cntErr } = await svc
      .from('announcements')
      .select('id', { count: 'exact', head: true })
      .eq('salon_id', salonId)
      .eq('auto_rotate', true)
      .eq('is_published', true);
    if (cntErr) { failed.push({ salonId, why: cntErr.message.slice(0, 200) }); continue; }

    // ★★ 状態が読めなかったときは【何もしない】（SQL を流す前もここで止まる）。null として進めると毎周出てしまう
    const { data: state, error: stErr } = await svc
      .from('salon_announce_state')
      .select('x_last_week, x_rotation_index')
      .eq('salon_id', salonId)
      .maybeSingle();
    if (stErr) { failed.push({ salonId, why: stErr.message.slice(0, 200) }); continue; }

    const judged = shouldPostXWeekly({
      now,
      salonId,
      targetCount: count ?? 0,
      lastWeek: (state?.x_last_week as string | null) ?? null,
      rotationIndex: (state?.x_rotation_index as number | null) ?? null,
    });
    if (!judged.post) { skipped.push({ salonId, why: judged.reason }); continue; }
    if (!apply) { posted.push(`${salonId}#${judged.index}`); continue; }

    // 順番の位置の1本だけを取り出す（★ 並びは毎日の自動投稿と同じ: created_at 昇順 → id 昇順）
    const { data: picked, error: pickErr } = await svc
      .from('announcements')
      .select('id, title, content, image_url')
      .eq('salon_id', salonId)
      .eq('auto_rotate', true)
      .eq('is_published', true)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(judged.index, judged.index);
    if (pickErr) { failed.push({ salonId, why: pickErr.message.slice(0, 200) }); continue; }
    const pick = ((picked ?? []) as Pick[])[0];
    if (!pick) { failed.push({ salonId, why: '順番の位置のお知らせが見つかりません（数えた直後に変わった可能性）' }); continue; }

    const text = xAnnounceBody(pick.title, pick.content);
    const images = pick.image_url ? [pick.image_url] : [];
    if (text.length === 0 && images.length === 0) { failed.push({ salonId, why: '投稿する中身がありません' }); continue; }

    // ★★ 先に「今週は出した」を記録してから投稿する。
    //   ★ 逆（投稿 → 記録）だと、記録に失敗したとき10分ごとに同じ投稿がお店の名義で出続ける。
    //   ★ こちらの順なら、投稿に失敗しても「その週は出ない」で済む（failed に数える）。
    const { error: stateErr } = await svc
      .from('salon_announce_state')
      .upsert({ salon_id: salonId, x_last_week: judged.weekKey, x_rotation_index: judged.index, updated_at: now.toISOString() }, { onConflict: 'salon_id' });
    if (stateErr) { failed.push({ salonId, why: '記録に失敗（投稿していません）: ' + stateErr.message.slice(0, 150) }); continue; }

    const { error: insErr } = await svc
      .from('x_posts')
      .insert({ author_profile_id: profileId, body: text || null, images });
    if (insErr) {
      console.error('[x-announce-weekly] 投稿できなかった', salonId, insErr.message);
      failed.push({ salonId, why: '投稿に失敗（今週は出ません）: ' + insErr.message.slice(0, 150) });
      continue;
    }
    posted.push(`${salonId}#${judged.index}`);
  }

  return NextResponse.json({
    ok: true,
    apply,
    salons: salonIds.length,
    posted: posted.length,
    failed: failed.length,
    detail: {
      posted, failed, skipped,
      // ★ 参考: この周が見た店の曜日・時刻（保存していないので、ここで計算して見せる）
      times: salonIds.map((id) => ({ salonId: id, at: xWeeklyLabel(id) })),
    },
  });
}
