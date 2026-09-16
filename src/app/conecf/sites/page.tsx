'use client';

import { ConecfShell } from '../ConecfShell';
import { LoginBoard } from '@/app/mypage/media/LoginBoard';
import { useToast } from '@/app/components/useToast';

// コネックエフ「ID・PASS登録」（第396便・1b）。
// ★ 中身はフクエスリンクの「ログイン情報（ID・PW）」と同じ部品。
// ★★ フクエスも一覧に出す（カッキーさんの決定：表向きフクエスのサイトではないため）。
//   ★ フクエスは同じ仕組みの中にあるので ID・PASS はいらない。★ 「自動で連携済み」とだけ出す。

export default function ConecfSitesPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="sites" title="ID・PASS登録" toast={toast}>
      {(a) => (
        <div className="space-y-3">
          <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] px-4 py-3.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <b className="text-[16px] font-black text-slate-800">フクエス</b>
            <span className="text-[12.5px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5">自動で連携済み</span>
            <span className="text-[13px] text-slate-500 leading-relaxed">ID・PASSの登録はいりません。コネックエフで入力した時点で反映されます。</span>
          </div>
          <LoginBoard salonId={a.salonId} onToast={showToast} />
        </div>
      )}
    </ConecfShell>
  );
}
