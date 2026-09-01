// 写メ日記の巡回の心拍を刻む（第100便）。
//
// ★★★ ここが「新着が無かった」と「止まっている」を分ける唯一の場所。
//   ★ 取り込めた記録（salon_diary_imports）は【新着があった周】にしか増えない。
//   ★ だから、新着が無くても必ず新しくなる時刻を別に持つ（salon_diary_watch）。
//
// ★★ 2か所から刻む。★ どちらか片方だけにしないこと（片方だけだと原因が絞れない）:
//   stampDiaryQueued … 巡回の口がジョブを積めたとき（/api/admin/diary-import）
//   stampDiaryListed … 駅ちかの一覧を読み終えたとき（relayFlow の planDiaryList）
//
// ★★★ 心拍が刻めなくても本筋を止めない。★ ただし黙らない（console に残す）。
//   ★ 見張りのために取り込みを止めるのは本末転倒（第98便「印のために本体を止めない」と同じ）。

import { createServiceClient } from '@/app/lib/supabase/service';

type Where = { salonId: number; provider: string; slot: number };

/** ★ last_note に長い文や秘密が入らないようにする。★ 画面にも出しうる場所なので短く切る。 */
function shortNote(note: string | null | undefined): string | null {
  if (typeof note !== 'string') return null;
  const t = note.trim();
  return t === '' ? null : t.slice(0, 200);
}

async function stamp(where: Where, patch: Record<string, string | null>): Promise<void> {
  try {
    const supabase = createServiceClient();
    const { error } = await supabase.from('salon_diary_watch').upsert(
      {
        salon_id: where.salonId,
        provider: where.provider,
        slot: where.slot,
        ...patch,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'salon_id,provider,slot' },
    );
    // ★ 心拍が刻めなくても取り込みは続ける。★ ただし黙らない
    if (error) console.error('[diary] 巡回の心拍を刻めなかった', where.salonId, error.message);
  } catch (e) {
    console.error('[diary] 巡回の心拍を刻めなかった', where.salonId, String((e as Error).message).slice(0, 120));
  }
}

/**
 * 巡回の口がジョブを積めた。
 * ★★ 積む【前】ではなく、積めた【後】に呼ぶこと。
 *   ★ 前に呼ぶと、積めていないのに心拍だけ新しくなる＝止まりが見えなくなる。
 */
export async function stampDiaryQueued(where: Where): Promise<void> {
  await stamp(where, { queued_at: new Date().toISOString() });
}

/**
 * 駅ちかの一覧を読み終えた。
 * ★★★ 新着が【無くても】呼ぶこと。★ ここが「見に行けた」の唯一の証拠。
 *   ★ 「取り込めたときだけ呼ぶ」形にすると、この表を作った意味が無くなる。
 */
export async function stampDiaryListed(where: Where, note?: string | null): Promise<void> {
  await stamp(where, { listed_at: new Date().toISOString(), last_note: shortNote(note) });
}
