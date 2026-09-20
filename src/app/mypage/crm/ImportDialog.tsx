'use client';

import { useState } from 'react';
import { importCrmCustomers, previewCrmImport, type CrmImportPreviewRow } from '@/app/actions/crm';
import { decodeText, parseCsv, parseVcf } from '@/app/lib/crm/importParse';

// フクエスCRM：お客様の取り込み（第566便・第579便で設定の一番下へ移した）。
// ★ 最初の1回くらいしか使わないので、顧客台帳からは外し、設定タブの「データの取り込み」から開く。

// ── 顧客の取り込み（第566便）：スマホの連絡先（.vcf）・CSV から名前と電話番号 ──────────
const IMPORT_STATUS_LABEL: Record<CrmImportPreviewRow['status'], string> = {
  new: '新規', exists: 'もう台帳にいる', dup: 'ファイル内で重複', invalid: '電話番号なし',
};

export function ImportDialog({ salonId, onClose, onDone }: { salonId: number; onClose: () => void; onDone: () => void }) {
  const [rows, setRows] = useState<CrmImportPreviewRow[] | null>(null);
  const [checked, setChecked] = useState<boolean[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [result, setResult] = useState('');
  const [truncated, setTruncated] = useState(false);

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setErr(''); setResult(''); setRows(null); setFileName(f.name);
    if (f.size > 20 * 1024 * 1024) { setErr('ファイルが大きすぎます（20MBまで）'); return; }
    const text = decodeText(await f.arrayBuffer());
    const parsed = /BEGIN:VCARD/i.test(text) ? parseVcf(text) : parseCsv(text);
    if (parsed.length === 0) { setErr('読み取れる行がありませんでした（.vcf か CSV を選んでください）'); return; }
    setBusy(true);
    const r = await previewCrmImport(salonId, parsed);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setRows(r.rows);
    setTruncated(r.truncated);
    setChecked(r.rows.map((x) => x.status === 'new' || x.status === 'exists'));
  };

  const run = async () => {
    if (!rows) return;
    const pickRows = rows.filter((_, i) => checked[i]).map((r) => ({ name: r.name, phones: r.phones }));
    if (pickRows.length === 0) { setErr('取り込む行にチェックを入れてください'); return; }
    setBusy(true); setErr('');
    const r = await importCrmCustomers(salonId, pickRows);
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setResult(`取り込みました：新しく ${r.created}人・もう台帳にいた人に追記 ${r.updated}人・変更なし／取り込まない ${r.skipped}件`);
    setRows(null);
    onDone();
  };

  const count = (st: CrmImportPreviewRow['status']) => (rows ?? []).filter((r) => r.status === st).length;
  const fmt = (p: string) => (p.length === 11 ? `${p.slice(0, 3)}-${p.slice(3, 7)}-${p.slice(7)}` : p);

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={busy ? undefined : onClose} />
      <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-3">
        <div className="pointer-events-auto flex max-h-[92vh] w-full max-w-[720px] flex-col bg-white shadow-2xl">
          <div className="flex items-center bg-indigo-600 px-4 py-2.5 text-white">
            <span className="text-[15px] font-black">お客様の取り込み（名前と電話番号）</span>
            <button type="button" onClick={onClose} disabled={busy} className="ml-auto px-2 text-[20px] font-bold" aria-label="閉じる">×</button>
          </div>
          <div className="overflow-y-auto p-4 text-[13px] text-slate-700">
            <p className="leading-relaxed">
              スマホの連絡先を書き出したファイル（.vcf）か、CSV ファイルを選んでください。名前と電話番号だけを読み込みます。
              電話番号が同じお客様は重複して作りません（名前が空なら名前を入れ、足りない番号を足します）。
            </p>
            <details className="mt-2 border border-slate-200 bg-slate-50 p-2">
              <summary className="cursor-pointer font-bold text-slate-600">スマホの連絡先の書き出し方</summary>
              <ul className="mt-1 list-disc space-y-1 pl-5 leading-relaxed">
                <li><b>iPhone</b>：パソコンで iCloud.com の「連絡先」を開く → 全部選ぶ → 「書き出す（vCard）」</li>
                <li><b>Android</b>：「連絡先」アプリ → 設定（またはメニュー）→「エクスポート」→ .vcf ファイルを作る</li>
                <li><b>CSV</b>：1行目に「名前」「電話番号」の見出しがあると確実です（Excel で保存した CSV も読めます）</li>
              </ul>
            </details>
            <label className="mt-3 inline-block cursor-pointer bg-indigo-600 px-4 py-2 font-bold text-white">
              ファイルを選ぶ
              <input type="file" accept=".vcf,.vcard,.csv,.txt,text/vcard,text/csv" className="hidden" onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
            {fileName && <span className="ml-2 text-slate-500">{fileName}</span>}
            {busy && <p className="mt-2 text-slate-400">処理しています…</p>}
            {err && <p className="mt-2 font-bold text-rose-600">{err}</p>}
            {result && <p className="mt-2 bg-emerald-50 px-3 py-2 font-bold text-emerald-800">{result}</p>}

            {rows && (
              <div className="mt-3">
                <p className="font-bold">
                  {rows.length}件：新規 {count('new')}・もう台帳にいる {count('exists')}・ファイル内で重複 {count('dup')}・電話番号なし {count('invalid')}
                </p>
                {truncated && <p className="text-[12px] font-bold text-amber-700">一度に取り込めるのは3000件までです（最初の3000件だけ出しています）</p>}
                <div className="mt-1 flex gap-2 text-[12px]">
                  <button type="button" onClick={() => setChecked(rows.map((r) => r.status === 'new' || r.status === 'exists'))} className="border border-slate-300 px-2 py-0.5 font-bold">取り込める行を全部選ぶ</button>
                  <button type="button" onClick={() => setChecked(rows.map(() => false))} className="border border-slate-300 px-2 py-0.5 font-bold">全部外す</button>
                </div>
                <div className="mt-2 max-h-[45vh] overflow-y-auto border border-slate-200">
                  <table className="w-full text-[12px]">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr>
                        <th className="w-8 px-2 py-1.5" />
                        <th className="px-2 py-1.5 text-left">名前</th>
                        <th className="px-2 py-1.5 text-left">電話番号</th>
                        <th className="px-2 py-1.5 text-left">状態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((r, i) => {
                        const can = r.status === 'new' || r.status === 'exists';
                        return (
                          <tr key={i} className={can ? '' : 'text-slate-400'}>
                            <td className="px-2 py-1">
                              <input type="checkbox" disabled={!can} checked={!!checked[i]} onChange={(e) => setChecked(checked.map((v, j) => (j === i ? e.target.checked : v)))} />
                            </td>
                            <td className="px-2 py-1">{r.name || '(名前なし)'}</td>
                            <td className="px-2 py-1">{r.phones.map(fmt).join('、') || '—'}</td>
                            <td className="px-2 py-1">
                              <span className={r.status === 'new' ? 'font-bold text-emerald-700' : r.status === 'exists' ? 'font-bold text-indigo-700' : ''}>{IMPORT_STATUS_LABEL[r.status]}</span>
                              {r.status === 'exists' && r.existingName && <span className="ml-1 text-slate-500">（{r.existingName}）</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
          {rows && (
            <div className="border-t border-slate-200 p-3">
              <button type="button" disabled={busy} onClick={run} className="w-full bg-indigo-600 py-2.5 text-[15px] font-bold text-white disabled:opacity-50">
                {busy ? '取り込んでいます…' : `チェックした ${checked.filter(Boolean).length}件を取り込む`}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

