'use client';

import { useState, useEffect } from 'react';
import { DIARIES, type Diary } from '@/data/diaries';

// ── Modal ─────────────────────────────────────────────────────

function DiaryListModal({ therapistName, onClose }: { therapistName: string; onClose: () => void }) {
  const filteredDiaries = DIARIES.filter(d => d.therapistName === therapistName);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[80vh] flex flex-col">
        <div className="p-4 bg-gradient-to-r from-pink-400 to-rose-400 text-white font-bold text-sm flex justify-between items-center flex-shrink-0">
          <span>✿ {therapistName}さんの写メ日記一覧</span>
          <button onClick={onClose} type="button" className="w-7 h-7 rounded-full bg-white/20 text-white font-bold text-xs">✕</button>
        </div>
        <div className="p-4 overflow-y-auto space-y-4 flex-1 text-xs scrollbar-pink bg-pink-50/10">
          {filteredDiaries.map((d) => (
            <div key={d.id} className="bg-white border border-pink-100 rounded-2xl p-4 space-y-2 shadow-xs">
              <div className="flex justify-between items-center text-[10px] text-slate-400 border-b border-dashed border-pink-50 pb-1">
                <span>📅 {d.date}</span>
                <span className="bg-pink-50 text-pink-500 font-bold px-2 py-0.5 rounded-md">{d.time}</span>
              </div>
              <h4 className="font-bold text-sm text-slate-800">「{d.title}」</h4>
              <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{d.content}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Diary card (full-image overlay) ──────────────────────────

function DiaryCard({ diary, onSelect }: { diary: Diary; onSelect: () => void }) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="relative text-left group flex-shrink-0 w-52 h-72 rounded-2xl overflow-hidden shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
    >
      {/* Full image background */}
      <img
        src={diary.imageUrl}
        alt={diary.therapistName}
        className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
      />

      {/* Gradient: dark top → transparent → dark bottom */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/10 to-black/70" />

      {/* Top: title + content */}
      <div className="absolute top-0 left-0 right-0 p-3">
        <p className="text-[9px] text-white/60 mb-1">{diary.date} {diary.time}</p>
        <h3 className="font-bold text-xs text-white line-clamp-1 mb-1">「{diary.title}」</h3>
        <p className="text-[10px] text-white/80 leading-relaxed line-clamp-3">{diary.content}</p>
      </div>

      {/* Bottom: therapist + salon + CTA */}
      <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-white drop-shadow">{diary.therapistName}</p>
          <p className="text-[10px] text-white/60 truncate">📍 {diary.salonName}</p>
        </div>
        <span className="flex-shrink-0 text-[10px] text-pink-300 font-bold ml-2">日記一覧 →</span>
      </div>
    </button>
  );
}

// ── DiarySection (top page) ───────────────────────────────────

export function DiarySection() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="text-lg">📷</span>
          <h2 className="text-base font-bold text-slate-900 tracking-wide">セラピスト写メ日記</h2>
        </div>
        <span className="text-[10px] text-pink-500 font-bold bg-pink-50 px-2 py-0.5 rounded-full">毎日更新中</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
        {DIARIES.map((diary) => (
          <DiaryCard key={diary.id} diary={diary} onSelect={() => setSelectedName(diary.therapistName)} />
        ))}
      </div>
      {selectedName && <DiaryListModal therapistName={selectedName} onClose={() => setSelectedName(null)} />}
    </div>
  );
}

// ── SalonDiarySection (salon detail page) ────────────────────

export function SalonDiarySection({ salonId }: { salonId: string }) {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  const [list, setList] = useState<Diary[]>([]);

  useEffect(() => {
    setList(DIARIES.filter(d => d.salonId === salonId));
  }, [salonId]);

  if (list.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">
        只今、こちらのサロンの写メ日記は準備中です ✿
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
        {list.map((diary) => (
          <DiaryCard key={diary.id} diary={diary} onSelect={() => setSelectedName(diary.therapistName)} />
        ))}
      </div>
      {selectedName && <DiaryListModal therapistName={selectedName} onClose={() => setSelectedName(null)} />}
    </div>
  );
}
