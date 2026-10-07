'use client';

import { useState } from 'react';
import {
  startConecfEkichikaEdit, previewConecfEkichikaPhotoRemovals,
  startConecfEsutamaEdit, previewConecfEsutamaPhotoRemovals,
} from '@/app/actions/conecfGirlEdit';
import type { PhotoRemoval } from '../PhotoRemoveConfirm';
import { sitePushToast, type SitePushOutcome } from '@/lib/conecfSitePush';

// サイトへ「更新する」の共通の動き（第732便・2026-09-23）。
// ★ 各タブの「保存して更新」（GirlExtraTabs・page.tsx）が同じ動きを使う（第758便で旧 EkichikaEditPanel / EsutamaEditPanel は削除）。
//   ★ 2か所に書くと、写真が消える確認（第428便）を片方だけ忘れる。
// ★ 流れ: 切り替え済みか → 消える写真があるか（preview）→ あれば確認を出して止まる → 無ければ送る。
// ★ 結果は待たない（受け付けて終わり）。★ 結果は「更新結果」に出る。
// ★★ 第1289便: 結果（SitePushOutcome）を返す。silent=true のときはお知らせを出さない＝呼ぶ側が2サイトぶんを1つにまとめて出す
//   （★ 駅ちかのお知らせが、直後のエステ魂のお知らせで上書きされていた）。送る枠はサーバー側が決める（枠1固定をやめた）。

export type PushSite = 'ekichika' | 'esutama';
const LABEL: Record<PushSite, string> = { ekichika: '駅ちか', esutama: 'エステ魂' };

export function useSitePush(site: PushSite, id: number, enabled: boolean, onToast: (m: string) => void) {
  const [busy, setBusy] = useState(false);
  const [removals, setRemovals] = useState<PhotoRemoval[] | null>(null);
  const label = LABEL[site];

  /** ★ お知らせを出す（そのサイトだけを名指しで押したとき用＝送っていない理由も言う） */
  const tell = (o: SitePushOutcome) => { const m = sitePushToast([o], { explicit: true }); if (m) onToast(m); };

  const send = async (allowRemove: boolean, opts: { silent?: boolean } = {}): Promise<SitePushOutcome> => {
    setBusy(true);
    const r = site === 'ekichika'
      ? await startConecfEkichikaEdit({ id, apply: true, allowRemove })
      : await startConecfEsutamaEdit({ id, apply: true, allowRemove });
    setBusy(false);
    setRemovals(null);
    const o: SitePushOutcome = r.ok
      ? { site: label, state: 'sent', labels: r.data.queued, notes: r.data.notes }
      : { site: label, state: r.off === true ? 'off' : 'failed', note: r.error };
    if (!opts.silent) tell(o);
    return o;
  };

  /**
   * ★ 押したときの入口。★ quiet=true のときは「切り替えていない」の知らせを出さない（保存して更新から呼ぶとき用）。
   *   ★ 切り替えていないときは null（何もしていない）。写真が消える確認で止まったときは state: 'confirm'（まだ送っていない）。
   */
  const onUpdate = async (opts: { quiet?: boolean; silent?: boolean } = {}): Promise<SitePushOutcome | null> => {
    if (!enabled) { if (!opts.quiet) onToast('更新するには、ホームで「コネックエフに切り替える」を押してください'); return null; }
    setBusy(true);
    const p = site === 'ekichika'
      ? await previewConecfEkichikaPhotoRemovals({ ids: [id] })
      : await previewConecfEsutamaPhotoRemovals({ ids: [id] });
    setBusy(false);
    if (!p.ok) {
      const o: SitePushOutcome = { site: label, state: 'failed', note: p.error };
      if (!opts.silent) tell(o);
      return o;
    }
    if (p.data.length > 0) { setRemovals(p.data); return { site: label, state: 'confirm' }; }   // ★ 確認待ち（送っていない）
    return send(false, { silent: opts.silent });
  };

  return { busy, removals, setRemovals, send, onUpdate, label };
}
