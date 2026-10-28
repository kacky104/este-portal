'use client';

// フクエスCRM 着信ポップ（CTI）：受付端末の発行・管理（運営・第1685便・2026-10-28）。設計メモ_2026-10-28_CTI着信ポップ_D方式.md §5
// ★ 端末を出す → トークンと QR が【この画面に1回だけ】出る → 店舗様の受付 Android のフクエスアプリで QR を読む → 設定完了。
// ★ 一覧は「最後の確認（ping）」で生きているかが分かる。30 分以上 ping が無い端末は黄色（電池の最適化で止まった疑い）。
// ★ 「テスト着信」は端末が無くても CRM のポップ（便 B）を確かめるため。device_id は null で記録に残る。

import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  adminListCtiDevices, adminAddCtiDevice, adminReissueCtiToken, adminSetCtiDeviceEnabled, adminDeleteCtiDevice, adminCtiTestCall,
  type CrmCtiDeviceRow, type CrmCtiQrPayload,
} from '@/app/actions/crmCtiAdmin';

type SalonOption = { id: number; name: string };
const LABEL = 'block text-[11px] font-bold text-gray-500 mb-1';
const INPUT = 'w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm bg-white';

function ago(iso: string | null): { text: string; stale: boolean } {
  if (!iso) return { text: 'まだ無し', stale: true };
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return { text: '—', stale: true };
  const m = Math.floor(ms / 60_000);
  const stale = m >= 30;
  if (m < 1) return { text: 'たった今', stale };
  if (m < 60) return { text: `${m}分前`, stale };
  const h = Math.floor(m / 60);
  if (h < 48) return { text: `${h}時間前`, stale };
  return { text: `${Math.floor(h / 24)}日前`, stale };
}

