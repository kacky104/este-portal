import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getBusinessDateJST, getScheduleWindowStatus, getNowJSTMinutes } from '@/lib/dutyStatus';
import { buildDisplayHours } from '@/lib/scheduleFormat';

// ★★ 第1004便（2026-09-30・カッキーさん）: fukuX に「本日出勤のセラピスト」を運営（@fukues_info）名義で自動投稿する周。
//   POST /api/admin/x-onduty-post  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean; slot?: '12' | '18' }
//
// ★ 何を出すか（カッキーさん決定・2026-09-30）
//   ・写真4枚: 【出勤中＋これから出勤する子】から4人（写真がある子だけ）。★ 終わった子は外す。
//     ★ ランダムではなく日ごと・回ごとにずらして順番に回す（20時出勤の子も 18:05 の回で載る）。
//   ・本文: 「本日は N人 が出勤予定（HH:MM現在 M人が出勤中）」＋写真の順に「①名前（お店）出勤時間」＋フクエスの出勤一覧へのリンク（文字だけ）。
//   ★ リンクカード（OGP のサムネイル）は付けない: 付けると写真4枚よりカードが目立ってしまう（第1005便・実機で確認）。
//   ・時刻: 12:05 と 18:05（JST）。キリのよい時刻から外して、他の自動投稿と重ねない。
// ★★ 第1184便（2026-10-05・カッキーさん）: 写真で紹介するのは【フクエックスの店舗アカウントを開設しているお店】のセラピストだけ。
//   ・開設している＝ salons.owner_id と同じログインの x_profiles（kind='shop'・approved）がある（xLink.ts・おすすめランキングと同じつなぎ方）。
//     ★ 店舗基本設定の「fukuX URL」を手で入れただけのお店は入らない（アカウントが連携していないため）。
//   ・「本日は N人 が出勤予定」の N は今までどおり全店ぶん（★ 紹介する子だけを絞る）。
//   ・「同じお店は1人まで」は【開設しているお店が4つ以上あるとき】に今までどおり効く。
//     ★ 4つ未満のときは、お店ごとに 1人ずつ → 2人ずつ … と均等に足して4人にする（1店だけなら同じ店から4人）。
//   ・開設しているお店に、出勤中・これから出勤で写真のある子が1人もいない回は投稿しない（skipped: 'no_fukux_shop'）。
//     ★ 全店に戻して埋めない（開設しているお店だけを紹介する、という約束を崩さない）。
// ★ 重複防止: 同じ日・同じ回の投稿がすでにあれば何もしない（周が2回動いても1本）。
// ★ 今日の出勤が0人、または写真のある子が0人なら投稿しない。
// ★ apply 既定 false（試し打ち）: 何を投稿するつもりかだけ返す。announce-auto と同じ作法。
//
//   crontab（VPS・JST）:
//   5 12 * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/x-onduty-post -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true,"slot":"12"}' >> /root/import.log 2>&1
//   5 18 * * * set -a; . /root/import.env; /usr/bin/curl -s -X POST https://fukues.com/api/admin/x-onduty-post -H "Authorization: Bearer $CRON_SECRET" -H "Content-Type: application/json" -d '{"apply":true,"slot":"18"}' >> /root/import.log 2>&1
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const OFFICIAL_HANDLE = 'fukues_info';

