'use client';

// ページ別ヒーロー（ヘッダー）画像の管理。ランキングのヒーロー設定と同方式。
// 画像は既存の公開バケット header-slider を再利用（page-hero/ 配下に保存）→ 公開URLを
// 管理者判定付きRPC admin_set_page_hero(p_key,p_url) で保存する。対象は5ページ。
import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidatePageHeroes } from '@/app/lib/revalidateTop';
import { PAGE_HERO_LABELS, type PageHeroKey } from '@/app/lib/pageHero';

const supabase = createClient();
const HERO_BUCKET = 'header-slider';
const KEYS: PageHeroKey[] = ['therapists', 'diary', 'reviews', 'newface', 'xshops', 'news'];

export default function PageHeroManager({ onToast }: { onToast: (m: string) => void }) {
  const [urls, setUrls] = useState<Record<PageHeroKey, string | null>>({
    therapists: null, diary: null, reviews: null, newface: null, xshops: null, news: null,
  });
  const [sel, setSel] = useState<PageHeroKey>('therapists');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('page_heroes').select('page_key, image_url');
    const next: Record<PageHeroKey, string | null> = {
      therapists: null, diary: null, reviews: null, newface: null, xshops: null, news: null,
    };
    ((data ?? []) as Array<{ page_key: string; image_url: string | null }>).forEach((r) => {
      if ((KEYS as string[]).includes(r.page_key)) next[r.page_key as PageHeroKey] = r.image_url ?? null;
    });
    setUrls(next);
    setLoaded(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const onFile = async (key: PageHeroKey, file: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      onToast('JPEG / PNG / WebP のみアップロードできます');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      onToast('画像は5MBまでです');
      return;
    }
    setBusy(true);
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
    const path = `page-hero/hero-${key}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from(HERO_BUCKET)
      .upload(path, file, { upsert: true, contentType: file.type });
    if (upErr) {
      setBusy(false);
      onToast(`アップロードに失敗しました: ${upErr.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from(HERO_BUCKET).getPublicUrl(path);
    const url = pub.publicUrl;
    const { error: rpcErr } = await supabase.rpc('admin_set_page_hero', { p_key: key, p_url: url });
    setBusy(false);
    if (rpcErr) {
      onToast(`保存に失敗しました: ${rpcErr.message}`);
      return;
    }
    setUrls((prev) => ({ ...prev, [key]: url }));
    if (inputRef.current) inputRef.current.value = '';
    revalidatePageHeroes();
    onToast(`「${PAGE_HERO_LABELS[key]}」のヘッダー画像を設定しました`);
  };

  const remove = async (key: PageHeroKey) => {
    setBusy(true);
    const { error: rpcErr } = await supabase.rpc('admin_set_page_hero', { p_key: key, p_url: '' });
    setBusy(false);
    if (rpcErr) {
      onToast(`削除に失敗しました: ${rpcErr.message}`);
      return;
    }
    setUrls((prev) => ({ ...prev, [key]: null }));
    revalidatePageHeroes();
    onToast(`「${PAGE_HERO_LABELS[key]}」のヘッダー画像を削除しました`);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">
        各ページ上部に表示するヘッダー画像を設定します（JPEG / PNG / WebP・5MBまで）。ランキングと同じ仕組みです。
      </p>

      {/* ページ選択 */}
      <div className="flex flex-wrap gap-1.5">
        {KEYS.map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setSel(key)}
            className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-colors ${
              sel === key
                ? 'bg-pink-600 text-white border-pink-600'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {PAGE_HERO_LABELS[key]}
            {urls[key] ? ' ●' : ''}
          </button>
        ))}
      </div>

      {/* 選択中ページのプレビュー＋操作 */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="text-sm font-bold text-slate-700">
          「{PAGE_HERO_LABELS[sel]}」ページのヘッダー画像
        </div>
        {urls[sel] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={urls[sel] as string} alt={PAGE_HERO_LABELS[sel]} className="block w-full max-w-md rounded-lg border border-slate-200" />
        ) : (
          <div className="text-sm text-slate-400">{loaded ? '未設定' : '読み込み中…'}</div>
        )}
        <div className="flex items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(sel, f);
            }}
            className="text-sm"
          />
          {urls[sel] && (
            <button
              type="button"
              onClick={() => remove(sel)}
              disabled={busy}
              className="px-3 py-1.5 rounded-full text-sm font-bold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
            >
              削除
            </button>
          )}
        </div>
        {busy && <div className="text-xs text-slate-400">処理中…</div>}
      </div>
    </div>
  );
}