/** 発行した直後に1回だけ出す枠（トークン＋QR）。閉じたら二度と出ない */
function IssuedBox({ issued, onClose }: { issued: { title: string; token: string; qr: CrmCtiQrPayload }; onClose: () => void }) {
  const [img, setImg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(JSON.stringify(issued.qr), { width: 220, margin: 1 }).then((d) => { if (alive) setImg(d); }).catch(() => { if (alive) setImg(''); });
    return () => { alive = false; };
  }, [issued]);
  const copy = async () => { try { await navigator.clipboard.writeText(issued.token); } catch { /* 手で選んでコピー */ } };
  return (
    <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4 space-y-3">
      <p className="text-sm font-black text-amber-900">{issued.title}</p>
      <p className="text-xs text-amber-800 leading-relaxed">
        この QR（またはトークン）は<strong>今だけ</strong>表示されます。閉じると二度と出ません（なくしたら「再発行」）。
        受付の Android のフクエスアプリで QR を読むと設定が終わります。
      </p>
      <div className="flex flex-wrap items-start gap-4">
        {img ? <img src={img} alt="端末設定用QR" width={220} height={220} className="rounded-lg border border-amber-200 bg-white" /> : <div className="h-[220px] w-[220px] rounded-lg bg-white/60" />}
        <div className="min-w-[240px] flex-1 space-y-2">
          <span className={LABEL}>トークン（手で入れるとき）</span>
          <code className="block break-all rounded-lg border border-amber-200 bg-white px-2 py-1.5 text-xs">{issued.token}</code>
          <div className="flex gap-2">
            <button type="button" onClick={() => void copy()} className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white">コピー</button>
            <button type="button" onClick={onClose} className="rounded-lg border border-amber-400 px-3 py-1.5 text-xs font-bold text-amber-800">閉じる（もう出ません）</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CrmCtiManager({ allSalons, onToast }: { allSalons: SalonOption[]; onToast: (msg: string) => void }) {
  const [devices, setDevices] = useState<CrmCtiDeviceRow[]>([]);
  const [ready, setReady] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [salon, setSalon] = useState<number | ''>('');
  const [name, setName] = useState('受付');
  const [issued, setIssued] = useState<{ title: string; token: string; qr: CrmCtiQrPayload } | null>(null);
  const [testSalon, setTestSalon] = useState<number | ''>('');
  const [testPhone, setTestPhone] = useState('');

  const load = useCallback(async () => {
    const res = await adminListCtiDevices();
    if (res.ok) { setDevices(res.devices); setReady(res.ready); } else onToast(res.error);
    setLoading(false);
  }, [onToast]);
  useEffect(() => { void load(); }, [load]);
  // ★ 「◯分前」を動かす（1分ごと）
  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((v) => v + 1), 60_000); return () => clearInterval(t); }, []);

  const onAdd = async () => {
    if (salon === '') { onToast('店を選んでください'); return; }
    setBusy('add');
    const res = await adminAddCtiDevice({ salonId: Number(salon), name });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    const sName = allSalons.find((s) => s.id === Number(salon))?.name ?? '';
    setIssued({ title: `${sName}「${res.qr.device}」の端末を出しました`, token: res.token, qr: res.qr });
    onToast('端末を出しました。QR はこの画面に1回だけ出ます');
    await load();
  };
  const onReissue = async (d: CrmCtiDeviceRow) => {
    if (!window.confirm(`${d.salonName}「${d.name}」のトークンを作り直します。\n\n今アプリに入っているトークンはその場で使えなくなり、新しい QR を読み直すまで着信は届きません。`)) return;
    setBusy('re-' + d.id);
    const res = await adminReissueCtiToken({ id: d.id });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    setIssued({ title: `${d.salonName}「${d.name}」のトークンを作り直しました`, token: res.token, qr: res.qr });
    await load();
  };
  const onToggle = async (d: CrmCtiDeviceRow) => {
    const next = !d.isEnabled;
    if (!next && !window.confirm(`${d.salonName}「${d.name}」を止めます。止めている間、この端末からの着信は受け付けません（トークンは残ります）。`)) return;
    setBusy('en-' + d.id);
    const res = await adminSetCtiDeviceEnabled({ id: d.id, enabled: next });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(next ? '再開しました' : '止めました');
    await load();
  };
  const onDelete = async (d: CrmCtiDeviceRow) => {
    if (!window.confirm(`${d.salonName}「${d.name}」を消します。\n\nこの端末のトークンは二度と使えません（着信の記録は残り、90日で消えます）。`)) return;
    setBusy('del-' + d.id);
    const res = await adminDeleteCtiDevice({ id: d.id });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast('消しました');
    await load();
  };
  const onTest = async (hidden: boolean) => {
    if (testSalon === '') { onToast('店を選んでください'); return; }
    setBusy('test');
    const res = await adminCtiTestCall({ salonId: Number(testSalon), phone: hidden ? '' : testPhone, hidden: hidden ? 'withheld' : undefined });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(res.duplicate ? '10秒以内の同じ番号なので1件にまとめました' : 'テスト着信を入れました（CRM を開いている画面にポップが出ます）');
  };

  if (loading) return <p className="text-xs text-gray-400">読み込み中…</p>;
  if (!ready) {
    return (
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
        追加SQL_第1685便（CTI着信ポップの土台）がまだ流れていません。流すと、ここで端末を出せるようになります。
      </p>
    );
  }
  const sorted = [...allSalons].sort((x, y) => x.name.localeCompare(y.name, 'ja'));

  return (
    <div className="space-y-4">
      <p className="text-xs text-gray-600 leading-relaxed">
        受付の Android に入れたフクエスのアプリが「かかってきた番号」を送り、開いている CRM の画面にポップを出します（電話は今まで通り携帯で出る・転送も通話料もなし）。
        ここで店ごとに端末を出すと QR が1回だけ出るので、店舗様の受付 Android のアプリで読んでもらいます。★ CRM 契約店だけ。1店1台の想定（2台目も同じ手順）。
      </p>

      {issued && <IssuedBox issued={issued} onClose={() => setIssued(null)} />}

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 flex flex-wrap items-end gap-3">
        <label className="min-w-[220px]">
          <span className={LABEL}>店</span>
          <select value={salon} onChange={(e) => setSalon(e.target.value === '' ? '' : Number(e.target.value))} className={INPUT}>
            <option value="">選んでください</option>
            {sorted.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="min-w-[160px]">
          <span className={LABEL}>端末の名前</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={30} className={INPUT} placeholder="受付" />
        </label>
        <button type="button" onClick={() => void onAdd()} disabled={busy !== '' || salon === ''} className="rounded-lg bg-pink-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-40">端末を出す（QR を作る）</button>
      </div>

      {devices.length === 0 ? (
        <p className="text-xs text-gray-400">まだ端末はありません。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] text-gray-500">
              <tr>
                <th className="px-3 py-2 text-left">店</th><th className="px-3 py-2 text-left">端末</th>
                <th className="px-3 py-2 text-left">最後の確認</th><th className="px-3 py-2 text-left">最後の着信</th>
                <th className="px-3 py-2 text-left">機種</th><th className="px-3 py-2 text-left">状態</th><th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {devices.map((d) => {
                const seen = ago(d.lastSeenAt);
                const call = ago(d.lastCallAt);
                return (
                  <tr key={d.id} className={'border-t border-gray-100 ' + (!d.isEnabled ? 'opacity-60' : d.isEnabled && seen.stale ? 'bg-amber-50' : '')}>
                    <td className="px-3 py-2 font-bold text-gray-800">{d.salonName}{!d.crmUntil && <span className="ml-1 text-[10px] text-rose-600">CRM未契約</span>}</td>
                    <td className="px-3 py-2 text-gray-700">{d.name}</td>
                    <td className="px-3 py-2 text-gray-600">{seen.text}{d.isEnabled && seen.stale && <span className="ml-1 text-[10px] text-amber-700">（30分以上なし・電池設定？）</span>}</td>
                    <td className="px-3 py-2 text-gray-600">{call.text}</td>
                    <td className="px-3 py-2 text-[11px] text-gray-500">{d.deviceModel || '—'}{d.androidVersion ? ` / Android ${d.androidVersion}` : ''}{d.appVersion ? ` / app ${d.appVersion}` : ''}</td>
                    <td className="px-3 py-2">{d.isEnabled ? <span className="text-[11px] font-bold text-emerald-700">有効</span> : <span className="text-[11px] font-bold text-gray-500">停止中</span>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap space-x-3">
                      <button type="button" onClick={() => void onReissue(d)} disabled={busy !== ''} className="text-xs text-pink-600 underline disabled:opacity-50">再発行</button>
                      <button type="button" onClick={() => void onToggle(d)} disabled={busy !== ''} className="text-xs text-gray-600 underline disabled:opacity-50">{d.isEnabled ? '止める' : '再開'}</button>
                      <button type="button" onClick={() => void onDelete(d)} disabled={busy !== ''} className="text-xs text-rose-600 underline disabled:opacity-50">消す</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="rounded-xl border border-dashed border-gray-300 p-3 flex flex-wrap items-end gap-3">
        <div className="w-full text-[11px] font-bold text-gray-500">テスト着信（端末が無くても CRM のポップを確かめる）</div>
        <label className="min-w-[220px]">
          <span className={LABEL}>店</span>
          <select value={testSalon} onChange={(e) => setTestSalon(e.target.value === '' ? '' : Number(e.target.value))} className={INPUT}>
            <option value="">選んでください</option>
            {sorted.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="min-w-[180px]">
          <span className={LABEL}>電話番号</span>
          <input value={testPhone} onChange={(e) => setTestPhone(e.target.value)} inputMode="numeric" className={INPUT} placeholder="09012345678" />
        </label>
        <button type="button" onClick={() => void onTest(false)} disabled={busy !== '' || testSalon === '' || !testPhone.trim()} className="rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white disabled:opacity-40">この番号で着信</button>
        <button type="button" onClick={() => void onTest(true)} disabled={busy !== '' || testSalon === ''} className="rounded-lg border border-slate-400 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-40">非通知で着信</button>
      </div>
    </div>
  );
}
