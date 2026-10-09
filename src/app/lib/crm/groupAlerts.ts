// フクエスCRM「グループ・提携店で共有するNG・要注意リスト」を、サーバーで読む道具（第1325便・2026-10-09）。
//   ★ 'use server' ではない（svc を受け取る下請け）。呼ぶ側（actions/crm.ts・actions/crmGroupShare.ts）が、先に本人確認をすること。
//   決まりは src/lib/crmGroup.ts。表は 追加SQL_第1324便。設計は 設計メモ_グループで共有するNG・要注意リスト_2026-10-09.md。
//
// ★★★ 店舗様の画面へ返す形（CrmGroupHit）には、出した店の番号・名前を入れない。mine（自店の分か）だけ。
// ★★ 見えるのは「いまグループに入っている店」だけ。入っているかは、毎回 DB で確かめる（外した直後から見えなくする）。
// ★ 表がまだ無い（追加SQL の前）ときは「入っていない」として扱う（画面を壊さない）。
// ★ 読めなかったときは、黙って「当たりなし」にしない。failed を返す（受付の人が「NG ではない」と思いこまないように）。

import type { createServiceClient } from '@/app/lib/supabase/service';
import { isCrmGroupCertainty, isCrmGroupKind, isCrmGroupLevel, sortCrmGroupHits, type CrmGroupHit } from '@/lib/crmGroup';

type Svc = ReturnType<typeof createServiceClient>;

/**
 * 表がまだ無いか（追加SQL_第1324便の前）。★ 42P01＝Postgres／PGRST205＝PostgREST の表の一覧に無い／404＝PostgREST が「その表は無い」と返した
 * ★★ 読む（select）ときにだけ使うこと。書く（insert・update）ときは、PostgREST の版によって中身の無いエラー（{}）が返り、
 *    code では見分けられない（手元の 12.2.3 で確かめた）。書く前に、先に読んで確かめる。
 */
export function crmGroupTableMissing(e: { code?: string } | null | undefined, status?: number): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205' || status === 404);
}

export type CrmGroupMembership =
  | { state: 'in'; groupId: number }
  | { state: 'out' }
  | { state: 'error'; message: string };

/** その店が、いま入っているグループ。★ 1店が入れるのは1つだけ（DB の索引） */
export async function readCrmGroupMembership(svc: Svc, salonId: number): Promise<CrmGroupMembership> {
  const { data, error, status } = await svc.from('crm_group_members')
    .select('group_id').eq('salon_id', salonId).is('left_at', null).limit(1).maybeSingle();
  if (error) {
    if (crmGroupTableMissing(error, status)) return { state: 'out' };
    console.error('[crmGroup] グループを読めなかった', salonId, error.message);
    return { state: 'error', message: error.message };
  }
  if (!data) return { state: 'out' };
  return { state: 'in', groupId: Number(data.group_id) };
}

/** いまグループに入っている店の数（自店をふくむ）。★ 名前は読まない */
export async function countCrmGroupMembers(svc: Svc, groupId: number): Promise<number> {
  const { count, error } = await svc.from('crm_group_members')
    .select('id', { count: 'exact', head: true }).eq('group_id', groupId).is('left_at', null);
  if (error) { console.error('[crmGroup] 店の数を読めなかった', groupId, error.message); return 0; }
  return count ?? 0;
}

type AlertDbRow = {
  id: unknown; salon_id: unknown; level: unknown; kind: unknown; certainty: unknown;
  happened_on: unknown; what: unknown; shown_name: unknown;
};
export const CRM_GROUP_HIT_COLS = 'id, salon_id, level, kind, certainty, happened_on, what, shown_name';

/** DB の行 → 画面へ返す形。★★★ salon_id は「自店か」を決めるのに使うだけで、返さない */
export function toCrmGroupHit(r: AlertDbRow, salonId: number): CrmGroupHit | null {
  if (!isCrmGroupLevel(r.level) || !isCrmGroupKind(r.kind) || !isCrmGroupCertainty(r.certainty)) return null;
  return {
    id: Number(r.id),
    level: r.level,
    kind: r.kind,
    certainty: r.certainty,
    happenedOn: String(r.happened_on ?? '').slice(0, 10),
    what: String(r.what ?? ''),
    shownName: String(r.shown_name ?? ''),
    mine: Number(r.salon_id) === salonId,
  };
}

export type CrmGroupHitsResult = { failed: boolean; byPhone: Map<string, CrmGroupHit[]> };

/**
 * 電話番号（数字10〜13桁・完全一致）が、グループの共有リストに当たるか。
 * ★ 取り下げた分（withdrawn_at）は当てない。★ 途中一致はしない（別の人を出してしまうため）。
 */
export async function readCrmGroupHits(svc: Svc, groupId: number, salonId: number, phones: ReadonlyArray<string>): Promise<CrmGroupHitsResult> {
  const byPhone = new Map<string, CrmGroupHit[]>();
  const want = [...new Set(phones.filter((p) => /^[0-9]{10,13}$/.test(p)))];
  if (want.length === 0) return { failed: false, byPhone };

  const links: Array<{ alertId: number; phone: string }> = [];
  for (let i = 0; i < want.length; i += 200) {
    const { data, error } = await svc.from('crm_group_alert_phones')
      .select('alert_id, phone').eq('group_id', groupId).in('phone', want.slice(i, i + 200));
    if (error) { console.error('[crmGroup] 共有リストの電話番号を読めなかった', groupId, error.message); return { failed: true, byPhone }; }
    for (const r of data ?? []) links.push({ alertId: Number(r.alert_id), phone: String(r.phone) });
  }
  if (links.length === 0) return { failed: false, byPhone };

  const ids = [...new Set(links.map((l) => l.alertId))];
  const hits = new Map<number, CrmGroupHit>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await svc.from('crm_group_alerts')
      .select(CRM_GROUP_HIT_COLS).eq('group_id', groupId).is('withdrawn_at', null).in('id', ids.slice(i, i + 200));
    if (error) { console.error('[crmGroup] 共有リストを読めなかった', groupId, error.message); return { failed: true, byPhone }; }
    for (const r of (data ?? []) as AlertDbRow[]) {
      const h = toCrmGroupHit(r, salonId);
      if (h) hits.set(h.id, h);
    }
  }
  for (const l of links) {
    const h = hits.get(l.alertId);
    if (!h) continue;
    const cur = byPhone.get(l.phone) ?? [];
    if (!cur.some((x) => x.id === h.id)) byPhone.set(l.phone, [...cur, h]);
  }
  for (const [p, hs] of byPhone) byPhone.set(p, sortCrmGroupHits(hs));
  return { failed: false, byPhone };
}

/**
 * その店から見た「当たり」。グループに入っていなければ空。
 * ★ 本人確認を済ませた後で呼ぶこと。
 */
export async function crmGroupHitsForSalon(svc: Svc, salonId: number, phones: ReadonlyArray<string>): Promise<CrmGroupHitsResult> {
  const empty = new Map<string, CrmGroupHit[]>();
  if (!phones.some((p) => /^[0-9]{10,13}$/.test(p))) return { failed: false, byPhone: empty };
  const m = await readCrmGroupMembership(svc, salonId);
  if (m.state === 'out') return { failed: false, byPhone: empty };
  if (m.state === 'error') return { failed: true, byPhone: empty };
  return readCrmGroupHits(svc, m.groupId, salonId, phones);
}
