'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import {
  announceFingerprint,
  judgeManualPost,
  manualPostMessage,
  shouldAutoPost,
  autoStateMessage,
  rotationCycleMessage,
  autoPostTimeLabel,
} from '@/lib/announceAuto';

// お知らせの手動配信（第68便・設計メモ 追記37 §191 守り3 / §192）。
//
// ★★★ なぜ画面から直に書かせるのをやめたか
//   「再投稿」は published_at を now() にするだけの操作で、画面から直に書けていた。
//     ・押した回数に上限が無い    → フクエスTOPの1枠を1店が押し続けて占有できる
//     ・押した記録が残らない      → 「その日に手動があったか」が誰にも分からない
//   ★ 後者のほうが重い。自動配信のスキップ判定（§192）が**成り立たなくなる**。
//   → 押す口をここ1つにして、押した事実を salon_announce_state に残す。
//
// ★★ 30分の待ちは【同じ本文を押し直したとき】だけ。新しく書いたものは即出す（§191）。
//   ★ 書いたものが出ないのは、オーナー様から見て「壊れている」。
//
// ★ 判定そのものは src/lib/announceAuto.ts の純粋関数（自己点検あり）。
//   ここは【DBを読んで渡し、結果のとおりに書く】だけ。判断をこのファイルに書かない。
//
// ★ 'use server' ファイルは async 関数以外を export できない（Next のビルド時チェック）。

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

// ★ 第500便（カッキーさん）: お知らせは 1日5回まで（朝6時区切り・★ 自動配信も1回に数える）。
//   数えるのは salon_rank_events の announce_manual / announce_auto（フクエスTOPが動いた回）。
//   ★ 新規（画面から直に INSERT）は DB のトリガ announcements_daily_limit_guard が止める。★ 再投稿はここで止める。
//   ★ 表がまだ無い（SQL 前）・読めないときは null ＝ 止めない（今までどおり動かす）。
const ANNOUNCE_DAILY_LIMIT = 5;
const ANNOUNCE_LIMIT_MESSAGE = '本日のお知らせ投稿は5回までです（毎朝6時にリセットされます）';

/** 朝6時区切りの「今日」のはじまり（ISO）。★ salon_bump の bump_day と同じ切り方 */
function announceDayStartISO(now: Date): string {
  const jst = new Date(now.getTime() + 9 * 3600_000 - 6 * 3600_000); // JST から6時間引いた日付が「今日」
  const ymd = jst.toISOString().slice(0, 10);
  return new Date(`${ymd}T06:00:00+09:00`).toISOString();
}

async function countAnnounceToday(svc: ReturnType<typeof createServiceClient>, salonId: number, now: Date): Promise<number | null> {
  const { count, error } = await svc
    .from('salon_rank_events')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId)
    .in('kind', ['announce_manual', 'announce_auto'])
    .gte('created_at', announceDayStartISO(now));
  if (error) return null;
  return count ?? 0;
}

/** その店舗を操作してよいか（オーナー本人・運営）。★ mediaCredentials.ts と同型。 */
async function assertSalonOwner(salonId: number): Promise<Result<{ userId: string }>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };

  const svc = createServiceClient();
  const { data: salon } = await svc.from('salons').select('owner_id').eq('id', salonId).maybeSingle();
  if (!salon) return { ok: false, error: '店舗が見つかりません' };

  const isOwner = (salon.owner_id as string | null) === user.id;
  if (!isOwner && user.id !== ADMIN_UUID) return { ok: false, error: 'この店舗の操作権限がありません' };
  return { ok: true, data: { userId: user.id } };
}

/**
 * 手動でお知らせを出す（再投稿・新規追加のあと）。
 *
 * @param kind 'repost' … 同じお知らせをもう一度出す（★ 押し直しなら30分待つ）
 *             'new'    … いま書いたものを出す（★ 待たせない。行の published_at は既に now）
 *
 * 返すもの:
 *   bumped   フクエスTOPの並びが動いたか
 *   waitMinutes 動かなかったとき、あと何分か
 *   message  そのまま画面に出す文（★ 起きたことを必ず言葉にする）
 */