// ★ 第1020便: お店の名前を短く（「AROMA-May-〜アロマメイ〜」→「AROMA-May」・「Aillis -アイリス-」→「Aillis」・「Mrs.AVANTI〜ミセス・アバンティ〜」→「Mrs.AVANTI」）。
//   「〜」「～」「（」「(」「｜」「|」「【」「 -」より前だけを使い、末尾の「-」「 」「・」を落とす。短くなりすぎたら元の名前。
function shortShopName(name: string): string {
  const cut = name.split(/[〜～（(｜|【]| -/)[0].replace(/[-\s・]+$/, '').trim();
  return cut.length >= 2 ? cut : name;
}
const PICK = 4;
const LIST_URL = 'https://fukues.com/therapists';

// 日ごと・回ごとにずらす先頭位置（同じ子ばかりにならないように）
function rotationOffset(businessDate: string, slot: string, n: number): number {
  if (n === 0) return 0;
  const dayNum = Math.floor(new Date(businessDate + 'T00:00:00Z').getTime() / 86400000);
  return ((dayNum * PICK * 2) + (slot === '18' ? PICK : 0)) % n;
}

export async function POST(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  let body: { apply?: unknown; slot?: unknown } = {};
  try { body = (await req.json()) as typeof body; } catch { /* body なしでも動く */ }
  const apply = body.apply === true;
  const slot = body.slot === '18' ? '18' : body.slot === '12' ? '12' : (getNowJSTMinutes() >= 15 * 60 ? '18' : '12');

  const svc = createServiceClient();
  const today = getBusinessDateJST();

  // 運営アカウント
  const { data: official } = await svc
    .from('x_profiles')
    .select('id, handle, kind, status')
    .eq('handle', OFFICIAL_HANDLE)
    .maybeSingle();
  if (!official || official.kind !== 'official') {
    return NextResponse.json({ ok: false, error: `運営アカウント @${OFFICIAL_HANDLE}（kind=official）が見つかりません` }, { status: 500 });
  }

  // 重複防止: 同じ日・同じ回の投稿がすでにあるか。
  // ★ 第1018便: 本文に日付・回を書かなくなったので、投稿時刻の範囲で判定する。
  //   12時の回＝営業日の 06:00〜15:00（JST）、18時の回＝15:00〜翌06:00。
  const dayStartUtc = new Date(`${today}T06:00:00+09:00`).getTime();
  const winFrom = new Date(slot === '12' ? dayStartUtc : dayStartUtc + 9 * 3600_000).toISOString();
  const winTo = new Date(slot === '12' ? dayStartUtc + 9 * 3600_000 : dayStartUtc + 24 * 3600_000).toISOString();
  const { data: dup } = await svc
    .from('x_posts')
    .select('id')
    .eq('author_profile_id', official.id)
    .like('body', '本日は %人 が出勤予定%')
    .gte('created_at', winFrom)
    .lt('created_at', winTo)
    .limit(1);
  if ((dup ?? []).length > 0) {
    return NextResponse.json({ ok: true, skipped: 'already_posted', slot, today, postId: String(dup![0].id) });
  }

  // 今日の出勤（本体の出勤表）
  const { data: sched } = await svc
    .from('therapist_schedules')
    .select('therapist_id, start_time, end_time')
    .eq('schedule_date', today)
    .eq('is_active', true)
    .limit(1000);
  const rows = ((sched ?? []) as { therapist_id: number; start_time: string | null; end_time: string | null }[])
    .map((r) => {
      const start = r.start_time ? String(r.start_time).slice(0, 5) : null;
      const end = r.end_time ? String(r.end_time).slice(0, 5) : null;
      return { id: Number(r.therapist_id), start, end, status: getScheduleWindowStatus(start, end) };
    })
    .filter((r) => r.status !== 'off');
  if (rows.length === 0) return NextResponse.json({ ok: true, skipped: 'no_schedule', slot, today });

  // 公開中のセラピスト・掲載中の店舗だけ
  const { data: ths } = await svc
    .from('therapists')
    .select('id, name, profile_image_url, user_id, salons!therapists_salon_id_fkey!inner(name, is_hidden, owner_id)')
    .in('id', rows.map((r) => r.id))
    .eq('is_active', true)
    .eq('salons.is_hidden', false);
  const pub = new Map<number, { name: string; shop: string; image: string | null; userId: string | null; ownerId: string | null }>();
  for (const t of (ths ?? []) as unknown as { id: number; name: string; profile_image_url: string | null; user_id: string | null; salons: { name: string; owner_id: string | null } | { name: string; owner_id: string | null }[] | null }[]) {
    const sh = Array.isArray(t.salons) ? t.salons[0] : t.salons;
    pub.set(Number(t.id), { name: t.name ?? '', shop: sh?.name ?? '', image: t.profile_image_url ?? null, userId: t.user_id ?? null, ownerId: sh?.owner_id ?? null });
  }
  const visible = rows.filter((r) => pub.has(r.id));
  const totalToday = visible.length;           // 本日の出勤予定（終わった子も含む）
  const onDutyNow = visible.filter((r) => r.status === 'onDuty').length;
  // ★ 写真に載せる候補: 出勤中＋これから出勤（終わった子は外す）・写真がある子だけ
  const withPhoto = visible
    .filter((r) => (r.status === 'onDuty' || r.status === 'before') && !!pub.get(r.id)?.image)
    .sort((a, b) => a.id - b.id);
  if (totalToday === 0) return NextResponse.json({ ok: true, skipped: 'no_schedule', slot, today });
  if (withPhoto.length === 0) return NextResponse.json({ ok: true, skipped: 'no_photo', slot, today, totalToday, onDutyNow });

  // ★ 第1184便: フクエックスの店舗アカウントを開設しているお店の子だけに絞る（お店のオーナーのログイン＝承認済みの kind='shop'）。
  const ownerIds = [...new Set(withPhoto.map((r) => pub.get(r.id)!.ownerId).filter((v): v is string => !!v))];
  const fukuxOwners = new Set<string>();
  if (ownerIds.length > 0) {
    const { data: shops, error: shopErr } = await svc
      .from('x_profiles')
      .select('auth_user_id')
      .in('auth_user_id', ownerIds)
      .eq('kind', 'shop')
      .eq('status', 'approved');
    if (shopErr) {
      // ★ 読めなかったときは投稿しない（★ 絞れないまま全店から出さない）
      console.error('[x-onduty-post] 店舗アカウントを読めなかった', shopErr.message);
      return NextResponse.json({ ok: false, error: shopErr.message }, { status: 500 });
    }
    for (const x of (shops ?? []) as { auth_user_id: string | null }[]) if (x.auth_user_id) fukuxOwners.add(x.auth_user_id);
  }
  const candidates = withPhoto.filter((r) => {
    const o = pub.get(r.id)!.ownerId;
    return !!o && fukuxOwners.has(o);
  });
  if (candidates.length === 0) return NextResponse.json({ ok: true, skipped: 'no_fukux_shop', slot, today, totalToday, onDutyNow });

  // ★ 第1019便: 「同じお店は1本につき1人まで」。ずらした先頭から順に見て、まだ載せていないお店の子だけ拾う。
  // ★ 第1184便: お店が4つ未満で4人に足りないときは、1店あたりの上限を 1人 → 2人 → … と上げながら同じ順で拾い直す
  //   （お店が4つ以上あれば1周目で4人そろう＝今までと同じ。1店だけなら、ずらした先頭から続けて4人）。
  const off = rotationOffset(today, slot, candidates.length);
  const picked: typeof candidates = [];
  const pickedIds = new Set<number>();
  const perShop = new Map<string, number>();
  for (let cap = 1; cap <= PICK && picked.length < PICK; cap++) {
    for (let i = 0; i < candidates.length && picked.length < PICK; i++) {
      const c = candidates[(off + i) % candidates.length];
      if (pickedIds.has(c.id)) continue;
      const shop = pub.get(c.id)!.shop;
      const n = perShop.get(shop) ?? 0;
      if (n >= cap) continue;
      perShop.set(shop, n + 1);
      pickedIds.add(c.id);
      picked.push(c);
    }
  }
  if (picked.length === 0) return NextResponse.json({ ok: true, skipped: 'no_photo', slot, today, totalToday, onDutyNow });

  const marks = ['①', '②', '③', '④'];
  // ★ 第1020便: スマホで1人1行に収めるため、出勤時間は入れない・お店は短い名前（写真タップで本人ページへ）。
  //   本文は7行＝「続きを読む」（8行超で畳む）にならない。「▶ 出勤一覧」の行は下の fukues.com リンクが同じ役目なので省く。
  const lines = picked.map((r, i) => {
    const t = pub.get(r.id)!;
    return `${marks[i]}${t.name}（${shortShopName(t.shop)}）`;
  });
  const bodyText =
    `本日は ${totalToday}人 が出勤予定🌸\n` +
    `その中の${picked.length}人をピックアップ！\n` +
    `\n` +
    `${lines.join('\n')}`;
  const images = picked.map((r) => pub.get(r.id)!.image!);
  // ★ 第1015便: 写真ごとのリンク先＝その子の fukuX アカウント（無ければフクエスのセラピストページ）
  const userIds = picked.map((r) => pub.get(r.id)!.userId).filter((v): v is string => !!v);
  const handleByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: xs } = await svc
      .from('x_profiles')
      .select('auth_user_id, handle, kind, status')
      .in('auth_user_id', userIds)
      .eq('kind', 'therapist')
      .eq('status', 'approved');
    for (const x of (xs ?? []) as { auth_user_id: string; handle: string | null }[]) if (x.handle) handleByUser.set(x.auth_user_id, x.handle);
  }
  const imageLinks = picked.map((r) => {
    const uid = pub.get(r.id)!.userId;
    const h = uid ? handleByUser.get(uid) : undefined;
    return h ? `/x/u/${encodeURIComponent(h)}` : `/therapist/${r.id}`;
  });

  if (!apply) {
    return NextResponse.json({ ok: true, dryRun: true, slot, today, totalToday, onDutyNow, picked: picked.map((r) => ({ id: r.id, name: pub.get(r.id)!.name, shop: pub.get(r.id)!.shop, hours: buildDisplayHours(r.start, r.end) })), body: bodyText, images, imageLinks });
  }

  // 投稿（運営名義・service_role）。★ リンクカード（link_image/title）は付けない＝文字だけのリンクにして写真を主役に
  const { data: inserted, error } = await svc
    .from('x_posts')
    .insert({
      author_profile_id: official.id,
      body: bodyText,
      images,
      image_links: imageLinks,
      link_url: LIST_URL,
      link_image: null,
      link_title: null,
      link_description: null,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('[x-onduty-post] 投稿できなかった', error?.message);
    return NextResponse.json({ ok: false, error: error?.message ?? 'insert failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, slot, today, postId: String(inserted.id), totalToday, onDutyNow, picked: picked.map((r) => r.id) });
}
