'use client';

import { useEffect, useState } from 'react';
import { getDiaryForwards, saveDiaryForward, getSalonDiaryConsents, setDiaryConsent } from '@/app/actions/diaryForward';
import { toConsentState, consentLabel, type ConsentState } from '@/lib/therapistMediaConsent';

// コネックエフ「女性プロフィール編集」の【写メ日記】タブ（第731便・2026-09-23・カッキーさん）。
// ★ 中身はフクエスのマイページ（/mypage/therapist/[id]）の「写メ日記の転送先」と同じ（同じ action・同じ表 therapist_diary_forwards）。
// ★★ 1人につきサイト1か所（カッキーさんの決定）。★ 「枠を追加」は出さない。枠1だけ。
//   ★ すでに2枠目以降が入っている子は、その行も出す（消えたように見せない）。増やす口だけ無い。
// ★ 送るかどうかは店舗の「写メ日記の正本」で決まる。ここは宛先の登録だけ（マイページと同じ）。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const INPUT = 'w-full border border-slate-300 rounded bg-white px-2 py-1.5 text-[14px] focus:outline-none focus:border-[#1e88e5]';
const SITES = [{ p: 'ekichika', label: '駅ちか' }, { p: 'esulove', label: 'エステラブ' }] as const;

type Row = { provider: string; slot: number; address: string; saved: string };

// ★ 第767便（カッキーさん）: エステ魂は宛先ではなく【本人の了承】（写メ日記転送のエステ魂タブと同じ記録・同じ action）
const CONSENT_BTNS: Array<[ConsentState, string]> = [['agreed', '了承あり'], ['declined', '送らない'], ['unknown', '未確認']];

