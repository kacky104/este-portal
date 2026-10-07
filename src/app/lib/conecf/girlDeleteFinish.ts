// セラピストの削除の【最後の段】: 各サイトから消えたことを確かめ終わったら、コネックエフ・フクエス側を消す（第1279便・2026-10-07）。
// ★ サーバー専用。service_role で動く。判断は lib/girlDeleteFinish.ts（純粋関数・番人あり）。
//
// ★ 呼ばれる場所: 中継の流れ（girl_delete / cast_hide）が終わったところ（app/lib/media/relayFlow.ts の advanceRelayFlow）。
//   ★ 文脈に deleteAfter が入っている流れ＝店舗様が「サイトからも一緒に消す」で削除を押して積んだ流れだけ。
//     （権限は、積むとき actions/conecfGirls.ts の deleteConecfGirl が確かめている。）
// ★★ ここへ来ない終わり方（通信の打ち切り・途中で別の更新に割り込まれた など）では、何も消さない。
//     ＝その方は非公開のまま一覧に残り、店舗様がもう一度「削除」を押せる。★ 「消さない側に倒す」。

import { createServiceClient } from '@/app/lib/supabase/service';
import { recordMediaAudit } from '@/app/lib/media/mediaAudit';
import { deleteTherapistCore } from '@/app/lib/therapistDelete';
import { providerLabel } from '@/lib/mediaAudit';
import { girlDeleteProgress, parseDeleteAfter, type DeleteWaitSite } from '@/lib/girlDeleteFinish';

type Svc = ReturnType<typeof createServiceClient>;

/**
 * ★★ 第436便: 消した人を【名簿の写し】からも外す（★ 外さないと「名前が同じ」の候補に出続け、
 *   ★ 次に同じ名前の子を作ったとき、もう居ない相手に結びついてしまう・2026-09-18 00:08 に踏んだ）。
 * ★ 第1279便: actions/conecfGirls.ts からここへ移した（中身は変えていない）。
 */
export async function pruneRosterSnapshots(svc: Svc, salonId: number, rows: ReadonlyArray<DeleteWaitSite>): Promise<void> {
  for (const r of rows) {
    const { data } = await svc.from('media_roster_snapshots').select('entries, total')
      .eq('salon_id', salonId).eq('provider', r.provider).eq('slot', r.slot).maybeSingle();
    const entries = (data?.entries as Array<{ castId?: unknown }> | null) ?? null;
    if (!Array.isArray(entries)) continue;
    const next = entries.filter((e) => String(e?.castId ?? '') !== r.castId);
    if (next.length === entries.length) continue;
    const { error } = await svc.from('media_roster_snapshots')
      .update({ entries: next, total: next.length })
      .eq('salon_id', salonId).eq('provider', r.provider).eq('slot', r.slot);
    if (error) console.error('[conecf] 名簿の写しから外せなかった', r.provider, error.message);
  }
}

/**
 * 流れが終わったところで呼ぶ。
 * @param currentGone この流れのサイトで、その方が居なくなった（非表示になった）ことを確かめられたか
 * @returns 運営のログ用の1行（店舗様には出さない）
 */
