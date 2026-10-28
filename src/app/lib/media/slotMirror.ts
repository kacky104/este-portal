// コネックエフ：駅ちかの枠2以降を「枠1と同じ」にそろえる（第1681便・2026-10-28・カッキーさんの決定）。
//
// ★ 店舗様の望み: 「枠2もボタンを押さなくても枠1と同じ紐づけができて、出勤なども回るように。違うのは場所（福岡市・博多／中洲・天神）だけ」。
// ★ 駅ちかは枠ごとに別のお店ページで、女の子の番号（castId）も枠ごとに別。枠2に誰も結びついていないと、出勤を送る相手がいない。
// ★ やること: 自動の周（media-auto-push・10分ごと）で、向きが「フクエスから反映（自動）」の枠2以降について、
//   【枠1に結びついている公開中のセラピスト】のうち、この枠にまだ番号が無い方を、1周に1人ずつ「サイトへ登録」する
//   （相手に同名がすでに居れば、第1495便の仕組みでその場で結びつく＝新しくは作らない）。
// ★ 1周に1人なのは、登録は相手サイトへのログイン＋写真つきの1本の流れで、同じ枠で2本は動かせない（busy）ため。39名なら約6.5時間で揃う。
// ★ この枠の出勤の自動更新は、未登録の方が残っているあいだも今までどおり回る（結びついた方から順に送られる）。
// ★ 送り先サイトを OFF にしている方（conecfTargetBlock）は登録しない。非公開の方も登録しない。
// ★ 読めなかったときは何もしない（ログだけ）。周そのものを止めない。
// ★★ 第1698便（A-3）: 同じ方の登録が24時間で3回うまくいかなければ、その方は試さない（lib/slotMirrorGiveUp.ts）。
//   店舗様が直せる理由の方は、ホームの帯に出す（readSlotMirrorStuck）。

import type { createServiceClient } from '@/app/lib/supabase/service';
import { loadCastIds } from '@/lib/mediaCastIds';
import { loadConecfOff } from '@/app/lib/conecf/targets';
import { buildGirlCreatePlan } from '@/app/lib/media/girlCreatePlan';
import { startRelayFlow } from '@/app/lib/media/relayFlow';
import { conecfConsentMissingNote } from '@/lib/mediaConsent';
import { findMediaSite } from '@/lib/mediaSites';
import { isNewFaceActive } from '@/lib/newFace';
import { createGirlFailures, slotMirrorGiveUp, slotMirrorStuckReason, SLOT_MIRROR_GIVE_UP_COUNT, type CreateGirlFailure } from '@/lib/slotMirrorGiveUp';

type Svc = ReturnType<typeof createServiceClient>;

export type SlotMirrorResult =
  | { kind: 'none'; why: string }
  | { kind: 'started'; therapistId: number; name: string; remaining: number; note: string }
  | { kind: 'failed'; therapistId: number; name: string; remaining: number; error: string };

