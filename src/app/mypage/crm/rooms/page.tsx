'use client';

import { useEffect, useState } from 'react';
import { getCrmRoomNotes, saveCrmRoomNote } from '@/app/actions/crm';
import { CRM_ROOM_NOTE_MAX, roomColor, type CrmRoomNote } from '@/app/lib/crm/types';
import { CrmShell, useCrmAccess } from '../CrmShell';
import { safeAction, useCrmDirty, useCrmLinks } from '../CrmBase';

// フクエスCRM「部屋メモ」（第1443便・2026-10-13・店舗様の要望）。
// ★ 部屋ごとに1つ、ずっと残るメモ（「G401 タオルたたむ」「G1011 オイル補充」）。書き換えるまで残る。
// ★ お店だけが見る（/cast のセラピストには出さない）。部屋は設定の「待機場所（部屋）」のもの。
// ★ 保存は部屋ごと（1枚ずつ「保存」）。ほかの部屋のメモはサーバーが読み直してから書く（別の端末の分を消さない）。

export default function CrmRoomsPage() {
  const { access, adminSalonQuery } = useCrmAccess();
  return (
    <CrmShell access={access} adminSalonQuery={adminSalonQuery} current="rooms">
      {(a) => <RoomsBody salonId={a.salonId} adminSalonQuery={adminSalonQuery} />}
    </CrmShell>
  );
}

type Loaded = { rooms: string[]; roomColors: Record<string, string>; notes: Record<string, CrmRoomNote>; ready: boolean };

function RoomsBody({ salonId, adminSalonQuery }: { salonId: number; adminSalonQuery: string }) {
  const links = useCrmLinks();
  const [data, setData] = useState<Loaded | null>(null);
  const [err, setErr] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  useEffect(() => {
    safeAction(getCrmRoomNotes(salonId)).then((r) => {
      if (!r.ok) { setErr(r.error); return; }
      setData({ rooms: r.rooms, roomColors: r.roomColors, notes: r.notes, ready: r.ready });
    });
  }, [salonId]);

  // ★ 保存していないメモがあれば、タブで移る前に聞く（設定の画面と同じ仕組み）
  const dirty = !!data && data.rooms.some((r) => drafts[r] !== undefined && drafts[r] !== (data.notes[r]?.text ?? ''));
  useCrmDirty(dirty);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  if (!data) return <p className="p-10 text-center text-[14px] text-slate-400">{err || '読み込み中です…'}</p>;

  return (
    <div className="mx-auto max-w-5xl p-3 md:p-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-2">
        <h1 className="text-[18px] font-black text-slate-800">部屋メモ</h1>
        <p className="text-[12px] text-slate-500">部屋ごとのメモです。書き換えるまで残ります（セラピストには見えません）。</p>
      </div>
      {!data.ready && (
        <p className="mb-3 border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
          部屋メモは準備中です（まだ保存できません）。
        </p>
      )}
      {data.rooms.length === 0 ? (
        <p className="border border-slate-200 bg-white p-6 text-center text-[14px] text-slate-500">
          部屋がまだありません。<a href={links.href('/settings') + adminSalonQuery + '#rooms'} className="font-bold text-indigo-600 underline">設定の「待機場所（部屋）」</a>で部屋を足すと、ここにメモの欄が出ます。
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {data.rooms.map((room) => (
            <RoomCard
              key={room}
              salonId={salonId}
              room={room}
              colorKey={data.roomColors[room]}
              note={data.notes[room] ?? { text: '', at: null }}
              ready={data.ready}
              draft={drafts[room]}
              onDraft={(v) => setDrafts((p) => ({ ...p, [room]: v }))}
              onSaved={(n) => {
                setData((p) => (p ? { ...p, notes: { ...p.notes, [room]: n } } : p));
                setDrafts((p) => { const q = { ...p }; delete q[room]; return q; });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function RoomCard({
  salonId, room, colorKey, note, ready, draft, onDraft, onSaved,
}: {
  salonId: number; room: string; colorKey: string | undefined; note: CrmRoomNote; ready: boolean;
  draft: string | undefined; onDraft: (v: string) => void; onSaved: (n: CrmRoomNote) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const value = draft ?? note.text;
  const changed = draft !== undefined && draft !== note.text;
  const c = roomColor(colorKey);
  const when = note.at
    ? new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(note.at))
    : '';

  const save = async () => {
    setBusy(true); setErr(''); setMsg('');
    const r = await safeAction(saveCrmRoomNote(salonId, room, value));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onSaved(r.note);
    setMsg(r.note.text ? '保存しました' : 'メモを消しました');
  };

  return (
    <div className={`flex flex-col border bg-white ${changed ? 'border-amber-400' : 'border-slate-200'}`}>
      <div className="flex items-center gap-2 px-3 py-2" style={{ background: c.bg, color: c.fg }}>
        <span className="text-[15px] font-black">{room}</span>
        {when && <span className="ml-auto text-[11px] opacity-80">{when} 更新</span>}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <textarea
          value={value}
          maxLength={CRM_ROOM_NOTE_MAX}
          disabled={!ready}
          onChange={(e) => { onDraft(e.target.value); setMsg(''); }}
          placeholder="例）タオルをたたむ／オイル補充"
          className="min-h-[96px] w-full flex-1 border border-slate-300 px-2.5 py-2 text-[14px] leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:bg-slate-50"
        />
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={save}
            disabled={!ready || busy || !changed}
            className="bg-indigo-600 px-4 py-1.5 text-[13px] font-bold text-white disabled:bg-slate-300"
          >
            {busy ? '保存中…' : '保存'}
          </button>
          {changed && !busy && <span className="text-[12px] font-bold text-amber-700">まだ保存していません</span>}
          {msg && !changed && <span className="text-[12px] font-bold text-emerald-700">{msg}</span>}
          <span className="ml-auto text-[11px] text-slate-400">{value.length}/{CRM_ROOM_NOTE_MAX}</span>
        </div>
        {err && <p className="text-[12px] font-bold text-rose-600">{err}</p>}
      </div>
    </div>
  );
}
