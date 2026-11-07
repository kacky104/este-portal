import type { createServiceClient } from '@/app/lib/supabase/service';
import { computeMediaLinkAlerts } from '@/app/lib/media/linkAlerts';
import { stallKey, storeShowsStall } from '@/lib/stallDigest';
import type { MediaLinkAlert } from '@/lib/mediaLinkStall';

// 店舗様の画面に「止まっています」を出すのは、運営にメールが届いてから3時間後（第1767便・2026-11-07）。
//
// ★ 決まりそのものは lib/stallDigest.ts の storeShowsStall（STALL_STORE_HOLD_HOURS）。
// ★ 運営向けの見張り（stallOverview → stall-watch のメール）は computeMediaLinkAlerts をそのまま使う（★ こちらで隠さない）。
// ★ 'use server' ではない（呼ぶのは権限を確かめた server action だけ）。

type Svc = ReturnType<typeof createServiceClient>;

/** その店の「運営にメールを出した時刻」。★ 読めなかったら null（＝隠さずに今までどおり出す） */
export async function loadStoreStallHold(svc: Svc, salonId: number): Promise<Map<string, string | null> | null> {
  try {
    const { data, error } = await svc.from('ops_stall_alerts').select('key, alerted_at').eq('salon_id', salonId);
    if (error) {
      console.error('[storeStallHold] 読めなかった（今までどおりすぐ出す）', salonId, error.message);
      return null;
    }
    const m = new Map<string, string | null>();
    for (const r of (data ?? []) as Array<{ key: unknown; alerted_at: unknown }>) {
      m.set(String(r.key), r.alerted_at == null ? null : String(r.alerted_at));
    }
    return m;
  } catch (e) {
    console.error('[storeStallHold] 読んでいる途中で落ちた（今までどおりすぐ出す）', salonId, e instanceof Error ? e.message : e);
    return null;
  }
}

/** 店舗様の画面の赤い帯（コネックエフ・フクエスリンク・マイページ）。メールから3時間たったものだけ */
export async function computeStoreLinkAlerts(
  svc: Svc,
  salonId: number,
): Promise<{ ok: true; data: MediaLinkAlert[] } | { ok: false; error: string }> {
  const [r, hold] = await Promise.all([computeMediaLinkAlerts(svc, salonId), loadStoreStallHold(svc, salonId)]);
  if (!r.ok) return r;
  const nowMs = Date.now();
  return {
    ok: true,
    data: r.data.filter((a) =>
      storeShowsStall(stallKey({ watch: a.watch, salonId, provider: a.provider, slot: a.slot, reason: a.reason }), hold, nowMs),
    ),
  };
}
