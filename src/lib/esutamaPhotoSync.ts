// ───────── ★★★ エステ魂の写真を、登録のあとからコネックエフに合わせる（第434便・2026-09-17）─────────
// ★ 純粋関数だけ。通信も DB も触らない（★ 番人 check:esutamaphotosync）。
//
// ★★ 実測で分かったエステ魂の作法（設計メモ_エステ魂の写真をあとから変える_2026-09-17.md）
//   ・写真は枠1〜6に【前から詰めて】並ぶ（★ 追加はいちばん小さい空き枠・第245便）
//   ・消すのは保存に `delete_photo[photoN]=1` を足す（★ ×ボタンの JS を読んだ）→ 後ろの写真が前へ詰まる（★ 実測1）
//   ・並べ替えのボタンは無い → 順番を直すときは【ずれた所から後ろを消して、コネックエフの順に入れ直す】
//
// ★★ 決めごと（駅ちか 第426・428便と同じ考え方）
//   ・触ってよいのは【コネックエフから送った記録のある写真】だけ
//   ・消し直す範囲にエステ魂にしか無い写真（記録なし）があれば、写真は合わせない（★ 消さない）
//   ・コネックエフで減らした写真を消すのは、押す前の確認で「消して更新」を選んだときだけ

export const ESUTAMA_SYNC_MAX = 6;

/** ★ 写真の見分け（★ URL の違い・?t= などに左右されないよう therapist-photos/<path> にそろえる） */
export function photoKey(s: string | null | undefined): string {
  const v = String(s ?? '').trim();
  if (!v) return '';
  const i = v.indexOf('therapist-photos/');
  return i >= 0 ? v.slice(i).split('?')[0].split('#')[0] : v.split('?')[0];
}

export type EsutamaSyncPlan =
  | { kind: 'noop' }
  /** 消し直す範囲に、記録の無い写真がある（★ 触らない） */
  | { kind: 'kept'; slots: number[] }
  /** コネックエフで減らした写真を消すことになるが、消す許可が無い */
  | { kind: 'blocked_remove'; slots: number[] }
  /** 枠が前から詰まっていない・仮置きのまま（★ 想定と違うので触らない） */
  | { kind: 'not_packed'; detail: string }
  /** keep 枚はそのまま・deleteSlots を消す・want[keep..] を順に足す */
  | { kind: 'sync'; keep: number; deleteSlots: number[]; addFrom: number; addCount: number };

export function planEsutamaPhotoSync(input: {
  slots: Array<{ slot: number; state: 'empty' | 'saved' | 'pending' }>;
  want: string[];
  had: Record<number, string>;
  allowRemove: boolean;
}): EsutamaSyncPlan {
  const slots = [...input.slots].sort((a, b) => a.slot - b.slot);
  if (slots.some((s) => s.state === 'pending')) return { kind: 'not_packed', detail: '仮置きのままの枠がある' };
  const filled = slots.filter((s) => s.state === 'saved').map((s) => s.slot);
  const k = filled.length;
  if (filled.some((s, i) => s !== i + 1)) return { kind: 'not_packed', detail: '写真の枠が前から詰まっていない（' + filled.join(',') + '）' };
  const want = input.want.map(photoKey).filter(Boolean).slice(0, ESUTAMA_SYNC_MAX);
  const had = (n: number) => photoKey(input.had[n]);

  let i = 0;
  while (i < k && i < want.length && had(i + 1) && had(i + 1) === want[i]) i++;
  const tail: number[] = [];
  for (let n = i + 1; n <= k; n++) tail.push(n);
  const unrecorded = tail.filter((n) => !had(n));
  if (unrecorded.length > 0) return { kind: 'kept', slots: unrecorded };
  const notInWant = tail.filter((n) => !want.includes(had(n)));
  if (notInWant.length > 0 && !input.allowRemove) return { kind: 'blocked_remove', slots: notInWant };
  const addCount = Math.max(0, want.length - i);
  if (tail.length === 0 && addCount === 0) return { kind: 'noop' };
  return { kind: 'sync', keep: i, deleteSlots: tail, addFrom: i, addCount };
}

/** ★ 押す前の確認に出す「エステ魂から消える写真」（★ 記録があり、コネックエフの写真に無いもの） */
export function esutamaRemovalSlots(want: string[], had: Record<number, string>): number[] {
  const w = want.map(photoKey).filter(Boolean).slice(0, ESUTAMA_SYNC_MAX);
  return Object.entries(had).map(([n, v]) => [Number(n), photoKey(v)] as const).filter(([, v]) => v && !w.includes(v)).map(([n]) => n).sort((a, b) => a - b);
}

/** ★ 画面の×ボタンから、枠 → 消すときの名前（data-delete_col・実測 photoN）を読む */
export function readEsutamaDeleteCols(html: string): Record<number, string> {
  const out: Record<number, string> = {};
  const re = /<a\b[^>]*class\s*=\s*["'][^"']*tmp_photo__cancel[^"']*["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(String(html ?? ''))) !== null) {
    const tg = /data-tg\s*=\s*["']cast_icon_(\d)["']/i.exec(m[0])?.[1];
    const col = /data-delete_col\s*=\s*["']([a-z0-9_]{1,20})["']/i.exec(m[0])?.[1];
    if (tg && col) out[Number(tg)] = col;
  }
  return out;
}
