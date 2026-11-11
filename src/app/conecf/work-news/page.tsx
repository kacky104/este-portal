'use client';

// コネックエフ「フクエスワーク新着情報」（第1962便・2026-11-12・カッキーさん）。
//
// ★★ マイページの求人の「新着情報」（/mypage/jobs/news）と【同じこと】をコネックエフでできるようにする。
//   中身はマイページと同じ部品（JobNewsManager）をそのまま使う＝ DB の読み書きもマイページと同じ道（新しい道は作らない）。
//   どちらで書いても同じ新着情報。「自動投稿」に印を付けたものは、1日1回・順番に求人ページの新着の上へ出る（周は work-news-auto）。
// ★ 入口はサイト自動更新一覧の「フクエス」（サイドバーには出さない・conecfNav の AUTO_HUB_CHILDREN）。
// ★ 求人がまだ無いお店には、出す先が無いことを案内する（真っ白にしない）。
// ★ 保存できるのは「コネックエフに切り替える」を押した店だけ（ほかの画面と同じ）。
// ★ 第1963便（カッキーさん）: 運営がほかの人の店を操作中でも使える。
//   表（work_news）は前から運営に開いている。画像の箱（work-news-images）は 追加SQL_第1963便 で運営に開ける。
//   fukuX への同時投稿だけは出さない（運営の fukuX アカウントに出てしまうため）。

import { ConecfShell } from '../ConecfShell';
import { JobNewsManager } from '@/app/mypage/JobNewsManager';
import { useMyJob } from '@/app/mypage/jobs/useMyJob';

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

function Body({ salonId, enabled, operator }: { salonId: number; enabled: boolean; operator: boolean }) {
  const { job, loading, loadError } = useMyJob(salonId);
  if (loading) return <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>;
  if (loadError) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{loadError}）</div>;
  if (!job) {
    return (
      <div className={`${CARD} p-5 text-[14px] leading-relaxed text-slate-600`}>
        まだフクエスワークの求人がありません。新着情報は求人ページに出るお知らせなので、先にフクエスのマイページで求人をつくってください。
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className={`${CARD} p-4 text-[13.5px] text-slate-500 leading-relaxed`}>
        フクエスワークの求人ページに出る「新着情報」です。自動投稿にすると、1日1回・順番に新着の先頭へ出します。
      </div>
      {enabled
        ? <JobNewsManager salonId={salonId} operator={operator} />
        : (
          <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
            新着情報を書くには、ホームで「コネックエフに切り替える」を押してください。
          </div>
        )}
    </div>
  );
}

export default function ConecfWorkNewsPage() {
  return (
    <ConecfShell current="workNews" title="フクエスワーク新着情報">
      {(a) => (a.salonId == null
        ? <div className={`${CARD} p-5 text-[14px] text-slate-500`}>店舗が選ばれていません。</div>
        : <Body salonId={a.salonId} enabled={!!a.enabledAt} operator={!!a.acting} />)}
    </ConecfShell>
  );
}
