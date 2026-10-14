import { createServiceClient } from '@/app/lib/supabase/service';
import { needsConsent } from '@/lib/mediaConsent';
import { diaryForwardAllowed, forwardsDiaryFromFukues } from '@/lib/diarySource';

// ── 駅ちかの投稿用メールアドレスを読み直す（第1478便・2026-10-14・カッキーさん）────────────────
//
// ★ 起きたこと（ラビリンス様・10/14）: 今日入ったセラピストがフクエスで写メ日記を書いても、駅ちかに載らなかった。
//   投稿用アドレスの読み込み（mail_apply・/admin/maillist/）が「フクエスで書く」に切り替えたとき（10/3）の1回だけで、
//   そのあとに駅ちかで作られた子のアドレスが、いつまでも空のままだった（新人が入るたびに同じことが起きる）。
// ★ 直し方は2つ:
//   ① 毎日1回、読み直す（refreshDiaryAddressesDaily・/api/cron/diary-address から）
//   ② 日記を送るときにアドレスが無ければ、その場で読みにいく（kickMailImport・forwardDiary から）。
//      その日記は diary_forward_log に 'waiting_address' で残し、読めたら送る（forwardDiary.ts の sendWaitingForwards）。
// ★ 駅ちかへは【読むだけ】（mail_apply は読み取りの流れ）。書くのはフクエスの therapist_diary_forward だけ
//   （同じ値は書かない・違えば上書き＝ relayFlow.ts の saveMailList。手で入れたアドレスも、駅ちかの一覧と違えば一覧の値になる）。

type Svc = ReturnType<typeof createServiceClient>;

const PROVIDER = 'ekichika';
/** 前に読めてから、これだけ経ったら毎日の読み直しをする（時間）。★ 「毎日1回」を、周の時刻のずれに強くするため 24h より少し短く */
const DAILY_AFTER_H = 20;
/** 読めなかった（相手サイトの不調・ほかの更新が動いていた）ときに、もう一度試すまで（分） */
const RETRY_AFTER_MIN = 60;
/** 日記を送るときの読みにいきは、前の読み込み（成否を問わず）からこれだけあける（分）。同じ店で何人も同時に書いたときに何度も行かない */
export const KICK_GAP_MIN = 15;

type Target = { salonId: number; slot: number };

/** 投稿用アドレスが要る枠（駅ちかへ日記を送る店・枠）を集める。★ 送る条件は forwardDiary と同じ物差し（diaryForwardAllowed） */
async function loadTargets(svc: Svc, salonId?: number): Promise<Target[]> {
  let q = svc.from('salon_import_sources').select('salon_id, slot, link_mode').eq('provider', PROVIDER);
  if (salonId != null) q = q.eq('salon_id', salonId);
  const { data: srcs, error } = await q;
  if (error || !srcs || srcs.length === 0) return [];
  const salonIds = [...new Set(srcs.map((r) => Number(r.salon_id)))];
  const [{ data: salons }, { data: creds }] = await Promise.all([
    svc.from('salons').select('id, diary_source, diary_write_pref').in('id', salonIds),
    svc.from('salon_media_credentials').select('salon_id, slot, is_enabled, consent_version').eq('provider', PROVIDER).in('salon_id', salonIds),
  ]);
  const salonOf = new Map<number, { source: string | null; pref: string | null }>();
  for (const s of salons ?? []) {
    salonOf.set(Number(s.id), {
      source: (s.diary_source as string | null) ?? null,
      pref: ((s as { diary_write_pref?: string | null }).diary_write_pref) ?? null,
    });
  }
  const credOk = new Set<string>();
  for (const c of creds ?? []) {
    if (c.is_enabled === true && !needsConsent((c.consent_version as string | null) ?? null)) credOk.add(Number(c.salon_id) + '#' + Number(c.slot ?? 1));
  }
  const out: Target[] = [];
  for (const r of srcs) {
    const sid = Number(r.salon_id);
    const slot = Number(r.slot ?? 1);
    const s = salonOf.get(sid);
    if (!s) continue;
    if (!forwardsDiaryFromFukues(s.source ?? 'benry')) continue;              // フクエスから送らない店は要らない
    if (!diaryForwardAllowed((r.link_mode as string | null) ?? null, s.pref)) continue; // この枠へは送らない
    if (!credOk.has(sid + '#' + slot)) continue;                               // ログイン情報・同意が無ければ読めない
    out.push({ salonId: sid, slot });
  }
  return out;
}

