'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTopAndAreas } from '@/app/lib/revalidateTop';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

// 「セラピストピックアップ枠」（therapist_pickup_banners）管理。authenticated クライアント直（RLSで admin UUID のみ許可）。
// 各枠は therapist_id 必須（DBの NOT NULL）。画像は therapist-pickup-banners バケットへ
// `{banner_id}/{timestamp}.{ext}` で保存（upsert不使用＝差し替えで必ず別URL）。
// 追加は「セラピスト選択→画像選択→新UUIDフォルダにアップロード→そのidで行を insert」の順で
// image_url(NOT NULL)・therapist_id(NOT NULL) を満たす。差し替え・削除では旧ファイルを Storage から掃除。
// 表示側は横長画像1枚のみ（タイトル・オーバーレイなし）。最大10枠は本UIで制御（DB制約にはしない）。
// TOP＋全エリアページに出るため、保存後は revalidateTopAndAreas（{top,areasAll}）で無効化する。
// 単一カラム更新は該当列のみ送る（他フィールドを undefined で上書きしない＝undefinedオーバーライドガード遵守）。
const BUCKET = 'therapist-pickup-banners';
const MAX_BANNERS = 10;

type TherapistOption = { id: number; name: string; salonName: string };

type Banner = {
  id: string;
  therapist_id: number;
  image_url: string;
  alt_text: string | null;
  display_order: number;
  is_active: boolean;
};

function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

