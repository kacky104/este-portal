// 予約の電話通知（第1703便）: 画面でもサーバーでも使う小さな道具（node の機能を使わない）。

// 数字だけにして、0 始まり 10〜11 桁だけ受け付ける。フリーダイヤル・ナビダイヤルなど、こちらからかけられない番号は不可。
const NG_PREFIXES = ['0120', '0800', '0570', '0180', '0990'];
export function normalizeCallTel(raw: string | null | undefined): string | null {
  const d = String(raw ?? '').replace(/[^0-9]/g, '');
  if (!/^0[0-9]{9,10}$/.test(d)) return null;
  if (NG_PREFIXES.some((p) => d.startsWith(p))) return null;
  return d;
}

/** 090-1234-5678／050-1234-5678／092-123-4567 の形に（見せるだけ）。 */
export function formatCallTel(tel: string | null | undefined): string {
  const d = String(tel ?? '').replace(/[^0-9]/g, '');
  if (/^0[5789]0\d{8}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (/^0\d{9}$/.test(d)) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return d;
}

/** +815012345678 → 050-1234-5678 */
export function formatE164Jp(e164: string | null | undefined): string {
  const s = String(e164 ?? '');
  return s.startsWith('+81') ? formatCallTel('0' + s.slice(3)) : s;
}

/** 時間帯の選択肢（30分刻み）。'' は「指定しない」。 */
export const CALL_HOUR_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`,
);
