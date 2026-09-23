'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  adminListImportSources, adminUpsertImportSource, adminSetImportSourceEnabled, buildEkichikaShopUrl,
  type ImportSourceRow,
} from '@/app/actions/importSourceAdmin';

// /admin「フクエスリンク：駅ちかの店舗ページ登録」（第704便・2026-09-23・カッキーさん）。
//   ★ 上: 店舗を選ぶ → 駅ちかの店舗番号を入れる → URL は番号から自動で入る（手で直せる）→ 登録する
//   ★ 下: 登録済みの一覧（店舗名・番号・URL・最終取り込み・状態）。行ごとに 停止／再開 だけ（削除は付けない）
//   ★ 読み書きは server action（service_role）。★ 旗は server action 側で全部立てる。

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
  const [externalId, setExternalId] = useState('');
  const [shopUrl, setShopUrl] = useState('');
  const [urlTouched, setUrlTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const res = await adminListImportSources();
    if (res.ok) setRows(res.rows); else onToast(res.error);
    setLoading(false);
  }, [onToast]);
  useEffect(() => { void load(); }, [load]);

  // ★ 番号を入れたら URL を組み立てる（★ 手で直したあとは触らない）
  const onExternalId = async (v: string) => {
    setExternalId(v);
    if (!urlTouched) setShopUrl(await buildEkichikaShopUrl(v));
  };

  const onSave = async () => {
    if (salonId === '') { onToast('店舗を選んでください'); return; }
    setSaving(true);
    const res = await adminUpsertImportSource({ salonId: Number(salonId), slot: 1, externalId, shopUrl });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast(res.created ? '登録しました。次の取り込み（15分以内）から動きます' : '上書きしました。次の取り込み（15分以内）から動きます');
    setExternalId(''); setShopUrl(''); setUrlTouched(false);
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

  const registered = new Set(rows.map((r) => r.salonId));

  return (
    <div className="space-y-5">
      <p className="text-xs text-gray-500 leading-relaxed">
        フクエスリンク（駅ちかからの反映）は、ここで駅ちかのお店のページを登録した店舗だけ動きます。
        登録すると取り込みの設定（出勤・プロフィール・即ヒメ・新しく入った子の作成・15分ごと）は自動で立ちます。
        店舗様はそのあと、フクエスリンクのホームで「駅ちかから反映する」を押すだけです。
      </p>

      {/* ── 登録 ── */}
      <div className="grid gap-3 md:grid-cols-[1.4fr_1fr_1.6fr_auto] items-end border border-gray-200 rounded-xl p-4 bg-gray-50">
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
        <label className="block">
          <span className="text-[11px] font-bold text-gray-500">駅ちかの店舗番号</span>
          <input
            value={externalId}
            onChange={(e) => void onExternalId(e.target.value)}
            inputMode="numeric"
            placeholder="例: 37168"
            className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white"
          />
        </label>
        <label className="block">
          <span className="text-[11px] font-bold text-gray-500">お店のページの URL（番号から自動・直せます）</span>
          <input
            value={shopUrl}
            onChange={(e) => { setUrlTouched(true); setShopUrl(e.target.value); }}
            placeholder="https://ranking-deli.jp/37168/"
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
                <th className="py-2 pr-3">店舗番号</th>
                <th className="py-2 pr-3">URL</th>
                <th className="py-2 pr-3">向き</th>
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
