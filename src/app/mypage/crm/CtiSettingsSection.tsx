'use client';

// フクエスCRM 設定タブ「着信ポップ」（第1686便・2026-10-28）。設計メモ_2026-10-28_CTI着信ポップ_D方式.md §4-4
// ★ 出すもの: 仕組みの説明／受付端末の一覧（最後の確認・最後の着信）／テスト着信／音・表示の ON/OFF（このブラウザだけ）。
// ★ 端末の発行（QR）は運営（/admin）だけ。ここでは読むだけ。
// ★ 「保存する」は要らない（音・表示はその場でこの端末に覚える）。

import { useCallback, useEffect, useState } from 'react';
import { crmCtiTestCall, listCrmCtiDevices, type CrmCtiDeviceInfo } from '@/app/actions/crmCti';
import { ctiPrefs, setCtiPrefs, type CtiPrefs } from '@/app/lib/crm/ctiPrefs';
import { playAlarmOnce, unlockAlarmAudio } from '@/app/lib/crm/alarmSound';
import { safeAction } from './CrmBase';
import { CTI_TEST_EVENT } from './CrmIncomingCalls';

function ago(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: 'まだ無し', stale: true };
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (!Number.isFinite(m)) return { text: '—', stale: true };
  const stale = m >= 30;
  if (m < 1) return { text: 'たった今', stale };
  if (m < 60) return { text: `${m}分前`, stale };
  const h = Math.floor(m / 60);
  if (h < 48) return { text: `${h}時間前`, stale };
  return { text: `${Math.floor(h / 24)}日前`, stale };
}

