import { createPublicClient } from '@/app/lib/supabase/public';
import { getBusinessDateJST, getScheduleWindowStatus } from '@/lib/dutyStatus';
import { seededWeightedShuffle, thirtyMinSeed } from '@/lib/shuffle'; // ★ タイムラインのおすすめと同じ30分シャッフル
import { buildDisplayHours } from '@/lib/scheduleFormat';

// ★★ 第1001便（2026-09-30・カッキーさん）: fukuX タイムラインの上に出す「今日出勤のセラピスト」の帯。
// ★ データは本体の therapist_schedules（今日の営業日・出勤あり）＋ therapists（公開中・掲載中の店舗）。新しい入力は要らない。
// ★ 行き先: fukuX のアカウントがあれば fukuX のプロフィール、無ければフクエスのセラピストページ。
// ★ 第1007便（カッキーさん決定）: 出すのは【いま出勤中の子だけ】。並びは【30分ごとに変わるランダム】（同じ30分の間は固定＝リロードで暴れない）。最大100人。
export type OnDutyTherapist = {
  id: number;
  name: string;
  salonName: string;
  imageUrl: string | null;
  hours: string;          // 例 "12:00〜22:00"
  onDutyNow: boolean;     // いま出勤中か（false＝これから）
  href: string;           // 行き先
  xHandle: string | null; // fukuX があれば @ID
};

const LIMIT = 100;

export async function fetchOnDutyTherapists(): Promise<OnDutyTherapist[]> {
  const supabase = createPublicClient();
  const today = getBusinessDateJST();

  const { data: sched } = await supabase
    .from('therapist_schedules')
    .select('therapist_id, start_time, end_time')
    .eq('schedule_date', today)
    .eq('is_active', true)
    .limit(500);
  const rows = (sched ?? []) as { therapist_id: number; start_time: string | null; end_time: string | null }[];
  if (rows.length === 0) return [];

  // いま出勤中の子だけ（これから・終わった子は外す）→ 30分ごとのランダム並び
  const onDuty = rows
    .map((r) => {
      const start = r.start_time ? String(r.start_time).slice(0, 5) : null;
      const end = r.end_time ? String(r.end_time).slice(0, 5) : null;
      const status = getScheduleWindowStatus(start, end);
      return { id: Number(r.therapist_id), start, end, status };
    })
    .filter((r) => r.status === 'onDuty')
    .sort((a, b) => a.id - b.id); // ★ シャッフル前の並びを固定（DB の返す順に左右されない）
  if (onDuty.length === 0) return [];
  const picked = seededWeightedShuffle(onDuty, thirtyMinSeed(), () => 1.0);

  const ids = picked.map((r) => r.id);
  const { data: ths } = await supabase
    .from('therapists')
    .select('id, name, salon_id, profile_image_url, user_id, salons!therapists_salon_id_fkey!inner(id, name, is_hidden)')
    .in('id', ids)
    .eq('is_active', true)
    .eq('salons.is_hidden', false);
  const thMap = new Map<number, { name: string; salonName: string; imageUrl: string | null; userId: string | null }>();
  for (const t of (ths ?? []) as unknown as Array<{ id: number; name: string; profile_image_url: string | null; user_id: string | null; salons: { name: string } | { name: string }[] | null }>) {
    const s = Array.isArray(t.salons) ? t.salons[0] : t.salons;
    thMap.set(Number(t.id), { name: t.name ?? '', salonName: s?.name ?? '', imageUrl: t.profile_image_url ?? null, userId: t.user_id ?? null });
  }

  // fukuX のアカウント（あれば @ID）
  const userIds = [...new Set([...thMap.values()].map((t) => t.userId).filter((v): v is string => !!v))];
  const handleByUser = new Map<string, string>();
  if (userIds.length > 0) {
    const { data: xs } = await supabase
      .from('x_profiles')
      .select('auth_user_id, handle, status, kind')
      .in('auth_user_id', userIds)
      .eq('kind', 'therapist')
      .eq('status', 'approved');
    for (const x of (xs ?? []) as { auth_user_id: string; handle: string | null }[]) {
      if (x.handle) handleByUser.set(x.auth_user_id, x.handle);
    }
  }

  const out: OnDutyTherapist[] = [];
  for (const r of picked) {
    const t = thMap.get(r.id);
    if (!t) continue; // 非公開・非表示店舗
    const xHandle = t.userId ? handleByUser.get(t.userId) ?? null : null;
    out.push({
      id: r.id,
      name: t.name,
      salonName: t.salonName,
      imageUrl: t.imageUrl,
      hours: buildDisplayHours(r.start, r.end),
      onDutyNow: r.status === 'onDuty',
      href: xHandle ? `/x/u/${encodeURIComponent(xHandle)}` : `/therapist/${r.id}`,
      xHandle,
    });
    if (out.length >= LIMIT) break;
  }
  return out;
}

// ★ 第1194便（2026-10-05・カッキーさん）: 帯の見出しの右端に出す「セラピスト総数」。
//   ★ フクエスTOPの数字の帯（第959便「福岡セラピスト ◯人」）・/therapists と同じ条件＝在籍中（is_active）・非表示でない店。
//   ★ 件数だけ数える（head:true＝行は取らない）。★ 実数のみ。読めなかったときは null（＝画面に出さない。0人と書かない）。
export async function fetchTherapistTotal(): Promise<number | null> {
  const supabase = createPublicClient();
  const { count, error } = await supabase
    .from('therapists')
    .select('id, salons!therapists_salon_id_fkey!inner(id)', { count: 'exact', head: true })
    .eq('is_active', true)
    .eq('salons.is_hidden', false);
  if (error || typeof count !== 'number') return null;
  return count;
}
