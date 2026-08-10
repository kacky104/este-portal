'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  listHpSites,
  listSalonsWithoutSite,
  createHpSite,
  updateHpSiteOperator,
  revalidateHpSitePages,
  deleteHpSite,
  type OperatorSite,
  type OperatorSitePatch,
} from '@/app/actions/hpOperator';
import { HP_TEMPLATES } from '@/app/lib/hpSite';

// /admin「公式HP管理」セクション（2026-08-09 段階4・運営専用）。
//
// - 契約サイト一覧（状態・ドメイン・期限・HP管理者・デザインまで一望）
// - 新規発行（salon 選択＋slug 入力。予約語・形式はサーバー側で検証）
// - 行の編集: slug / ドメイン / 公開状態(suspended含む) / デザインロック解除 /
//   レジストラ / ドメイン期限 / 契約メモ
// - 解約（行の削除・二重確認）
//
// ドメインを設定したら Vercel 側のドメイン追加（Settings → Domains）も忘れないこと。
// ここに書いてもDNSは繋がらない（アプリ側の紐付けだけ）。

const STATUS_LABEL: Record<string, string> = {
  draft: '非公開', live: '公開中', suspended: '停止中',
};
const STATUS_CLS: Record<string, string> = {
  draft:     'bg-slate-50 text-slate-500 border-slate-200',
  live:      'bg-emerald-50 text-emerald-600 border-emerald-200',
  suspended: 'bg-rose-50 text-rose-500 border-rose-200',
};

/** ドメイン期限の残日数（null=未設定）。 */
function daysUntil(ymd: string | null): number | null {
  if (!ymd) return null;
  const target = new Date(`${ymd}T00:00:00+09:00`).getTime();
  return Math.floor((target - Date.now()) / 86400000);
}

function siteToPatch(s: OperatorSite): OperatorSitePatch {
  return {
    slug:            s.slug,
    domain:          s.domain ?? '',
    status:          s.status,
    designLocked:    s.designLocked,
    domainRegistrar: s.domainRegistrar,
    domainExpiresAt: s.domainExpiresAt ?? '',
    contractNote:    s.contractNote,
  };
}

