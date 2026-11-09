'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ConecfShell } from '../../ConecfShell';
import { useToast } from '@/app/components/useToast';
import { listConecfGirls, saveConecfGirlOrder, type ConecfGirlRow } from '@/app/actions/conecfGirls';
import { sendConecfGirlOrderToSites } from '@/app/actions/conecfSort';
import { getConecfSchedule, type ConecfScheduleRow } from '@/app/actions/conecfSchedule';
import { manualOrderToSave } from '@/lib/therapistOrder';
import { revalidateSalon } from '@/app/lib/revalidateTop';

// コネックエフ「並び替え」（第1859便・2026-11-09・カッキーさん・オイルクエスト様のご要望）。ベンリーの「並び替え」と同じ使い方。
// ★ 写真を長押ししてから動かすと、その場所へ入る（マウスでも指でも）。画面の端まで持っていくと自動でスクロール。
// ★ 並び順の選択（入店日順・50音順・当日出勤順…）・新人を先頭へ・前回保存時に戻す。保存は下の「保存する」でまとめて。
// ★ 保存先はセラピスト一覧のつまみと同じ（saveConecfGirlOrder・第1384便）。非公開の方は今までどおり最後（動かせない）。
// ★ 「並び順をサイトへ送る」は第1557便の受け口（駅ちか・エステ魂）。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const LONG_PRESS_MS = 300;

type Preset = '' | 'joined' | 'registered' | 'kana' | 'today' | 'now' | 'tomorrow' | 'randomToday' | 'randomTomorrow';
const PRESETS: Array<[Preset, string]> = [
  ['', '未選択'], ['joined', '入店日順（新しい順）'], ['registered', '登録の新しい順'], ['kana', '50音順'],
  ['today', '当日出勤順'], ['now', '現在出勤中順'], ['tomorrow', '翌日出勤順'],
  ['randomToday', 'ランダム（当日出勤）'], ['randomTomorrow', 'ランダム（翌日出勤）'],
];

/** 'HH:MM' → 朝6時はじまりの分（0:00〜5:59 は翌日として +24時間） */
function bizMin(t: string | null): number | null {
  const m = /^(\d{1,2}):(\d{2})/.exec(t ?? '');
  if (!m) return null;
  const v = Number(m[1]) * 60 + Number(m[2]);
  return v < 360 ? v + 1440 : v;
}
function nowBizMin(): number {
  const j = new Date(Date.now() + 9 * 3600 * 1000);
  const v = j.getUTCHours() * 60 + j.getUTCMinutes();
  return v < 360 ? v + 1440 : v;
}
function shuffle<T>(a: T[]): T[] {
  const b = [...a];
  for (let i = b.length - 1; i > 0; i -= 1) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; }
  return b;
}