export function CtiSettingsSection({ salonId }: { salonId: number }) {
  const [devices, setDevices] = useState<CrmCtiDeviceInfo[] | null>(null);
  const [ready, setReady] = useState(true);
  const [err, setErr] = useState('');
  const [prefs, setPrefsState] = useState<CtiPrefs>({ pop: true, sound: true });
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const r = await safeAction(listCrmCtiDevices(salonId));
    if (!r.ok) { setErr(r.error); setDevices([]); return; }
    setReady(r.ready); setDevices(r.devices);
  }, [salonId]);
  useEffect(() => { void load(); setPrefsState(ctiPrefs()); }, [load]);

  const setPref = (p: Partial<CtiPrefs>) => { setCtiPrefs(p); setPrefsState(ctiPrefs()); };
  const test = async (hidden: boolean) => {
    setBusy(true); setMsg(''); setErr('');
    const r = await safeAction(crmCtiTestCall(salonId, { phone, hidden }));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    try { window.dispatchEvent(new Event(CTI_TEST_EVENT)); } catch { /* 何もしない */ }
    setMsg(r.duplicate ? '10秒以内の同じ番号なので1件にまとめました' : 'テスト着信を入れました。3秒ほどで右上にポップが出ます（この画面でも出ます）');
  };

  const hasDevice = (devices ?? []).length > 0;

  return (
    <section className="mt-4 border border-slate-200 bg-white p-5">
      <h2 className="text-[17px] font-black text-slate-800">着信ポップ <span className="ml-1 border border-amber-300 bg-amber-50 px-1.5 py-0.5 align-middle text-[12px] font-bold text-amber-800">準備中</span></h2>
      {/* ★ 第1688便: 受付の Android アプリの配布が始まるまで「準備中」。始まったら、この札と設定タブの「（準備中）」を外す */}
      <p className="mt-1 text-[13px] font-bold text-amber-800">受付の Android 用アプリを準備しています。使えるようになりましたら、運営からご案内します。</p>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        受付の Android に入れた「フクエス着信」アプリが、かかってきた電話の番号をフクエスCRMに知らせます。
        CRM を開いている画面（PC・タブレット・スマホ、どれでも）の右上に、お客様の名前・分類・次が何回目か・要注意メモ・グループ共有のNGが出ます。
        台帳にない番号は「新規」と出て、「受付へ」「台帳」を押すと番号が入った状態で開きます。電話はいつも通り携帯で出てください（転送も通話料もありません）。
      </p>
      <p className="mt-1 text-[12px] text-slate-400">アプリの設定（QR）は運営が行います。使い始めたい・端末を替えたいときは運営までご連絡ください。</p>

      {/* 端末 */}
      <h3 className="mt-4 text-[14px] font-black text-slate-700">受付の端末</h3>
      {devices == null ? (
        <p className="mt-1 text-[13px] text-slate-400">読み込み中…</p>
      ) : !ready ? (
        <p className="mt-1 text-[13px] text-slate-400">着信ポップはまだ準備中です。</p>
      ) : !hasDevice ? (
        <p className="mt-1 text-[13px] text-slate-500">まだ端末は登録されていません（運営が設定すると、ここに出ます）。</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {devices!.map((d) => {
            const seen = ago(d.lastSeenAt);
            const call = ago(d.lastCallAt);
            return (
              <li key={d.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 border px-3 py-2 text-[13px] ${!d.isEnabled ? 'border-slate-200 bg-slate-50 text-slate-400' : seen.stale ? 'border-amber-300 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}`}>
                <span className="font-bold text-slate-800">{d.name}</span>
                {!d.isEnabled ? <span className="text-[11px] font-bold">停止中（運営）</span>
                  : seen.stale ? <span className="text-[11px] font-bold text-amber-800">アプリからの確認が {seen.text}（止まっているかもしれません・端末のアプリを開いてください）</span>
                  : <span className="text-[11px] font-bold text-emerald-800">動いています（確認 {seen.text}）</span>}
                <span className="text-[12px] text-slate-500">最後の着信 {call.text}</span>
                {d.deviceModel && <span className="text-[11px] text-slate-400">{d.deviceModel}{d.androidVersion ? ` / Android ${d.androidVersion}` : ''}</span>}
              </li>
            );
          })}
        </ul>
      )}

      {/* この端末（ブラウザ）の設定 */}
      <h3 className="mt-5 text-[14px] font-black text-slate-700">この画面での出し方（この端末だけ）</h3>
      <div className="mt-2 space-y-2 text-[14px]">
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={prefs.pop} onChange={(e) => setPref({ pop: e.target.checked })} />
          この端末ではポップを出す
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-5 w-5 accent-indigo-600" checked={prefs.sound} onChange={(e) => setPref({ sound: e.target.checked })} />
          着信のときに音を鳴らす
          <button type="button" onClick={async () => { if (await unlockAlarmAudio()) playAlarmOnce(3); }} className="ml-2 border border-slate-300 bg-white px-2 py-1 text-[12px] font-bold text-slate-600">▶ 試しに鳴らす</button>
        </label>
        <p className="text-[12px] text-slate-400">ブラウザの決まりで、画面を一度でも触ったあとでないと音は出ません。ポップは閉じるまで残り、3分たつと薄くなります。</p>
      </div>

      {/* テスト */}
      <h3 className="mt-5 text-[14px] font-black text-slate-700">テスト着信</h3>
      <p className="mt-1 text-[12px] text-slate-500">端末が無くても、ここから「かかってきたこと」にしてポップを確かめられます。</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="numeric" placeholder="09012345678" className="w-44 border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-indigo-400 focus:outline-none" />
        <button type="button" disabled={busy || !phone.trim() || !ready} onClick={() => void test(false)} className="bg-indigo-600 px-3 py-2 text-[13px] font-bold text-white disabled:opacity-40">この番号で着信</button>
        <button type="button" disabled={busy || !ready} onClick={() => void test(true)} className="border border-slate-300 bg-white px-3 py-2 text-[13px] font-bold text-slate-700 disabled:opacity-40">非通知で着信</button>
      </div>
      {msg && <p className="mt-2 text-[13px] font-bold text-emerald-700">{msg}</p>}
      {err && <p className="mt-2 text-[13px] font-bold text-rose-600">{err}</p>}
    </section>
  );
}
