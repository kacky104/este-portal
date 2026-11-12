'use client';

// ★ 第1965便（2026-11-12・カッキーさん）: フクエスお知らせの自動投稿の時刻（タイマー更新／時刻指定更新）。
//   画面の中身は上位表示と同じ部品（ScheduleEditor）。手動と自動を合わせて1日10回まで・朝6時に戻る。
//   ★ 設定して「始める」を押した店だけ、この時刻で出る。止めると、今までどおり（1日1回・お店ごとに決まった時刻）に戻る。
//   ★ 「いま1回」のボタンは出さない（お知らせの一覧の「再投稿」が同じ役目）。
import { useCallback, useState } from 'react';
import { useLoadOnMount } from '../../conecfClientUtil';
import { ConecfShell } from '../../ConecfShell';
import { useToast } from '@/app/components/useToast';
import { getAnnounceSchedule, saveAnnounceSchedule } from '@/app/actions/conecfAnnounceSchedule';
import type { ConecfBumpSlot } from '@/app/actions/conecfBump';
import { ANNOUNCE_SCHEDULE_DAILY_LIMIT, ANNOUNCE_SCHEDULE_INTERVAL_CHOICES, ANNOUNCE_SCHEDULE_MAX_PER_DAY } from '@/lib/announceSchedule';
import { ScheduleEditor } from '../../bump/ScheduleEditor';

const BOX = 'bg-white border border-slate-200 p-5 text-[16px]';

function Body({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const [d, setD] = useState<{ ready: boolean; slot: ConecfBumpSlot; targetCount: number | null } | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(async () => {
    const r = await getAnnounceSchedule();
    if (!r.ok) { setError(r.error); return; }
    setD(r.data); setError('');
  }, []);
  useLoadOnMount(load);
  if (error) return <div className={`${BOX} text-slate-500`}>読み込めませんでした（{error}）</div>;
  if (!d) return <div className={`${BOX} text-slate-400`}>読み込み中…</div>;
  if (!d.ready) return <div className={`${BOX} text-slate-500`}>この設定は準備中です。運営事務局までご連絡ください。</div>;
  const s = d.slot;
  return (
    <div className="space-y-3">
      <div className="bg-white border border-slate-200 px-4 py-3 text-[14px] leading-relaxed text-slate-600">
        <p>「自動投稿」にしたお知らせを、決めた時刻に1本ずつ・順番に、フクエスの新着の先頭へ出します。</p>
        <p>手で投稿した分と合わせて <b>1日{ANNOUNCE_SCHEDULE_DAILY_LIMIT}回まで</b>（毎朝6時に戻ります）。止めているあいだは、今までどおり1日1回・お店ごとに決まった時刻に出ます。</p>
        {d.targetCount === 0 && <p className="mt-1 font-bold text-rose-700">いま「自動投稿」にしたお知らせがありません。お知らせの一覧で「自動投稿にする」を押してください。</p>}
      </div>
      <ScheduleEditor key={[s.enabled, s.startMin, s.endMin, s.intervalMin, (s.times ?? []).join(',')].join('|')}
        s={s} enabled={enabled} onToast={onToast} onSaved={load}
        name="お知らせ" siteName="フクエス" defaultQuota={ANNOUNCE_SCHEDULE_DAILY_LIMIT} choices={ANNOUNCE_SCHEDULE_INTERVAL_CHOICES}
        heading={<>フクエス　<span className="text-rose-600">お知らせの自動投稿</span></>}
        back={{ href: '/announce', label: 'フクエスお知らせへ' }}
        timesMax={ANNOUNCE_SCHEDULE_MAX_PER_DAY} verb="投稿し" what="自動投稿"
        lagNote="見回りは10分ごとなので、実際に出るのは時刻から10分以内です。"
        quotaNote={`お知らせは1日${ANNOUNCE_SCHEDULE_DAILY_LIMIT}回までなので、この設定は保存できません。間隔を広げるか、時間帯を短くしてください。`}
        save={(i) => saveAnnounceSchedule(i)} />
    </div>
  );
}

export default function ConecfAnnounceSchedulePage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="announce" title="お知らせの自動投稿の時刻" toast={toast}>
      {(a) => <Body enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