/** その枠の最後の読み込み（成功・全部）の時刻 */
async function lastReads(svc: Svc, t: Target): Promise<{ lastOk: number | null; lastAny: number | null }> {
  const { data } = await svc
    .from('salon_media_audit')
    .select('outcome, created_at')
    .eq('salon_id', t.salonId).eq('provider', PROVIDER).eq('slot', t.slot)
    .eq('event', 'read_maillist')
    .order('created_at', { ascending: false })
    .limit(20);
  let lastOk: number | null = null, lastAny: number | null = null;
  for (const r of data ?? []) {
    const at = Date.parse(String(r.created_at));
    if (!Number.isFinite(at)) continue;
    if (lastAny == null) lastAny = at;
    if (lastOk == null && r.outcome === 'ok') lastOk = at;
    if (lastOk != null && lastAny != null) break;
  }
  return { lastOk, lastAny };
}

async function start(t: Target, actor: string): Promise<string> {
  const { startRelayFlow } = await import('@/app/lib/media/relayFlow');
  try {
    const r = await startRelayFlow({ salonId: t.salonId, provider: PROVIDER, slot: t.slot, intent: 'mail_apply', actor });
    return r.ok ? 'started' : r.reason;
  } catch (e) {
    return 'error:' + (e instanceof Error ? e.message : 'unknown').slice(0, 80);
  }
}

/** ① 毎日1回の読み直し。前に読めてから DAILY_AFTER_H 時間たった枠だけ（読めなかった枠は RETRY_AFTER_MIN 分あけて再挑戦） */
export async function refreshDiaryAddressesDaily(): Promise<Array<{ salonId: number; slot: number; result: string }>> {
  const svc = createServiceClient();
  const targets = await loadTargets(svc);
  const now = Date.now();
  const out: Array<{ salonId: number; slot: number; result: string }> = [];
  for (const t of targets) {
    const { lastOk, lastAny } = await lastReads(svc, t);
    if (lastOk != null && now - lastOk < DAILY_AFTER_H * 3600_000) continue;
    if (lastAny != null && now - lastAny < RETRY_AFTER_MIN * 60_000) continue;
    out.push({ ...t, result: await start(t, 'cron:diary-address') });
  }
  return out;
}

/**
 * ② 日記を送るときにアドレスが無かった → その店・枠の読み込みを始める（前の読み込みから KICK_GAP_MIN 分以内なら行かない）。
 * ★ 失敗しても投げない（日記の投稿は成立させる）。
 */
export async function kickMailImport(salonId: number, slot: number): Promise<string> {
  try {
    const svc = createServiceClient();
    const targets = await loadTargets(svc, salonId);
    const t = targets.find((x) => x.slot === slot);
    if (!t) return 'not_target';
    const { lastAny } = await lastReads(svc, t);
    if (lastAny != null && Date.now() - lastAny < KICK_GAP_MIN * 60_000) return 'recent';
    // ★ 同じ店で少し前に読みにいったばかり（まだ記録が付く前）なら行かない＝待っている日記の記録で見分ける
    const since = new Date(Date.now() - KICK_GAP_MIN * 60_000).toISOString();
    // ★ diary_forward_log.therapist_id には外部キーが無い（結合で絞れない）ので、店のセラピストの id で絞る
    const { data: ths } = await svc.from('therapists').select('id').eq('salon_id', salonId);
    const tids = (ths ?? []).map((r) => Number(r.id));
    const { data: waiting } = tids.length
      ? await svc
          .from('diary_forward_log').select('id')
          .eq('provider', PROVIDER).eq('slot', slot).eq('status', 'waiting_address')
          .in('therapist_id', tids).gt('created_at', since).limit(2)
      : { data: [] as Array<{ id: number }> };
    // ★ 今回の日記の行はこの直前に入っているので、2件目があれば「もう誰かが読みにいった」
    if ((waiting ?? []).length >= 2) return 'already_kicked';
    return await start(t, 'system:diary-address');
  } catch (e) {
    console.error('[diary] 投稿用アドレスの読み込みを始められなかった', salonId, slot, e instanceof Error ? e.message : e);
    return 'error';
  }
}
