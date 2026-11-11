'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE } from '@/lib/setPlan';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';
import { normalizeBumpTimes } from '@/lib/ekichikaBump';
import {
  ANNOUNCE_SCHEDULE_DAILY_LIMIT, ANNOUNCE_SCHEDULE_DEFAULT,
  announceSchedulePerDay, validateAnnounceSchedule, type AnnounceScheduleSetting,
} from '@/lib/announceSchedule';
import type { ConecfBumpSlot } from '@/app/actions/conecfBump';

// コネックエフ「フクエスお知らせ」の自動投稿の時刻（第1965便・2026-11-12・カッキーさん）。
// ★ 判断は src/lib/announceSchedule.ts（自己点検あり）。ここは DB を読んで渡し、結果のとおりに書くだけ。
// ★ 表は conecf_announce_schedule（追加SQL_第1965便）。表が無いあいだは ready=false（画面は「準備中」）。
// ★ 画面の部品は上位表示と同じ ScheduleEditor なので、返す形も ConecfBumpSlot に合わせる。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function resolve(write: boolean) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false as const, error: 'ログインが必要です' };
  const svc = createServiceClient();
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id, conecf_enabled_at, crm_until'), user.id, actingId)
    .limit(1).maybeSingle();
  if (!salon) return { ok: false as const, error: '店舗情報が見つかりません' };
  if (write && !salon.conecf_enabled_at) return { ok: false as const, error: '保存するには、ホームで「コネックエフに切り替える」を押してください' };
  if (write && isConecfStopped({ conecfEnabledAt: salon.conecf_enabled_at as string | null, crmUntil: (salon.crm_until as string | null) ?? null }, getCalendarDateJST())) {
    return { ok: false as const, error: CONECF_STOPPED_MESSAGE };
  }
  return { ok: true as const, svc, salonId: Number(salon.id) };
}

/** 朝6時区切りの「今日」のはじまり（ISO）。announcePost.ts と同じ切り方 */
function dayStartISO(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 3600_000 - 6 * 3600_000);
  return new Date(`${jst.toISOString().slice(0, 10)}T06:00:00+09:00`).toISOString();
}

export async function getAnnounceSchedule(): Promise<Result<{ ready: boolean; slot: ConecfBumpSlot; targetCount: number | null }>> {
  const r = await resolve(false);
  if (!r.ok) return r;
  const now = new Date();
  const [sch, used, st, cnt] = await Promise.all([
    r.svc.from('conecf_announce_schedule').select('enabled, start_min, end_min, interval_min, times').eq('salon_id', r.salonId).maybeSingle(),
    r.svc.from('salon_rank_events').select('id', { count: 'exact', head: true }).eq('salon_id', r.salonId).in('kind', ['announce_manual', 'announce_auto']).gte('created_at', dayStartISO(now)),
    r.svc.from('salon_announce_state').select('last_bump_at').eq('salon_id', r.salonId).maybeSingle(),
    r.svc.from('announcements').select('id', { count: 'exact', head: true }).eq('salon_id', r.salonId).eq('auto_rotate', true).eq('is_published', true),
  ]);
  const row = sch.error ? null : sch.data;
  const usedToday = used.error ? null : (used.count ?? 0);
  return {
    ok: true,
    data: {
      ready: !sch.error,
      targetCount: cnt.error ? null : (cnt.count ?? 0),
      slot: {
        slot: 1, hasCredential: true, linkOff: false, area: null,
        enabled: row?.enabled === true,
        startMin: Number(row?.start_min ?? ANNOUNCE_SCHEDULE_DEFAULT.startMin),
        endMin: Number(row?.end_min ?? ANNOUNCE_SCHEDULE_DEFAULT.endMin),
        intervalMin: Number(row?.interval_min ?? ANNOUNCE_SCHEDULE_DEFAULT.intervalMin),
        times: normalizeBumpTimes(row?.times), timesReady: !sch.error,
        lastAt: st.error ? null : ((st.data?.last_bump_at as string | null) ?? null),
        remaining: usedToday === null ? null : Math.max(0, ANNOUNCE_SCHEDULE_DAILY_LIMIT - usedToday),
        quota: ANNOUNCE_SCHEDULE_DAILY_LIMIT, readAt: now.toISOString(), countStale: false, resetMin: 360,
      },
    },
  };
}

export async function saveAnnounceSchedule(input: { enabled: boolean; startMin: number; endMin: number; intervalMin: number; times?: number[] }): Promise<Result<{ perDay: number }>> {
  const r = await resolve(true);
  if (!r.ok) return r;
  // ★ times を渡さなかったとき（止める・始めるだけ）は、いまの時刻指定を残す
  let times: number[] | null;
  if (input.times !== undefined) {
    times = normalizeBumpTimes(input.times);
  } else {
    const cur = await r.svc.from('conecf_announce_schedule').select('times').eq('salon_id', r.salonId).maybeSingle();
    if (cur.error) return { ok: false, error: '保存できませんでした（運営事務局までご連絡ください）' };
    times = normalizeBumpTimes(cur.data?.times);
  }
  const setting: AnnounceScheduleSetting = { enabled: input.enabled === true, startMin: Number(input.startMin), endMin: Number(input.endMin), intervalMin: Number(input.intervalMin), times };
  const bad = validateAnnounceSchedule(setting);
  if (bad) return { ok: false, error: bad };
  const nowIso = new Date().toISOString();
  // ★ slot_done_at ＝ 保存した時刻。いまの回は出さず、次の回から（保存した瞬間に1本出てしまわないように）
  const { error } = await r.svc.from('conecf_announce_schedule').upsert({
    salon_id: r.salonId, enabled: setting.enabled, start_min: setting.startMin, end_min: setting.endMin, interval_min: setting.intervalMin,
    times: setting.times, slot_done_at: nowIso, updated_at: nowIso,
  }, { onConflict: 'salon_id' });
  if (error) return { ok: false, error: '保存できませんでした（運営事務局までご連絡ください）' };
  return { ok: true, data: { perDay: announceSchedulePerDay(setting) } };
}
