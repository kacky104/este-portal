'use client';

// ページ別ヒーロー（ヘッダー）画像の管理。ランキングのヒーロー設定と同方式。
// 画像は既存の公開バケット header-slider を再利用（page-hero/ 配下に保存）→ 公開URLを
// 管理者判定付きRPC admin_set_page_hero(p_key,p_url) で保存する。
// keys プロップで対象ページを絞れる（本体タブ＝MAIN_PAGE_HERO_KEYS（既定）／求人タブ＝JOBS_PAGE_HERO_KEYS）。
// ※ keys には lib/pageHero.ts のエクスポート定数など「毎レンダーで同一参照」のものを渡すこと
//   （インライン配列だと load の useCallback が毎回作り直され再取得が走る）。
import { useEffect, useState, useRef, useCallback } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { revalidatePageHeroes } from '@/app/lib/revalidateTop';
import { MAIN_PAGE_HERO_KEYS, PAGE_HERO_LABELS, type PageHeroKey } from '@/app/lib/pageHero';

const supabase = createClient();
const HERO_BUCKET = 'header-slider';

// PC / スマホ の2枠（2026-08-17 / 第19便で追加）。
// ★ 保存は RPC admin_set_page_hero_image(p_key, p_variant, p_url) を使う。
//   従来の admin_set_page_hero(p_key, p_url) もDB側に残してあるが、こちらからは呼ばない
//   （PC専用で、SPを触れないため）。
// ★ スマホ用が未設定のときは公開ページ側でPC用が流用される（PageHero が判断する）。
//   ここでその判断を書かないこと。二重に持つと必ず食い違う。
type Variant = 'pc' | 'sp';
const VARIANTS: ReadonlyArray<{ key: Variant; label: string; hint: string }> = [
  { key: 'pc', label: 'PC用', hint: '横768px以上で表示されます' },
  { key: 'sp', label: 'スマホ用', hint: '横767px以下で表示されます。未設定ならPC用が使われます' },
];

type UrlPair = { pc: string | null; sp: string | null };

// 保存先のパス。★コンポーネントの外に出してある。
//   中に書くと Date.now() が「レンダー中に呼ばれる不純な関数」として lint に拾われる
//   （実際にはイベントハンドラからしか呼ばれないので害は無いが、警告を増やさない）。
function heroPath(key: PageHeroKey, variant: Variant, ext: string): string {
  return `page-hero/hero-${key}-${variant}-${Date.now()}.${ext}`;
}

// keys の各キーを空ペアで初期化したレコード（部分キーのRecordだが、参照は常に keys 内なので安全）。
function emptyUrls(keys: readonly PageHeroKey[]): Record<PageHeroKey, UrlPair> {
  return Object.fromEntries(keys.map((k) => [k, { pc: null, sp: null }])) as Record<PageHeroKey, UrlPair>;
}