function Body({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const [saved, setSaved] = useState<ConecfGirlRow[] | null>(null);
  const [list, setList] = useState<ConecfGirlRow[] | null>(null);
  const [sched, setSched] = useState<{ today: string; tomorrow: string; rows: ConecfScheduleRow[] } | null>(null);
  const [salonId, setSalonId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [preset, setPreset] = useState<Preset>('');
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const listRef = useRef<ConecfGirlRow[] | null>(null);
  useEffect(() => { listRef.current = list; }, [list]);

  const load = useCallback(async () => {
    const [g, s] = await Promise.all([listConecfGirls(), getConecfSchedule()]);
    if (!g.ok) { setError(g.error); return; }
    const act = g.data.girls.filter((x) => x.isActive), hid = g.data.girls.filter((x) => !x.isActive);
    setSaved([...act, ...hid]); setList([...act, ...hid]); setSalonId(g.data.salonId); setError('');
    if (s.ok) setSched({ today: s.data.dates[0] ?? '', tomorrow: s.data.dates[1] ?? '', rows: s.data.rows });
  }, []);
  useEffect(() => { void load(); }, [load]);

  const dirty = useMemo(() => !!list && !!saved && list.map((x) => x.id).join(',') !== saved.map((x) => x.id).join(','), [list, saved]);
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; return ''; };
    window.addEventListener('beforeunload', f);
    return () => window.removeEventListener('beforeunload', f);
  }, [dirty]);

  const shiftOf = useCallback((id: number, date: string) => {
    const r = sched?.rows.find((x) => x.id === id);
    const d = r?.days.find((x) => x.date === date);
    return d && d.isActive ? d : null;
  }, [sched]);

  /** 公開中の方だけを並べ替える（非公開の方は最後のまま） */
  const reorderActive = (fn: (act: ConecfGirlRow[]) => ConecfGirlRow[]) => {
    if (!list) return;
    const act = list.filter((x) => x.isActive), hid = list.filter((x) => !x.isActive);
    setList([...fn(act), ...hid]);
  };
  const byShift = (date: string, random: boolean) => (act: ConecfGirlRow[]) => {
    const on = act.filter((x) => shiftOf(x.id, date)), off = act.filter((x) => !shiftOf(x.id, date));
    const sorted = random ? shuffle(on) : [...on].sort((a, b) => (bizMin(shiftOf(a.id, date)?.start ?? null) ?? 9999) - (bizMin(shiftOf(b.id, date)?.start ?? null) ?? 9999));
    return [...sorted, ...off];
  };
  const applyPreset = () => {
    if (!preset) { onToast('並び順を選んでください'); return; }
    if (['today', 'now', 'tomorrow', 'randomToday', 'randomTomorrow'].includes(preset) && !sched) { onToast('出勤を読み込めなかったため、この並び順は使えません'); return; }
    const today = sched?.today ?? '', tomorrow = sched?.tomorrow ?? '';
    switch (preset) {
      case 'joined': reorderActive((a) => [...a].sort((x, y) => (y.joinedOn ?? '').localeCompare(x.joinedOn ?? ''))); break;
      case 'registered': reorderActive((a) => [...a].sort((x, y) => y.id - x.id)); break;
      case 'kana': reorderActive((a) => [...a].sort((x, y) => x.name.localeCompare(y.name, 'ja'))); break;
      case 'today': reorderActive(byShift(today, false)); break;
      case 'tomorrow': reorderActive(byShift(tomorrow, false)); break;
      case 'randomToday': reorderActive(byShift(today, true)); break;
      case 'randomTomorrow': reorderActive(byShift(tomorrow, true)); break;
      case 'now': {
        const n = nowBizMin();
        const working = (id: number) => { const s = shiftOf(id, today); const a = bizMin(s?.start ?? null), b = bizMin(s?.end ?? null); return a != null && b != null && a <= n && n < (b <= a ? b + 1440 : b); };
        reorderActive((a) => [...a.filter((x) => working(x.id)), ...byShift(today, false)(a.filter((x) => !working(x.id)))]);
        break;
      }
    }
    onToast('並び替えました。「保存する」を押すと保存されます');
  };
  const newFirst = () => { reorderActive((a) => [...a.filter((x) => x.isNewFace), ...a.filter((x) => !x.isNewFace)]); onToast('新人の方を先頭へ移しました。「保存する」を押すと保存されます'); };

  const onSave = async () => {
    if (!list) return;
    setSaving(true);
    const res = await saveConecfGirlOrder({ ids: manualOrderToSave(list, (x) => x.id, (x) => !x.isActive) });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    if (salonId != null) void revalidateSalon(salonId);
    setSaved(list);
    onToast('並び順を保存しました（フクエスのお店ページにも、この順で出ます）');
  };
  const onSend = async () => {
    if (dirty) { onToast('先に「保存する」を押してください'); return; }
    setSending(true);
    try {
      const r = await sendConecfGirlOrderToSites();
      if (!r.ok) { onToast(r.error); return; }
      const parts: string[] = [];
      if (r.data.queued.length > 0) parts.push(r.data.queued.join('・') + 'へ並び順を送る準備ができました。結果は「更新結果」に出ます');
      if (r.data.skipped.length > 0) parts.push('送れなかったサイト: ' + r.data.skipped.join('、'));
      onToast(parts.join('。') || '送る先がありませんでした');
    } finally { setSending(false); }
  };

  // ── 長押しで動かす ──
  //   押して 300ms 動かさずにいると「つかんだ」状態。その前に動かしたら（スクロールのつもり）つかまない。
  //   つかんでいる間は指の下のカードの場所へ入れる。画面の上下の端では自動でスクロール。
  const press = useRef<{ id: number; x: number; y: number; timer: number } | null>(null);
  const dragging = useRef<number | null>(null);
  const scrollTimer = useRef<number | null>(null);
  const lastY = useRef(0);
  const endDrag = useCallback(() => {
    if (press.current) { window.clearTimeout(press.current.timer); press.current = null; }
    dragging.current = null; setDragId(null);
    if (scrollTimer.current != null) { window.clearInterval(scrollTimer.current); scrollTimer.current = null; }
  }, []);
  const moveTo = useCallback((x: number, y: number) => {
    const id = dragging.current;
    const cur = listRef.current;
    if (id == null || !cur) return;
    const el = document.elementFromPoint(x, y)?.closest('[data-sort-id]') as HTMLElement | null;
    const over = el ? Number(el.dataset.sortId) : NaN;
    if (!Number.isFinite(over) || over === id) return;
    const target = cur.find((g) => g.id === over);
    if (!target || !target.isActive) return;
    const from = cur.findIndex((g) => g.id === id), to = cur.findIndex((g) => g.id === over);
    const next = [...cur];
    const [m] = next.splice(from, 1);
    next.splice(to, 0, m);
    listRef.current = next; setList(next);
  }, []);
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = press.current;
      if (p && dragging.current == null && Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) { window.clearTimeout(p.timer); press.current = null; return; }
      if (dragging.current == null) return;
      lastY.current = e.clientY;
      moveTo(e.clientX, e.clientY);
    };
    const onUp = () => endDrag();
    // ★ 指でつかんでいる間は、画面のスクロールにしない
    const onTouchMove = (e: TouchEvent) => { if (dragging.current != null) e.preventDefault(); };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [moveTo, endDrag]);
  const onDown = (e: React.PointerEvent, g: ConecfGirlRow) => {
    if (!g.isActive || saving) return;
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    const x = e.clientX, y = e.clientY;
    const timer = window.setTimeout(() => {
      dragging.current = g.id; setDragId(g.id); lastY.current = y;
      if (navigator.vibrate) try { navigator.vibrate(15); } catch { /* 無くてよい */ }
      scrollTimer.current = window.setInterval(() => {
        const h = window.innerHeight, yy = lastY.current;
        if (yy < 120) window.scrollBy(0, -14); else if (yy > h - 120) window.scrollBy(0, 14);
      }, 30);
    }, LONG_PRESS_MS);
    press.current = { id: g.id, x, y, timer };
  };

  if (error) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>;
  if (!list) return <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>;

  return (
    <div className="space-y-3 pb-24">
      <div className={`${CARD} space-y-3 p-4`}>
        <p className="text-[13.5px] leading-relaxed text-slate-600">写真を<b>長押し</b>してから動かすと、その場所へ入ります（マウスでも指でも）。画面の上下の端まで持っていくと自動でスクロールします。並べ終わったら下の「保存する」を押してください。保存した順は、セラピスト一覧・出勤スケジュール・フクエスのお店ページにも出ます。</p>
        <div className="flex flex-wrap items-center gap-2 text-[14px]">
          <span className="font-bold text-slate-600">並び順：</span>
          <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} className="min-w-[13rem] border border-slate-300 bg-white px-2 py-1.5">
            {PRESETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button type="button" onClick={applyPreset} disabled={!preset || saving} className="border border-pink-400 px-3 py-1.5 font-bold text-pink-600 disabled:opacity-40">並び順を適用</button>
          <span className="mx-1 hidden h-5 border-l border-slate-200 sm:inline-block" />
          <button type="button" onClick={newFirst} disabled={saving} className="text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">新人を先頭へ</button>
          <button type="button" onClick={() => saved && setList(saved)} disabled={!dirty || saving} className="text-[13.5px] font-bold text-indigo-600 underline underline-offset-4 disabled:text-slate-300 disabled:no-underline">前回保存時に戻す</button>
          <span className="ml-auto" />
          <button type="button" onClick={() => void onSend()} disabled={sending || !enabled} className="bg-pink-500 px-4 py-2 text-[13.5px] font-bold text-white hover:bg-pink-600 disabled:opacity-40">{sending ? '受け付けています…' : '並び順をサイトへ送る（駅ちか・エステ魂）'}</button>
        </div>
      </div>

      <div className={`${CARD} p-2 ${dragId != null ? 'select-none' : ''}`}>
        <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 lg:grid-cols-7 xl:grid-cols-9">
          {list.map((g, i) => {
            const t = sched ? shiftOf(g.id, sched.today) : null;
            return (
              <li key={g.id} data-sort-id={g.id}
                onPointerDown={(e) => onDown(e, g)}
                onContextMenu={(e) => e.preventDefault()}
                className={`relative flex flex-col items-center border px-1 pb-1.5 pt-5 text-center transition-shadow ${
                  !g.isActive ? 'border-slate-100 bg-slate-50 opacity-50' : dragId === g.id ? 'z-10 border-pink-400 bg-pink-50 shadow-lg ring-2 ring-pink-300' : 'cursor-grab border-slate-200 bg-white hover:border-pink-300'
                }`}
                style={{ touchAction: dragId != null ? 'none' : 'manipulation', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}>
                <span className="absolute left-1 top-1 text-[10.5px] font-bold tabular-nums text-slate-400">{g.isActive ? i + 1 : '非公開'}</span>
                {t && <span className="absolute right-1 top-1 bg-emerald-600 px-1 text-[10px] font-bold text-white">出勤</span>}
                {g.isNewFace && <span className="absolute right-1 top-5 bg-sky-500 px-1 text-[10px] font-bold text-white">新人</span>}
                {g.imageUrl
                  // eslint-disable-next-line @next/next/no-img-element -- 他サイトの小さな顔写真（セラピスト一覧と同じ）
                  ? <img src={g.imageUrl} alt="" draggable={false} className="pointer-events-none h-[96px] w-[72px] border border-slate-200 bg-slate-100 object-cover" loading="lazy" />
                  : <span className="h-[96px] w-[72px] border border-slate-200 bg-slate-100" aria-hidden />}
                <span className="mt-1 w-full truncate text-[12.5px] font-bold text-slate-700">{g.name || '（名前なし）'}</span>
                <span className="h-[14px] text-[10.5px] tabular-nums text-slate-400">{t && t.start && t.end ? `${t.start}〜${t.end}` : ''}</span>
              </li>
            );
          })}
        </ul>
      </div>

      {dirty && (
        <div className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-between gap-3 border-t border-amber-300 bg-white/95 px-4 py-3 backdrop-blur md:left-[288px]">
          <p className="text-[14px] font-bold text-amber-800">並び順を変えました（まだ保存していません）</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => saved && setList(saved)} disabled={saving} className="border border-slate-300 px-3 py-2 text-[14px] font-bold text-slate-600">元に戻す</button>
            <button type="button" onClick={() => void onSave()} disabled={saving || !enabled} className="bg-gradient-to-r from-indigo-700 to-indigo-500 px-6 py-2 text-[14px] font-bold text-white disabled:opacity-50">{saving ? '保存しています…' : '保存する'}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConecfGirlsSortPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="girlsSort" title="並び替え" toast={toast} wide>
      {(a) => <Body enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
