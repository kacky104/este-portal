'use client';

// ★★★ セラピストの既定画像（運営）（第217便・2026-09-08・カッキーさんの指示）
//
//   写真が1枚も無いセラピストのカードに出す、フクエス共通の画像。
//   ★ 店舗様が /mypage（店舗画像）で入れた画像があればそちらが勝つ（★ 本人 → 店舗 → 運営）。
//   ★ 決め方は src/lib/therapistPlaceholder.ts（番人あり）。ここは運営の1枚を置く・消すだけ。
//
//   保存先: page_heroes の page_key='therapist_placeholder'（image_url）。
//   ★ 書くのは専用の RPC admin_set_therapist_placeholder（運営UIDだけ）。
//     ★ ヒーロー画像の RPC（admin_set_page_hero_image）の許可リストには入れていない
//       （★ あちらは PC/SP の2枚・ページの無効化と結びついていて用途が違う）。
//   画像の置き場: header-slider バケット（PageHeroManager と同じ）。
import { useEffect, useState, useRef } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidateTopAndAreas } from '@/app/lib/revalidateTop';
import { THERAPIST_PLACEHOLDER_KEY } from '@/lib/therapistPlaceholder';

const BUCKET = 'header-slider';

export default function TherapistPlaceholderManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [url, setUrl] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    supabase
      .from('page_heroes')
      .select('image_url')
      .eq('page_key', THERAPIST_PLACEHOLDER_KEY)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setUrl(((data as { image_url?: string | null } | null)?.image_url) ?? null);
        setLoaded(true);
      });
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFile = async (file: File) => {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { onToast('JPEG / PNG / WebP のみアップロードできます'); return; }
    if (file.size > 5 * 1024 * 1024) { onToast('画像は5MBまでです'); return; }
    setBusy(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `therapist-placeholder/default_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) { setBusy(false); onToast(`アップロードに失敗しました: ${upErr.message}`); return; }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error: rpcErr } = await supabase.rpc('admin_set_therapist_placeholder', { p_url: pub.publicUrl });
    setBusy(false);
    if (rpcErr) { onToast(`保存に失敗しました: ${rpcErr.message}`); return; }
    setUrl(pub.publicUrl);
    if (inputRef.current) inputRef.current.value = '';
    // ★ 写真が出る場所は多い（トップ・地域・店舗・ランキング…）。★ トップと地域だけ即時に作り直し、残りは ISR（最大10分）。
    revalidateTopAndAreas();
    onToast('セラピストの既定画像を設定しました（反映まで最大10分）');
  };

  const remove = async () => {
    if (!url) return;
    if (!window.confirm('運営の既定画像を削除しますか？\n（店舗の既定画像が無い方は「画像なし」の表示に戻ります）')) return;
    setBusy(true);
    const { error: rpcErr } = await supabase.rpc('admin_set_therapist_placeholder', { p_url: '' });
    setBusy(false);
    if (rpcErr) { onToast(`削除に失敗しました: ${rpcErr.message}`); return; }
    setUrl(null);
    revalidateTopAndAreas();
    onToast('運営の既定画像を削除しました');
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-slate-500 leading-relaxed">
        写真が1枚も無いセラピストのカード（トップ・地域・店舗ページ・ランキング・出勤表・写メ日記・本人ページ・公式HP）に出す、フクエス共通の画像です。
        店舗が自分の既定画像を入れている場合はそちらが優先されます。推奨：縦長（3:4）1080×1440px／JPEG・PNG・WebP、5MBまで。
      </p>
      <div className="flex items-start gap-4">
        <div className="w-28 aspect-[3/4] rounded-lg border border-slate-200 overflow-hidden bg-slate-50 flex-shrink-0 flex items-center justify-center">
          {!loaded ? (
            <span className="text-[10px] text-slate-400">読み込み中...</span>
          ) : url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt="セラピストの既定画像（運営）" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] text-slate-400">未設定</span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <label className={`inline-flex items-center justify-center px-4 py-2 rounded-lg border border-pink-300 text-pink-600 text-xs font-bold cursor-pointer hover:bg-pink-50 transition-colors ${busy ? 'opacity-50 pointer-events-none' : ''}`}>
            {busy ? '処理中...' : url ? '画像を変更' : '画像を追加'}
            <input
              ref={inputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }}
            />
          </label>
          {url && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="inline-flex items-center justify-center px-4 py-2 rounded-lg border border-rose-200 text-rose-500 text-xs font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              削除
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
