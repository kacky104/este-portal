// シフト提出・シフト管理表を使える店（2026-11-04・カッキーさん「一旦、ラビリンス様だけの運用」）。★ サーバー専用。
//   SHIFT_SALON_IDS に使える店の id をカンマ区切りで入れる（例 `6,12`）。`all` で全店。
//   ★ 無い・空なら【どの店も使えない】（セラピストページのタブ・管理表を出さない）。環境変数の変更は Redeploy が要る。
//   ★ 電話通知の TWILIO_VOICE_SALON_IDS と同じ形（lib/booking/bookingCall.ts）。
export function shiftAllowedForSalon(salonId: number | null | undefined): boolean {
  if (salonId == null) return false;
  const raw = (process.env.SHIFT_SALON_IDS ?? '').trim();
  if (!raw) return false;
  if (raw.toLowerCase() === 'all') return true;
  return raw.split(',').map((x) => Number(x.trim())).filter((n) => Number.isInteger(n) && n > 0).includes(Number(salonId));
}
