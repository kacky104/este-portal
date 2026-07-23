'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import {
  MAIN_ARTICLE_CATEGORY_ORDER,
  mainArticleCategoryLabel,
} from '@/app/lib/mainArticleCategories';
import { MAIN_ARTICLE_PRESETS } from '@/app/lib/mainArticlePresets';
import {
  adminListMainArticles,
  adminCreateMainArticle,
  adminUpdateMainArticle,
  adminDeleteMainArticle,
  type MainArticle,
} from '@/app/actions/mainArticles';

// admin「本体」タブのコラム記事（main_articles）管理カード。
// WorkArticlesManager（求人側）のピンクテーマ版・構成同一：
// 一覧（draft含む・updated_at降順）／作成・編集フォーム（slug・title・category・excerpt・body・
// hero画像・status）／削除。DB書き込みはサーバーアクション（RLS admin_all）経由、
// hero画像のアップロード・掃除だけブラウザSupabaseクライアント直（main-article-images・admin書き込み）。
// 公開ページは /column 配下。

const supabase = createClient();

const BUCKET = 'main-article-images';
const EXCERPT_TARGET = 150; // 抜粋の目安字数（超過は警告のみ・保存は許可）
const SLUG_RE = /^[a-z0-9-]+$/;

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

// main-article-images の public URL からストレージパス（{article_id}/{ts}.{ext}）を取り出す。該当しなければ null。
function storagePathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

