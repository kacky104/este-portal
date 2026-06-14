'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { DIARIES, type Diary } from '@/data/diaries';

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

export function DiarySection() {
  const [selectedName, setSelectedName] = useState<string | null>(null);
  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5"><span className="text-lg">📷</span><h2 className="text-base font-bold text-slate-900 tracking-wide">セラピスト写メ日記</h2></div>
        <span className="text-[10px] text-pink-500 font-bold bg-pink-50 px-2 py-0.5 rounded-full">毎日更新中</span>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
        {DIARIES.map((diary) => (
          <button key={diary.id} onClick={() => setSelectedName(diary.therapistName)} type="button" className="text-left group flex-shrink-0 w-52 rounded-2xl border border-pink-50 bg-white shadow-sm hover:border-pink-200 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col justify-between">
            <div>
              <div className="h-32 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                <img src={diary.imageUrl} alt={diary.therapistName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/40 text-white text-[10px] font-bold">{diary.therapistName}</span>
                <span className="absolute top-2 right-2 text-[9px] text-slate-500 bg-white/80 px-1.5 py-0.5 rounded-md font-medium">{diary.time}</span>
              </div>
              <div className="p-3 space-y-1">
                <h3 className="font-bold text-xs text-slate-800 line-clamp-1 group-hover:text-pink-600">{diary.title}</h3>
                <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 break-all">{diary.content}</p>
              </div>
            </div>
            <div className="px-3 pb-3 pt-1 border-t border-dashed border-slate-50 flex items-center justify-between text-[9px] text-slate-400 w-full">
              <span className="truncate max-w-[120px]">📍 {diary.salonName}</span>
              <span className="text-pink-400 font-bold">日記一覧 →</span>
            </div>
          </button>
        ))}
      </div>
      {selectedName && <DiaryListModal therapistName={selectedName} onClose={() => setSelectedName(null)} />}
    </div>
  );
}

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
    <div className="w-full space-y-3">
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
        {list.map((diary) => (
          <button key={diary.id} onClick={() => setSelectedName(diary.therapistName)} type="button" className="text-left group flex-shrink-0 w-52 rounded-2xl border border-pink-50 bg-white shadow-sm hover:border-pink-200 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col justify-between">
            <div>
              <div className="h-32 bg-slate-100 relative overflow-hidden flex items-center justify-center">
                <img src={diary.imageUrl} alt={diary.therapistName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <span className="absolute bottom-2 left-2 px-2 py-0.5 rounded-lg bg-black/40 text-white text-[10px] font-bold">{diary.therapistName}</span>
                <span className="absolute top-2 right-2 text-[9px] text-slate-500 bg-white/80 px-1.5 py-0.5 rounded-md font-medium">{diary.time}</span>
              </div>
              <div className="p-3 space-y-1">
                <h3 className="font-bold text-xs text-slate-800 line-clamp-1 group-hover:text-pink-600">{diary.title}</h3>
                <p className="text-[10px] text-slate-500 leading-relaxed line-clamp-2 break-all">{diary.content}</p>
              </div>
            </div>
            <div className="px-3 pb-3 pt-1 border-t border-dashed border-slate-50 flex justify-end text-[9px] text-slate-400 w-full">
              <span className="text-pink-400 font-bold">この子の履歴を見る →</span>
            </div>
          </button>
        ))}
      </div>
      {selectedName && <DiaryListModal therapistName={selectedName} onClose={() => setSelectedName(null)} />}
    </div>
  );
}
