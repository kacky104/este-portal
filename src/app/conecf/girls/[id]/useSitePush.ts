'use client';

import { useState } from 'react';
import {
  startConecfEkichikaEdit, previewConecfEkichikaPhotoRemovals,
  startConecfEsutamaEdit, previewConecfEsutamaPhotoRemovals,
} from '@/app/actions/conecfGirlEdit';
import type { PhotoRemoval } from '../PhotoRemoveConfirm';

// サイトへ「更新する」の共通の動き（第732便・2026-09-23）。
// ★ EkichikaEditPanel / EsutamaEditPanel と、各タブの「保存して更新」（GirlExtraTabs）が同じ動きを使う。
//   ★ 2か所に書くと、写真が消える確認（第428便）を片方だけ忘れる。
// ★ 流れ: 切り替え済みか → 消える写真があるか（preview）→ あれば確認を出して止まる → 無ければ送る。
// ★ 結果は待たない（受け付けて終わり）。★ 結果は「更新結果」に出る。

export type PushSite = 'ekichika' | 'esutama';
const LABEL: Record<PushSite, string> = { ekichika: '駅ちか', esutama: 'エステ魂' };

export function useSitePush(site: PushSite, id: number, enabled: boolean, onToast: (m: string) => void) {
  const [busy, setBusy] = useState(false);
  const [removals, setRemovals] = useState<PhotoRemoval[] | null>(null);
  const label = LABEL[site];

  const send = async (allowRemove: boolean) => {
    setBusy(true);
    const r = site === 'ekichika'
      ? await startConecfEkichikaEdit({ id, apply: true, allowRemove })
      : await startConecfEsutamaEdit({ id, apply: true, allowRemove });
    setBusy(false);
    setRemovals(null);
    onToast(r.ok ? `${label}への更新を受け付けました。結果は「更新結果」に出ます` : r.error);
    return r.ok;
  };

  /** ★ 押したときの入口。★ quiet=true のときは「切り替えていない」の知らせを出さない（保存して更新から呼ぶとき用） */
  const onUpdate = async (opts: { quiet?: boolean } = {}) => {
    if (!enabled) { if (!opts.quiet) onToast('更新するには、ホームで「コネックエフに切り替える」を押してください'); return false; }
    setBusy(true);
    const p = site === 'ekichika'
      ? await previewConecfEkichikaPhotoRemovals({ ids: [id] })
      : await previewConecfEsutamaPhotoRemovals({ ids: [id] });
    setBusy(false);
    if (!p.ok) { onToast(p.error); return false; }
    if (p.data.length > 0) { setRemovals(p.data); return false; }   // ★ 確認待ち（送っていない）
    return send(false);
  };

  return { busy, removals, setRemovals, send, onUpdate, label };
}
