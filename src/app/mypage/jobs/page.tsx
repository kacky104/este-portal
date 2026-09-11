'use client';

import Link from 'next/link';
import { useState } from 'react';
// ★ deleteMyJob は【この画面からは呼ばない】（2026-09-11・カッキーさんの指示）。
//   ★ 求人と応募履歴がまとめて消え、取り返しがつかないため、削除ボタンごと外した。
//   ★ サーバー側の deleteMyJob（src/app/actions/jobs）はそのまま残してある（★ 運営が使う口）。
import { toggleMyJobActive } from '@/app/actions/jobs';
import { useJobsGate } from './useJobsGate';
import { useMyJob } from './useMyJob';
import { WorkShell } from './WorkShell';
import { useToast } from '@/app/components/useToast';
import { useNewApplicationCount, NewCountBadge } from './useNewApplications';

// フクエスワークのホーム（第220便・2026-09-08・カッキーさんの指示で /mypage の「求人」タブから独立）。
//
// ★★ この画面が引き受けるのは【状態を見せること】だけ。★ 入力は「求人内容」へ、応募は「応募」へ渡す。
//   ★ フクエスリンクのホームと同じ考え方（状態を上に・操作は各画面へ）。

export default function WorkHomePage() {
  const { decision, salon, loadError } = useJobsGate();
  const { toast, showToast } = useToast();
  const salonId = salon ? salon.id : null;
  const { job, setJob, loading, loadError: jobError } = useMyJob(salonId);
  const [busy, setBusy] = useState(false);
  // ★ 未対応（新規のまま）の応募の数。★ 「応募」カードの右に赤丸で出す（2026-09-11）。
  const newApplications = useNewApplicationCount(salonId);

  // ★ 状態バッジの見た目（2026-09-11・カッキーさんの指示）。
  //   ★ スマホ: 横いっぱい・中央寄せ・縦は細め（py-0.5）。
  //   ★ PC: 文字幅ぶんの箱に戻す（sm:inline-block / sm:w-auto / sm:py-1.5）。
  const badgeClass =
    'block w-full text-center text-[15px] font-black text-white px-4 py-0.5 shadow-sm ' +
    'sm:inline-block sm:w-auto sm:py-1.5';

  const handleToggle = async () => {
    if (!job) return;
    setBusy(true);
    const res = await toggleMyJobActive(job.id);
    setBusy(false);
    if (!res.ok) { showToast(res.error); return; }
    setJob({ ...job, is_active: res.is_active });
    showToast(res.is_active ? '公開にしました' : '非公開にしました');
  };

  // ★ 削除はこの画面から無くした（2026-09-11）。★ 消したいときは非公開にして運営へ連絡。

  return (
    <WorkShell
      decision={decision}
      loadError={loadError}
      salonName={salon?.name ?? null}
      salonId={salonId}
      title="ホーム"
      current="home"
      toast={toast}
    >
      {/* ── 状態 ─────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 shadow-sm p-5">
        {loading ? (
          <p className="text-[14px] text-slate-400">読み込み中です…</p>
        ) : jobError ? (
          <p className="text-[14px] text-rose-600">求人情報の取得に失敗しました：{jobError}</p>
        ) : (
          <>
            <div className="flex items-center justify-between gap-2 flex-wrap">
              {/* ★ 見出し「いまの状態」は消し、バッジだけを大きく出す（2026-09-11・カッキーさんの指示）。
                  ★ 公開中＝緑のベタ塗り／非公開＝濃いグレー／未作成＝薄いグレーの枠。★ ひと目で分かる大きさに。 */}
              {/* ★ スマホは【横いっぱい・縦は細め】（2026-09-11・カッキーさんの指示）。
                  ★ PC（sm:以上）は今までどおり文字幅ぶんの箱。 */}
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {job ? (
                  job.is_active ? (
                    <span className={badgeClass} style={{ background: 'linear-gradient(90deg,#059669,#84CC16)' }}>公開中</span>
                  ) : (
                    <span className={`${badgeClass} bg-slate-500`}>非公開</span>
                  )
                ) : (
                  <span className={`${badgeClass} !text-slate-400 bg-slate-100 border border-slate-200`}>未作成</span>
                )}
              </div>

              {job && (
                // ★★ ボタンの並び（2026-09-11・カッキーさんの指示）。
                //   ★ スマホ: 枠いっぱいに2等分（バッジの左右の端とぴったり揃う）。
                //   ★ PC: 文字幅ぶん＋min-w-[150px] で2つの大きさを揃える。
                //   ★ 非公開のときはボタンが1つなので、そのときは1列にする（半分幅にしない）。
                <div className={`grid gap-2 w-full sm:flex sm:w-auto sm:items-center ${job.is_active ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {job.is_active && (
                    <a
                      href={`/jobs/${job.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="w-full sm:w-auto sm:min-w-[150px] inline-flex items-center justify-center text-center text-[12px] font-bold px-3 py-1.5 border transition-colors"
                      style={{ borderColor: '#6EE7B7', color: '#059669' }}
                    >
                      掲載ページを見る
                    </a>
                  )}
                  <button
                    onClick={handleToggle}
                    disabled={busy}
                    className="w-full sm:w-auto sm:min-w-[150px] inline-flex items-center justify-center text-center text-[12px] font-bold px-3 py-1.5 border border-slate-200 text-slate-500 hover:bg-slate-50 hover:border-slate-300 transition-colors disabled:opacity-50"
                  >
                    {job.is_active ? '非公開にする' : '公開する'}
                  </button>
                  {/* ★ 削除ボタンは置かない（2026-09-11・カッキーさんの指示）。
                      ★ 求人と応募履歴が一緒に消えて戻せないため。★ 掲載をやめるときは「非公開にする」。 */}
                </div>
              )}
            </div>

            <p className="mt-2.5 text-[14px] text-slate-500 leading-relaxed">
              {job
                ? job.is_active
                  ? 'フクエスワークに掲載中です。'
                  : 'いまは非公開です。'
                : 'まだ求人がありません。「求人内容」から作成すると、フクエスワークに掲載されます（1店舗1件）。'}
            </p>
          </>
        )}
      </div>

      {/* ── 各画面への入口 ───────────────────────────── */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
        {[
          { href: '/mypage/jobs/edit', label: '求人内容', desc: job ? '掲載している内容を直す' : '求人をつくる', badge: 0 },
          // ★ 「応募」だけ、未対応の件数を赤丸で出す（2026-09-11・カッキーさんの指示）。
          { href: '/mypage/jobs/applications', label: '応募', desc: '届いた応募を見る', badge: newApplications },
          { href: '/mypage/jobs/news', label: '新着情報', desc: '求人ページに出るお知らせを書く', badge: 0 },
        ].map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="block bg-white border border-slate-200 shadow-sm p-4 hover:border-emerald-300 hover:shadow transition-all"
          >
            <p className="text-[15px] font-black text-slate-700 flex items-center gap-2">
              {t.label}
              <NewCountBadge count={t.badge} />
            </p>
            <p className="mt-1 text-[13px] text-slate-400 leading-relaxed">{t.desc}</p>
          </Link>
        ))}
      </div>

      <ul className="mt-4 text-[12.5px] text-slate-400 leading-relaxed space-y-1 list-disc pl-4">
        <li>店舗が非表示の間は、求人も非公開になります。</li>
      </ul>
    </WorkShell>
  );
}
