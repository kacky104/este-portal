'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { DIARIES } from '@/data/diaries';

const GRADS = ['from-pink-300 to-rose-400', 'from-fuchsia-300 to-pink-400', 'from-rose-300 to-pink-500'];
const SYMS = ['✿', '❀', '✾', '♡', '✦'];
const SCHED = [
  { day: '月', active: true,  start: '12:00', end: '21:00' },
  { day: '火', active: true,  start: '12:00', end: '21:00' },
  { day: '水', active: false, start: '',       end: ''       },
  { day: '木', active: true,  start: '16:00', end: '翌2:00' },
  { day: '金', active: true,  start: '19:00', end: '翌4:00' },
  { day: '土', active: true,  start: '15:00', end: '23:00'  },
  { day: '日', active: false, start: '',       end: ''       },
];

type Therapist = {
  id: string;
  name: string;
  workHours: string;
  comment: string;
  area: string;
};

function getStatus(hours: string): 'ON' | 'END' | 'OFF' {
  if (!hours) return 'OFF';
  const clean = hours.replace(/[〜～~]/g, '-').replace(/翌/g, '');
  if (!clean.includes('-')) return 'OFF';
  const [sStr, eStr] = clean.split('-');
  const [sH, sM] = sStr.split(':').map(Number);
  const [eH, eM] = eStr.split(':').map(Number);
  const start = sH * 60 + (sM || 0);
  let end = eH * 60 + (eM || 0);
  if (end < start || hours.includes('翌')) end += 1440;

  const jst = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [cH, cM] = jst.split(':').map(Number);
  let cur = cH * 60 + cM;
  if (cur < start && cur <= (end - 1440)) cur += 1440;
  return cur >= start && cur <= end ? 'ON' : cur > end ? 'END' : 'OFF';
}

