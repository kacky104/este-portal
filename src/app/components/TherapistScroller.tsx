'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { THERAPISTS, type Therapist } from '@/data/therapists';

const GRADIENTS = ['from-pink-300 to-rose-400', 'from-fuchsia-300 to-pink-400', 'from-rose-300 to-pink-500', 'from-pink-400 to-fuchsia-400'];
const SYMBOLS = ['✿', '❀', '✾', '♡', '✦', '❋'];
const WEEKS = ['月', '火', '水', '木', '金', '土', '日'];

// 出勤判定（深夜対応）
function isDuty(hours: string): boolean {
  if (!hours) return false;
  const clean = hours.replace(/[〜～~]/g, '-').replace(/翌/g, '');
  if (!clean.includes('-')) return false;

  const [start, end] = clean.split('-').map(t => {
    const [h, m] = t.trim().split(':').map(Number);
    return h * 60 + (m || 0);
  });

  let endMin = end;
  if (endMin < start || hours.includes('翌')) endMin += 1440;

  const jst = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [curH, curM] = jst.split(':').map(Number);
  let curMin = curH * 60 + curM;

  if (curMin < start && curMin <= (endMin - 1440)) curMin += 1440;
  return curMin >= start && curMin <= endMin;
}

// ① 女の子ミニカード
function Card({ therapist, index, onOpen }: { therapist: Therapist; index: number; onOpen: (t: Therapist, g: string, s: string) => void }) {
  const grad = GRADIENTS[index % GRADIENTS.length];
  const sym = SYMBOLS[index % SYMBOLS.length];
  const [onDuty, setOnDuty] = useState(false);

  useEffect(() => { setOnDuty(isDuty(therapist.workHours)); }, [therapist.workHours]);

  return (
    <button onClick={() => onOpen(therapist, grad, sym)} type="button" className="text-left flex-shrink-0 w-44 rounded-2xl border border-pink-100 bg-white shadow-sm hover:border-pink-300 hover:-translate-y-1 transition-all duration-300 overflow-hidden">
      <div className={`relative h-28 bg-gradient-to-br ${grad} flex items-center justify-center`}>
        <div className="w-16 h-16 rounded-full bg-white/30 flex items-center justify-center text-white font-bold text-2xl">{therapist.name.charAt(0)}</div>
        <span className="absolute bottom-2 right-3 text-white/50 text-xl">{sym}</span>
        {onDuty ? (
          <span className="absolute top-2 right-2 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-500 border border-emerald-100 animate-pulse">● 出勤中</span>
        ) : (
          <span className="absolute top-2 right-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">{therapist.workHours.split(/[〜～~]/)[0]}〜</span>
        )}
      </div>
      <div className="p-3">
        <p className="font-bold text-sm text-slate-900 mb-0.5">{therapist.name}</p>
        <p className="text-[10px] text-slate-400 truncate mb-1.5">{therapist.salonName}</p>
        <p className="text-[10px] text-pink-500 font-medium mb-1.5">🕒 {therapist.workHours}</p>
        <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">{therapist.comment}</p>
      </div>
    </button>
  );
}

// ② プロフィールモーダル（ポップアップ窓）
function Modal({ therapist, grad, sym, onClose }: { therapist: Therapist | null; grad: string; sym: string; onClose: () => void }) {
  if (!therapist) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-sm">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden max-h-[85vh] flex flex-col">
        <div className={`relative h-32 bg-gradient-to-br ${grad} flex items-center justify-center flex-shrink-0`}>
          <button onClick={onClose} type="button" className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/20 text-white font-bold text-sm">✕</button>
          <div className="w-20 h-20 rounded-full bg-white/30 flex items-center justify-center text-white font-bold text-2xl">{therapist.name.charAt(0)}</div>
          <span className="absolute bottom-3 right-4 text-white/40 text-2xl">{sym}</span>
        </div>
        <div className="p-5 overflow-y-auto space-y-4 flex-1 text-xs">
          <div>
            <div className="flex items-baseline gap-2">
              <h3 className="text-xl font-bold text-slate-900">{therapist.name}</h3>
              <span className="font-semibold text-pink-500 bg-pink-50 px-2 py-0.5 rounded">22歳</span>
            </div>
            <p className="text-slate-400 mt-0.5">{therapist.salonName}</p>
          </div>
          <div className="bg-pink-50/40 border border-pink-100 rounded-xl p-3 space-y-1">
            <div className="flex justify-between"><span className="text-slate-400">スタイル</span><span className="text-slate-800 font-medium">T160 B85(D) W58 H85</span></div>
            <div className="flex justify-between"><span className="text-slate-400">出勤時間</span><span className="text-pink-600 font-bold">{therapist.workHours}</span></div>
          </div>
          <div className="space-y-1">
            <h4 className="font-bold text-slate-400">💬 メッセージ</h4>
            <p className="text-slate-600 bg-slate-50 p-3 rounded-xl leading-relaxed">{therapist.comment}</p>
          </div>
          <div className="space-y-1.5">
            <h4 className="font-bold text-slate-400">📅 今週のスケジュール</h4>
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKS.map((day, idx) => (
                <div key={day} className={`p-1.5 rounded-lg border ${idx !== 2 && idx !== 6 ? 'bg-pink-50/30 border-pink-100 text-pink-600' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                  <div className="font-bold mb-0.5">{day}</div>
                  <div className="text-[8px] scale-90">{(idx !== 2 && idx !== 6) ? '出勤' : '休み'}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex-shrink-0">
          <Link href={`/salon/${therapist.salonId}`} className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-sm shadow-md">
            <span>{therapist.salonName} の詳細を見る</span> →
          </Link>
        </div>
      </div>
    </div>
  );
}

// ③ メインコンポーネント
export function TherapistScroller() {
  const [list, setList] = useState<Therapist[]>([]);
  const [select, setSelect] = useState<Therapist | null>(null);
  const [grad, setGrad] = useState('');
  const [sym, setSym] = useState('');

  useEffect(() => { setList(THERAPISTS.filter(t => isDuty(t.workHours))); }, []);

  if (list.length === 0) {
    return <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/20 w-full mx-4">現在、出勤時間外のセラピストのみです ✿</div>;
  }

  return (
    <>
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
        {list.map((t, i) => <Card key={t.id} therapist={t} index={i} onOpen={(target, g, s) => { setSelect(target); setGrad(g); setSym(s); }} />)}
      </div>
      <Modal therapist={select} grad={grad} sym={sym} onClose={() => setSelect(null)} />
    </>
  );
}
