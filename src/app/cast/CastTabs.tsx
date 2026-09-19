'use client';

// /cast の3タブ（写メ日記・着せ替え・今すぐ）。/mypage のタブUI（activeTab state＋ピル型チップ）を踏襲。
// ★ 第516便: スマホは画面下に固定のタブバー、PC は上のピル型。fukuX はヘッダーのアイコンへ移した。
// 初期表示は「写メ日記」。中身は既存コンポーネントをそのまま配置（移植のみ・ロジック非変更）：
//  - 写メ日記：CastDiary（投稿フォーム＋自分の日記一覧）
//  - 着せ替え：CastThemePicker（ページの色を選ぶ。背景適用は親の CastThemeProvider が担い、タブ切替後も維持）
//  - 今すぐ：準備中表示（フェーズ3で実装）
// テーマ背景はページ全体（CastThemeProvider）に効くため、タブを切り替えても維持される。

import { useCallback, useRef, useState } from 'react';
import { CastDiary } from './CastDiary';
import { CastThemePicker } from './CastTheme';
import { CastImasugu } from './CastImasugu';
import { CastCustomers } from './CastCustomers';

type CastTab = 'diary' | 'theme' | 'now' | 'records';

// ★ 第516便: スマホは画面下に固定のタブバー（アイコン＋文字）。PC（md 以上）は上のピル型のまま。
//   アイコンはライブラリを入れずに SVG で持つ（線の太さ・大きさをそろえるため全部 24×24・stroke 1.8）。
const ICON_PATHS: Record<CastTab, string> = {
  // カメラ
  diary: 'M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.2-1.8A1.5 1.5 0 0 1 9.6 3.5h4.8a1.5 1.5 0 0 1 1.2.7L16.8 6h1.7A2.5 2.5 0 0 1 21 8.5v9A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-9Z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
  // 稲妻
  now: 'M13 2.5 4.5 13.5H11l-1 8 8.5-11H12l1-8Z',
  // パレット
  theme: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.8-.8 1.8-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3Z M7.5 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M10 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z M14.5 8a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  // ノート（記録帳）
  records: 'M6 3.5h11A1.5 1.5 0 0 1 18.5 5v14a1.5 1.5 0 0 1-1.5 1.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5Z M8.5 8h6 M8.5 11.5h6 M8.5 15h3.5',
};

function TabIcon({ tab, className }: { tab: CastTab; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICON_PATHS[tab].split(' M').map((d, i) => (
        <path key={i} d={i === 0 ? d : `M${d}`} />
      ))}
    </svg>
  );
}

const TABS: ReadonlyArray<readonly [CastTab, string]> = [
  ['diary', '写メ日記'],
  ['now', '今すぐ'],
  ['theme', '着せ替え'],
  ['records', '記録帳'], // ★ 第518便: お客様記録帳（第496便）と報酬帳（第498便）を1つに
];

