'use client';

import { useEffect, useState } from 'react';
import { getSalonCastLinks } from '@/app/actions/castInvite';

// ★ 第873便（カッキーさん）: 写メ日記転送（コネックエフ）の「連携」列。
//   セラピストページ（/cast）と連携済みなら〇・まだなら✕。★ 連携しないと写メ日記を送れないため。
// ★ enabled=false（フクエスリンク側）では読まない＝列も出さない。

/** 連携済みのセラピスト id の集合。★ 読めない／使わないときは null（列を出さない） */
export function useCastLinked(salonId: number | null, enabled: boolean): Set<string> | null {
  const [linked, setLinked] = useState<Set<string> | null>(null);
  useEffect(() => {
    if (!enabled || salonId == null) return;
    let live = true;
    void getSalonCastLinks({ salonId }).then((r) => {
      if (live && r.ok) setLinked(new Set(r.linkedIds));
    }).catch(() => { /* ★ 読めなければ列を出さない */ });
    return () => { live = false; };
  }, [salonId, enabled]);
  return enabled ? linked : null;
}

export function CastLinkMark({ linked }: { linked: boolean }) {
  return linked
    ? <span className="text-[16px] font-bold text-emerald-600" title="セラピストページと連携済み">〇</span>
    : <span className="text-[16px] font-bold text-rose-500" title="セラピストページと未連携（写メ日記を送れません）">✕</span>;
}