export function HpSitesManager({ onToast }: { onToast: (msg: string) => void }) {
  const [sites, setSites] = useState<OperatorSite[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);

  // 新規発行
  const [candidates, setCandidates] = useState<{ id: number; name: string; hidden: boolean }[]>([]);
  const [newSalonId, setNewSalonId] = useState('');
  const [newSlug, setNewSlug] = useState('');

  // 編集中の行（salonId → patch）
  const [editingId, setEditingId] = useState<number | null>(null);
  const [patch, setPatch] = useState<OperatorSitePatch | null>(null);

  const load = useCallback(async () => {
    const [sitesRes, candRes] = await Promise.all([listHpSites(), listSalonsWithoutSite()]);
    if (!sitesRes.ok) { setLoadError(sitesRes.error); return; }
    setSites(sitesRes.sites);
    setLoadError('');
    if (candRes.ok) setCandidates(candRes.salons);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    const salonId = Number(newSalonId);
    if (!salonId || !newSlug.trim()) { onToast('店舗と slug を入力してください'); return; }
    setBusy(true);
    const res = await createHpSite({ salonId, slug: newSlug.trim() });
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast('公式HPを発行しました');
    setNewSalonId('');
    setNewSlug('');
    load();
  };

  const handleSave = async (salonId: number) => {
    if (!patch) return;
    setBusy(true);
    const res = await updateHpSiteOperator(salonId, patch);
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast('保存しました');
    setEditingId(null);
    setPatch(null);
    load();
  };

  const handleRevalidate = async (salonId: number) => {
    setBusy(true);
    const res = await revalidateHpSitePages(salonId);
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast(`公開ページのキャッシュを更新しました（${res.paths.join(' / ')}）`);
  };

  const handleDelete = async (s: OperatorSite) => {
    if (!window.confirm(`「${s.salonName}」の公式HP（/hp/${s.slug}）を解約（削除）します。よろしいですか？`)) return;
    if (!window.confirm('この操作は取り消せません。本当に削除しますか？（写真・文章の設定も消えます）')) return;
    setBusy(true);
    const res = await deleteHpSite(s.salonId);
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast('削除しました');
    load();
  };

  if (loadError) return <p className="text-xs text-rose-500">{loadError}</p>;
  if (!sites) return <p className="text-xs text-slate-400">読み込み中です…</p>;

  const inputCls = 'w-full rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 focus:outline-none focus:border-pink-300';

  return (
    <div className="space-y-4">
      {/* ── 新規発行 ── */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h4 className="text-xs font-black text-slate-700">新規発行（契約成立時）</h4>
        <div className="flex flex-col sm:flex-row gap-2">
          <select
            value={newSalonId}
            onChange={(e) => setNewSalonId(e.target.value)}
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-700"
          >
            <option value="">店舗を選択…</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.hidden ? '（非表示）' : ''}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value)}
            placeholder="slug（例: aroma-grace）"
            className="flex-1 rounded-lg border border-slate-200 px-2.5 py-2 text-xs text-slate-700"
          />
          <button
            onClick={handleCreate}
            disabled={busy}
            className="px-5 py-2 rounded-full bg-pink-500 text-white text-xs font-black hover:bg-pink-600 disabled:opacity-50"
          >
            発行する
          </button>
        </div>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          発行すると fukues.com/hp/【slug】 と 店舗ドメイン/admin（発行後はまず fukues.com/hp/【slug】/admin）が有効になります。
          slug は半角英小文字・数字・ハイフン。デザインは打ち合わせ後、運営がその店の /admin で設定・確定してください。
        </p>
      </div>

      {/* ── 一覧 ── */}
      {sites.length === 0 ? (
        <p className="text-xs text-slate-400">契約サイトはまだありません。</p>
      ) : (
        <div className="space-y-2">
          {sites.map((s) => {
            const days = daysUntil(s.domainExpiresAt);
            const isEditing = editingId === s.salonId;
            const templateLabel = HP_TEMPLATES.find((t) => t.key === s.templateKey)?.label ?? s.templateKey;
            return (
              <div key={s.salonId} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
                {/* サマリー行 */}
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-black text-slate-800">{s.salonName}</span>
                  {s.isDemo && (
                    <span className="inline-flex px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-[10px] font-bold text-amber-600">サンプル</span>
                  )}
                  <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${STATUS_CLS[s.status] ?? STATUS_CLS.draft}`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                  <span className="inline-flex px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-500">
                    {templateLabel}/{s.themeKey}{s.designLocked ? '・確定済' : '・未確定'}
                  </span>
                  {s.domain ? (
                    <span className="text-[11px] font-bold text-slate-600">{s.domain}</span>
                  ) : (
                    <span className="text-[11px] text-slate-400">/hp/{s.slug}</span>
                  )}
                  {days !== null && (
                    <span className={`inline-flex px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                      days < 0 ? 'bg-rose-50 text-rose-600 border-rose-200'
                      : days <= 60 ? 'bg-amber-50 text-amber-600 border-amber-200'
                      : 'bg-slate-50 text-slate-500 border-slate-200'
                    }`}>
                      {days < 0 ? `期限切れ ${-days}日` : `期限まで ${days}日`}
                    </span>
                  )}
                  {s.adminEmail && (
                    <span className="text-[10px] text-slate-400">
                      担当者: {s.adminEmail}{s.adminLinked ? '（ログイン済）' : '（招待中）'}
                    </span>
                  )}
                  <span className="ml-auto flex gap-2">
                    <a href={`/hp/${s.slug}`} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-slate-400 hover:text-slate-600 underline">公開ページ</a>
                    <a href={`/hp/${s.slug}/admin`} target="_blank" rel="noreferrer" className="text-[11px] font-bold text-slate-400 hover:text-slate-600 underline">管理画面</a>
                    <button
                      onClick={() => {
                        if (isEditing) { setEditingId(null); setPatch(null); }
                        else { setEditingId(s.salonId); setPatch(siteToPatch(s)); }
                      }}
                      className="text-[11px] font-bold text-pink-600 hover:text-pink-700 underline"
                    >
                      {isEditing ? '閉じる' : '編集'}
                    </button>
                  </span>
                </div>

                {/* 編集パネル */}
                {isEditing && patch && (
                  <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">slug（暫定URL fukues.com/hp/◯◯）</span>
                      <input type="text" value={patch.slug} onChange={(e) => setPatch({ ...patch, slug: e.target.value })} className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">独自ドメイン（www不要・空欄=未接続）</span>
                      <input type="text" value={patch.domain} onChange={(e) => setPatch({ ...patch, domain: e.target.value })} placeholder="example-shop.com" className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">公開状態（停止=店舗側から解除不可）</span>
                      <select value={patch.status} onChange={(e) => setPatch({ ...patch, status: e.target.value })} className={inputCls}>
                        <option value="draft">非公開（制作中）</option>
                        <option value="live">公開中</option>
                        <option value="suspended">停止中（運営）</option>
                      </select>
                    </label>
                    <label className="flex items-end gap-2 pb-1">
                      <input
                        type="checkbox"
                        checked={patch.designLocked}
                        onChange={(e) => setPatch({ ...patch, designLocked: e.target.checked })}
                        className="w-4 h-4 accent-pink-500"
                      />
                      <span className="text-[11px] font-bold text-slate-600">
                        デザイン確定ロック
                        <span className="block text-[10px] font-normal text-slate-400">外すとギャラリーから再選択できる状態に戻る（有償作業時）</span>
                      </span>
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">レジストラ（運営メモ）</span>
                      <input type="text" value={patch.domainRegistrar} onChange={(e) => setPatch({ ...patch, domainRegistrar: e.target.value })} placeholder="例: お名前.com" className={inputCls} />
                    </label>
                    <label className="block">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">ドメイン更新期限</span>
                      <input type="date" value={patch.domainExpiresAt} onChange={(e) => setPatch({ ...patch, domainExpiresAt: e.target.value })} className={inputCls} />
                    </label>
                    <label className="block sm:col-span-2">
                      <span className="text-[10px] font-bold text-slate-400 block mb-1">契約メモ（運営専用・店舗には見えない）</span>
                      <textarea value={patch.contractNote} onChange={(e) => setPatch({ ...patch, contractNote: e.target.value })} rows={2} className={inputCls} />
                    </label>
                    <div className="sm:col-span-2 flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => handleSave(s.salonId)}
                        disabled={busy}
                        className="px-5 py-2 rounded-full bg-pink-500 text-white text-xs font-black hover:bg-pink-600 disabled:opacity-50"
                      >
                        {busy ? '保存中…' : '保存する'}
                      </button>
                      <button
                        onClick={() => handleDelete(s)}
                        disabled={busy}
                        className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-400 hover:border-rose-200 hover:text-rose-500 disabled:opacity-50"
                      >
                        解約（削除）
                      </button>
                      <span className="text-[10px] text-slate-400">
                        ※ ドメインを設定したら Vercel の Settings → Domains にも追加してください（DNSの紐付けはアプリ側ではできません）
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