function GridCard({ therapist, index, onOpen }: { therapist: Therapist; index: number; onOpen: (t: Therapist, g: string, s: string) => void }) {
  const grad = GRADS[index % GRADS.length];
  const sym = SYMS[index % SYMS.length];
  const [st, setSt] = useState<'ON' | 'END' | 'OFF'>('OFF');
  useEffect(() => { setSt(getStatus(therapist.workHours)); }, [therapist.workHours]);

  return (
    <button onClick={() => onOpen(therapist, grad, sym)} type="button" className="text-left w-full rounded-2xl border border-pink-50 bg-white shadow-sm flex h-28 overflow-hidden">
      <div className={`relative w-28 bg-gradient-to-br ${grad} flex items-center justify-center flex-shrink-0`}>
        <div className="w-14 h-14 rounded-full bg-white/30 flex items-center justify-center text-white font-bold text-xl">{therapist.name.charAt(0)}</div>
        <span className="absolute bottom-1 right-2 text-white/40 text-sm">{sym}</span>
      </div>
      <div className="p-3 flex-1 flex flex-col justify-between min-w-0 text-xs">
        <div>
          <div className="flex items-center gap-1.5 mb-0.5">
            <p className="font-bold text-slate-900 truncate">{therapist.name}</p>
            {st === 'ON'  && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-500 animate-pulse">本日出勤</span>}
            {st === 'END' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-500">受付終了</span>}
            {st === 'OFF' && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-slate-50 text-slate-400">休日</span>}
          </div>
          <p className="text-[10px] text-pink-500 font-medium mb-1">🕒 {therapist.workHours}</p>
          <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed break-all">{therapist.comment}</p>
        </div>
      </div>
    </button>
  );
}

function ProfileModal({ therapist, grad, sym, onClose }: { therapist: Therapist | null; grad: string; sym: string; onClose: () => void }) {
  if (!therapist) return null;
  const diary = DIARIES.find(d => d.therapistName === therapist.name);

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
          <div className="flex items-baseline gap-2">
            <h3 className="text-xl font-bold text-slate-900">{therapist.name}</h3>
            <span className="font-semibold text-pink-500 bg-pink-50 px-2 py-0.5 rounded">22歳</span>
          </div>
          <div className="bg-pink-50/40 border border-pink-100 rounded-xl p-3 space-y-1">
            <div className="flex justify-between"><span className="text-slate-400">スタイル</span><span className="text-slate-800 font-medium">T160 B85(D) W58 H85</span></div>
            <div className="flex justify-between"><span className="text-slate-400">出勤時間</span><span className="text-pink-600 font-bold">{therapist.workHours}</span></div>
          </div>
          {diary && (
            <div className="bg-gradient-to-r from-rose-50 to-pink-50 border border-pink-100 rounded-xl p-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[10px] font-black text-pink-500 tracking-wider">📷 最新の写メ日記</p>
                <p className="font-bold text-slate-800 text-[11px] truncate mt-0.5">「{diary.title}」</p>
              </div>
              <Link href={`/diary/${diary.id}`} onClick={onClose} className="bg-white text-pink-500 border border-pink-200 font-bold text-[10px] px-3 py-1.5 rounded-lg flex-shrink-0">読む 📖</Link>
            </div>
          )}
          <div className="space-y-1">
            <h4 className="font-bold text-slate-400">💬 メッセージ</h4>
            <p className="text-slate-600 bg-slate-50 p-3 rounded-xl leading-relaxed">{therapist.comment}</p>
          </div>
          <div className="space-y-1.5">
            <h4 className="font-bold text-slate-400">📅 今週のスケジュール</h4>
            <div className="grid grid-cols-7 gap-1 text-center">
              {SCHED.map((s) => (
                <div key={s.day} className={`p-1 rounded-lg border flex flex-col justify-between min-h-[52px] ${s.active ? 'bg-pink-50/30 border-pink-100 text-pink-600' : 'bg-slate-50 border-slate-100 text-slate-300'}`}>
                  <div className="font-bold text-[10px] border-b border-pink-100/30 pb-0.5">{s.day}</div>
                  {s.active ? (
                    <div className="text-[8px] font-black leading-tight flex flex-col justify-center flex-1 origin-center scale-95 tracking-tighter"><span>{s.start}</span><span className="text-[6px] text-pink-300 -my-0.5">▼</span><span>{s.end}</span></div>
                  ) : (
                    <div className="text-[8px] py-2 text-slate-300 flex-1 flex items-center justify-center">休み</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SalonTherapists({ salonId }: { salonId: number }) {
  const [list, setList] = useState<Therapist[]>([]);
  const [sel, setSel] = useState<Therapist | null>(null);
  const [gr, setGr] = useState('');
  const [sy, setSy] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment')
        .eq('salon_id', salonId);
      const mapped: Therapist[] = (data ?? []).map(t => ({
        id:        String(t.id),
        name:      (t.name as string) ?? '',
        workHours: (t.work_hours as string) ?? '',
        area:      (t.area as string) ?? '',
        comment:   (t.comment as string) ?? '',
      }));
      setList(mapped.filter(t => getStatus(t.workHours) === 'ON'));
    })();
  }, [salonId]);

  if (list.length === 0) return <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">只今、案内可能なセラピストはおりません ✿</div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {list.map((t, i) => <GridCard key={t.id} therapist={t} index={i} onOpen={(tg, g, s) => { setSel(tg); setGr(g); setSy(s); }} />)}
      </div>
      <ProfileModal therapist={sel} grad={gr} sym={sy} onClose={() => setSel(null)} />
    </div>
  );
}

export function SalonAllTherapists({ salonId }: { salonId: number }) {
  const [list, setList] = useState<Therapist[]>([]);
  const [sel, setSel] = useState<Therapist | null>(null);
  const [gr, setGr] = useState('');
  const [sy, setSy] = useState('');

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase
        .from('therapists')
        .select('id, name, work_hours, area, comment')
        .eq('salon_id', salonId);
      const mapped: Therapist[] = (data ?? []).map(t => ({
        id:        String(t.id),
        name:      (t.name as string) ?? '',
        workHours: (t.work_hours as string) ?? '',
        area:      (t.area as string) ?? '',
        comment:   (t.comment as string) ?? '',
      }));
      setList(mapped);
    })();
  }, [salonId]);

  if (list.length === 0) return <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">在籍セラピストの情報は準備中です ✿</div>;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {list.map((t, i) => <GridCard key={t.id} therapist={t} index={i} onOpen={(tg, g, s) => { setSel(tg); setGr(g); setSy(s); }} />)}
      </div>
      <ProfileModal therapist={sel} grad={gr} sym={sy} onClose={() => setSel(null)} />
    </div>
  );
}
