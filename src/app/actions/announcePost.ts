'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';
import {
  announceFingerprint,
  judgeManualPost,
  manualPostMessage,
  dayKeyJST,
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
 * ★★ まだ自動配信は回っていない（§195 の4）。ここは「今日、手動があったか」だけを返す。
 *   ★ 回っていないものを「回っています」と見せないこと。
 */
export async function getAnnounceState(input: { salonId: string | number }): Promise<
  Result<{
    /** この店の自動配信の時刻（IDから割り当て・選べない）。例 '11:37' */
    autoTimeLabel: string | null;
    /** 今日（朝6時区切り）の区切りの日 */
    todayKey: string | null;
    /** 今日、手動で出したか */
    postedManuallyToday: boolean;
    /** 最後にフクエスTOPの並びを動かした時刻（ISO）。まだ無ければ null */
    lastBumpAt: string | null;
  }>
> {
  const salonId = Number(input.salonId);
  if (!Number.isFinite(salonId)) return { ok: false, error: '店舗の指定が不正です' };
  const guard = await assertSalonOwner(salonId);
  if (!guard.ok) return guard;

  const svc = createServiceClient();
  const { data, error } = await svc
    .from('salon_announce_state')
    .select('last_manual_at, last_bump_at')
    .eq('salon_id', salonId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };

  const now = new Date();
  const todayKey = dayKeyJST(now);
  const lastManual = (data?.last_manual_at as string | null) ?? null;
  // ★ 「今日」は朝6:00〜翌5:59（JST）。salon_bump の区切りと同じ
  const postedManuallyToday =
    lastManual !== null && todayKey !== null && dayKeyJST(new Date(lastManual)) === todayKey;

  return {
    ok: true,
    data: {
      autoTimeLabel: autoPostTimeLabel(salonId),
      todayKey,
      postedManuallyToday,
      lastBumpAt: (data?.last_bump_at as string | null) ?? null,
    },
  };
}
