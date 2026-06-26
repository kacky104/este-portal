'use client';

// /cast の3タブ（写メ日記・着せ替え・今すぐ）。/mypage のタブUI（activeTab state＋ピル型チップ）を踏襲。
// 初期表示は「写メ日記」。中身は既存コンポーネントをそのまま配置（移植のみ・ロジック非変更）：
//  - 写メ日記：CastDiary（投稿フォーム＋自分の日記一覧）
//  - 着せ替え：CastThemePicker（ページの色を選ぶ。背景適用は親の CastThemeProvider が担い、タブ切替後も維持）
//  - 今すぐ：準備中表示（フェーズ3で実装）
// テーマ背景はページ全体（CastThemeProvider）に効くため、タブを切り替えても維持される。

import { useState } from 'react';
import { CastDiary } from './CastDiary';
import { CastThemePicker } from './CastTheme';
import { CastImasugu } from './CastImasugu';

type CastTab = 'diary' | 'theme' | 'now';

const TABS: ReadonlyArray<readonly [CastTab, string]> = [
  ['diary', '写メ日記'],
  ['theme', '着せ替え'],
  ['now', '今すぐ'],
];

export function CastTabs({
  therapistId,
  therapistName,
  salonId,
  imasuguOn,
  imasuguUntil,
  ownerImasuguOn,
  ownerImasuguUntil,
  today,
}: {
  therapistId: string;
  therapistName: string;
  salonId: number;
  imasuguOn: boolean;
  imasuguUntil: string | null;
  ownerImasuguOn: boolean;
  ownerImasuguUntil: string | null;
  today: { is_active: boolean; start_time: string | null; end_time: string | null };
}) {
  const [activeTab, setActiveTab] = useState<CastTab>('diary');

  return (
    <div className="space-y-5">
      {/* タブバー（/mypage のチップを踏襲。3タブなので横並び、窮屈なら折り返す） */}
      <div className="flex flex-wrap justify-center gap-1.5">
        {TABS.map(([key, label]) => {
          const selected = activeTab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              aria-pressed={selected}
              className={`inline-flex items-center gap-1 px-4 py-1.5 rounded-full border text-[12px] font-bold transition-colors ${
                selected
                  ? 'bg-pink-50 text-pink-600 border-pink-300'
                  : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600 hover:border-slate-300'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* タブ中身 */}
      {activeTab === 'diary' && (
        <CastDiary therapistId={therapistId} therapistName={therapistName} salonId={salonId} />
      )}

      {activeTab === 'theme' && <CastThemePicker />}

      {activeTab === 'now' && (
        <CastImasugu
          initialOn={imasuguOn}
          initialUntil={imasuguUntil}
          ownerOn={ownerImasuguOn}
          ownerUntil={ownerImasuguUntil}
          today={today}
        />
      )}
    </div>
  );
}
