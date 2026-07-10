'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { XTimeAgo } from '../XTimeAgo';
import { VerifiedBadge } from '../VerifiedBadge';
import { XImageCropModal } from '../XImageCropModal';
import { normalizeLinkUrl } from '../xLink';
import { searchXPostsByDate } from '@/app/actions/xAdminSearch';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

const supabase = createClient();

export type ShopRow = {
  id: string;
  handle: string;
  display_name: string;
  avatar_url: string | null;
  is_verified: boolean;
  status: string;
  created_at: string;
};
export type ModPost = {
  id: string;
  body: string | null;
  images: string[];
  createdAt: string;
  authorHandle: string;
  authorName: string;
};
export type ModProfile = {
  id: string;
  handle: string;
  display_name: string;
  kind: string;
  status: string;
  is_verified: boolean;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店', official: '運営' };

// タイムラインバナー（5枠固定・64:27=1280×540＝16:9の縦3/4）。行が存在する枠だけタイムラインに表示される。
export type BannerRow = { slot: number; image_url: string; link_url: string | null };
const BANNER_SLOTS = [1, 2, 3, 4, 5] as const;
const BANNER_W = 1280;
const BANNER_H = 540;

function validateBannerFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

// バナーリンクの正規化: 「/」始まりはサイト内パスとしてそのまま許可（normalizeLinkUrl は http/https 専用のため）。
// それ以外は共通ユーティリティで http/https のみ許可・危険スキームを排除。
function normalizeBannerLink(raw: string): { url: string | null; error: string | null } {
  const s = raw.trim();
  if (s.startsWith('/')) return { url: s, error: null };
  return normalizeLinkUrl(s);
}

export function XAdmin({
  shops: initialShops,
  posts: initialPosts,
  profiles: initialProfiles,
  emails,
  banners: initialBanners,
  myAuthId,
}: {
  shops: ShopRow[];
  posts: ModPost[];
  profiles: ModProfile[];
  emails: Record<string, string>; // profile.id → ログインメール（運営のみ・/x/admin 限定で表示）
  banners: BannerRow[]; // タイムラインバナー（設定済みの枠のみ）
  myAuthId: string; // 運営の auth uid（x-images のアップロード先フォルダ＝RLSが先頭フォルダ一致を要求）
}) {
  const [tab, setTab] = useState<'verify' | 'accounts' | 'posts' | 'banners'>('verify');
  const [shops, setShops] = useState(initialShops);
  const [posts, setPosts] = useState(initialPosts);
  const [profiles, setProfiles] = useState(initialProfiles);
  const [onlyUnverified, setOnlyUnverified] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [searchFrom, setSearchFrom] = useState(''); // datetime-local の値
  const [searchTo, setSearchTo] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchActive, setSearchActive] = useState(false); // 検索結果表示中フラグ

  // ── バナー管理の状態 ──
  // slot → 行（未設定枠は undefined）。リンク入力は保存前の編集値を別に持つ。
  const [bannerMap, setBannerMap] = useState<Record<number, BannerRow | undefined>>(() => {
    const m: Record<number, BannerRow | undefined> = {};
    initialBanners.forEach((b) => {
      m[b.slot] = b;
    });
    return m;
  });
  const [bannerLinks, setBannerLinks] = useState<Record<number, string>>(() => {
    const m: Record<number, string> = {};
    initialBanners.forEach((b) => {
      m[b.slot] = b.link_url ?? '';
    });
    return m;
  });
  const [bannerCrop, setBannerCrop] = useState<{ slot: number; file: File } | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2800);
  };

  // 認証バッジ付与/解除：x_profiles.is_verified を更新（運営は通常クライアントで RLS/ガードトリガを通過）。
  const setVerified = async (id: string, value: boolean) => {
    if (busy) return;
    setBusy(id);
    const { error } = await supabase.from('x_profiles').update({ is_verified: value }).eq('id', id);
    setBusy(null);
    if (error) {
      showToast(`更新に失敗しました：${error.message}`);
      return;
    }
    setShops((list) => list.map((s) => (s.id === id ? { ...s, is_verified: value } : s)));
    setProfiles((list) => list.map((p) => (p.id === id ? { ...p, is_verified: value } : p)));
    showToast(value ? '認証バッジを付与しました' : '認証バッジを解除しました');
  };

  // BAN(凍結)/解除：status を 'rejected' / 'approved' に。全 kind 対象。
  const setBanned = async (id: string, name: string, ban: boolean) => {
    if (busy) return;
    if (ban && !window.confirm(`「${name}」を凍結（BAN）しますか？\n投稿・フォロー不可になり、他ユーザーから見えなくなります。`)) return;
    setBusy(id);
    const { error } = await supabase
      .from('x_profiles')
      .update({ status: ban ? 'rejected' : 'approved' })
      .eq('id', id);
    setBusy(null);
    if (error) {
      showToast(`更新に失敗しました：${error.message}`);
      return;
    }
    setProfiles((list) => list.map((p) => (p.id === id ? { ...p, status: ban ? 'rejected' : 'approved' } : p)));
    setShops((list) => list.map((s) => (s.id === id ? { ...s, status: ban ? 'rejected' : 'approved' } : s)));
    showToast(ban ? '凍結しました' : '凍結を解除しました');
  };

  const deletePost = async (id: string) => {
    if (busy) return;
    if (!window.confirm('この投稿を削除しますか？\nこの操作は取り消せません。')) return;
    setBusy(id);
    const { error } = await supabase.from('x_posts').delete().eq('id', id);
    setBusy(null);
    if (error) {
      showToast(`削除に失敗しました：${error.message}`);
      return;
    }
    setPosts((list) => list.filter((p) => p.id !== id));
    showToast('投稿を削除しました');
  };

  const deleteProfile = async (id: string, name: string) => {
    if (busy) return;
    if (!window.confirm(`プロフィール「${name}」を削除しますか？\nこの操作は取り消せません（投稿等も連動して消える場合があります）。`)) return;
    setBusy(id);
    const { error } = await supabase.from('x_profiles').delete().eq('id', id);
    setBusy(null);
    if (error) {
      showToast(`削除に失敗しました：${error.message}`);
      return;
    }
    setProfiles((list) => list.filter((p) => p.id !== id));
    setShops((list) => list.filter((s) => s.id !== id));
    showToast('プロフィールを削除しました');
  };

  const runSearch = async () => {
    if (!searchFrom && !searchTo) {
      showToast('日時を指定してください');
      return;
    }
    setSearching(true);
    const res = await searchXPostsByDate(searchFrom || null, searchTo || null);
    setSearching(false);
    if (!res.ok) {
      showToast(`検索に失敗しました：${res.error ?? ''}`);
      return;
    }
    setPosts(res.posts);
    setSearchActive(true);
    showToast(`${res.posts.length}件見つかりました`);
  };

  const clearSearch = () => {
    setPosts(initialPosts); // 初期50件に復元（props をそのまま使う）
    setSearchActive(false);
    setSearchFrom('');
    setSearchTo('');
  };

  // ── バナー管理の操作 ──
  // 画像選択 → バリデーション → 16:9 クロップモーダルへ（アップロードはクロップ確定時）。
  const onBannerFile = (slot: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const verr = validateBannerFile(file);
    if (verr) {
      showToast(verr);
      return;
    }
    setBannerCrop({ slot, file });
  };

  // クロップ確定: x-images（本人フォルダ配下＝RLS要件）へアップロード → x_banners に upsert。
  // リンクは現在の入力値を正規化して同時保存（不正値は null 扱い＝画像保存を優先）。
  const onBannerCropSave = async (blob: Blob) => {
    const crop = bannerCrop;
    if (!crop) return;
    setBannerCrop(null);
    const slot = crop.slot;
    setBusy(`banner-${slot}`);
    const ext = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
    const path = `${myAuthId}/banner-slot${slot}-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('x-images').upload(path, blob, { cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) {
      setBusy(null);
      showToast(`画像のアップロードに失敗しました：${upErr.message}`);
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('x-images').getPublicUrl(path);
    const { url: linkUrl } = normalizeBannerLink(bannerLinks[slot] ?? '');
    const row: BannerRow = { slot, image_url: publicUrl, link_url: linkUrl };
    const { error } = await supabase.from('x_banners').upsert(row);
    setBusy(null);
    if (error) {
      showToast(`保存に失敗しました：${error.message}`);
      return;
    }
    setBannerMap((m) => ({ ...m, [slot]: row }));
    showToast(`バナー${slot}を保存しました`);
  };

  // リンクだけ保存（画像設定済みの枠のみ）。空欄は「リンクなし」。
  const saveBannerLink = async (slot: number) => {
    const row = bannerMap[slot];
    if (!row) return;
    const { url, error: linkErr } = normalizeBannerLink(bannerLinks[slot] ?? '');
    if (linkErr) {
      showToast(linkErr);
      return;
    }
    setBusy(`banner-${slot}`);
    const { error } = await supabase.from('x_banners').update({ link_url: url }).eq('slot', slot);
    setBusy(null);
    if (error) {
      showToast(`保存に失敗しました：${error.message}`);
      return;
    }
    setBannerMap((m) => ({ ...m, [slot]: { ...row, link_url: url } }));
    showToast('リンクを保存しました');
  };

  // 枠の削除（行削除＝タイムラインから即非表示。storage の画像ファイルはヘッダー同様に残置）。
  const deleteBanner = async (slot: number) => {
    if (!bannerMap[slot]) return;
    if (!window.confirm(`バナー${slot}を削除しますか？\nタイムラインからすぐに消えます。`)) return;
    setBusy(`banner-${slot}`);
    const { error } = await supabase.from('x_banners').delete().eq('slot', slot);
    setBusy(null);
    if (error) {
      showToast(`削除に失敗しました：${error.message}`);
      return;
    }
    setBannerMap((m) => ({ ...m, [slot]: undefined }));
    setBannerLinks((m) => ({ ...m, [slot]: '' }));
    showToast(`バナー${slot}を削除しました`);
  };

  const shownShops = onlyUnverified ? shops.filter((s) => !s.is_verified) : shops;

  return (
    <div className="x-card my-6 p-5 rounded-2xl bg-[color:var(--x-surface)] shadow-[0_4px_16px_rgba(109,40,217,0.3)]">
      <h1 className="text-xl font-black tracking-tight mb-1">運営パネル</h1>
      <p className="text-xs text-[color:var(--x-text-muted)] mb-4">fukuX の認証バッジ・凍結・モデレーション</p>

      {/* タブ */}
      <div className="flex gap-1 p-1 mb-5 rounded-xl bg-[color:var(--x-inset)]">
        {(
          [
            ['verify', '認証'],
            ['accounts', 'アカウント'],
            ['posts', '投稿'],
            ['banners', 'バナー'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`flex-1 py-2 rounded-lg text-xs font-bold transition-colors ${
              tab === key ? 'bg-[color:var(--x-surface)] text-[color:var(--x-accent)] shadow-sm' : 'text-[color:var(--x-text-muted)] hover:text-[color:var(--x-text-primary)]'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 認証バッジ管理（店舗） ── */}
      {tab === 'verify' && (
        <div>
          <label className="flex items-center gap-2 mb-3 text-xs font-bold text-[color:var(--x-text-secondary)] select-none">
            <input type="checkbox" checked={onlyUnverified} onChange={(e) => setOnlyUnverified(e.target.checked)} />
            未認証の店舗だけ表示
          </label>
          <div className="space-y-2">
            {shownShops.length === 0 ? (
              <p className="text-center text-sm text-[color:var(--x-text-muted)] py-12">該当する店舗はありません</p>
            ) : (
              shownShops.map((s) => (
                <div key={s.id} className="border border-[color:var(--x-border-strong)] rounded-2xl p-3 flex items-center gap-3">
                  <span className="relative w-11 h-11 rounded-full overflow-hidden border border-[color:var(--x-border)] bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
                    {s.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={s.avatar_url} alt={s.display_name} className="w-full h-full object-cover" />
                    ) : (
                      <span className="text-white font-bold">{s.display_name.charAt(0) || '?'}</span>
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/x/u/${s.handle}`} className="font-bold text-sm text-[color:var(--x-text-primary)] hover:underline truncate">
                        {s.display_name}
                      </Link>
                      {s.is_verified && <VerifiedBadge />}
                      {s.status === 'rejected' && (
                        <span className="text-[10px] font-bold text-rose-500 bg-rose-50 rounded-full px-1.5 py-0.5">凍結中</span>
                      )}
                    </div>
                    <p className="text-xs text-[color:var(--x-text-muted)]">@{s.handle}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setVerified(s.id, !s.is_verified)}
                    disabled={busy === s.id}
                    className={`flex-shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                      s.is_verified
                        ? 'border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] hover:border-rose-200 hover:text-rose-500'
                        : 'text-white'
                    }`}
                    style={s.is_verified ? undefined : { background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
                  >
                    {s.is_verified ? '認証解除' : '認証付与'}
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ── アカウント（BAN/凍結・削除） ── */}
      {tab === 'accounts' && (
        <div className="divide-y divide-slate-100">
          {profiles.length === 0 ? (
            <p className="text-center text-sm text-[color:var(--x-text-muted)] py-12">プロフィールはありません</p>
          ) : (
            profiles.map((p) => {
              const banned = p.status === 'rejected';
              return (
                <div key={p.id} className="py-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <Link href={`/x/u/${p.handle}`} className="font-bold text-sm text-[color:var(--x-text-primary)] hover:underline truncate">
                        {p.display_name}
                      </Link>
                      {(p.kind === 'official' || ((p.kind === 'shop' || p.kind === 'therapist') && p.is_verified)) && <VerifiedBadge kind={p.kind} />}
                      <span className="text-[10px] font-bold text-indigo-500 bg-indigo-50 rounded-full px-1.5 py-0.5">
                        {KIND_LABEL[p.kind] ?? p.kind}
                      </span>
                      {banned && (
                        <span className="text-[10px] font-bold text-rose-500 bg-rose-50 rounded-full px-1.5 py-0.5">凍結中</span>
                      )}
                    </div>
                    <p className="text-xs text-[color:var(--x-text-muted)]">@{p.handle}</p>
                    {/* ログインメール（運営パネル限定表示）。未取得時は — */}
                    <p className="text-[11px] text-[color:var(--x-text-muted)] break-all mt-0.5">
                      ✉ {emails[p.id] ?? '—'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBanned(p.id, p.display_name, !banned)}
                    disabled={busy === p.id}
                    className={`flex-shrink-0 px-3 py-1 rounded-lg text-[11px] font-bold transition-colors disabled:opacity-50 ${
                      banned
                        ? 'border border-emerald-200 text-emerald-600 bg-emerald-50 hover:bg-emerald-100'
                        : 'border border-amber-200 text-amber-600 bg-amber-50 hover:bg-amber-100'
                    }`}
                  >
                    {banned ? '凍結解除' : '凍結'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteProfile(p.id, p.display_name)}
                    disabled={busy === p.id}
                    className="flex-shrink-0 px-3 py-1 rounded-lg border border-rose-200 text-rose-500 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                  >
                    削除
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── 投稿モデレーション ── */}
      {tab === 'posts' && (
        <div>
          {/* 日時範囲検索 */}
          <div className="mb-4 p-3 rounded-2xl bg-[color:var(--x-inset)] border border-[color:var(--x-border-strong)]">
            <p className="text-xs font-bold text-[color:var(--x-text-secondary)] mb-2">投稿日時で検索（日本時間）</p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[color:var(--x-text-muted)]">
                開始
                <input
                  type="datetime-local"
                  value={searchFrom}
                  onChange={(e) => setSearchFrom(e.target.value)}
                  className="text-xs border border-[color:var(--x-border-strong)] rounded-lg px-2 py-1 text-[color:var(--x-text-primary)]"
                />
              </label>
              <label className="flex flex-col gap-1 text-[11px] font-bold text-[color:var(--x-text-muted)]">
                終了
                <input
                  type="datetime-local"
                  value={searchTo}
                  onChange={(e) => setSearchTo(e.target.value)}
                  className="text-xs border border-[color:var(--x-border-strong)] rounded-lg px-2 py-1 text-[color:var(--x-text-primary)]"
                />
              </label>
              <button
                type="button"
                onClick={runSearch}
                disabled={searching}
                className="text-xs font-bold px-4 py-1.5 rounded-lg text-white disabled:opacity-50"
                style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
              >
                {searching ? '検索中…' : '検索'}
              </button>
              {searchActive && (
                <button
                  type="button"
                  onClick={clearSearch}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] hover:bg-[color:var(--x-inset)]"
                >
                  検索解除
                </button>
              )}
            </div>
            {searchActive && (
              <p className="text-[11px] text-indigo-500 font-bold mt-2">
                検索結果を表示中（最大100件・新しい順）
              </p>
            )}
          </div>

          {/* 投稿リスト */}
          <div className="divide-y divide-slate-100">
            {posts.length === 0 ? (
              <p className="text-center text-sm text-[color:var(--x-text-muted)] py-12">
                {searchActive ? '該当する投稿はありません' : '投稿はありません'}
              </p>
            ) : (
            posts.map((p) => (
              <div key={p.id} className="py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-[color:var(--x-text-muted)]">
                    <span className="font-bold text-[color:var(--x-text-secondary)]">{p.authorName}</span> @{p.authorHandle} ·{' '}
                    <XTimeAgo iso={p.createdAt} />
                  </p>
                  {p.body && <p className="text-sm text-[color:var(--x-text-primary)] mt-0.5 break-words line-clamp-3">{p.body}</p>}
                  {p.images.length > 0 && <p className="text-[11px] text-[color:var(--x-text-muted)] mt-0.5">🖼 画像{p.images.length}枚</p>}
                </div>
                <button
                  type="button"
                  onClick={() => deletePost(p.id)}
                  disabled={busy === p.id}
                  className="flex-shrink-0 px-3 py-1 rounded-lg border border-rose-200 text-rose-500 text-[11px] font-bold bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                >
                  削除
                </button>
              </div>
            ))
          )}
          </div>
        </div>
      )}

      {/* ── タイムラインバナー管理（5枠・16:9） ── */}
      {tab === 'banners' && (
        <div>
          <p className="text-xs text-[color:var(--x-text-muted)] mb-4 leading-relaxed">
            タイムライン（おすすめ／フォロー中／お店）のタブ直下に表示されるスライダーです。画像は横長（1280×540）に切り抜かれます。
            設定した枠だけが番号順に表示され、0枠ならスライダー自体が出ません。リンクは任意（/ 始まりはサイト内・URLは新規タブ）。
          </p>
          <div className="space-y-4">
            {BANNER_SLOTS.map((slot) => {
              const row = bannerMap[slot];
              const slotBusy = busy === `banner-${slot}`;
              return (
                <div key={slot} className="border border-[color:var(--x-border-strong)] rounded-2xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-[color:var(--x-text-primary)]">
                      バナー{slot}
                      {!row && <span className="ml-1.5 text-[10px] font-bold text-[color:var(--x-text-muted)]">未設定</span>}
                    </p>
                    <div className="flex items-center gap-2">
                      <label
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg text-white cursor-pointer transition-opacity hover:opacity-95 ${slotBusy ? 'opacity-50 pointer-events-none' : ''}`}
                        style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
                      >
                        {slotBusy ? '処理中…' : row ? '画像を変更' : '画像を選択'}
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => onBannerFile(slot, e)}
                          disabled={slotBusy}
                        />
                      </label>
                      {row && (
                        <button
                          type="button"
                          onClick={() => deleteBanner(slot)}
                          disabled={slotBusy}
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 transition-colors disabled:opacity-50"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  </div>

                  {/* プレビュー（16:9）。未設定はプレースホルダ。 */}
                  {row ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={row.image_url} alt={`バナー${slot}`} className="w-full aspect-[64/27] object-cover rounded-lg" />
                  ) : (
                    <div className="w-full aspect-[64/27] rounded-lg bg-[color:var(--x-inset)] border border-dashed border-[color:var(--x-border-strong)] flex items-center justify-center">
                      <span className="text-xs text-[color:var(--x-text-muted)]">画像未設定</span>
                    </div>
                  )}

                  {/* リンクURL（任意）。画像設定済みの枠のみ保存可。 */}
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      type="text"
                      value={bannerLinks[slot] ?? ''}
                      onChange={(e) => setBannerLinks((m) => ({ ...m, [slot]: e.target.value }))}
                      placeholder="リンクURL（任意）例: /x/u/fukues_info や https://…"
                      className="flex-1 min-w-0 px-3 py-2 rounded-lg border border-[color:var(--x-border-strong)] text-xs bg-[color:var(--x-surface)] text-[color:var(--x-text-primary)] placeholder:text-[color:var(--x-text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => saveBannerLink(slot)}
                      disabled={!row || slotBusy}
                      className="flex-shrink-0 text-[11px] font-bold px-3 py-2 rounded-lg border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] hover:border-indigo-300 hover:text-indigo-500 transition-colors disabled:opacity-40"
                    >
                      リンク保存
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* バナー画像のクロップ（16:9固定・1280×720出力）。ヘッダー用モーダルの比率パラメータ版。 */}
      {bannerCrop && (
        <XImageCropModal
          file={bannerCrop.file}
          outWidth={BANNER_W}
          outHeight={BANNER_H}
          title={`バナー${bannerCrop.slot}を調整`}
          onCancel={() => setBannerCrop(null)}
          onSave={onBannerCropSave}
        />
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
