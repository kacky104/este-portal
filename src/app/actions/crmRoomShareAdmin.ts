'use server';

// フクエスCRM：提携店の部屋共有のペア（運営・第1670便・2026-10-27）。
// ★ NG・要注意の共有グループ（crmGroupAdmin.ts）とは別。表は crm_room_share_pairs（追加SQL_第1670便）。
// ★★ 守り: requireAdmin（ADMIN_UUID 照合）＋ service_role。
// ★ どの店とどの店が提携しているかは秘密の情報。返す先は /admin だけ。

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { ADMIN_UUID } from '@/app/lib/admin';

type Err = { ok: false; error: string };

async function requireAdmin(): Promise<{ ok: true } | Err> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'ログインが必要です' };
  if (user.id !== ADMIN_UUID) return { ok: false, error: '管理者専用です' };
  return { ok: true };
}
function tableMissing(e: { code?: string } | null | undefined): boolean {
  return !!e && (e.code === '42P01' || e.code === 'PGRST205');
}

export type CrmRoomSharePairRow = {
  id: number;
  salonA: { id: number; name: string; crmUntil: string | null };
  salonB: { id: number; name: string; crmUntil: string | null };
  note: string;
  createdAt: string;
  endedAt: string | null;
};

/** ペアの一覧（続いているもの・終わったもの）。★ 表がまだ無ければ ready: false */
export async function adminListRoomSharePairs(): Promise<{ ok: true; ready: boolean; pairs: CrmRoomSharePairRow[] } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const svc = createServiceClient();
  const { data, error } = await svc.from('crm_room_share_pairs')
    .select('id, salon_a, salon_b, note, created_at, ended_at').order('id', { ascending: false });
  if (tableMissing(error)) return { ok: true, ready: false, pairs: [] };
  if (error) return { ok: false, error: 'ペアを読めませんでした: ' + error.message };
  const ids = [...new Set((data ?? []).flatMap((r) => [Number(r.salon_a), Number(r.salon_b)]))];
  const names = new Map<number, { name: string; crmUntil: string | null }>();
  if (ids.length > 0) {
    const { data: ss } = await svc.from('salons').select('id, name, crm_until').in('id', ids);
    for (const s of ss ?? []) names.set(Number(s.id), { name: String(s.name ?? ''), crmUntil: (s.crm_until as string | null) ?? null });
  }
  const sal = (id: number) => ({ id, name: names.get(id)?.name ?? `店${id}`, crmUntil: names.get(id)?.crmUntil ?? null });
  return {
    ok: true, ready: true,
    pairs: (data ?? []).map((r) => ({
      id: Number(r.id), salonA: sal(Number(r.salon_a)), salonB: sal(Number(r.salon_b)),
      note: String(r.note ?? ''), createdAt: String(r.created_at ?? ''), endedAt: (r.ended_at as string | null) ?? null,
    })),
  };
}

/** ペアを組む（運営）。★ 2店とも CRM 契約店であること（契約が切れている店は出勤の部屋を持てない） */
export async function adminAddRoomSharePair(input: { salonA: number; salonB: number; note?: string }): Promise<{ ok: true; id: number } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const x = Number(input.salonA), y = Number(input.salonB);
  if (!Number.isInteger(x) || !Number.isInteger(y) || x <= 0 || y <= 0) return { ok: false, error: '店を2つ選んでください' };
  if (x === y) return { ok: false, error: '同じ店どうしは組めません' };
  const note = String(input.note ?? '').trim();
  if (note.length > 200) return { ok: false, error: '覚え書きは200文字までです' };
  const svc = createServiceClient();
  const { data: ss, error: sErr } = await svc.from('salons').select('id, crm_until').in('id', [x, y]);
  if (sErr) return { ok: false, error: '店を読めませんでした: ' + sErr.message };
  if ((ss ?? []).length !== 2) return { ok: false, error: '店が見つかりません' };
  if ((ss ?? []).some((s) => !s.crm_until)) return { ok: false, error: '2店ともフクエスCRMの契約店である必要があります' };
  const [sa, sb] = x < y ? [x, y] : [y, x];
  const { data, error } = await svc.from('crm_room_share_pairs').insert({ salon_a: sa, salon_b: sb, note }).select('id').single();
  if (tableMissing(error)) return { ok: false, error: '追加SQL_第1670便 がまだ流れていません' };
  if (error?.code === '23505') return { ok: false, error: 'その2店はもう組んでいます' };
  if (error || !data) return { ok: false, error: '組めませんでした: ' + (error?.message ?? '') };
  return { ok: true, id: Number(data.id) };
}

/** ペアを終わらせる（運営）。★ 借りている部屋の出勤はそのまま残るが、帯・同意書・空き枠ではもう見なくなる */
export async function adminEndRoomSharePair(input: { id: number }): Promise<{ ok: true } | Err> {
  const a = await requireAdmin();
  if (!a.ok) return a;
  const id = Number(input.id);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: 'ペアが不正です' };
  const svc = createServiceClient();
  const { data, error } = await svc.from('crm_room_share_pairs').update({ ended_at: new Date().toISOString() }).eq('id', id).is('ended_at', null).select('id');
  if (error) return { ok: false, error: '終わらせられませんでした: ' + error.message };
  if (!data || data.length === 0) return { ok: false, error: 'ペアが見つかりません（もう終わっています）' };
  return { ok: true };
}