// 旧hero画像を Storage から削除（remove() 戻り値を検査して失敗はログのみ・本処理は止めない）。
async function removeHeroFile(url: string | null): Promise<void> {
  const path = storagePathFromUrl(url);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error('[MainArticles] hero画像の削除に失敗:', path, error);
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

type FormState = {
  slug: string;
  title: string;
  category: string;
  excerpt: string;
  body: string;
  hero_image_url: string | null;
  status: 'draft' | 'published';
};

// 編集中コンテキスト。isNew の場合はクライアント生成UUIDを行ID＋hero画像パスに使う。
type Editing = {
  id: string;
  isNew: boolean;
  originalSlug: string;
  originalHeroUrl: string | null;
};

const EMPTY_FORM: FormState = {
  slug: '', title: '', category: 'howto', excerpt: '', body: '', hero_image_url: null, status: 'draft',
};

export default function MainArticlesManager({ onToast }: { onToast: (msg: string) => void }) {
  const [articles, setArticles] = useState<MainArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [editing, setEditing] = useState<Editing | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [heroUploading, setHeroUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [presetKey, setPresetKey] = useState(''); // 新規作成時の定型コラム選択

  const load = useCallback(async () => {
    setLoading(true);
    const res = await adminListMainArticles();
    if (!res.ok) {
      setLoadError(res.error);
      setArticles([]);
    } else {
      setLoadError('');
      setArticles(res.articles);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing({ id: crypto.randomUUID(), isNew: true, originalSlug: '', originalHeroUrl: null });
    setForm(EMPTY_FORM);
    setFormError('');
    setPresetKey('');
  };

  // 定型コラム（プリセット）をフォームに流し込む。ヒーロー画像・ステータスはそのまま（下書き）。
  const applyPreset = (key: string) => {
    if (!key) { setPresetKey(''); return; }
    const preset = MAIN_ARTICLE_PRESETS.find(pr => pr.key === key);
    if (!preset) return;
    if ((form.title.trim() !== '' || form.body.trim() !== '') &&
        !window.confirm('入力中の内容を定型コラムで置き換えますか？')) {
      return; // キャンセル時は選択・入力を維持
    }
    setPresetKey(key);
    setForm(p => ({
      ...p,
      slug: preset.slug,
      title: preset.title,
      category: preset.category,
      excerpt: preset.excerpt,
      body: preset.body,
    }));
  };

  const openEdit = (a: MainArticle) => {
    setEditing({ id: a.id, isNew: false, originalSlug: a.slug, originalHeroUrl: a.hero_image_url });
    setForm({
      slug: a.slug,
      title: a.title,
      category: a.category,
      excerpt: a.excerpt,
      body: a.body,
      hero_image_url: a.hero_image_url,
      status: a.status,
    });
    setFormError('');
  };

  // フォームを閉じる。今セッションでアップロードしたが未保存の hero は孤児になるため掃除する。
  const closeForm = async () => {
    if (editing && form.hero_image_url && form.hero_image_url !== editing.originalHeroUrl) {
      await removeHeroFile(form.hero_image_url);
    }
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError('');
    setPresetKey('');
  };

  const handleHeroUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !editing) return;
    const verr = validateImageFile(file);
    if (verr) { onToast(verr); return; }

    setHeroUploading(true);
    const prevUrl = form.hero_image_url;
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    // パスは {article_id}/{timestamp}.{ext} でユニーク化・upsert不使用（差し替えで必ず別URL）。
    const path = `${editing.id}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type, cacheControl: STORAGE_CACHE_CONTROL });
    if (error) {
      setHeroUploading(false);
      onToast(`画像のアップロードに失敗しました: ${error.message}`);
      return;
    }
    const { data: { publicUrl } } = supabase.storage.from(BUCKET).getPublicUrl(path);
    setForm(p => ({ ...p, hero_image_url: publicUrl }));
    // 直前にこのセッションでアップした未保存画像（＝originalと異なる）があれば孤児掃除。
    if (prevUrl && prevUrl !== editing.originalHeroUrl) {
      await removeHeroFile(prevUrl);
    }
    setHeroUploading(false);
  };

  const handleClearHero = async () => {
    if (!editing) return;
    // 今セッションでアップした未保存画像なら実ファイルも掃除。保存済みの元画像は保存時に掃除する。
    if (form.hero_image_url && form.hero_image_url !== editing.originalHeroUrl) {
      await removeHeroFile(form.hero_image_url);
    }
    setForm(p => ({ ...p, hero_image_url: null }));
  };

  const handleSave = async () => {
    if (!editing) return;
    const slug = form.slug.trim();
    if (slug === '') { setFormError('slug（URL）は必須です'); return; }
    if (!SLUG_RE.test(slug)) { setFormError('slug は英数字（小文字）とハイフンのみで入力してください'); return; }
    if (form.title.trim() === '') { setFormError('タイトルは必須です'); return; }
    setFormError('');
    setSaving(true);

    const inputBase = {
      slug,
      title: form.title,
      category: form.category,
      excerpt: form.excerpt,
      body: form.body,
      hero_image_url: form.hero_image_url,
      status: form.status,
    };

    const res = editing.isNew
      ? await adminCreateMainArticle({ id: editing.id, ...inputBase })
      : await adminUpdateMainArticle(editing.id, inputBase);

    if (!res.ok) {
      setSaving(false);
      setFormError(res.error);
      return;
    }

    // 編集で hero を差し替え/削除していたら、DB確定後に元ファイルを掃除（remove戻り値検査）。
    if (!editing.isNew && editing.originalHeroUrl && form.hero_image_url !== editing.originalHeroUrl) {
      await removeHeroFile(editing.originalHeroUrl);
    }

    setSaving(false);
    setEditing(null);
    setForm(EMPTY_FORM);
    setPresetKey('');
    onToast(editing.isNew ? 'コラム記事を作成しました' : 'コラム記事を更新しました');
    await load();
  };

  const handleDelete = async (a: MainArticle) => {
    if (!window.confirm(`「${a.title || '(無題)'}」を削除しますか？この操作は取り消せません。`)) return;
    setDeletingId(a.id);
    const res = await adminDeleteMainArticle(a.id);
    if (!res.ok) {
      setDeletingId(null);
      onToast(`削除に失敗しました: ${res.error}`);
      return;
    }
    // 行削除に成功してから hero 画像を掃除（失敗しても行削除は確定・ログのみ）。
    if (a.hero_image_url) await removeHeroFile(a.hero_image_url);
    setDeletingId(null);
    onToast('コラム記事を削除しました');
    await load();
  };

  const excerptLen = form.excerpt.length;
  const excerptOver = excerptLen > EXCERPT_TARGET;
  const slugChanged = editing != null && !editing.isNew && form.slug.trim() !== editing.originalSlug;

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-4">
      {/* ── ヘッダ：新規作成ボタン ── */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-slate-400 font-medium">
          利用者向けSEO記事「コラム」（/column 配下）。draft は公開ページに出ません。
        </p>
        {!editing && (
          <button
            type="button"
            onClick={openNew}
            className="flex-shrink-0 px-4 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs shadow-sm hover:opacity-90 transition-opacity"
          >
            ＋ 新規作成
          </button>
        )}
      </div>

      {/* ── 作成・編集フォーム ── */}
      {editing && (
        <div className="rounded-2xl border border-pink-100 bg-pink-50/30 p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-700">
              {editing.isNew ? '新規コラム作成' : 'コラム編集'}
            </h3>
            <button
              type="button"
              onClick={closeForm}
              className="text-[11px] font-bold text-slate-400 hover:text-slate-600"
            >
              閉じる
            </button>
          </div>

          {/* 定型コラムから読み込む（新規作成時のみ） */}
          {editing.isNew && (
            <div className="space-y-1">
              <label className="text-[11px] font-bold text-slate-400 block">定型コラムから読み込む（任意）</label>
              <select
                value={presetKey}
                onChange={e => applyPreset(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-pink-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
              >
                <option value="">（選択すると各項目に自動入力）</option>
                {MAIN_ARTICLE_PRESETS.map(pr => (
                  <option key={pr.key} value={pr.key}>{pr.label}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-400">選ぶとタイトル・slug・カテゴリ・抜粋・本文が入ります。あとはヒーロー画像を設定して「作成」してください。</p>
            </div>
          )}

          {/* slug */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block">
              slug（URL） <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={form.slug}
              onChange={e => setForm(p => ({ ...p, slug: e.target.value }))}
              placeholder="例: how-to-choose-salon"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 font-mono"
            />
            <p className="text-[10px] text-slate-400">英数字（小文字）とハイフンのみ。</p>
            {slugChanged && (
              <p className="text-[10px] text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-2 py-1">
                ⚠ 公開後の slug 変更は既存URL・SEO評価が失われるため非推奨です。
              </p>
            )}
          </div>

          {/* title */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block">
              タイトル <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
              placeholder="例: 福岡メンズエステの選び方ガイド"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
            />
          </div>

          {/* category */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block">カテゴリ</label>
            <select
              value={form.category}
              onChange={e => setForm(p => ({ ...p, category: e.target.value }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
            >
              {MAIN_ARTICLE_CATEGORY_ORDER.map(key => (
                <option key={key} value={key}>{mainArticleCategoryLabel(key)}</option>
              ))}
            </select>
          </div>

          {/* excerpt */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-bold text-slate-400 block">抜粋（一覧カード・meta description用）</label>
              <span className={`text-[10px] font-bold ${excerptOver ? 'text-amber-600' : 'text-slate-400'}`}>
                {excerptLen}/{EXCERPT_TARGET}
              </span>
            </div>
            <textarea
              value={form.excerpt}
              onChange={e => setForm(p => ({ ...p, excerpt: e.target.value }))}
              rows={2}
              placeholder="150字程度の要約。検索結果や一覧カードに表示されます。"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 resize-y"
            />
            {excerptOver && (
              <p className="text-[10px] text-amber-600">目安の150字を超えています（保存は可能です）。</p>
            )}
          </div>

          {/* body (Markdown) */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block">本文（Markdown）</label>
            <textarea
              value={form.body}
              onChange={e => setForm(p => ({ ...p, body: e.target.value }))}
              rows={12}
              placeholder="Markdown で記述（## 見出し・リスト・リンク等。ワーク側コラムと同じ書式）。"
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200 font-mono resize-y"
            />
          </div>

          {/* hero image */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block">ヒーロー画像（OGP兼用）</label>
            {form.hero_image_url ? (
              <div className="flex items-start gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={form.hero_image_url}
                  alt="hero preview"
                  className="w-40 h-[84px] object-cover rounded-lg border border-slate-200"
                />
                <button
                  type="button"
                  onClick={handleClearHero}
                  className="text-[11px] font-bold text-rose-500 hover:text-rose-600"
                >
                  画像を外す
                </button>
              </div>
            ) : (
              <label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-dashed border-pink-300 text-pink-600 text-xs font-bold cursor-pointer hover:bg-pink-50 transition-colors">
                {heroUploading ? 'アップロード中...' : '画像をアップロード'}
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleHeroUpload} disabled={heroUploading} className="hidden" />
              </label>
            )}
            <p className="text-[10px] text-slate-400">横1200×縦630px推奨（OGP兼用）・アップロード前に圧縮推奨。</p>
          </div>

          {/* status */}
          <div className="space-y-1">
            <label className="text-[11px] font-bold text-slate-400 block">ステータス</label>
            <select
              value={form.status}
              onChange={e => setForm(p => ({ ...p, status: e.target.value as 'draft' | 'published' }))}
              className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-pink-200"
            >
              <option value="draft">下書き（draft）</option>
              <option value="published">公開（published）</option>
            </select>
            <p className="text-[10px] text-slate-400">
              初めて公開にした時点の日時が公開日として記録されます（下書きに戻しても公開日は保持）。
            </p>
          </div>

          {formError && (
            <p className="text-xs text-rose-500 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{formError}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={closeForm}
              disabled={saving}
              className="px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-xs font-bold hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || heroUploading}
              className="px-6 py-2 rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
            >
              {saving ? '保存中...' : editing.isNew ? '作成' : '更新'}
            </button>
          </div>
        </div>
      )}

      {/* ── 一覧 ── */}
      {loading ? (
        <div className="p-6 text-center text-sm text-slate-400">読み込み中...</div>
      ) : loadError ? (
        <div className="p-6 text-center text-sm text-rose-400">{loadError}</div>
      ) : articles.length === 0 ? (
        <div className="p-8 text-center text-sm text-slate-400">まだコラム記事がありません。</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-pink-50/50 border-b border-slate-100">
                <th className="text-left px-3 py-2.5 text-[11px] font-bold text-slate-400">タイトル</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-bold text-slate-400 w-32">カテゴリ</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-bold text-slate-400 w-24">ステータス</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-bold text-slate-400 w-40">公開日</th>
                <th className="text-left px-3 py-2.5 text-[11px] font-bold text-slate-400 w-40">更新日</th>
                <th className="px-3 py-2.5 w-28" />
              </tr>
            </thead>
            <tbody>
              {articles.map((a, i) => (
                <tr key={a.id} className={`border-b border-slate-100 hover:bg-pink-50/20 transition-colors ${i % 2 === 0 ? '' : 'bg-slate-50/30'}`}>
                  <td className="px-3 py-2.5">
                    <div className="text-xs font-bold text-slate-800">{a.title || '(無題)'}</div>
                    <div className="text-[10px] text-slate-400 font-mono break-all">/{a.slug}</div>
                  </td>
                  <td className="px-3 py-2.5">
                    <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                      {mainArticleCategoryLabel(a.category)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {a.status === 'published' ? (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-pink-100 text-pink-700 border border-pink-200 font-bold">公開中</span>
                    ) : (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200 font-bold">下書き</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500">{formatDate(a.published_at)}</td>
                  <td className="px-3 py-2.5 text-[11px] text-slate-500">{formatDate(a.updated_at)}</td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(a)}
                        className="text-[11px] font-bold px-3 py-1 rounded-lg border border-pink-200 text-pink-600 hover:bg-pink-50 hover:border-pink-300 transition-colors"
                      >
                        編集
                      </button>
                      <button
                        onClick={() => handleDelete(a)}
                        disabled={deletingId === a.id}
                        className="text-[11px] font-bold px-3 py-1 rounded-lg border border-rose-200 text-rose-500 hover:bg-rose-50 hover:border-rose-300 disabled:opacity-50 transition-colors"
                      >
                        {deletingId === a.id ? '削除中...' : '削除'}
                      </button>
                    </div>
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
