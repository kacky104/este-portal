import { areaLabel } from '@/app/lib/areaLabel';

// ランキング表示用：地域＋区分のテキスト。スラッシュの両隣に半角スペースを入れて読みやすく。
// 例：「博多駅周辺 / メンズエステ / ルーム（個室）」、出張専門は「博多駅周辺 / 出張専門」。
export function salonMetaText(
  area: string | null,
  area2: string | null,
  dispatchType: 'none' | 'available' | 'only',
): string {
  const parts: string[] = [];
  if (area) parts.push(areaLabel(area));
  if (area2) parts.push(areaLabel(area2));
  if (dispatchType === 'only') parts.push('出張専門');
  else { parts.push('メンズエステ'); parts.push('ルーム（個室）'); }
  return parts.join(' / ');
}