export default function PageHeroManager({
  onToast,
  keys = MAIN_PAGE_HERO_KEYS,
  description = '各ページ上部に表示するヘッダー画像を設定します（JPEG / PNG / WebP・5MBまで）。ランキングと同じ仕組みです。',
}: {
  onToast: (m: string) => void;
  keys?: readonly PageHeroKey[];
  description?: string;
}) {
  const [urls, setUrls] = useState<Record<PageHeroKey, UrlPair>>(() => emptyUrls(keys));
  const [sel, setSel] = useState<PageHeroKey>(keys[0]);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  // PC枠とSP枠でファイル入力を分ける（同じ ref を使い回すと、片方を選んだあと
  // もう片方の input が空にならず「同じファイルを選び直せない」状態になる）。
  const inputRefs = { pc: useRef<HTMLInputElement>(null), sp: useRef<HTMLInputElement>(null) };

  const load = useCallback(async () => {
    const { data } = await supabase.from('page_heroes').select('page_key, image_url, image_url_sp');
    const next = emptyUrls(keys);
    ((data ?? []) as Array<{ page_key: string; image_url: string | null; image_url_sp: string | null }>).forEach((r) => {
      if ((keys as readonly string[]).includes(r.page_key)) {
        next[r.page_key as PageHeroKey] = { pc: r.image_url ?? null, sp: r.image_url_sp ?? null };
      }
    });
    setUrls(next);
    setLoaded(true);
  }, [keys]);

  useEffect(() => { load(); }, [load]);

  const onFile = async (key: PageHeroKey, variant: Variant, file: File) => {
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
    // ★ ファイル名に variant を入れている（heroPath）。入れないと PC と SP を同じ瞬間に上げたとき衝突しうる。
    const path = heroPath(key, variant, ext);
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
    const { error: rpcErr } = await supabase.rpc('admin_set_page_hero_image', { p_key: key, p_variant: variant, p_url: url });
    setBusy(false);
    if (rpcErr) {
      onToast(`保存に失敗しました: ${rpcErr.message}`);
      return;
    }
    setUrls((prev) => ({ ...prev, [key]: { ...prev[key], [variant]: url } }));
    const ref = inputRefs[variant].current;
    if (ref) ref.value = '';
    revalidatePageHeroes();
    onToast(`「${PAGE_HERO_LABELS[key]}」の${variant === 'pc' ? 'PC用' : 'スマホ用'}ヘッダー画像を設定しました`);
  };

  const remove = async (key: PageHeroKey, variant: Variant) => {
    setBusy(true);
    const { error: rpcErr } = await supabase.rpc('admin_set_page_hero_image', { p_key: key, p_variant: variant, p_url: '' });
    setBusy(false);
    if (rpcErr) {
      onToast(`削除に失敗しました: ${rpcErr.message}`);
      return;
    }
    setUrls((prev) => ({ ...prev, [key]: { ...prev[key], [variant]: null } }));
    revalidatePageHeroes();
    onToast(`「${PAGE_HERO_LABELS[key]}」の${variant === 'pc' ? 'PC用' : 'スマホ用'}ヘッダー画像を削除しました`);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500">{description}</p>

      {/* ページ選択 */}
      <div className="flex flex-wrap gap-1.5">
        {keys.map((key) => (
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
            {/* ● はPC用、▪ はスマホ用が設定済みの印 */}
            {urls[key].pc ? ' ●' : ''}
            {urls[key].sp ? ' ▪' : ''}
          </button>
        ))}
      </div>

      {/* 選択中ページのプレビュー＋操作（PC枠・スマホ枠の2つ） */}
      <div className="rounded-xl border border-slate-200 p-4 space-y-4">
        <div className="text-sm font-bold text-slate-700">
          「{PAGE_HERO_LABELS[sel]}」ページのヘッダー画像
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {VARIANTS.map((v) => {
            const current = urls[sel][v.key];
            return (
              <div key={v.key} className="rounded-lg border border-slate-100 bg-slate-50/40 p-3 space-y-2">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold text-slate-700">{v.label}</span>
                  <span className="text-[11px] text-slate-400">{v.hint}</span>
                </div>

                {current ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={current} alt={`${PAGE_HERO_LABELS[sel]}（${v.label}）`} className="block w-full rounded-lg border border-slate-200 bg-white" />
                ) : (
                  <div className="text-sm text-slate-400">
                    {!loaded
                      ? '読み込み中…'
                      : v.key === 'sp' && urls[sel].pc
                        ? '未設定（PC用の画像が使われます）'
                        : '未設定'}
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <input
                    ref={inputRefs[v.key]}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) onFile(sel, v.key, f);
                    }}
                    className="text-sm max-w-full"
                  />
                  {current && (
                    <button
                      type="button"
                      onClick={() => remove(sel, v.key)}
                      disabled={busy}
                      className="px-3 py-1.5 rounded-full text-sm font-bold border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors disabled:opacity-50"
                    >
                      削除
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {busy && <div className="text-xs text-slate-400">処理中…</div>}
      </div>
    </div>
  );
}
