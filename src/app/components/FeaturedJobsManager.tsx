'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateFeaturedJobs } from '@/app/actions/jobs';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

// 設定対象セットの切替タブ。key=null はトップ共通（featured_jobs.area IS NULL）、
// それ以外は AREA_ORDER キー（DB値・例 '博多・住吉'）＝そのエリア専用（area = key の行）。
// 全域センチネル(ALL_AREA)のみ求人エリアページ非対応のため除外。通常5エリア＋出張専門(DISPATCH_AREA)を含む。
// 表示名は areaLabel 経由だが、出張は areaLabel('出張')='出張' となるため「出張専門」を固定文字列で特別扱いする
//（/jobs/dispatch の表示名と揃える）。tab.key='出張' が featured_jobs.area='出張' としてそのまま流れる。
const AREA_TABS: { key: string | null; label: string }[] = [
  { key: null, label: 'トップ(共通)' },
  ...AREA_ORDER.filter((a) => a !== ALL_AREA).map((a) => ({
    key: a as string,
    label: a === DISPATCH_AREA ? '出張専門' : areaLabel(a),
  })),
];

// おすすめ求人（featured_jobs）設定。本体のピックアップサロン（FeaturedSalonsManager）と完全同方式：
// select追加／↑↓並べ替え（display_order 振り直し）／✕削除／行ごとのスライド画像アップロード。
// 書き込みは authenticated クライアント（RLS で admin UUID のみ許可）。成功時 revalidateFeaturedJobs()
// で /jobs トップの ISR を即時更新。
//
// 画像はサロン用と同じ featured-salon-images バケットを流用（ポリシーは bucket_id 一致のみで
// フォルダ制限なし）。求人分は "jobs/" プレフィックスで分離して保存する。
const MAX_FEATURED = 5;
const BUCKET = 'featured-salon-images';
const PREFIX = 'jobs/';

type FeaturedJobItem = {
  id:           string; // featured_jobs.id (uuid)
  jobId:        number; // salon_jobs.id
  jobTitle:     string;
  salonName:    string;
  displayOrder: number;
  imageUrl:     string | null;
};

type JobOption = {
  id:        number;
  title:     string;
  salonName: string;
};

// リレーション（salons）はオブジェクト／配列いずれの場合もあるため正規化する。
function pickSalonName(raw: unknown): string {
  const s = Array.isArray(raw) ? raw[0] : raw;
  return s && typeof (s as { name?: unknown }).name === 'string' ? (s as { name: string }).name : '';
}

