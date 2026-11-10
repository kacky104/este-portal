'use client';

// ★ 第1928便（2026-11-11・カッキーさん「フクエスも駅ちかみたいに」）: フクエスの上位表示（TOP・地域ページ）の設定画面。
//   中身はマイページと同じ部品（SalonBumpButton）。運営が店を操作中はサーバー経由（第1927便）
import Link from 'next/link';
import { ConecfShell } from '../../ConecfShell';
import { useConecfActing } from '../../ConecfSession';
import { useConecfHref } from '../../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { SalonBumpButton } from '@/app/components/SalonBumpButton';

function Body({ salonId }: { salonId: number | null }) {
  const href = useConecfHref();
  const acting = useConecfActing();
  return (
    <div className="space-y-3 pb-40">
      <Link href={href('/bump')} className="inline-flex items-center gap-1 text-[15px] font-bold text-slate-500 hover:text-slate-700">← 上位表示設定の一覧へ</Link>
      <p className="text-[16px] font-black text-slate-700">フクエス　<span className="text-rose-600">TOP・地域ページ</span></p>
      {salonId != null
        ? <SalonBumpButton salonId={salonId} operator={acting} />
        : <div className="bg-white border border-slate-200 p-5 text-[14px] text-slate-500">店舗情報が見つかりません</div>}
    </div>
  );
}

export default function ConecfFukuesBumpPage() {
  const { toast } = useToast();
  return (
    <ConecfShell current="bump" title="フクエスの上位表示" toast={toast}>
      {(a) => <Body salonId={a.salonId} />}
    </ConecfShell>
  );
}