export function GirlDiaryTab({ id, salonId, onToast }: { id: number; salonId: number; onToast: (m: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [consentBusy, setConsentBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    getSalonDiaryConsents({ salonId, provider: 'esutama' }).then((r) => {
      if (!alive || !r.ok) return;
      const c = r.data.consents.find((x) => String(x.therapistId) === String(id));
      setConsent(c ? toConsentState(c.state) : 'unknown');
    }).catch(() => { /* ★ 読めなければ行を出さない */ });
    return () => { alive = false; };
  }, [id, salonId]);

  const onConsent = async (state: ConsentState) => {
    setConsentBusy(true);
    try {
      const r = await setDiaryConsent({ therapistId: id, provider: 'esutama', state });
      if (!r.ok) { onToast(r.error); return; }
      setConsent(state);
      onToast(state === 'agreed' ? 'エステ魂を「了承あり」にしました' : state === 'declined' ? 'エステ魂を「送らない」にしました' : 'エステ魂を「まだ確認していません」に戻しました');
    } finally { setConsentBusy(false); }
  };

  useEffect(() => {
    let alive = true;
    getDiaryForwards({ therapistId: id }).then((r) => {
      if (!alive) return;
      if (!r.ok) { setError(r.error); return; }
      const loadedRows: Row[] = r.data.map((f) => ({ provider: f.provider, slot: f.slot, address: f.address, saved: f.address }));
      for (const s of SITES) {
        if (!loadedRows.some((x) => x.provider === s.p)) loadedRows.push({ provider: s.p, slot: 1, address: '', saved: '' });
      }
      setRows(loadedRows);
      setLoaded(true);
    }).catch((e) => { if (alive) setError(String(e)); });
    return () => { alive = false; };
  }, [id]);

  const onSave = async (provider: string, label: string, row: Row) => {
    const key = `${provider}:${row.slot}`;
    setSaving(key);
    const r = await saveDiaryForward({ therapistId: id, provider, slot: row.slot, address: row.address });
    setSaving(null);
    if (!r.ok) { onToast(r.error); return; }
    const v = row.address.trim();
    if (r.data.saved) {
      setRows((rs) => rs.map((x) => (x.provider === provider && x.slot === row.slot ? { ...x, address: v, saved: v } : x)));
      onToast(`${label}の宛先を保存しました`);
    } else if (row.slot > 1) {
      setRows((rs) => rs.filter((x) => !(x.provider === provider && x.slot === row.slot)));
      onToast(`${label}（${row.slot}枠目）の宛先を消しました`);
    } else {
      setRows((rs) => rs.map((x) => (x.provider === provider && x.slot === row.slot ? { ...x, address: '', saved: '' } : x)));
      onToast(`${label}へは送らない設定にしました`);
    }
  };

  return (
    <div className={CARD}>
      <div className="px-4 py-2">
        <p className="text-[13.5px] font-bold text-slate-700 pt-3 pb-1 border-b border-slate-200">写メ日記の転送先</p>
        <p className="text-[12px] text-slate-500 py-2">
          各サイトで発行された「日記の投稿用メールアドレス」を貼ってください。空なら送りません。
        </p>
        {error ? (
          <p className="text-[13px] text-rose-600 py-2">読み込めませんでした: {error}</p>
        ) : !loaded ? (
          <p className="text-[13px] text-slate-400 py-2">読み込み中…</p>
        ) : SITES.map((s) => {
          const mine = rows.filter((r) => r.provider === s.p).sort((a, b) => a.slot - b.slot);
          return mine.map((row) => {
            const key = `${s.p}:${row.slot}`;
            const dirty = row.address.trim() !== row.saved;
            return (
              <div key={key} className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-1.5 sm:gap-3 items-start py-3 border-b border-slate-100 last:border-b-0">
                <div className="pt-1.5 text-[14px]">
                  {s.label}{row.slot > 1 ? `（${row.slot}枠目）` : ''}
                  {dirty && <span className="ml-2 text-[11px] font-bold text-rose-600 border border-rose-200 bg-rose-50 rounded-full px-2 py-0.5">未保存</span>}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="email" inputMode="email" autoComplete="off" placeholder="未登録"
                    value={row.address}
                    onChange={(e) => setRows((rs) => rs.map((x) => (x.provider === s.p && x.slot === row.slot ? { ...x, address: e.target.value } : x)))}
                    className={INPUT}
                  />
                  <button
                    type="button" disabled={saving === key}
                    onClick={() => void onSave(s.p, s.label, row)}
                    className="flex-none h-8 min-w-[80px] px-4 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40"
                  >
                    {saving === key ? '保存中…' : '保存'}
                  </button>
                </div>
              </div>
            );
          });
        })}
        {loaded && consent && (
          <div className="grid grid-cols-1 sm:grid-cols-[170px_1fr] gap-1.5 sm:gap-3 items-start py-3 border-b border-slate-100">
            <div className="pt-1 text-[14px]">エステ魂</div>
            <div>
              <div className="flex flex-wrap items-center gap-3">
                <span className={`text-[13.5px] font-bold ${consent === 'agreed' ? 'text-emerald-700' : consent === 'declined' ? 'text-slate-500' : 'text-amber-700'}`}>
                  {consentLabel(consent)}
                </span>
                <span className="flex items-center gap-1.5">
                  {CONSENT_BTNS.map(([st, label]) => (
                    <button key={st} type="button" onClick={() => void onConsent(st)} disabled={consentBusy || consent === st} aria-pressed={consent === st}
                      className={`text-[13px] font-bold px-2.5 py-1 border disabled:opacity-40 ${consent === st ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
                      {label}
                    </button>
                  ))}
                </span>
              </div>
              <p className="text-[12px] text-slate-500 mt-1.5 leading-relaxed">エステ魂はセラピスト本人のアカウントから投稿するため、ご本人の了承を記録します。了承ありでも「魂セラピスト」を始めていないと転送できません。</p>
            </div>
          </div>
        )}
        <p className="text-[12px] text-amber-700 bg-amber-50 border border-amber-100 rounded px-3 py-2 my-3 leading-relaxed">
          ※ この宛先を知っている人は誰でもこのセラピストとして各サイトに投稿できます。取り扱いにご注意ください。
        </p>
      </div>
    </div>
  );
}
