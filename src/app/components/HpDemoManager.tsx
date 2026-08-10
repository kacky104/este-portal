'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import {
  getHpDemoState,
  createHpDemo,
  reseedHpDemoSchedules,
  syncHpDemoTherapists,
  setHpDemoTherapistImage,
  type DemoState,
} from '@/app/actions/hpDemo';

// /admin「公式HP サンプル店舗（デモ）」セクション（2026-08-09・運営専用）。
//
// デザイン一覧（/hp/templates）の「デモ →」が見せるサンプル店舗をここで完結管理する:
//  1. ワンクリックで一式生成（サロン・salon_sites・セラピスト5名・出勤14日分）
//  2. セラピスト写真の差し替え（AI生成画像などをアップ）
//  3. 出勤の再生成（日が経って切れたとき）
//  4. 内容の編集は既存の /hp/demo/admin（運営はそのまま入れる）へ誘導
//
// ヒーロー画像は未設定のままでよい（タイプSは既定KVにフォールバックする）。

const supabase = createClient();

export function HpDemoManager({ onToast }: { onToast: (msg: string) => void }) {
  const [state, setState] = useState<DemoState | null>(null);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadingId, setUploadingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await getHpDemoState();
    if (res.ok) { setState(res.state); setLoadError(''); }
    else setLoadError(res.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async () => {
    setBusy(true);
    const res = await createHpDemo();
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast('サンプル店舗を作成しました');
    load();
  };

  const handleSyncTherapists = async () => {
    setBusy(true);
    const res = await syncHpDemoTherapists();
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast(res.added > 0 ? `${res.added}名を追加しました（在籍${res.total}名）` : '追加はありません（名簿と一致しています）');
    load();
  };

  const handleReseed = async () => {
    setBusy(true);
    const res = await reseedHpDemoSchedules();
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast('出勤スケジュールを14日分作り直しました');
    load();
  };

  const uploadTherapistImage = async (therapistId: string, file: File) => {
    if (file.size > 5 * 1024 * 1024) { onToast('5MB以下の画像を選択してください'); return; }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { onToast('JPEG・PNG・WebPのみ対応しています'); return; }
    setUploadingId(therapistId);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `hp_demo/th_${therapistId}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('salon-images')
      .upload(path, file, { upsert: false, cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) {
      setUploadingId(null);
      onToast(`アップロードに失敗しました: ${upErr.message}`);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from('salon-images').getPublicUrl(path);
    const res = await setHpDemoTherapistImage(therapistId, publicUrl);
    setUploadingId(null);
    if (!res.ok) { onToast(res.error); return; }
    onToast('写真を設定しました');
    load();
  };

  if (loadError) {
    return <p className="text-xs text-rose-500">{loadError}</p>;
  }
  if (!state) {
    return <p className="text-xs text-slate-400">読み込み中です…</p>;
  }

  if (!state.exists) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-3">
        <p className="text-xs text-slate-500 leading-relaxed">
          デザイン一覧（<a href="/hp/templates" target="_blank" rel="noreferrer" className="text-pink-600 underline">/hp/templates</a>）の
          「デモ →」が参照するサンプル店舗を作成します。
          サロン（非表示）・公式HP設定（タイプS）・セラピスト5名・出勤14日分がワンクリックで入ります。
          作成後、セラピストの写真をこの画面から差し替えてください。
        </p>
        <button
          onClick={handleCreate}
          disabled={busy}
          className="px-5 py-2.5 rounded-full bg-pink-500 text-white text-xs font-black hover:bg-pink-600 disabled:opacity-50"
        >
          {busy ? '作成中…' : 'サンプル店舗を一式作成する'}
        </button>
        <p className="text-[11px] text-slate-400">
          ※ 本体の店舗一覧・トップには一切表示されません（非表示・トップ非掲載で作成されます）。
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 space-y-5">
      {/* ── 状態と入口リンク ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-bold text-slate-700">{state.salonName}</span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-500">
          salon_id: {state.salonId}
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-500">
          在籍 {state.therapists.length}名
        </span>
        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[10px] font-bold text-slate-500">
          出勤 {state.scheduledDays}日分
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <a
          href="/hp/demo/preview/s/gold"
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 rounded-full bg-pink-500 text-white text-xs font-bold hover:bg-pink-600"
        >
          デモを見る（タイプS gold）
        </a>
        <a
          href="/hp/demo/admin"
          target="_blank"
          rel="noreferrer"
          className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:border-slate-300"
        >
          内容を編集（キャッチ・コンセプト・画像）
        </a>
        <button
          onClick={handleSyncTherapists}
          disabled={busy}
          className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:border-slate-300 disabled:opacity-50"
        >
          {busy ? '処理中…' : 'セラピストを補充する（名簿8名）'}
        </button>
        <button
          onClick={handleReseed}
          disabled={busy}
          className="px-4 py-2 rounded-full border border-slate-200 text-xs font-bold text-slate-500 hover:border-slate-300 disabled:opacity-50"
        >
          {busy ? '処理中…' : '出勤を14日分作り直す'}
        </button>
      </div>
      <p className="text-[11px] text-slate-400 leading-relaxed">
        ※ デモの入口はデザイン一覧の「デモ →」（/hp/demo/preview/ひな形/色）。ひな形・色はURLで自由に切り替わるため、
        ここでの設定（タイプS gold）は「/hp/demo を直接開いたときの既定」でしかありません。
        ヒーロー画像は未設定のままでOK（タイプSは既定のキービジュアルが表示されます）。
      </p>

      {/* ── セラピスト写真 ── */}
      <div>
        <p className="text-xs font-bold text-slate-600 mb-2">セラピスト写真（クリックでアップロード・顔なし推奨）</p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {state.therapists.map((t) => (
            <div key={t.id} className="space-y-1">
              <label className="block cursor-pointer group">
                {t.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={t.imageUrl}
                    alt={t.name}
                    className="w-full aspect-[4/5] object-cover rounded-xl border border-slate-200 group-hover:opacity-80"
                  />
                ) : (
                  <span className="flex items-center justify-center w-full aspect-[4/5] rounded-xl border-2 border-dashed border-slate-200 text-[11px] text-slate-400 group-hover:border-pink-300">
                    {uploadingId === t.id ? 'アップ中…' : '写真を選ぶ'}
                  </span>
                )}
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  disabled={uploadingId !== null}
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = '';
                    if (file) await uploadTherapistImage(t.id, file);
                  }}
                />
              </label>
              <p className="text-[11px] font-bold text-slate-600 text-center">
                {t.name}
                {t.age !== null && <span className="font-normal text-slate-400">（{t.age}）</span>}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
