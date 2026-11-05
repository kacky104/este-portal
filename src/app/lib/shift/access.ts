// シフト提出・シフト管理表を使える店（2026-11-04・カッキーさん「一旦、ラビリンス様だけの運用」）。★ サーバー専用。
//   SHIFT_SALON_IDS に使える店の id をカンマ区切りで入れる（例 `6,12`）。`all` で全店。
//   ★ 無い・空なら【どの店も使えない】（セラピストページのタブ・管理表を出さない）。環境変数の変更は Redeploy が要る。
//   ★ 電話通知の TWILIO_VOICE_SALON_IDS と同じ形（lib/booking/bookingCall.ts）。
// ★ 2026-11-05（カッキーさん「店舗によっては使わないところもあるので選べるように」）: 2段になった。
//   ・SHIFT_SALON_IDS ＝ 運営の外枠（管理表を開ける店。11/5 から all）
//   ・shift_settings.enabled ＝ お店が「使う」にしたか（管理表の上の設定の枠で切り替え・既定オフ）
//   セラピストページの「シフト提出」タブ・提出の受け口・「新しい希望」バッジは、両方そろった店だけ（shiftOnForSalon）。
import type { createServiceClient } from '@/app/lib/supabase/service';

type Svc = ReturnType<typeof createServiceClient>;

export function shiftAllowedForSalon(salonId: number | null | undefined): boolean {
  if (salonId == null) return false;
  const raw = (process.env.SHIFT_SALON_IDS ?? '').trim();
  if (!raw) return false;
  if (raw.toLowerCase() === 'all') return true;
  return raw.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0).includes(Number(salonId));
}

/** お店が「シフト提出を使う」にしているか（★ 列が無い・読めないときはオフ扱い＝タブを出さない） */
export async function readShiftEnabled(svc: Svc, salonId: number): Promise<boolean> {
  try {
    const { data, error } = await svc.from('shift_settings').select('enabled').eq('salon_id', salonId).maybeSingle();
    if (error) return false;
    return (data as { enabled?: boolean } | null)?.enabled === true;
  } catch {
    return false;
  }
}

/** 外枠（SHIFT_SALON_IDS）とお店のオン、両方そろっているか */
export async function shiftOnForSalon(svc: Svc, salonId: number | null | undefined): Promise<boolean> {
  if (salonId == null || !shiftAllowedForSalon(salonId)) return false;
  return readShiftEnabled(svc, Number(salonId));
}