export async function finishGirlDelete(
  params: { salonId: number; provider: string; slot: number },
  deleteAfterRaw: unknown,
  currentGone: boolean,
): Promise<string> {
  const da = parseDeleteAfter(deleteAfterRaw);
  if (!da) return '削除の続き: 文脈の形が読めないので何もしない';
  const svc = createServiceClient();
  const site = providerLabel(params.provider);
  // ★ 記録に使う種類は、そのサイトの削除と同じ（駅ちか＝delete_girl／エステ魂＝hide_cast）。新しい種類は足さない（古い画面が知らない種類を出してしまう）
  const event = params.provider === 'esutama' ? 'hide_cast' as const : 'delete_girl' as const;

  const { data: t, error: tErr } = await svc
    .from('therapists')
    .select('id, salon_id, name, is_active')
    .eq('id', da.therapistId)
    .maybeSingle();
  if (tErr) {
    console.error('[conecf] 削除の続き: 本人を読めなかった', da.therapistId, tErr.message);
    return '削除の続き: 本人を読めなかったので何もしない';
  }
  // ★ もう居ない（先に終わった別のサイトの流れが消した・店舗様が「コネックエフだけ消す」で消した）
  if (!t || Number(t.salon_id) !== params.salonId) return '削除の続き: 本人はもう居ない';
  const who = String(t.name ?? '').trim() ? String(t.name).trim() + 'さん' : 'このセラピスト';

  // ── このサイトで確かめられなかった → 消さない。★ 黙らない（一覧に残っている理由を言う）
  if (!currentGone) {
    await recordMediaAudit({
      salonId: params.salonId, provider: params.provider, slot: params.slot,
      event, outcome: 'stopped',
      summary: who + 'は、' + site + 'から消えたことを確かめられなかったため、コネックエフには残しています（非公開）。'
        + '少し待ってから、セラピスト一覧でもう一度「削除」を押してください',
      detail: { therapistId: da.therapistId, reason: 'kept_site_not_confirmed' },
      actor: 'system:girl-delete',
    });
    return '削除の続き: ' + site + 'で確かめられなかったので、コネックエフ側は消さない';
  }

  // ── ほかのサイトは終わったか。★ 依頼した時刻より後の記録だけを見る
  const { data: rows, error: aErr } = await svc
    .from('salon_media_audit')
    .select('provider, slot, event, outcome, detail')
    .eq('salon_id', params.salonId)
    .in('event', ['delete_girl', 'hide_cast'])
    .gte('created_at', da.requestedAt)
    .order('created_at', { ascending: false })
    .limit(100);
  if (aErr) {
    console.error('[conecf] 削除の続き: 記録を読めなかった', aErr.message);
    return '削除の続き: 記録を読めなかったので、コネックエフ側は消さない';
  }
  const progress = girlDeleteProgress({
    waitFor: da.waitFor,
    rows: (rows ?? []).map((r) => ({ provider: String(r.provider), slot: Number(r.slot), event: String(r.event), outcome: String(r.outcome), detail: r.detail as unknown })),
    alsoDone: [params.provider + '#' + params.slot],
  });
  if (!progress.ready) {
    // ★ ほかのサイトがまだ終わっていない（または、そちらで確かめられなかった）。そちらの流れが終わったところで、もう一度ここへ来る。
    return '削除の続き: まだ待っているサイトがある（' + progress.pending.map((s) => s.provider + '#' + s.slot).join(', ') + '）';
  }

  // ── 全部のサイトで確かめられた。★ 待っている間に「公開」に戻されていたら消さない（店舗様の気が変わった）
  if (t.is_active === true) {
    await recordMediaAudit({
      salonId: params.salonId, provider: params.provider, slot: params.slot,
      event, outcome: 'stopped',
      summary: who + 'は各サイトから消えましたが、公開に戻されていたため、コネックエフからは消していません',
      detail: { therapistId: da.therapistId, reason: 'kept_republished' },
      actor: 'system:girl-delete',
    });
    return '削除の続き: 公開に戻されていたので消さない';
  }

  const res = await deleteTherapistCore(svc, { therapistId: String(da.therapistId), salonId: params.salonId });
  if (!res.ok) {
    await recordMediaAudit({
      salonId: params.salonId, provider: params.provider, slot: params.slot,
      event, outcome: 'failed',
      summary: who + 'は各サイトから消えましたが、コネックエフ側を消せませんでした。セラピスト一覧から、もう一度「削除」を押してください',
      detail: { therapistId: da.therapistId, reason: 'local_delete_failed' },
      actor: 'system:girl-delete',
    });
    console.error('[conecf] 削除の続き: 本人を消せなかった', da.therapistId, res.error);
    return '削除の続き: ★ 本人を消せなかった: ' + res.error.slice(0, 120);
  }
  await pruneRosterSnapshots(svc, params.salonId, da.waitFor);
  await recordMediaAudit({
    salonId: params.salonId, provider: params.provider, slot: params.slot,
    event, outcome: 'ok',
    summary: who + 'を、コネックエフ・フクエスから削除しました（各サイトから消えたことを確かめました）',
    detail: { therapistId: da.therapistId, reason: 'local_deleted', sites: da.waitFor.length },
    actor: 'system:girl-delete',
  });
  return '削除の続き: 各サイトで確かめられたので、本人（id ' + da.therapistId + '）を消した';
}
