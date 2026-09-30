import { NextResponse } from 'next/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getBusinessDateJST, getScheduleWindowStatus, getNowJSTMinutes } from '@/lib/dutyStatus';
import { buildDisplayHours } from '@/lib/scheduleFormat';
import { fetchFukuesOgp } from '@/app/x/xOgp';

// ★★ 第1004便（2026-09-30・カッキーさん）: fukuX に「本日出勤のセラピスト」を運営（@fukues_info）名義で自動投稿する周。
//   POST /api/admin/x-onduty-post  (Authorization: Bearer <CRON_SECRET>)
//   body: { apply?: boolean; slot?: '12' | '18' }
//
// ★ 何を出すか（カッキーさん決定・2026-09-30）
//   ・写真4枚: 【出勤中＋これから出勤する子】から4人（写真がある子だけ）。★ 終わった子は外す。
//     ★ ランダムではなく日ごと・回ごとにずらして順番に回す（20時出勤の子も 18:05 の回で載る）。
//   ・本文: 「本日は N人 が出勤予定（HH:MM現在 M人が出勤中）」＋載せた4人の名前と出勤時間＋フクエスの出勤一覧へのリンク。
//   ・時刻: 12:05 と 18:05（JST）。キリのよい時刻から外して、他の自動投稿と重ねない。
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
const PICK = 4;
const LIST_URL = 'https://fukues.com/therapists';

function jstHHMM(): string {
  const m = getNowJSTMinutes();
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
function jstDateLabel(businessDate: string): string {
  const [, mm, dd] = businessDate.split('-');
  return `${Number(mm)}月${Number(dd)}日`;
}
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

  // 重複防止: 同じ日・同じ回の投稿がすでにあるか（本文の先頭行で判定）
  const head = `本日出勤のセラピスト（${jstDateLabel(today)}・${slot}時の回）`;
  const { data: dup } = await svc
    .from('x_posts')
    .select('id')
    .eq('author_profile_id', official.id)
    .like('body', `${head}%`)
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
    .select('id, name, profile_image_url, salons!therapists_salon_id_fkey!inner(is_hidden)')
    .in('id', rows.map((r) => r.id))
    .eq('is_active', true)
    .eq('salons.is_hidden', false);
  const pub = new Map<number, { name: string; image: string | null }>();
  for (const t of (ths ?? []) as unknown as { id: number; name: string; profile_image_url: string | null }[]) {
    pub.set(Number(t.id), { name: t.name ?? '', image: t.profile_image_url ?? null });
  }
  const visible = rows.filter((r) => pub.has(r.id));
  const totalToday = visible.length;           // 本日の出勤予定（終わった子も含む）
  const onDutyNow = visible.filter((r) => r.status === 'onDuty').length;
  // ★ 写真に載せる候補: 出勤中＋これから出勤（終わった子は外す）・写真がある子だけ
  const candidates = visible
    .filter((r) => (r.status === 'onDuty' || r.status === 'before') && !!pub.get(r.id)?.image)
    .sort((a, b) => a.id - b.id);
  if (totalToday === 0) return NextResponse.json({ ok: true, skipped: 'no_schedule', slot, today });
  if (candidates.length === 0) return NextResponse.json({ ok: true, skipped: 'no_photo', slot, today, totalToday, onDutyNow });

  const off = rotationOffset(today, slot, candidates.length);
  const picked = Array.from({ length: Math.min(PICK, candidates.length) }, (_, i) => candidates[(off + i) % candidates.length]);

  const now = jstHHMM();
  const lines = picked.map((r) => `${pub.get(r.id)!.name} ${buildDisplayHours(r.start, r.end)}`);
  const bodyText =
    `${head}\n` +
    `本日は ${totalToday}人 が出勤予定（${now}現在 ${onDutyNow}人が出勤中）🌸\n` +
    `写真: ${lines.join(' ／ ')}\n` +
    `▶ 出勤一覧はこちら`;
  const images = picked.map((r) => pub.get(r.id)!.image!);

  if (!apply) {
    return NextResponse.json({ ok: true, dryRun: true, slot, today, totalToday, onDutyNow, picked: picked.map((r) => ({ id: r.id, name: pub.get(r.id)!.name, hours: buildDisplayHours(r.start, r.end) })), body: bodyText, images });
  }

  // 投稿（運営名義・service_role）。リンクは fukues.com なので OGP カードも付ける（失敗しても投稿は成立）
  const ogp = await fetchFukuesOgp(LIST_URL).catch(() => null);
  const { data: inserted, error } = await svc
    .from('x_posts')
    .insert({
      author_profile_id: official.id,
      body: bodyText,
      images,
      link_url: LIST_URL,
      link_image: ogp?.image ?? null,
      link_title: ogp?.title ?? null,
      link_description: ogp?.description ?? null,
    })
    .select('id')
    .single();
  if (error || !inserted) {
    console.error('[x-onduty-post] 投稿できなかった', error?.message);
    return NextResponse.json({ ok: false, error: error?.message ?? 'insert failed' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, slot, today, postId: String(inserted.id), totalToday, onDutyNow, picked: picked.map((r) => r.id) });
}