export default function FeaturedJobsManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [items,           setItems]           = useState<FeaturedJobItem[]>([]);
  const [candidates,      setCandidates]      = useState<JobOption[]>([]);
  const [selectedJobId,   setSelectedJobId]   = useState<number | ''>('');
  // 設定対象セット。null=トップ共通（area IS NULL）／AREA_ORDER キー=そのエリア専用。既定はトップ共通。
  const [selectedArea,    setSelectedArea]    = useState<string | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [saving,          setSaving]          = useState(false);
  const [errorMsg,        setErrorMsg]        = useState('');

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const uploadTargetId = useRef<string | null>(null);

  const fetchFeatured = useCallback(async () => {
    setLoading(true);
    const sb = createClient();

    // 1) 選択セットの登録済み featured_jobs を取得。null=トップ共通（area IS NULL）／値=そのエリア（.eq）。
    const featuredSel = sb
      .from('featured_jobs')
      .select('id, job_id, display_order, image_url')
      .order('display_order', { ascending: true });
    const { data: featuredData, error } = await (selectedArea === null
      ? featuredSel.is('area', null)
      : featuredSel.eq('area', selectedArea));

    if (error) {
      setErrorMsg('featured_jobs テーブルがまだ作成されていない可能性があります。SQLマイグレーションを確認してください。');
      setLoading(false);
      return;
    }

    const rows = featuredData ?? [];

    // 2) 登録済み求人の表示情報（サロン名｜求人タイトル）を解決。
    let jobMap: Record<number, { title: string; salonName: string }> = {};
    const jobIds = [...new Set(rows.map(r => r.job_id as number))];
    if (jobIds.length > 0) {
      const { data: jobData } = await sb
        .from('salon_jobs')
        .select('id, title, salons(name)')
        .in('id', jobIds);
      jobMap = Object.fromEntries(
        (jobData ?? []).map(j => [
          j.id as number,
          { title: (j.title as string) ?? '', salonName: pickSalonName(j.salons) },
        ])
      );
    }

    // 3) 追加候補：公開中(is_active)かつサロン非hidden の求人のみ。
    const { data: candData } = await sb
      .from('salon_jobs')
      .select('id, title, salon_id, salons!inner(name, is_hidden)')
      .eq('is_active', true)
      .eq('salons.is_hidden', false)
      .order('published_at', { ascending: false });

    setCandidates(
      (candData ?? []).map(j => ({
        id:        j.id as number,
        title:     (j.title as string) ?? '',
        salonName: pickSalonName(j.salons),
      }))
    );

    setErrorMsg('');
    setItems(rows.map(row => ({
      id:           row.id as string,
      jobId:        row.job_id as number,
      jobTitle:     jobMap[row.job_id as number]?.title ?? '(削除済みの求人)',
      salonName:    jobMap[row.job_id as number]?.salonName ?? '',
      displayOrder: row.display_order as number,
      imageUrl:     (row.image_url as string | null) ?? null,
    })));
    setLoading(false);
  }, [selectedArea]);

  useEffect(() => { fetchFeatured(); }, [fetchFeatured]);

  const handleAdd = async () => {
    if (selectedJobId === '' || items.length >= MAX_FEATURED) return;
    const nextOrder = items.length + 1;
    setSaving(true);
    // トップ共通は area を送らない＝NULL、エリア選択時は area=選択キー（DB値）を付与。
    // display_order は選択セット内の件数+1で採番（セット内で完結）。
    // 同一セット内 job_id 重複は一意インデックス (COALESCE(area,''), job_id) がDB層で弾く（下の error で toast）。
    const payload: { job_id: number; display_order: number; area?: string } = {
      job_id:        Number(selectedJobId),
      display_order: nextOrder,
    };
    if (selectedArea !== null) payload.area = selectedArea;
    const { error } = await supabase.from('featured_jobs').insert(payload);
    setSaving(false);
    if (error) { onToast(`追加に失敗しました: ${error.message}`); return; }
    setSelectedJobId('');
    await revalidateFeaturedJobs();
    await fetchFeatured();
  };

  const handleDelete = async (id: string) => {
    setSaving(true);
    const { error } = await supabase.from('featured_jobs').delete().eq('id', id);
    if (error) { setSaving(false); onToast(`削除に失敗しました: ${error.message}`); return; }
    // 行削除時に紐づく画像ファイルもstorageから掃除（残置ファイル対策）。DB削除成功後に実施。
    const removed = items.find(i => i.id === id);
    if (removed?.imageUrl) {
      const oldPath = removed.imageUrl.split(`/${BUCKET}/`)[1];
      if (oldPath) {
        const { error: removeError } = await supabase.storage.from(BUCKET).remove([oldPath]);
        if (removeError) console.error('[FeaturedJobs] 行削除に伴う画像の削除に失敗:', oldPath, removeError);
      }
    }
    setSaving(false);
    await revalidateFeaturedJobs();
    await fetchFeatured();
  };

  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1;
    if (swapIdx < 0 || swapIdx >= items.length) return;

    const reordered = [...items];
    [reordered[index], reordered[swapIdx]] = [reordered[swapIdx], reordered[index]];

    setSaving(true);
    await Promise.all(
      reordered.map((item, i) =>
        supabase.from('featured_jobs').update({ display_order: i + 1 }).eq('id', item.id)
      )
    );
    setSaving(false);
    setItems(reordered.map((item, i) => ({ ...item, displayOrder: i + 1 })));
    await revalidateFeaturedJobs();
  };

  const triggerImageUpload = (itemId: string) => {
    uploadTargetId.current = itemId;
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const itemId = uploadTargetId.current;
    if (!file || !itemId) return;

    const item = items.find(i => i.id === itemId);
    if (!item) return;

    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    // パスは timestamp でユニーク化（job-hero-images と同方式 {識別子}/{timestamp}.{ext}）。
    // 固定名＋upsertだと差し替えても public URL が不変でCDN/ブラウザが旧画像をキャッシュし続ける
    // （＝「変更しても前回の画像」バグ）。毎回URLが変わるようにして確実に反映させる。
    const path = `${PREFIX}${itemId}/${Date.now()}.${ext}`;

    setSaving(true);

    // 差し替え前の旧ファイルパスを控えておく（新規アップロード成功後に掃除する）。
    const oldPath = item.imageUrl ? item.imageUrl.split(`/${BUCKET}/`)[1] : null;

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });

    if (uploadError) {
      onToast(`画像のアップロードに失敗しました: ${uploadError.message}`);
      e.target.value = '';
      uploadTargetId.current = null;
      setSaving(false);
      return;
    }

    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: updateError } = await supabase
      .from('featured_jobs')
      .update({ image_url: publicUrl })
      .eq('id', itemId);

    if (updateError) {
      onToast(`画像URLの保存に失敗しました: ${updateError.message}`);
    } else if (oldPath && oldPath !== path) {
      // DB更新が成功してから旧ファイルを削除（失敗時に画像を失わない順序）。
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (removeError) console.error('[FeaturedJobs] 旧画像の削除に失敗:', oldPath, removeError);
    }

    e.target.value = '';
    uploadTargetId.current = null;
    setSaving(false);
    if (!updateError) await revalidateFeaturedJobs();
    await fetchFeatured();
  };

  const handleDeleteImage = async (item: FeaturedJobItem) => {
    if (!item.imageUrl) return;
    setSaving(true);
    const storagePath = item.imageUrl.split(`/${BUCKET}/`)[1];
    if (storagePath) {
      const { error: removeError } = await supabase.storage.from(BUCKET).remove([storagePath]);
      if (removeError) console.error('[FeaturedJobs] 画像の削除に失敗:', storagePath, removeError);
    }
    await supabase.from('featured_jobs').update({ image_url: null }).eq('id', item.id);
    setSaving(false);
    await revalidateFeaturedJobs();
    await fetchFeatured();
  };

  const featuredIds    = new Set(items.map(i => i.jobId));
  const availableJobs  = candidates.filter(j => !featuredIds.has(j.id));

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      {/* タイトルはアコーディオン見出しへ集約。ここは補足（推奨サイズ）と件数のみ。 */}
      <div className="flex items-center justify-between mb-5">
        <span className="text-[10px] text-slate-400">推奨画像サイズ: 横1440px × 縦540px</span>
        <span className="text-xs text-slate-400">{items.length} / {MAX_FEATURED}件</span>
      </div>

      {/* 設定対象セットの切替タブ：トップ(共通)＋通常5エリア。選択セット内で一覧・並び順・追加が完結する。
          切替時は選択中の求人セレクトもリセット。保存処理中は誤操作防止のため無効化。 */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {AREA_TABS.map((tab) => {
          const active = selectedArea === tab.key;
          return (
            <button
              key={tab.label}
              type="button"
              onClick={() => { if (active) return; setSelectedArea(tab.key); setSelectedJobId(''); }}
              disabled={saving}
              className="px-3 py-1.5 rounded-full text-xs font-bold shadow-sm border transition-colors disabled:opacity-40"
              style={
                active
                  ? { background: 'linear-gradient(95deg,#10B981,#84CC16)', color: '#ffffff', borderColor: 'transparent' }
                  : { borderColor: '#A7F3D0', color: '#059669', background: '#ffffff' }
              }
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-400 mb-4">
        {selectedArea === null
          ? 'フクエスワークのトップ（/jobs）に表示されるおすすめ求人スライダーです。並び順は下の↑↓で調整できます。'
          : selectedArea === DISPATCH_AREA
            ? '出張専門ページ（/jobs/dispatch）に表示されるおすすめ求人です。並び順は下の↑↓で調整できます。'
            : `「${areaLabel(selectedArea)}」のエリアページ（/jobs/area）に表示されるおすすめ求人です。並び順は下の↑↓で調整できます。`}
      </p>

      {/* hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={handleFileChange}
      />

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">
          ⚠ {errorMsg}
        </div>
      ) : (
        <>
          {/* 登録済み一覧 */}
          {items.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 rounded-2xl mb-4">
              おすすめ求人が未設定です
            </div>
          ) : (
            <div className="space-y-2 mb-4">
              {items.map((item, i) => (
                <div
                  key={item.id}
                  className="bg-emerald-50/40 rounded-2xl px-4 py-3 border border-emerald-100/70"
                >
                  {/* 上段: 番号・名前・操作ボタン */}
                  <div className="flex items-center gap-3">
                    <span className="text-xs font-black w-4 flex-shrink-0" style={{ color: '#34D399' }}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-800 truncate">{item.salonName}｜{item.jobTitle}</p>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        onClick={() => handleMove(i, 'up')}
                        disabled={i === 0 || saving}
                        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-30 transition-colors"
                      >↑</button>
                      <button
                        onClick={() => handleMove(i, 'down')}
                        disabled={i === items.length - 1 || saving}
                        className="w-7 h-7 rounded-lg border border-slate-200 text-slate-400 text-xs flex items-center justify-center hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-30 transition-colors"
                      >↓</button>
                      <button
                        onClick={() => handleDelete(item.id)}
                        disabled={saving}
                        className="w-7 h-7 rounded-lg border border-rose-100 text-rose-400 text-xs flex items-center justify-center hover:bg-rose-50 disabled:opacity-30 transition-colors"
                      >✕</button>
                    </div>
                  </div>

                  {/* 下段: 画像設定（未設定ならサロンのメイン画像が使われる旨を明示） */}
                  <div className="mt-2 pl-7 flex items-center gap-2">
                    {item.imageUrl ? (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.imageUrl}
                          alt="スライダー画像"
                          className="w-16 h-10 object-cover rounded-lg border border-emerald-100"
                        />
                        <button
                          onClick={() => triggerImageUpload(item.id)}
                          disabled={saving}
                          className="text-[10px] font-semibold border border-emerald-200 rounded-lg px-2.5 py-1 hover:bg-emerald-50 disabled:opacity-40 transition-colors"
                          style={{ color: '#059669' }}
                        >
                          変更
                        </button>
                        <button
                          onClick={() => handleDeleteImage(item)}
                          disabled={saving}
                          className="text-[10px] text-rose-400 font-semibold border border-rose-100 rounded-lg px-2.5 py-1 hover:bg-rose-50 disabled:opacity-40 transition-colors"
                        >
                          画像を削除
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => triggerImageUpload(item.id)}
                        disabled={saving}
                        className="text-[10px] text-slate-500 font-semibold border border-dashed border-slate-300 rounded-lg px-3 py-1.5 hover:border-emerald-300 hover:text-emerald-500 disabled:opacity-40 transition-colors"
                      >
                        📷 画像をアップロード（未設定時はサロンのメイン画像）
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 追加フォーム */}
          {items.length < MAX_FEATURED ? (
            <div className="flex gap-2">
              <select
                value={selectedJobId}
                onChange={e => setSelectedJobId(e.target.value ? Number(e.target.value) : '')}
                className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-200"
              >
                <option value="">求人を選択...</option>
                {availableJobs.map(j => (
                  <option key={j.id} value={j.id}>{j.salonName}｜{j.title}</option>
                ))}
              </select>
              <button
                onClick={handleAdd}
                disabled={selectedJobId === '' || saving}
                className="flex-shrink-0 px-4 py-2 rounded-xl text-white font-bold text-xs shadow-sm disabled:opacity-40 hover:opacity-90 transition-opacity"
                style={{ background: 'linear-gradient(95deg,#10B981,#84CC16)' }}
              >
                {saving ? '...' : '追加'}
              </button>
            </div>
          ) : (
            <p className="text-xs text-slate-400 text-center py-2 border border-dashed border-slate-200 rounded-xl">
              最大{MAX_FEATURED}件まで登録可能です。削除してから追加してください。
            </p>
          )}
        </>
      )}
    </div>
  );
}
