'use client';

// フクエスCRM：提携店の部屋共有（運営・第1670便・2026-10-27）。
// ★ NG・要注意の共有グループ（CrmGroupManager）とは別の入れ物。店と店のペアを組むだけ。
// ★ 例: ラビリンス × enju（きほ＝かるあ）。enju の出勤情報で「ラビリンス／部屋A」を選べるようになる。

import { useCallback, useEffect, useState } from 'react';
import { adminListRoomSharePairs, adminAddRoomSharePair, adminEndRoomSharePair, type CrmRoomSharePairRow } from '@/app/actions/crmRoomShareAdmin';

type SalonOption = { id: number; name: string };
const LABEL = 'block text-[11px] font-bold text-gray-500 mb-1';
const ymd = (iso: string | null) => (iso ? iso.slice(0, 10).replace(/-/g, '/') : '—');

export default function CrmRoomShareManager({ allSalons, onToast }: { allSalons: SalonOption[]; onToast: (msg: string) => void }) {
  const [pairs, setPairs] = useState<CrmRoomSharePairRow[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [a, setA] = useState<number | ''>('');
  const [b, setB] = useState<number | ''>('');
  const [note, setNote] = useState('');

  const load = useCallback(async () => {
    const res = await adminListRoomSharePairs();
    if (res.ok) { setPairs(res.pairs); setReady(res.ready); } else onToast(res.error);
    setLoading(false);
  }, [onToast]);
  useEffect(() => { void load(); }, [load]);

  const onAdd = async () => {
    if (a === '' || b === '') { onToast('店を2つ選んでください'); return; }
    setBusy('add');
    const res = await adminAddRoomSharePair({ salonA: Number(a), salonB: Number(b), note });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast('部屋共有を組みました');
    setA(''); setB(''); setNote('');
    await load();
  };
  const onEnd = async (p: CrmRoomSharePairRow) => {
    if (!window.confirm(`${p.salonA.name} × ${p.salonB.name} の部屋共有を終わらせます。\n\n相手の店の部屋を借りている出勤はそのまま残りますが、本日画面の帯・QRの同意書・ネット予約の空き枠では見なくなります。`)) return;
    setBusy('end-' + p.id);
    const res = await adminEndRoomSharePair({ id: p.id });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast('終わらせました');
    await load();
  };

  if (loading) return <p className="text-xs text-gray-400">読み込み中…</p>;
  if (!ready) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
        追加SQL_第1670便（部屋共有の提携ペアの表）がまだ流れていません。流すと、ここでペアを組めるようになります。
      </p>
    );
  }
  const active = pairs.filter((p) => !p.endedAt);
  const ended = pairs.filter((p) => p.endedAt);
  const sorted = [...allSalons].sort((x, y) => x.name.localeCompare(y.name, 'ja'));

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600 leading-relaxed">
        同じセラピストを2つの店で受け付ける（例: ラビリンスの「きほ」＝ enju の「かるあ」）ときの入れ物です。ペアを組むと、お互いの出勤情報の「待機場所」に相手の店の部屋が「店名／部屋」として並び、
        借りた部屋の QR で同意書が出て（文面・記録・ポイントは予約の店のもの）、本日画面には相手の店の予約の時間帯が帯で出て、フクエスのネット予約の空き枠も相手の予約で閉じます。
        ★ NG・要注意の共有（上のグループ）とは別です。2店とも CRM 契約店である必要があります。
      </p>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[200px]">
          <span className={LABEL}>店 1</span>
          <select value={a} onChange={(e) => setA(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="">選んでください</option>
            {sorted.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="min-w-[200px]">
          <span className={LABEL}>店 2</span>
          <select value={b} onChange={(e) => setB(e.target.value === '' ? '' : Number(e.target.value))} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white">
            <option value="">選んでください</option>
            {sorted.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="flex-1 min-w-[200px]">
          <span className={LABEL}>覚え書き（任意）</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={200} className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white" placeholder="例）きほ＝かるあ" />
        </label>
        <button type="button" onClick={() => void onAdd()} disabled={busy !== '' || a === '' || b === ''} className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">部屋共有を組む</button>
      </div>

      {active.length === 0 ? (
        <p className="text-xs text-gray-400">まだペアはありません。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] text-gray-500">
              <tr><th className="px-3 py-2 text-left">店 1</th><th className="px-3 py-2 text-left">店 2</th><th className="px-3 py-2 text-left">覚え書き</th><th className="px-3 py-2 text-left">組んだ日</th><th className="px-3 py-2" /></tr>
            </thead>
            <tbody>
              {active.map((p) => (
                <tr key={p.id} className="border-t border-gray-100">
                  <td className="px-3 py-2 font-bold text-gray-800">{p.salonA.name}{!p.salonA.crmUntil && <span className="ml-1 text-[10px] text-rose-600">CRM未契約</span>}</td>
                  <td className="px-3 py-2 font-bold text-gray-800">{p.salonB.name}{!p.salonB.crmUntil && <span className="ml-1 text-[10px] text-rose-600">CRM未契約</span>}</td>
                  <td className="px-3 py-2 text-gray-500">{p.note}</td>
                  <td className="px-3 py-2 text-gray-500">{ymd(p.createdAt)}</td>
                  <td className="px-3 py-2 text-right"><button type="button" onClick={() => void onEnd(p)} disabled={busy !== ''} className="text-xs text-rose-600 underline disabled:opacity-50">終わらせる</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {ended.length > 0 && (
        <div className="text-[11px] text-gray-400 leading-relaxed">
          <p className="font-bold text-gray-500">終わったペア</p>
          {ended.map((p) => <p key={p.id}>{p.salonA.name} × {p.salonB.name}（{ymd(p.createdAt)} 〜 {ymd(p.endedAt)}）</p>)}
        </div>
      )}
    </div>
  );
}