export function CastTabs({
  therapistId,
  therapistName,
  salonId,
  xProfileId,
  imasuguOn,
  imasuguUntil,
  ownerImasuguOn,
  ownerImasuguUntil,
  importImasuguOn,
  importImasuguUntil,
  today,
  businessDate,
  todayReward,
  todayRewardCount,
  diaryToday,
}: {
  therapistId: string;
  therapistName: string;
  salonId: number;
  xProfileId: string | null; // 連携 fukuX プロフィール id（非連携は null）。日記の fukuX 同時投稿に使う
  imasuguOn: boolean;
  imasuguUntil: string | null;
  ownerImasuguOn: boolean;
  ownerImasuguUntil: string | null;
  // ★ 駅ちかの「即ヒメ」から取り込んだ枠（第39便）。表示だけに使う。排他制御には混ぜない。
  importImasuguOn: boolean;
  importImasuguUntil: string | null;
  today: { is_active: boolean; start_time: string | null; end_time: string | null };
  businessDate: string; // ★ 第498便: 報酬の「今日」（営業日・YYYY-MM-DD）。第518便から記録帳に渡す
  // ★ 第524便: 今日のまとめ（ページを開いた時点の値）
  todayReward: number;
  todayRewardCount: number;
  diaryToday: number;
}) {
  const [activeTab, setActiveTab] = useState<CastTab>('diary');
  const topRef = useRef<HTMLDivElement>(null);
  const [reward, setReward] = useState({ total: todayReward, count: todayRewardCount });
  const onTodayChange = useCallback((total: number, count: number) => setReward({ total, count }), []);
  // 今すぐ：本人・お店・取り込みのどれかが有効なら受付中（開いた時点で判定）
  const [imasuguUntilShown] = useState<string | null>(() => {
    const now = Date.now();
    const live = [[imasuguOn, imasuguUntil], [ownerImasuguOn, ownerImasuguUntil], [importImasuguOn, importImasuguUntil]] as const;
    const ends = live.filter(([on, u]) => on && u && new Date(u).getTime() > now).map(([, u]) => new Date(u as string).getTime());
    return ends.length ? new Date(Math.max(...ends)).toISOString() : null;
  });

  // タブを切り替えたら、中身の先頭が見える位置まで戻す（下のタブバーから押したときに、前のタブの途中のまま残らないように）。
  const selectTab = (key: CastTab) => {
    setActiveTab(key);
    const el = topRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={topRef} className="space-y-5 scroll-mt-20">
      {/* ★ 第524便: 今日のまとめ（出勤・今すぐ・報酬・日記）。押すとそのタブへ */}
      <TodaySummary
        today={today}
        imasuguUntil={imasuguUntilShown}
        reward={reward}
        diaryToday={diaryToday}
        onPick={selectTab}
      />

      {/* PC（md 以上）: 上のピル型タブ */}
      <div className="hidden md:flex flex-wrap justify-center gap-2">
        {TABS.map(([key, label]) => {
          const selected = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => selectTab(key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1.5 px-4 min-h-[44px] rounded-full border text-[14px] font-bold transition-colors ${
                selected
                  ? 'bg-pink-50 text-pink-600 border-pink-300'
                  : 'bg-white text-slate-500 border-slate-200 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <TabIcon tab={key} className="w-4 h-4" />
              {label}
            </button>
          );
        })}
      </div>

      {/* スマホ: 画面下に固定のタブバー。★ 本文は page.tsx の main に下の余白（pb）を足してある */}
      <nav
        aria-label="メニュー"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-pink-100 shadow-[0_-4px_12px_rgba(0,0,0,0.05)] pb-[env(safe-area-inset-bottom)]"
      >
        <div className="max-w-2xl mx-auto grid grid-cols-4">
          {TABS.map(([key, label]) => {
            const selected = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => selectTab(key)}
                aria-pressed={selected}
                className={`relative flex flex-col items-center justify-center gap-0.5 min-h-[60px] pt-1.5 pb-1 text-[13px] font-bold transition-colors ${
                  selected ? 'text-pink-600' : 'text-slate-400 active:text-slate-600'
                }`}
              >
                {selected && <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-full bg-pink-500" />}
                <TabIcon tab={key} className="w-6 h-6" />
                {label}
              </button>
            );
          })}
        </div>
      </nav>

      {/* タブ中身 */}
      {activeTab === 'diary' && (
        <CastDiary therapistId={therapistId} therapistName={therapistName} salonId={salonId} xProfileId={xProfileId} />
      )}

      {activeTab === 'theme' && <CastThemePicker />}

      {activeTab === 'records' && <CastCustomers today={businessDate} onTodayChange={onTodayChange} />}

      {activeTab === 'now' && (
        <CastImasugu
          initialOn={imasuguOn}
          initialUntil={imasuguUntil}
          ownerOn={ownerImasuguOn}
          ownerUntil={ownerImasuguUntil}
          importOn={importImasuguOn}
          importUntil={importImasuguUntil}
          today={today}
        />
      )}
    </div>
  );
}

// ★ 第524便: 今日のまとめ（横並びの小さなタイル4つ）。★ 出勤・今すぐ・日記はページを開いた時点の値、報酬は記録帳の変更に合わせて変わる
function jstHm(iso: string): string {
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
}

function TodaySummary({
  today,
  imasuguUntil,
  reward,
  diaryToday,
  onPick,
}: {
  today: { is_active: boolean; start_time: string | null; end_time: string | null };
  imasuguUntil: string | null;
  reward: { total: number; count: number };
  diaryToday: number;
  onPick: (tab: CastTab) => void;
}) {
  const onDuty = today.is_active && !!today.start_time;
  const tiles: { key: string; tab: CastTab; label: string; value: string; sub: string; hot: boolean }[] = [
    { key: 'duty', tab: 'now', label: '出勤', value: onDuty ? today.start_time! : 'お休み', sub: onDuty ? `〜${today.end_time ?? ''}` : '本日', hot: onDuty },
    { key: 'now', tab: 'now', label: '今すぐ', value: imasuguUntil ? '受付中' : 'OFF', sub: imasuguUntil ? `〜${jstHm(imasuguUntil)}` : '—', hot: !!imasuguUntil },
    { key: 'reward', tab: 'records', label: '今日の報酬', value: `¥${reward.total.toLocaleString('ja-JP')}`, sub: `${reward.count}人`, hot: reward.total > 0 },
    { key: 'diary', tab: 'diary', label: '今日の日記', value: `${diaryToday}件`, sub: diaryToday > 0 ? '投稿済み' : 'まだ', hot: diaryToday > 0 },
  ];
  return (
    <div className="grid grid-cols-4 gap-2">
      {tiles.map((t) => (
        <button
          key={t.key}
          type="button"
          onClick={() => onPick(t.tab)}
          className="min-w-0 rounded-2xl bg-white/85 backdrop-blur-sm border border-pink-100 shadow-sm px-1.5 py-2.5 text-center hover:border-pink-300 transition-colors"
        >
          <span className="block text-[10px] font-bold text-slate-400 leading-none truncate">{t.label}</span>
          <span className={`block mt-1.5 text-[13px] sm:text-[15px] font-black leading-none tabular-nums truncate ${t.hot ? 'text-pink-600' : 'text-slate-400'}`}>{t.value}</span>
          <span className="block mt-1 text-[10px] text-slate-400 leading-none tabular-nums truncate">{t.sub}</span>
        </button>
      ))}
    </div>
  );
}
