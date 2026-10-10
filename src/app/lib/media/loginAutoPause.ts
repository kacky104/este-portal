// 「ID・パスワードが違う」ために自動で一時停止した枠を、記録から読む（第1378便）。決まりは src/lib/loginAutoPause.ts。
import type { createServiceClient } from '@/app/lib/supabase/service';
import { isPausedByLoginReject } from '@/lib/loginAutoPause';

type Svc = ReturnType<typeof createServiceClient>;

const CREDENTIAL_EVENTS = ['credential_saved', 'credential_enabled', 'credential_disabled', 'credential_deleted'];

/**
 * 一時停止している枠のうち、「ID・パスワードが違う」ために自動で止めたもの。
 * @param paused 一時停止している枠（is_enabled=false で、登録は残っている）
 * @param onError 読めなかった枠があったときに呼ぶ（運営の見張りは、読めなかった回を「直った」と数えないために使う）
 * @returns 'provider#slot' の集合。★ 読めなかったときは空（記録の読み取りの不調で、画面を赤くしない）
 * ★ 一時停止の枠が無い店では、DB を読まない。
 */
export async function loadLoginRejectPaused(
  svc: Svc,
  salonId: number,
  paused: ReadonlyArray<{ provider: string; slot: number }>,
  onError?: (message: string) => void,
): Promise<Set<string>> {
  const out = new Set<string>();
  if (paused.length === 0) return out;
  await Promise.all(paused.map(async (p) => {
    const { data, error } = await svc
      .from('salon_media_audit')
      .select('event, outcome, detail')
      .eq('salon_id', salonId).eq('provider', p.provider).eq('slot', p.slot)
      .in('event', CREDENTIAL_EVENTS)
      .order('created_at', { ascending: false })
      .limit(1);
    if (error) {
      console.error('[login-guard] 一時停止の理由を読めなかった', salonId, p.provider, p.slot, error.message);
      onError?.('店 ' + salonId + '・' + p.provider + '（枠' + p.slot + '）の一時停止の理由を読めなかった: ' + error.message);
      return;
    }
    const rows = (data ?? []).map((r) => ({ event: String(r.event), outcome: String(r.outcome), detail: r.detail as unknown }));
    if (isPausedByLoginReject(rows)) out.add(p.provider + '#' + p.slot);
  }));
  return out;
}

/**
 * 自動で一時停止にするかを決めるための事実（lib/loginAutoPause.ts の decideLoginAutoPause に渡す）。
 *   everWorked  … 登録・再開・停止のいちばん新しい記録のあと、1度でもログインできたか
 *                 （login の ok、または、ログインしないと残らない read_ / write_ / verify_ / push_ の ok）
 *   firstFailAt … 最後に通ったあと、最初にログインに失敗した時刻（everWorked のときだけ）
 * ★ 読めなかったら null を返す（呼び元は止めない＝今までどおり60分に1回の見送りに任せる）。
 * ★ 呼ぶのは「ID・パスワードが違う」が5回続いているときだけ（ふだんの周では DB を読まない）。
 */
export async function loadLoginPauseFacts(
  svc: Svc, salonId: number, provider: string, slot: number,
): Promise<{ everWorked: boolean; firstFailAt: string | null } | null> {
  const base = () => svc
    .from('salon_media_audit')
    .select('created_at')
    .eq('salon_id', salonId).eq('provider', provider).eq('slot', slot);

  const anchorQ = await base().in('event', CREDENTIAL_EVENTS).order('created_at', { ascending: false }).limit(1);
  if (anchorQ.error) { console.error('[login-guard] 登録の記録を読めなかった', salonId, provider, slot, anchorQ.error.message); return null; }
  const anchorAt = (anchorQ.data ?? [])[0] ? String((anchorQ.data ?? [])[0].created_at) : null;

  let okQuery = base().eq('outcome', 'ok')
    .or('event.eq.login,event.like.read_*,event.like.write_*,event.like.verify_*,event.like.push_*')
    .order('created_at', { ascending: false }).limit(1);
  if (anchorAt) okQuery = okQuery.gt('created_at', anchorAt);
  const okQ = await okQuery;
  if (okQ.error) { console.error('[login-guard] 通った記録を読めなかった', salonId, provider, slot, okQ.error.message); return null; }
  const lastOkAt = (okQ.data ?? [])[0] ? String((okQ.data ?? [])[0].created_at) : null;
  if (!lastOkAt) return { everWorked: false, firstFailAt: null };

  const failQ = await base().eq('event', 'login').eq('outcome', 'failed').gt('created_at', lastOkAt)
    .order('created_at', { ascending: true }).limit(1);
  if (failQ.error) { console.error('[login-guard] 失敗の記録を読めなかった', salonId, provider, slot, failQ.error.message); return null; }
  return { everWorked: true, firstFailAt: (failQ.data ?? [])[0] ? String((failQ.data ?? [])[0].created_at) : null };
}
