'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminListImportSources, adminUpsertImportSource, adminSetImportSourceEnabled, adminSetImportSourceImasugu, extractEkichikaShopId,
  type ImportSourceRow,
} from '@/app/actions/importSourceAdmin';

// /admin「フクエスリンク：駅ちかの店舗ページ登録」（第704便・2026-09-23・カッキーさん）。
//   ★ 上: 店舗を選ぶ → 駅ちかのお店のページの URL を貼る → 店舗番号は URL から自動で入る（手で直せる）→ 登録する
//   ★ 下: 登録済みの一覧（店舗名・番号・URL・最終取り込み・状態）。行ごとに 停止／再開 だけ（削除は付けない）
//   ★ 読み書きは server action（service_role）。★ 旗は server action 側で全部立てる。
// ★★ 第1261便（2026-10-07・カッキーさん）: 即ヒメを読むかを枠ごとに選ぶ。既定は 枠1＝読む・枠2と3＝読まない
//   （2枠の店で、枠2の取り込みが枠1で付けた「今すぐ」を外していた。フクエスの今すぐは枠1のページと同じにする）。
//   ★ 登録の欄にチェック（枠を選び直すと既定に戻る）／一覧に「即ヒメ」の列と切り替えボタン。

type SalonOption = { id: number; name: string };

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function ImportSourceManager({ allSalons, onToast }: {
  allSalons: SalonOption[];
  onToast: (msg: string) => void;
}) {
  const [rows, setRows] = useState<ImportSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [salonId, setSalonId] = useState<number | ''>('');
  const [slot, setSlot] = useState<1 | 2 | 3>(1);
  // ★ 第1261便: 即ヒメを読むか。★ 枠1だけが既定で ON
  const [imasugu, setImasugu] = useState(true);
  const [busyImId, setBusyImId] = useState<number | null>(null);
  const pickSlot = (n: 1 | 2 | 3) => { setSlot(n); setImasugu(n === 1); };
  const [externalId, setExternalId] = useState('');
  const [shopUrl, setShopUrl] = useState('');
  const [idTouched, setIdTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await adminListImportSources();
    if (res.ok) setRows(res.rows); else onToast(res.error);
    setLoading(false);
  }, [onToast]);
  useEffect(() => { void load(); }, [load]);

  // ★ URL を貼ったら番号を抜く（★ 番号を手で直したあとは触らない）
  const onShopUrl = async (v: string) => {
    setShopUrl(v);
    if (!idTouched) setExternalId(await extractEkichikaShopId(v));
  };

  const onSave = async () => {
    if (salonId === '') { onToast('店舗を選んでください'); return; }
    setSaving(true);
    const res = await adminUpsertImportSource({ salonId: Number(salonId), slot, externalId, shopUrl, importImasugu: imasugu });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast(res.created ? '登録しました。次の取り込み（15分以内）から動きます' : '上書きしました。次の取り込み（15分以内）から動きます');
    setExternalId(''); setShopUrl(''); setIdTouched(false); pickSlot(1);
    await load();
  };

  // ★ 第1261便: 一覧から、その枠の即ヒメを読む／読まない
  const onToggleImasugu = async (r: ImportSourceRow) => {
    setBusyImId(r.id);
    const res = await adminSetImportSourceImasugu({ id: r.id, on: !r.importImasugu });
    setBusyImId(null);
    if (!res.ok) { onToast(res.error); return; }
    const label = r.salonName + (r.slot > 1 ? `（枠${r.slot}）` : '');
    onToast(r.importImasugu ? `${label} の即ヒメを読まないようにしました` : `${label} の即ヒメを読むようにしました（次の取り込みから）`);
    await load();
  };

  const onToggle = async (r: ImportSourceRow) => {
    setBusyId(r.id);
    const res = await adminSetImportSourceEnabled({ id: r.id, enabled: !r.isEnabled });
    setBusyId(null);
    if (!res.ok) { onToast(res.error); return; }
    onToast(r.isEnabled ? `${r.salonName} の取り込みを止めました` : `${r.salonName} の取り込みを再開しました`);
    await load();
  };

  const registered = new Set(rows.filter((r) => r.slot === slot).map((r) => r.salonId));

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500 leading-relaxed">
        フクエスリンク（駅ちかからの反映）は、ここで駅ちかのお店のページを登録した店舗だけ動きます。
        登録すると取り込みの設定（出勤・プロフィール・新しく入った子の作成・15分ごと）は自動で立ちます。
        即ヒメ（フクエスの「今すぐ」）は枠1だけ読むのが既定です（2枠の店で食い違わないように）。下の一覧でも枠ごとに切り替えられます。
        店舗様はそのあと、フクエスリンクのホームで「駅ちかから反映する」を押すだけです。
        ★ 掲載番号（URL 末尾・例 46440）は、駅ちか管理画面のログイン用の店舗ID（例 37168）とは別の番号です。
      </p>

      {/* ── 登録 ── */}
      <div className="grid gap-3 md:grid-cols-[1.4fr_auto_1.8fr_1fr_auto] items-end border border-gray-200 rounded-xl p-4 bg-gray-50">
        <label className="block">
          <span className="text-[11px] font-bold text-gray-500">店舗</span>
          <select
            value={salonId}
            onChange={(e) => setSalonId(e.target.value === '' ? '' : Number(e.target.value))}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value="">選んでください</option>
            {allSalons.map((s) => (
              <option key={s.id} value={s.id}>{s.name}{registered.has(s.id) ? '（登録済み・上書き）' : ''}</option>
            ))}
          </select>
        </label>
        {/* ★ 第707便: 掲載枠が2つ以上ある店は、枠ごとに登録する（一覧では「（枠2）」と付いて別の行） */}
        <label className="block">
          <span className="text-[11px] font-bold text-gray-500">枠</span>
          <select
            value={slot}
            onChange={(e) => pickSlot(Number(e.target.value) as 1 | 2 | 3)}
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          >
            <option value={1}>枠1</option>
            <option value={2}>枠2</option>
            <option value={3}>枠3</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-gray-500">駅ちかのお店のページの URL（貼り付け）</span>
          <input
            value={shopUrl}
            onChange={(e) => void onShopUrl(e.target.value)}
            placeholder="https://ranking-deli.jp/fukuoka/area175/style8/46440/"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-gray-500">掲載番号（URL 末尾の数字・自動で入ります）</span>
          <input
            value={externalId}
            onChange={(e) => { setIdTouched(true); setExternalId(e.target.value); }}
            inputMode="numeric"
            placeholder="例: 46440"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </label>
        <button
          type="button"
          onClick={() => void onSave()}
          disabled={saving || salonId === '' || !externalId || !shopUrl}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90"
        >
          {saving ? '登録中…' : '登録する'}
        </button>
        {/* ★ 第1261便: 即ヒメを読むか（枠1だけが既定で ON） */}
        <label className="md:col-span-5 flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
          <input type="checkbox" checked={imasugu} onChange={(e) => setImasugu(e.target.checked)} className="h-4 w-4 accent-pink-500" />
          <span>
            <b className="text-gray-800">この枠の即ヒメを読む</b>（フクエスの「今すぐ」に反映）。
            2枠以上ある店は、ふつう枠1だけにします（両方で読むと、枠2の内容で枠1の今すぐが外れます）。
          </span>
        </label>
      </div>

      {/* ── 一覧 ── */}
      {loading ? (
        <p className="text-xs text-gray-400">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-xs text-gray-400">まだ登録がありません。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-200">
                <th className="py-2 pr-3">店舗</th>
                <th className="py-2 pr-3">掲載番号</th>
                <th className="py-2 pr-3">URL</th>
                <th className="py-2 pr-3">向き</th>
                <th className="py-2 pr-3">即ヒメ</th>
                <th className="py-2 pr-3">最終取り込み</th>
                <th className="py-2 pr-3">状態</th>
                <th className="py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3 font-bold text-gray-800">{r.salonName}{r.slot > 1 ? `（枠${r.slot}）` : ''}</td>
                  <td className="py-2 pr-3 tabular-nums">{r.externalId || <span className="text-rose-600 font-bold">未登録</span>}</td>
                  <td className="py-2 pr-3 max-w-[260px] truncate">
                    {r.shopUrl ? <a href={r.shopUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">{r.shopUrl}</a> : '—'}
                  </td>
                  <td className="py-2 pr-3">{r.linkMode === 'read' ? '駅ちかから反映' : r.linkMode === 'none' ? '反映しない' : r.linkMode}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => void onToggleImasugu(r)}
                      disabled={busyImId === r.id}
                      title="押すと切り替わります"
                      className={`px-2 py-0.5 border rounded-lg font-bold disabled:opacity-50 ${r.importImasugu ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-gray-300 bg-white text-gray-400'}`}
                    >
                      {busyImId === r.id ? '…' : r.importImasugu ? '読む' : '読まない'}
                    </button>
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{fmt(r.lastRunAt)}</td>
                  <td className="py-2 pr-3">
                    {!r.isEnabled ? <span className="text-gray-400 font-bold">停止中</span>
                      : r.lastStatus === 'error' ? <span className="text-rose-600 font-bold" title={r.lastError ?? ''}>エラー</span>
                      : r.lastStatus === 'ok' ? <span className="text-emerald-600 font-bold">OK</span>
                      : '—'}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => void onToggle(r)}
                      disabled={busyId === r.id}
                      className="px-3 py-1 border border-gray-300 rounded-lg bg-white font-bold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
                    >
                      {busyId === r.id ? '…' : r.isEnabled ? '停止' : '再開'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