/** この枠（slot≧2）で、枠1と同じにするために登録すべき方を1人だけ登録する */
export async function mirrorOneTherapistToSlot(
  svc: Svc,
  input: { salonId: number; provider: string; slot: number; notBefore?: string | null; /** ★ true なら相手サイトへは行かず、誰を登録するかだけ返す */ dryRun?: boolean },
): Promise<SlotMirrorResult> {
  const { salonId, provider, slot } = input;
  if (slot < 2) return { kind: 'none', why: '枠1はそろえる元なので対象外' };
  if (provider !== 'ekichika') return { kind: 'none', why: '駅ちか以外は対象外' };

  // ★ この枠の鍵と、コネックエフの文への同意（guardTherapistCreate と同じ止め）
  const { data: cred } = await svc.from('salon_media_credentials')
    .select('consent_version, is_enabled').eq('salon_id', salonId).eq('provider', provider).eq('slot', slot).maybeSingle();
  if (!cred || cred.is_enabled !== true) return { kind: 'none', why: 'この枠の ID・パスワードが無い（または一時停止中）' };
  const consentNg = conecfConsentMissingNote(cred.consent_version as string | null, findMediaSite(provider)?.name ?? 'このサイト');
  if (consentNg) return { kind: 'none', why: consentNg };

  const t = await loadSlotMirrorTodo(svc, { salonId, provider, slot });
  if (t.kind === 'none') return t;
  const nowMs = Date.now();
  // ★★ 第1698便（A-3）: 24時間で3回うまくいかなかった方は試さない（直したらまた試す）
  const tryable = t.todo.filter((x) => !slotMirrorGiveUp({ name: String(x.name ?? ''), failures: t.failures, nowMs, updatedAt: x.updated_at ?? null }).givenUp);
  if (tryable.length === 0) {
    return { kind: 'none', why: t.todo.length + '名は、24時間で' + SLOT_MIRROR_GIVE_UP_COUNT + '回登録できなかったため試していません（直したらまた試します）' };
  }
  const todo = tryable;

  // ★ 同じ方で続けて失敗しないよう、この枠の直近6時間の登録の記録で「最近試した方」を後ろに回す
  //   （create_girl の detail は name、cast_id_linked は therapistId）
  const { data: recent } = await svc.from('salon_media_audit')
    .select('detail, created_at')
    .eq('salon_id', salonId).eq('provider', provider).eq('slot', slot)
    .in('event', ['create_girl', 'cast_id_linked', 'plan_work'])
    .gte('created_at', new Date(nowMs - 6 * 3600_000).toISOString())
    .order('created_at', { ascending: false }).limit(60);
  const triedIds = new Set<number>();
  const triedNames = new Set<string>();
  for (const r of recent ?? []) {
    const d = r.detail as { therapistId?: unknown; name?: unknown; purpose?: unknown } | null;
    if (!d) continue;
    if (typeof d.therapistId === 'number') triedIds.add(d.therapistId);
    if (typeof d.name === 'string' && d.name) triedNames.add(d.name);
  }
  const triedRecently = (x: { id: number; name: string | null }) => triedIds.has(x.id) || triedNames.has(String(x.name ?? ''));
  const ordered = [...todo.filter((x) => !triedRecently(x)), ...todo.filter((x) => triedRecently(x))];
  const target = ordered[0];
  const name = String(target.name ?? '');
  const remaining = t.todo.length - 1;

  const built = await buildGirlCreatePlan(svc, {
    salonId, therapistId: target.id, slot,
    // ★ 店舗様が「サイトへ登録」を押したときと同じ既定（枠1に1枚・用意できなければ登録だけ・2枚目以降は送らない）
    withPhoto: true, withPhotoAsked: false, allPhotos: false,
    // ★★ 第1692便（2026-10-28・カッキーさん）: 新人マークは【フクエス（＝枠1）で新人の印が付いている方だけ】。
    //   第1681便は rookie: true 固定で、枠2 に全員が新人マーク付き（30日）で並んでいた
    postTo: 'action', rookie: isNewFaceActive(target.is_new_face ?? null, target.new_face_since ?? null),
  });
  if (!built.ok) return { kind: 'failed', therapistId: target.id, name, remaining, error: built.error };
  if (input.dryRun) return { kind: 'started', therapistId: target.id, name, remaining, note: '（試し打ち）' };

  try {
    const r = await startRelayFlow({
      salonId, provider, slot, intent: 'girl_create',
      actor: 'system:slot-mirror',
      ...built.data.relay,
      ...(input.notBefore ? { notBefore: input.notBefore } : {}),
    });
    if (!r.ok) return { kind: 'failed', therapistId: target.id, name, remaining, error: r.note };
    return { kind: 'started', therapistId: target.id, name, remaining, note: r.note };
  } catch (e) {
    return { kind: 'failed', therapistId: target.id, name, remaining, error: (e as Error).message.slice(0, 200) };
  }
}

type TodoRow = { id: number; name: string | null; is_new_face?: boolean | null; new_face_since?: string | null; updated_at?: string | null };

/**
 * ★ この枠で「枠1と同じ」にするために登録すべき方と、この枠の直近24時間の登録の失敗（第1698便で切り出した）。
 *   ★ 枠1に番号がある（＝枠1で連携済み）・公開中・この枠には無い・この枠の送り先を OFF にしていない方
 */
