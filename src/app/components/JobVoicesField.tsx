'use client';

import {
  AGE_GROUPS,
  MAX_THERAPIST_VOICES,
  MAX_VOICE_COMMENT_LEN,
  type TherapistVoice,
} from '@/app/lib/jobs';

// 「在籍セラピストの声」入力欄（インタビュー形式・最大3件）。mypage求人フォーム／admin代理編集で共用。
// JobGalleryField の構成（最大N件・追加・個別削除・↑↓並び替え）を踏襲。画像は扱わずテキストのみ。
// 各エントリ: ★評価(1-5・クリック選択) / 年代(select・AGE_GROUPS・未選択は保存時にブロック) /
// コメント(textarea・200字カウンター・二重切り詰め)。
export function JobVoicesField({
  value,
  onChange,
}: {
  value: TherapistVoice[];
  onChange: (voices: TherapistVoice[]) => void;
}) {
  const atMax = value.length >= MAX_THERAPIST_VOICES;

  // 追加（末尾）。既定は★5・年代未選択・コメント空。年代は保存時に必須。
  const add = () => {
    if (atMax) return;
    onChange([...value, { rating: 5, ageGroup: '', comment: '' }]);
  };

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  // 並び替え（↑↓で隣と入れ替え）。表示順＝この配列順。
  const move = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= value.length) return;
    const next = [...value];
    [next[index], next[j]] = [next[j], next[index]];
    onChange(next);
  };

  const patch = (index: number, p: Partial<TherapistVoice>) => {
    onChange(value.map((v, i) => (i === index ? { ...v, ...p } : v)));
  };

  return (
    <div>
      <label className="text-[11px] font-bold text-slate-400 block mb-1">
        在籍セラピストの声（最大{MAX_THERAPIST_VOICES}件）
      </label>
      <p className="text-[10px] text-slate-400 mb-2 leading-relaxed">
        在籍セラピストへのインタビュー形式のコメントを掲載できます（任意・↑↓で並び替え）。
        <span className="block">評価（★1〜5）・年代・コメント（{MAX_VOICE_COMMENT_LEN}字まで）を入力してください。年代は必須です。</span>
      </p>

      {value.length > 0 && (
        <div className="space-y-2 mb-2">
          {value.map((v, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-slate-50/50 p-2.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] text-slate-400">{i + 1}件目</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    aria-label="上へ"
                    className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-30 transition-colors"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === value.length - 1}
                    aria-label="下へ"
                    className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-30 transition-colors"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(i)}
                    className="text-[11px] font-bold px-2.5 py-1 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 transition-colors"
                  >
                    削除
                  </button>
                </div>
              </div>

              {/* ★評価（1〜5・クリック選択）。塗り/空を切替。 */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-slate-400 w-10 flex-shrink-0">評価</span>
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => patch(i, { rating: n })}
                      aria-label={`${n}つ星`}
                      aria-pressed={v.rating >= n}
                      className="p-0.5"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" className="block">
                        <path
                          d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9 6.19 20.9l1.11-6.47L2.6 9.85l6.5-.95L12 2.5z"
                          fill={v.rating >= n ? '#F59E0B' : '#E5E7EB'}
                        />
                      </svg>
                    </button>
                  ))}
                  <span className="text-[11px] text-slate-400 ml-1">{v.rating}/5</span>
                </div>
              </div>

              {/* 年代（select・必須） */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] text-slate-400 w-10 flex-shrink-0">年代</span>
                <select
                  value={v.ageGroup}
                  onChange={(e) => patch(i, { ageGroup: e.target.value })}
                  className={`px-2 py-1.5 rounded-lg border text-xs bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 ${
                    v.ageGroup === '' ? 'border-rose-300 text-slate-400' : 'border-slate-200 text-slate-700'
                  }`}
                >
                  <option value="">選択してください</option>
                  {AGE_GROUPS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </div>

              {/* コメント（200字・カウンター・二重切り詰め） */}
              <textarea
                value={v.comment}
                maxLength={MAX_VOICE_COMMENT_LEN}
                onChange={(e) => patch(i, { comment: e.target.value.slice(0, MAX_VOICE_COMMENT_LEN) })}
                placeholder="例）未経験から始めましたが、研修が丁寧で安心して働けています。"
                className="w-full px-2 py-1.5 rounded-lg border border-slate-200 text-xs bg-white min-h-[64px] resize-y focus:outline-none focus:ring-2 focus:ring-emerald-200"
              />
              <span className="block text-[10px] text-slate-300 text-right mt-0.5">
                {v.comment.length}/{MAX_VOICE_COMMENT_LEN}
              </span>
            </div>
          ))}
        </div>
      )}

      {!atMax && (
        <button
          type="button"
          onClick={add}
          className="w-full py-4 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500 font-semibold hover:border-emerald-300 hover:text-emerald-600 transition-colors"
        >
          {value.length === 0 ? '💬 セラピストの声を追加' : '＋ 声を追加'}
        </button>
      )}
    </div>
  );
}
