'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { computeMediaLinkAlerts } from '@/app/lib/media/linkAlerts';
import type { MediaLinkAlert } from '@/lib/mediaLinkStall';

// フクエスリンク（/mypage/media）の外枠が最初に要るものを【1回】で返す（第1120便・2026-10-03）。
//
// ★ もとは毎ページ、useMediaGate（ログイン＋店）／MediaShell（店の conecf_enabled_at ＋ 赤帯＝ログイン＋店＋4〜5本）を
//   別々に読んでいた（約12本）。★ ここではログイン1回＋店1回で決め、赤帯は同じ店 id でそのまま計算する（権限確認を二重にしない）。
// ★ 店の選び方は useMediaGate と同じ：非表示でない店を先に、id の若い順で1件。★ 複数店舗の切り替えは作らない。
// ★ 赤帯は読めなければ空（★ 画面は止めない。警告が出せないことを「異常なし」と見せないだけ）。
// ★ コネックエフの getConecfShellState（第1117便）と同じ作り。

export type MediaShellState =
  | {
      ok: true;
      userId: string;
      email: string;
      /** ★ 店が無ければ null（★ 画面は「店舗情報が見つかりません」を出す） */
      salon: { id: number; name: string | null; conecfEnabledAt: string | null } | null;
      alerts: MediaLinkAlert[];
    }
  | { ok: false; reason: 'login' };

export async function getMediaShellState(): Promise<MediaShellState> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'login' };
  const email = user.email ?? '';

  // ★ 店は本人の権限（RLS）で読む（★ useMediaGate と同じ引き方・.single() を使わない理由も同じ）
  const { data: salon } = await supabase
    .from('salons')
    .select('id, name, conecf_enabled_at')
    .eq('owner_id', user.id)
    .order('is_hidden', { ascending: true })
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!salon) return { ok: true, userId: user.id, email, salon: null, alerts: [] };

  const salonId = Number(salon.id);
  const alerts = await computeMediaLinkAlerts(createServiceClient(), salonId)
    .then((r) => (r.ok ? r.data : []))
    .catch(() => [] as MediaLinkAlert[]);
  return {
    ok: true,
    userId: user.id,
    email,
    salon: { id: salonId, name: (salon.name as string | null) ?? null, conecfEnabledAt: (salon.conecf_enabled_at as string | null) ?? null },
    alerts,
  };
}