export default function TherapistPickupBannerManager({
  allTherapists,
  onToast,
}: {
  allTherapists: TherapistOption[];
  onToast: (msg: string) => void;
}) {
  const supabase = createClient();
  const [items, setItems] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  // 追加フォームで選択中のセラピスト（画像選択→アップロード→insert に使う）。
  const [addTherapistId, setAddTherapistId] = useState<number | ''>('');
  // alt のローカル編集値（「保存」ボタンで確定）。
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});

  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const replaceTargetId = useRef<string | null>(null);

  const atLimit = items.length >= MAX_BANNERS;

  const therapistLabel = useCallback(
    (id: number) => {
      const t = allTherapists.find((x) => x.id === id);
      return t ? `${t.name}（${t.salonName}）` : `セラピストID: ${id}（取得不可・非表示の可能性）`;
    },
    [allTherapists],
  );

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('therapist_pickup_banners')
      .select('id, therapist_id, image_url, alt_text, display_order, is_active')
      .order('display_order', { ascending: true });
    if (error) {
      setErrorMsg('therapist_pickup_banners テーブルの読み込みに失敗しました。マイグレーションを確認してください。');
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Banner[];
    setErrorMsg('');
    setItems(list);
    setAltDrafts(Object.fromEntries(list.map((b) => [b.id, b.alt_text ?? ''])));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  // 新規追加：セラピスト選択済み → 画像を選ぶ → 新UUIDフォルダにアップロード → その id で行を insert。
  const triggerAdd = () => {
    if (atLimit) { onToast(`最大${MAX_BANNERS}枠です`); return; }
    if (addTherapistId === '') { onToast('先にセラピストを選択してください'); return; }
    addInputRef.current?.click();
  };
  const handleAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (atLimit) { onToast(`最大${MAX_BANNERS}枠です`); return; }
    if (addTherapistId === '') { onToast('先にセラピストを選択してください'); return; }
    const err = validateImageFile(file);
    if (err) { onToast(err); return; }
    setBusy(true);
    const id = crypto.randomUUID();
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) { onToast(`アップロードに失敗しました: ${upErr.message}`); setBusy(false); return; }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const nextOrder = items.reduce((m, b) => Math.max(m, b.display_order), 0) + 1;
    const { error: insErr } = await supabase
      .from('therapist_pickup_banners')
      .insert({ id, therapist_id: addTherapistId, image_url: publicUrl, display_order: nextOrder, is_active: true });
    if (insErr) {
      // 行作成に失敗したらアップロード済みファイルを掃除（孤児を残さない）。
      await supabase.storage.from(BUCKET).remove([path]);
      onToast(insErr.code === '42501'
        ? 'RLSにより追加が拒否されました。admin権限でログインしているか確認してください。'
        : `追加に失敗しました: ${insErr.message}`);
      setBusy(false);
      return;
    }
    setBusy(false);
    setAddTherapistId('');
    await revalidateTopAndAreas();
    await fetchList();
    onToast('セラピストピックアップ枠を追加しました');
  };

  // 画像差し替え：新ファイルをアップロード → DB更新成功後に旧ファイルを掃除。
  const triggerReplace = (id: string) => { replaceTargetId.current = id; replaceInputRef.current?.click(); };
  const handleReplace = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const id = replaceTargetId.current;
    e.target.value = '';
    replaceTargetId.current = null;
    if (!file || !id) return;
    const err = validateImageFile(file);
    if (err) { onToast(err); return; }
    const target = items.find((b) => b.id === id);
    if (!target) return;
    setBusy(true);
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const path = `${id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) { onToast(`アップロードに失敗しました: ${upErr.message}`); setBusy(false); return; }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: dbErr } = await supabase
      .from('therapist_pickup_banners')
      .update({ image_url: publicUrl, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (dbErr) { onToast(`保存に失敗しました: ${dbErr.message}`); setBusy(false); return; }
    // DB更新が成功してから旧ファイルを削除（失敗時に画像を失わない順序）。
    const oldPath = storagePathFromUrl(target.image_url);
    if (oldPath && oldPath !== path) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (rmErr) console.error('[TherapistPickupBanner] 旧画像の削除に失敗:', oldPath, rmErr);
    }
    setBusy(false);
    await revalidateTopAndAreas();
    await fetchList();
    onToast('画像を差し替えました');
  };

  // 紐づくセラピストの変更（単一カラム therapist_id のみ更新）。
  const handleChangeTherapist = async (id: string, therapistId: number) => {
    setBusy(true);
    const { error } = await supabase
      .from('therapist_pickup_banners')
      .update({ therapist_id: therapistId, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) { onToast(`変更に失敗しました: ${error.message}`); return; }
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, therapist_id: therapistId } : b)));
    await revalidateTopAndAreas();
    onToast('紐づけセラピストを変更しました');
  };

  // alt を保存（該当行のみ更新）。
  const handleSaveAlt = async (id: string) => {
    const alt = (altDrafts[id] ?? '').trim() || null;
    setBusy(true);
    const { error } = await supabase
      .from('therapist_pickup_banners')
      .update({ alt_text: alt, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) { onToast(`保存に失敗しました: ${error.message}`); return; }
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, alt_text: alt } : b)));
    await revalidateTopAndAreas();
    onToast('保存しました');
  };

  // 公開/非公開の切替。
  const handleToggleActive = async (id: string) => {
    const target = items.find((b) => b.id === id);
    if (!target) return;
    const next = !target.is_active;
    setBusy(true);
    const { error } = await supabase
      .from('therapist_pickup_banners')
      .update({ is_active: next, updated_at: new Date().toISOString() })
      .eq('id', id);
    setBusy(false);
    if (error) { onToast(`変更に失敗しました: ${error.message}`); return; }
    setItems((prev) => prev.map((b) => (b.id === id ? { ...b, is_active: next } : b)));
    await revalidateTopAndAreas();
    onToast(next ? '公開にしました' : '非公開にしました');
  };

  // 並び替え（↑↓）：隣の行と display_order を入れ替え。
  const handleMove = async (id: string, dir: 'up' | 'down') => {
    const idx = items.findIndex((b) => b.id === id);
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
    if (idx < 0 || swapIdx < 0 || swapIdx >= items.length) return;
    const a = items[idx];
    const b = items[swapIdx];
    setBusy(true);
    const [r1, r2] = await Promise.all([
      supabase.from('therapist_pickup_banners').update({ display_order: b.display_order, updated_at: new Date().toISOString() }).eq('id', a.id),
      supabase.from('therapist_pickup_banners').update({ display_order: a.display_order, updated_at: new Date().toISOString() }).eq('id', b.id),
    ]);
    setBusy(false);
    if (r1.error || r2.error) {
      onToast(`並び替えに失敗しました: ${(r1.error ?? r2.error)?.message}`);
      await fetchList();
      return;
    }
    await revalidateTopAndAreas();
    await fetchList();
  };

  // 削除：行削除 → Storage ファイル掃除。
  const handleDelete = async (id: string) => {
    if (!window.confirm('この枠を削除しますか？\nこの操作は取り消せません。')) return;
    const target = items.find((b) => b.id === id);
    setBusy(true);
    const { data: deleted, error } = await supabase.from('therapist_pickup_banners').delete().eq('id', id).select('id');
    setBusy(false);
    if (error) { onToast(`削除に失敗しました: ${error.message}`); return; }
    if (!deleted || deleted.length === 0) {
      onToast('削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    const oldPath = storagePathFromUrl(target?.image_url ?? null);
    if (oldPath) {
      const { error: rmErr } = await supabase.storage.from(BUCKET).remove([oldPath]);
      if (rmErr) console.error('[TherapistPickupBanner] 削除に伴う画像の削除に失敗:', oldPath, rmErr);
    }
    setItems((prev) => prev.filter((b) => b.id !== id));
    await revalidateTopAndAreas();
    onToast('枠を削除しました');
  };

  const selectClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          トップ＋全エリアページのサロン一覧（20枚目直下）に、横長バナー画像1枚を表示します（公開中からランダム1枚・リロードで入れ替わり）。クリックでセラピストページへ移動します。最大{MAX_BANNERS}枠。
        </p>
        <span className="text-[10px] text-slate-400 flex-shrink-0 ml-3">推奨サイズ: 横1240×縦480px（31:12・横長）</span>
      </div>

      {/* hidden file inputs（追加／差し替え） */}
      <input ref={addInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAdd} />
      <input ref={replaceInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleReplace} />

      {/* 追加フォーム：セラピスト選択（必須）→ 画像を選んで追加 */}
      <div className="flex gap-2 mb-2">
        <select
          value={addTherapistId}
          onChange={(e) => setAddTherapistId(e.target.value ? Number(e.target.value) : '')}
          className={`flex-1 min-w-0 ${selectClass}`}
          disabled={atLimit}
        >
          <option value="">セラピストを選択...</option>
          {allTherapists.map((t) => (
            <option key={t.id} value={t.id}>{t.name}（{t.salonName}）</option>
          ))}
        </select>
        <button
          type="button"
          onClick={triggerAdd}
          disabled={busy || atLimit || addTherapistId === ''}
          className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          ＋ 画像を選んで追加
        </button>
      </div>
      <p className="text-[10px] text-slate-400 mb-4">
        現在 {items.length} / {MAX_BANNERS} 枠{atLimit ? '（上限に達しています。追加するには既存の枠を削除してください）' : ''}
      </p>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          枠がありません。セラピストを選び「画像を選んで追加」から登録してください。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((b, i) => (
            <div key={b.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
              <div className="flex flex-wrap items-start gap-4">
                {/* プレビュー（31:12＝表示の横長比率に合わせる。object-cover は中央基準） */}
                <div className="flex-shrink-0">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={b.image_url}
                    alt={b.alt_text ?? ''}
                    className="w-48 aspect-[31/12] object-cover rounded-lg border border-slate-200 bg-slate-100"
                  />
                  <div className="flex gap-2 mt-1">
                    <button onClick={() => triggerReplace(b.id)} disabled={busy} className="text-[10px] font-semibold text-pink-600 hover:underline disabled:opacity-40">
                      画像を差し替え
                    </button>
                  </div>
                </div>

                {/* 設定フィールド */}
                <div className="flex-1 min-w-[220px] space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${b.is_active ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' : 'bg-slate-100 text-slate-400 border border-slate-200'}`}>
                      {b.is_active ? '公開中' : '非公開'}
                    </span>
                    <span className="text-[10px] text-slate-400">表示順 {b.display_order}</span>
                    <div className="flex items-center gap-1 ml-auto">
                      <button onClick={() => handleMove(b.id, 'up')} disabled={busy || i === 0} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-100 disabled:opacity-30" aria-label="上へ">↑</button>
                      <button onClick={() => handleMove(b.id, 'down')} disabled={busy || i === items.length - 1} className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 text-xs hover:bg-slate-100 disabled:opacity-30" aria-label="下へ">↓</button>
                    </div>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">紐づけセラピスト（クリックで詳細ページへ）</label>
                    <select
                      className={selectClass}
                      value={b.therapist_id}
                      onChange={(e) => handleChangeTherapist(b.id, Number(e.target.value))}
                      disabled={busy}
                    >
                      {/* 現在値が allTherapists に無い（非表示等）場合でも選択を保持できるよう、先頭に現在値を出す。 */}
                      {!allTherapists.some((t) => t.id === b.therapist_id) && (
                        <option value={b.therapist_id}>{therapistLabel(b.therapist_id)}</option>
                      )}
                      {allTherapists.map((t) => (
                        <option key={t.id} value={t.id}>{t.name}（{t.salonName}）</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-[10px] font-bold text-slate-400 block mb-0.5">alt（任意）</label>
                    <input
                      className={selectClass}
                      placeholder="画像の説明"
                      value={altDrafts[b.id] ?? ''}
                      onChange={(e) => setAltDrafts((prev) => ({ ...prev, [b.id]: e.target.value }))}
                    />
                  </div>

                  <div className="flex items-center gap-2 flex-wrap pt-1">
                    <button onClick={() => handleSaveAlt(b.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                      保存
                    </button>
                    <button onClick={() => handleToggleActive(b.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                      {b.is_active ? '非公開にする' : '公開にする'}
                    </button>
                    <button onClick={() => handleDelete(b.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 transition-colors ml-auto">
                      削除
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
