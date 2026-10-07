import type { SupabaseClient } from '@supabase/supabase-js';
import { getCalendarDateJST } from '@/lib/dutyStatus';
import { isConecfStopped, CONECF_STOPPED_MESSAGE, conecfFlowBlockMessage } from '@/lib/setPlan';

// ★★ コネックエフを止めているか（第1243便・2026-10-06・カッキーさんの決定）。
//   セット（コネックエフ＋フクエスCRM）を OFF にした店は、コネックエフの保存・各サイトへの送信を止める。
//   ・止めるのは「コネックエフに切り替え済み（conecf_enabled_at あり）なのに、セットの契約が無い（crm_until が今日より前／空）」店だけ。
//     ★ 切り替えていない店（フクエスリンク・マイページで編集している店）には効かない。
//   ・設定（ID・PASS、連携の向き、送り先、conecf_enabled_at）には触らない。★ ON に戻せば次の周から元どおり送る。
//   ・★ 読めなかったとき（error）は【止めない】。読み取りの不調で、契約している店の送信を止めないため（console.error は出す）。
// ★ 決めごと（判定・文）は src/lib/setPlan.ts。ここは DB から2列読んで当てるだけ。

type Svc = SupabaseClient;

/** 止めているなら店舗様に見せる文、止めていなければ null */
export async function conecfStopNote(svc: Svc, salonId: number): Promise<string | null> {
  const { data, error } = await svc.from('salons').select('conecf_enabled_at, crm_until').eq('id', salonId).maybeSingle();
  if (error) {
    console.error('[conecf] セットの契約を読めなかった（止めずに進める）', salonId, error.code, error.message);
    return null;
  }
  if (!data) return null;
  return isConecfStopped(
    { conecfEnabledAt: (data.conecf_enabled_at as string | null) ?? null, crmUntil: (data.crm_until as string | null) ?? null },
    getCalendarDateJST(),
  ) ? CONECF_STOPPED_MESSAGE : null;
}

/**
 * ★ 第1291便: 中継の流れ（startRelayFlow）を始めてよいか。止めるなら店舗様に見せる文、よければ null。
 *   write=true（相手サイトを書き換える流れ）は、コネックエフに切り替えた店だけ（決めごとは lib/setPlan.ts の conecfFlowBlockMessage）。
 *   ★ 読めなかったとき（error）・店が見つからないときは【止めない】（conecfStopNote と同じ作法）。
 */
export async function conecfFlowNote(svc: Svc, salonId: number, opts: { write: boolean }): Promise<string | null> {
  const { data, error } = await svc.from('salons').select('conecf_enabled_at, crm_until').eq('id', salonId).maybeSingle();
  if (error) {
    console.error('[conecf] 店舗の設定を読めなかった（止めずに進める）', salonId, error.code, error.message);
    return null;
  }
  if (!data) return null;
  return conecfFlowBlockMessage(
    { conecfEnabledAt: (data.conecf_enabled_at as string | null) ?? null, crmUntil: (data.crm_until as string | null) ?? null },
    getCalendarDateJST(),
    opts,
  );
}