async function loadSlotMirrorTodo(
  svc: Svc,
  input: { salonId: number; provider: string; slot: number },
): Promise<{ kind: 'none'; why: string } | { kind: 'todo'; todo: TodoRow[]; failures: CreateGirlFailure[] }> {
  const { salonId, provider, slot } = input;
  // ★ 在籍（公開中だけ）。枠1の番号と、この枠の番号
  const { data: ths, error: tErr } = await svc.from('therapists')
    .select('id, name, import_cast_id, is_active, is_new_face, new_face_since, updated_at').eq('salon_id', salonId);
  if (tErr) return { kind: 'none', why: '在籍を読めなかった: ' + tErr.message };
  const rows = ((ths ?? []) as Array<TodoRow & { import_cast_id?: string | null; is_active?: boolean | null }>);
  const active = rows.filter((x) => x.is_active === true);
  if (active.length === 0) return { kind: 'none', why: '公開中の方がいない' };

  const [m1, mN] = await Promise.all([
    loadCastIds(svc, { therapists: rows, provider, slot: 1 }),
    loadCastIds(svc, { therapists: rows, provider, slot }),
  ]);
  if (m1.error || mN.error) return { kind: 'none', why: '番号の表を読めなかった: ' + (m1.error ?? mN.error) };

  const { off, error: offErr } = await loadConecfOff(svc, salonId, provider, slot);
  if (offErr) return { kind: 'none', why: '送り先サイトの設定を読めなかった: ' + offErr };

  const todo = active.filter((x) => !!m1.maps.castIdOf.get(x.id) && !mN.maps.castIdOf.get(x.id) && !off.has(x.id));
  if (todo.length === 0) return { kind: 'none', why: '枠1と同じにそろっている' };

  // ★ 第1698便: この枠の直近24時間の登録の記録（うまくいかなかったもの）。★ 読めなければ空（今までどおり試す）
  const { data: aud, error: aErr } = await svc.from('salon_media_audit')
    .select('event, outcome, detail, created_at')
    .eq('salon_id', salonId).eq('provider', provider).eq('slot', slot)
    .eq('event', 'create_girl').neq('outcome', 'ok')
    .gte('created_at', new Date(Date.now() - 24 * 3600_000).toISOString())
    .order('created_at', { ascending: false }).limit(300);
  if (aErr) console.warn('[slot-mirror] 登録の記録を読めなかった（打ち切りは見ない）', salonId, slot, aErr.message);
  return { kind: 'todo', todo, failures: createGirlFailures(aErr ? [] : (aud ?? [])) };
}

export type SlotMirrorStuck = { slot: number; therapistId: number; name: string; reason: string };

/**
 * ★★ 第1698便（A-3）: ホームの帯に出す「枠2以降に自動で登録できていない方」。
 *   ★ 試すのをやめた方のうち、店舗様が直せる理由の方だけ（直せないものは運営だけ・カッキーさんの決定）。
 *   ★ 見るのは、自動の周がそろえに行く枠（駅ちか・枠2以降・フクエスから反映（自動）・止められていない）だけ。読めなければ空。
 */
export async function readSlotMirrorStuck(svc: Svc, salonId: number): Promise<SlotMirrorStuck[]> {
  const provider = 'ekichika';
  const { data: srcs, error } = await svc.from('salon_import_sources')
    .select('slot, link_mode, is_enabled')
    .eq('salon_id', salonId).eq('provider', provider).eq('is_enabled', true).eq('link_mode', 'write_auto');
  if (error) { console.warn('[slot-mirror] 枠を読めなかった', salonId, error.message); return []; }
  const slots = ((srcs ?? []) as Array<{ slot: number | null }>).map((r) => Number(r.slot ?? 1)).filter((n) => n >= 2);
  const out: SlotMirrorStuck[] = [];
  const nowMs = Date.now();
  for (const slot of slots) {
    const t = await loadSlotMirrorTodo(svc, { salonId, provider, slot });
    if (t.kind === 'none') continue;
    for (const x of t.todo) {
      const g = slotMirrorGiveUp({ name: String(x.name ?? ''), failures: t.failures, nowMs, updatedAt: x.updated_at ?? null });
      if (!g.givenUp) continue;
      const reason = slotMirrorStuckReason(g.last);
      if (reason) out.push({ slot, therapistId: x.id, name: String(x.name ?? ''), reason });
    }
  }
  return out;
}