export async function postAnnouncementManually(input: {
  salonId: string | number;
  announcementId: string;
  kind: 'repost' | 'new';
}): Promise<Result<{ bumped: boolean; waitMinutes: number; message: string }>> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const now = new Date();

  // ★ 出す1本を読む。★ salon_id も条件に入れる（他店のIDを渡されても動かさない）
  const { data: ann, error: annErr } = await svc
    .from('announcements')
    .select('id, title, content, is_published')
    .eq('id', input.announcementId)
    .eq('salon_id', salonId)
    .maybeSingle();
  if (annErr) return { ok: false, error: annErr.message };
  if (!ann) return { ok: false, error: 'お知らせが見つかりません' };
  // ★ 非公開のものは出さない。出しても表に現れないのに「出しました」と言うことになる
  if (ann.is_published !== true) return { ok: false, error: '非公開のお知らせは配信できません' };

  const { data: state, error: stErr } = await svc
    .from('salon_announce_state')
    .select('last_bump_at, last_bump_fingerprint')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (stErr) return { ok: false, error: stErr.message };

  const fingerprint = announceFingerprint(ann.title as string | null, ann.content as string | null);

  // ★★ 新規は必ず出す。行の published_at はもう now なので、判定に掛けない。
  //   （掛けると「30分前に同じ文面を出していた」ときに、書いたばかりのものが出なくなる）
  const judged = input.kind === 'new'
    ? { bumpFukues: true as const, waitMinutes: 0, kind: 'new' as const }
    : judgeManualPost({
        now,
        fingerprint,
        lastFingerprint: (state?.last_bump_fingerprint as string | null) ?? null,
        lastBumpAt: (state?.last_bump_at as string | null) ?? null,
      });

  // ★ 第500便: 1日5回まで。★ 再投稿で並びが動くときだけ見る（止められる回・新規は数え直さない）
  if (judged.bumpFukues && input.kind === 'repost') {
    const used = await countAnnounceToday(svc, salonId, now);
    if (used != null && used >= ANNOUNCE_DAILY_LIMIT) return { ok: false, error: ANNOUNCE_LIMIT_MESSAGE };
  }

  // ★ 並びを動かすときだけ published_at を進める（トリガは service role を通す）
  if (judged.bumpFukues && input.kind === 'repost') {
    const { error } = await svc
      .from('announcements')
      .update({ published_at: now.toISOString() })
      .eq('id', input.announcementId)
      .eq('salon_id', salonId);
    if (error) return { ok: false, error: error.message };
  }

  // ★★ 押した事実は【動いても動かなくても】残す。
  //   ここが §192「手動があった日は自動をお休みする」の材料。
  //   ★ 押し直しが30分で止められた日も「手動があった日」。止められたことは店舗の意図と関係ない。
  const patch: Record<string, string | number | null> = {
    salon_id: salonId,
    last_manual_at: now.toISOString(),
    updated_at: now.toISOString(),
  };
  if (judged.bumpFukues) {
    patch.last_bump_at = now.toISOString();
    patch.last_bump_fingerprint = fingerprint;
  }
  const { error: upErr } = await svc
    .from('salon_announce_state')
    .upsert(patch, { onConflict: 'salon_id' });
  // ★ 記録に失敗しても、出たものは出た。嘘をつかないため、ここでは失敗にしない。
  //   ただし黙らない（次の周で「手動があった日」を取りこぼす可能性がある）。
  if (upErr) console.error('[announce] 手動配信の記録に失敗:', upErr.message);

  // ★ 第500便: おすすめランキング（1回5点）と 1日5回の材料。★ フクエスTOPが動いた回だけ残す
  if (judged.bumpFukues) {
    const { error: evErr } = await svc.from('salon_rank_events').insert({ salon_id: salonId, kind: 'announce_manual' });
    if (evErr) console.error('[announce] ランキング用の記録に失敗:', evErr.message);
  }

  return {
    ok: true,
    data: {
      bumped: judged.bumpFukues,
      waitMinutes: judged.waitMinutes,
      // ★ 駅ちかへの書き込みはまだ無い（§195 の5）。'none' ＝ その行を出さない。
      //   送っていないのに「送れませんでした」と書かない
      message: manualPostMessage(
        { bumpFukues: judged.bumpFukues, waitMinutes: judged.waitMinutes, sendToEkichika: true, kind: judged.kind },
        'none',
      ),
    },
  };
}

/**
 * 画面に出すための、その店の自動配信の状態。
 *
 * ★★★ 周（/api/admin/announce-auto）と【同じ判定】から文を作る。
 *   画面が「今日は出ます」と言い、周は出さない——が起きうる形にしない。
 *   ★ 材料の集め方まで周と揃える（対象は auto_rotate かつ公開中）。
 */
export async function getAnnounceState(input: { salonId: string | number }): Promise<
  Result<{
    /** この店の自動配信の時刻（IDから割り当て・選べない）。例 '11:37' */
    autoTimeLabel: string | null;
    /** 「自動で回す」に印の付いた、公開中のお知らせの本数 */
    targetCount: number;
    /** そのまま画面に出す1行 */
    message: string;
    /** 「5本あるので、1本が出るのは 5日に1回です」。0本のときは null */
    cycleMessage: string | null;
    /** ★ 第500便: 今日あと何回お知らせを出せるか（朝6時区切り・自動も含む）。読めないときは null */
    remainingToday: number | null;
  }>
> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();

  // ★ 周と同じ条件で数える（auto_rotate かつ公開中）
  const { count, error: cntErr } = await svc
    .from('announcements')
    .select('id', { count: 'exact', head: true })
    .eq('salon_id', salonId)
    .eq('auto_rotate', true)
    .eq('is_published', true);

  const { data: state, error: stErr } = await svc
    .from('salon_announce_state')
    .select('last_auto_day, rotation_index, last_manual_at')
    .eq('salon_id', salonId)
    .maybeSingle();

  // ★★ 読めなかったときは null を渡す。0件と混ぜない（作法3-5）。
  //   shouldAutoPost が 'unknown' を返し、画面は「読み取れていません」と言う
  const targetCount = cntErr || stErr ? null : (count ?? 0);

  const judged = shouldAutoPost({
    now: new Date(),
    salonId,
    autoTargetCount: targetCount,
    lastAutoDay: (state?.last_auto_day as string | null) ?? null,
    lastManualAt: (state?.last_manual_at as string | null) ?? null,
    rotationIndex: (state?.rotation_index as number | null) ?? null,
  });

  const timeLabel = autoPostTimeLabel(salonId);
  const usedToday = await countAnnounceToday(svc, salonId, new Date());
  return {
    ok: true,
    data: {
      autoTimeLabel: timeLabel,
      targetCount: targetCount ?? 0,
      // ★ 本数も渡す（★ 画面の2行目を畳んだので、この1行が本数を持つ・2026-09-06）
      message: autoStateMessage(judged, timeLabel, targetCount),
      // ★ 本数の上限は決めていない。代わりに周期を数字で出す（第70便）
      cycleMessage: targetCount === null ? null : rotationCycleMessage(targetCount),
      remainingToday: usedToday == null ? null : Math.max(0, ANNOUNCE_DAILY_LIMIT - usedToday),
    },
  };
}
