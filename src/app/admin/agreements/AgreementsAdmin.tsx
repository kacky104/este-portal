'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { getListingAgreementAdminList, type AgreementAdminRow } from '@/app/actions/listingAgreement';
import { AGREEMENT_TITLE, AGREEMENT_VERSION_LABEL } from '@/lib/listingAgreement';

// 管理画面「申込書・誓約書」（第1174便・2026-10-04・カッキーさん）。
// ★ 上: 店舗に送るリンク（全店で同じ・https://fukues.com/mypage/agreement）。QR・コピー・LINEで送る。
//   リンクは誰に渡っても、店舗オーナーのアカウントでログインしないとサインできない。
// ★ 下: 全店の提出の様子（提出済み／前の版／未提出）。「見る」で控え（/admin/agreements/[id]・印刷できる）。
// ★ 読み取りは開いたときに 2本（店舗の一覧・サインの一覧）。

const SIGN_URL = 'https://fukues.com/mypage/agreement';
const LINE_TEXT = `【フクエス】「${AGREEMENT_TITLE}」のご提出をお願いします。\nマイページにログインのうえ、下のページからご記入・サインをお願いします（1〜2分で終わります）。\n${SIGN_URL}`;

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
}

export function AgreementsAdmin() {
  const [rows, setRows] = useState<AgreementAdminRow[] | null>(null);
  const [version, setVersion] = useState('');
  const [err, setErr] = useState('');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [showHidden, setShowHidden] = useState(false);
  const [onlyTodo, setOnlyTodo] = useState(false);

  useEffect(() => {
    let alive = true;
    void getListingAgreementAdminList().then((res) => {
      if (!alive) return;
      if (!res.ok) { setErr(res.error); return; }
      setRows(res.rows); setVersion(res.currentVersion);
    });
    QRCode.toDataURL(SIGN_URL, { width: 220, margin: 1 }).then((d) => { if (alive) setQr(d); }).catch(() => { if (alive) setQr(''); });
    return () => { alive = false; };
  }, []);

  const copy = async () => {
    try { await navigator.clipboard.writeText(SIGN_URL); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { /* 手で選んでコピーできる */ }
  };

  const stateOf = (r: AgreementAdminRow): 'done' | 'old' | 'none' => (!r.latest ? 'none' : r.latest.version === version ? 'done' : 'old');
  const visible = useMemo(() => (rows ?? []).filter((r) => (showHidden || !r.isHidden) && (!onlyTodo || stateOf(r) !== 'done')),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, showHidden, onlyTodo, version]);
  const base = (rows ?? []).filter((r) => !r.isHidden);
  const doneCount = base.filter((r) => stateOf(r) === 'done').length;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/admin" className="text-[13px] font-bold text-pink-600 hover:text-pink-700">← 管理者ダッシュボード</Link>
          <h1 className="text-[16px] font-black">申込書・誓約書</h1>
          <span className="ml-auto text-[12px] text-slate-400">{AGREEMENT_VERSION_LABEL}</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-5 space-y-5">
        <section className="bg-white border border-slate-200 p-4 sm:p-5">
          <h2 className="text-[15px] font-black">店舗に送るリンク</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
            全店で同じリンクです。店舗オーナーのアカウントでログインするとサインできます（代筆を防ぐため、ログインしていない人はサインできません）。
          </p>
          <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center">
            {qr
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={qr} alt="サインのページの QR コード" className="h-[160px] w-[160px] flex-none border border-slate-200" />
              : <div className="h-[160px] w-[160px] flex-none bg-slate-100" />}
            <div className="min-w-0 flex-1 space-y-2.5">
              <p className="select-all break-all border border-slate-200 bg-slate-50 px-2.5 py-2 text-[13px] text-slate-600">{SIGN_URL}</p>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => void copy()} className="h-10 bg-pink-600 text-[13.5px] font-bold text-white hover:opacity-95">{copied ? 'コピーしました' : 'リンクをコピー'}</button>
                <a href={`https://line.me/R/share?text=${encodeURIComponent(LINE_TEXT)}`} target="_blank" rel="noopener noreferrer" className="inline-flex h-10 items-center justify-center bg-[#06c755] text-[13.5px] font-bold text-white hover:opacity-90">LINEで送る</a>
              </div>
              <a href={SIGN_URL} target="_blank" rel="noopener noreferrer" className="inline-block text-[13px] font-bold text-pink-600 underline">サインのページを開いて見る</a>
            </div>
          </div>
        </section>

        <section className="bg-white border border-slate-200 p-4 sm:p-5">
          <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
            <h2 className="text-[15px] font-black">提出の様子</h2>
            {rows && <p className="text-[13.5px] text-slate-500"><b className="text-[20px] font-black text-pink-600">{doneCount}</b> / {base.length} 店 提出済み（表示中の店舗）</p>}
            <label className="ml-auto flex items-center gap-1.5 text-[13px] text-slate-600"><input type="checkbox" checked={onlyTodo} onChange={(e) => setOnlyTodo(e.target.checked)} className="accent-pink-600" />まだの店だけ</label>
            <label className="flex items-center gap-1.5 text-[13px] text-slate-600"><input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="accent-pink-600" />非表示の店も出す</label>
          </div>

          {err && <p className="mt-3 text-[14px] font-bold text-rose-600">{err}</p>}
          {!rows && !err && <p className="mt-4 text-[13px] text-slate-400">読み込み中…</p>}
          {rows && (
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-500">
                    <th className="border-b border-slate-200 px-2.5 py-2 font-bold">店舗</th>
                    <th className="border-b border-slate-200 px-2.5 py-2 font-bold">状態</th>
                    <th className="border-b border-slate-200 px-2.5 py-2 font-bold">代表者</th>
                    <th className="border-b border-slate-200 px-2.5 py-2 font-bold">サインした日時</th>
                    <th className="border-b border-slate-200 px-2.5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const st = stateOf(r);
                    return (
                      <tr key={r.salonId} className={`border-b border-slate-100 ${r.isHidden ? 'text-slate-400' : ''}`}>
                        <td className="px-2.5 py-2"><span className="mr-1.5 text-[11.5px] text-slate-400 tabular-nums">{r.salonId}</span>{r.salonName}{r.isHidden ? '（非表示）' : ''}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap">
                          {st === 'done' && <span className="border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[12px] font-bold text-emerald-700">提出済み</span>}
                          {st === 'old' && <span className="border border-amber-300 bg-amber-50 px-2 py-0.5 text-[12px] font-bold text-amber-700">前の版</span>}
                          {st === 'none' && <span className="border border-slate-200 bg-slate-50 px-2 py-0.5 text-[12px] font-bold text-slate-400">未提出</span>}
                        </td>
                        <td className="px-2.5 py-2">{r.latest?.representative ?? ''}</td>
                        <td className="px-2.5 py-2 whitespace-nowrap tabular-nums">{r.latest ? fmt(r.latest.signedAt) : ''}</td>
                        <td className="px-2.5 py-2 text-right">
                          {r.latest && <Link href={`/admin/agreements/${r.latest.id}`} target="_blank" rel="noopener noreferrer" className="font-bold text-pink-600 underline">見る</Link>}
                        </td>
                      </tr>
                    );
                  })}
                  {visible.length === 0 && <tr><td colSpan={5} className="px-2.5 py-6 text-center text-slate-400">該当する店舗はありません</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
