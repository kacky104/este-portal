'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { normalizeLinkUrl } from '../xLink';
import { deleteMyXAccount } from '@/app/actions/xAccount';
import type { XProfile } from '../xProfile';
import { X_OFFER_AREAS } from '../xOfferAreas';
import { XImageCropModal } from '../XImageCropModal';
import type { ShopMini } from '../xAffiliation';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';

const supabase = createClient();

const DISPLAY_MAX = 30;
const BIO_MAX = 160;

const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店', official: '運営' };

// 数値入力欄の値を保存用に変換：空文字は null（0 にしない）。数値として妥当なら整数化。
function toIntOrNull(s: string): number | null {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

// プロフィール編集。編集できるのは display_name / bio / avatar_url / header_url のみ。
// handle / kind / status / is_verified / affiliated_shop_id はガードトリガで変更不可＝フォームに含めず送らない。
export function XSettingsForm({
  profile,
  email,
  affiliatedShop,
}: {
  profile: XProfile;
  email: string | null;
  affiliatedShop: ShopMini | null;
}) {
  const router = useRouter();

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [bio, setBio] = useState(profile.bio ?? '');
  const [link, setLink] = useState(profile.link_url ?? '');
  // 年齢・スリーサイズ（すべて任意）。数値欄は文字列で保持し、保存時に null/整数へ変換。
  const [age, setAge] = useState(profile.age?.toString() ?? '');
  const [height, setHeight] = useState(profile.height?.toString() ?? '');
  const [bust, setBust] = useState(profile.bust?.toString() ?? '');
  const [cup, setCup] = useState(profile.cup ?? '');
  const [waist, setWaist] = useState(profile.waist?.toString() ?? '');
  const [hip, setHip] = useState(profile.hip?.toString() ?? '');
  // 年齢・スリーサイズはセラピストのみ、住所はお店のみ。
  const isTherapist = profile.kind === 'therapist';
  const isShop = profile.kind === 'shop';
  const [address, setAddress] = useState(profile.address ?? '');
  // お店カード画像（お店アカウントのみ・最大6枚）。タイムライン「お店」タブのショーケースに使う。
  const [showcaseImages, setShowcaseImages] = useState<string[]>(profile.showcase_images ?? []);
  const [showcaseUploading, setShowcaseUploading] = useState(false);
  // DM受付オフ（全kind共通）。オンにすると自分・相手とも新規/追加送信が不可になる（過去の閲覧は可）。
  const [dmDisabled, setDmDisabled] = useState(profile.dm_disabled);
  // オファー受付（求人スカウト）。未所属セラピストのみ設定可（所属中はセクション自体を出さない）。
  const canOffer = isTherapist && !profile.affiliated_shop_id;
  const [offerEnabled, setOfferEnabled] = useState(profile.offer_enabled);
  const [offerComment, setOfferComment] = useState(profile.offer_comment ?? '');
  const [offerAreas, setOfferAreas] = useState<string[]>(profile.offer_areas ?? []);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [headerUrl, setHeaderUrl] = useState<string | null>(profile.header_url);
  // ヘッダー画像は選択直後にクロップエディタ（3:1）を開く。null=モーダル非表示。
  const [headerCropFile, setHeaderCropFile] = useState<File | null>(null);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [headerUploading, setHeaderUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // 自主脱退（解除）の状態。解除済みならボタンを消す。
  const [shop, setShop] = useState<ShopMini | null>(affiliatedShop);
  const [removing, setRemoving] = useState(false);

  // アカウント削除（危険操作）の状態。二段階確認＋@handle 入力一致でのみ確定可。
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [deleting, setDeleting] = useState(false);
  // 入力が自分の handle と一致（先頭 @ は許容・大小無視）したときだけ確定ボタンを活性化。
  const confirmOk = confirmText.trim().replace(/^@/, '').toLowerCase() === profile.handle.toLowerCase();

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2600);
  };

  // 画像アップロード：x-images バケットの本人フォルダ配下（先頭フォルダ=本人UIDをRLSが要求）。
  const uploadImage = async (file: File): Promise<string | null> => {
    const verr = validateImageFile(file);
    if (verr) {
      setError(verr);
      return null;
    }
    setError('');
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${profile.auth_user_id}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('x-images').upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) {
      setError(`画像のアップロードに失敗しました: ${upErr.message}`);
      return null;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('x-images').getPublicUrl(path);
    return publicUrl;
  };

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarUploading(true);
    const url = await uploadImage(file);
    if (url) setAvatarUrl(url);
    setAvatarUploading(false);
  };

  // ヘッダーはここでアップロードせず、バリデーション後にクロップエディタを開く（保存時に切り抜き→アップロード）。
  const onHeader = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const verr = validateImageFile(file);
    if (verr) {
      setError(verr);
      return;
    }
    setError('');
    setHeaderCropFile(file);
  };

  // クロップ確定：切り抜き後の blob を webp（jpegフォールバックは拡張子.jpg）でアップロードし header_url に反映。
  const onHeaderCropSave = async (blob: Blob) => {
    setHeaderUploading(true);
    setError('');
    const ext = blob.type === 'image/jpeg' ? 'jpg' : 'webp';
    const path = `${profile.auth_user_id}/header-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from('x-images').upload(path, blob, { cacheControl: STORAGE_CACHE_CONTROL });
    if (upErr) {
      setError(`画像のアップロードに失敗しました: ${upErr.message}`);
      setHeaderUploading(false);
      setHeaderCropFile(null);
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('x-images').getPublicUrl(path);
    setHeaderUrl(publicUrl);
    setHeaderUploading(false);
    setHeaderCropFile(null);
  };

  // お店カード画像の追加（複数選択可）。空き枠（8枚まで）の分だけ順にアップロードし、超過分は無視して通知。
  const onShowcase = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const room = 8 - showcaseImages.length;
    if (room <= 0) {
      showToast('お店カード画像は8枚までです');
      return;
    }
    const take = files.slice(0, room);
    setShowcaseUploading(true);
    const uploaded: string[] = [];
    for (const file of take) {
      const url = await uploadImage(file);
      if (url) uploaded.push(url);
    }
    if (uploaded.length > 0) setShowcaseImages((prev) => [...prev, ...uploaded].slice(0, 8));
    if (files.length > room) showToast('お店カード画像は8枚までのため、超過分は追加していません');
    setShowcaseUploading(false);
  };

  const removeShowcase = (idx: number) => {
    setShowcaseImages((prev) => prev.filter((_, i) => i !== idx));
  };

  // 希望エリアの選択トグル。保存は選択順ではなく X_OFFER_AREAS の定数順に揃える。
  const toggleOfferArea = (area: string) => {
    setOfferAreas((prev) =>
      prev.includes(area)
        ? prev.filter((a) => a !== area)
        : X_OFFER_AREAS.filter((a) => a === area || prev.includes(a))
    );
  };

  const displayOk = displayName.trim().length >= 1 && displayName.trim().length <= DISPLAY_MAX;
  const busy = saving || avatarUploading || headerUploading || showcaseUploading;

  const save = async () => {
    if (!displayOk) {
      setError('表示名は1〜30文字で入力してください');
      return;
    }
    // リンク検証（http/https のみ・スキーム無しは https:// 補完・危険スキームは弾く）。空は null。
    const { url: linkUrl, error: linkErr } = normalizeLinkUrl(link);
    if (linkErr) {
      setError(linkErr);
      return;
    }
    if (busy) return;
    setSaving(true);
    setError('');
    // 変更不可フィールド（handle/kind/status/is_verified/affiliated_shop_id）は送らない＝ガードに触れない。
    const { error: upErr } = await supabase
      .from('x_profiles')
      .update({
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
        header_url: headerUrl,
        link_url: linkUrl,
        dm_disabled: dmDisabled,
        // 年齢・スリーサイズはセラピストのみ保存対象（他種別では欄を出さず、キーも送らない＝null上書き防止）。
        ...(isTherapist
          ? {
              age: toIntOrNull(age),
              height: toIntOrNull(height),
              bust: toIntOrNull(bust),
              cup: cup.trim() || null,
              waist: toIntOrNull(waist),
              hip: toIntOrNull(hip),
            }
          : {}),
        // 住所はお店アカウントのみ保存対象（他種別では欄を出さず、キーも送らない）。
        ...(isShop ? { address: address.trim() || null } : {}),
        // お店カード画像は「認証済みお店」のみ保存対象（未認証で送るとDBトリガ例外で保存全体が失敗するため）。
        ...(isShop && profile.is_verified ? { showcase_images: showcaseImages } : {}),
        // オファー系は未所属セラピストのみ保存対象（それ以外では欄を出さず、キーも送らない＝ガードトリガ回避）。
        ...(canOffer
          ? {
              offer_enabled: offerEnabled,
              offer_comment: offerComment.trim() || null,
              offer_areas: offerAreas,
            }
          : {}),
      })
      .eq('id', profile.id);
    setSaving(false);
    if (upErr) {
      setError(`保存に失敗しました：${upErr.message}`);
      return;
    }
    showToast('保存しました');
    router.refresh();
    setTimeout(() => router.push(`/x/u/${profile.handle}`), 900);
  };

  // セラピストの自主脱退：自分の profile id を渡して所属解除 RPC を呼ぶ。
  const leaveShop = async () => {
    if (removing || !shop) return;
    if (!window.confirm(`「${shop.displayName}」への所属を解除しますか？`)) return;
    setRemoving(true);
    const { error: rpcErr } = await supabase.rpc('x_affiliation_remove', {
      p_therapist_profile_id: profile.id,
    });
    setRemoving(false);
    if (rpcErr) {
      showToast(rpcErr.message);
      return;
    }
    setShop(null);
    showToast('所属を解除しました');
    router.refresh();
  };

  // アカウント削除の確定。多重実行防止（deleting ガード＋ボタン disabled）。
  // 成功後はサインアウトせず（auth は本体と共有）、プロフィール無しでも見られる /x へハード遷移。
  // ハードナビゲーションにすることで、削除済み（x_profiles 無し）状態をサーバーから取り直す。
  const handleDeleteAccount = async () => {
    if (deleting || !confirmOk) return;
    setDeleting(true);
    setError('');
    const res = await deleteMyXAccount();
    if (!res.ok) {
      setDeleting(false);
      setError(res.error);
      return;
    }
    window.location.assign('/x');
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium text-center">
          ⚠️ {error}
        </div>
      )}

      {/* ── ヘッダー画像 ── */}
      <div>
        <p className="text-[11px] font-bold text-[color:var(--x-text-muted)] mb-2 px-1">ヘッダー画像（任意・横長）</p>
        {/* 高さはプロフィール表示（XProfileView）と同じ: スマホ123px / PC202px */}
        <div className="relative h-[123px] sm:h-[202px] rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-100 to-sky-100 border border-[color:var(--x-border)]">
          {headerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headerUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <label className="px-3 py-2 rounded-xl border border-indigo-300 text-[color:var(--x-accent)] text-xs font-bold hover:bg-indigo-50 cursor-pointer transition-colors">
            {headerUploading ? 'アップ中...' : headerUrl ? '変更' : '画像を選ぶ'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onHeader} disabled={headerUploading} className="hidden" />
          </label>
          {headerUrl && (
            <button type="button" onClick={() => setHeaderUrl(null)} className="text-xs text-[color:var(--x-text-muted)] hover:text-rose-500 transition-colors">
              削除
            </button>
          )}
        </div>
      </div>

      {/* ── アバター ── */}
      <div>
        <p className="text-[11px] font-bold text-[color:var(--x-text-muted)] mb-2 px-1">アイコン画像（任意）</p>
        <div className="flex items-center gap-3">
          <span className="relative w-16 h-16 rounded-full overflow-hidden border-2 border-white shadow-sm bg-gradient-to-br from-indigo-300 to-sky-300 flex items-center justify-center flex-shrink-0">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <span className="text-white font-bold text-xl">{displayName.charAt(0) || '?'}</span>
            )}
          </span>
          <div className="flex items-center gap-2">
            <label className="px-3 py-2 rounded-xl border border-indigo-300 text-[color:var(--x-accent)] text-xs font-bold hover:bg-indigo-50 cursor-pointer transition-colors">
              {avatarUploading ? 'アップ中...' : avatarUrl ? '変更' : '画像を選ぶ'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatar} disabled={avatarUploading} className="hidden" />
            </label>
            {avatarUrl && (
              <button type="button" onClick={() => setAvatarUrl(null)} className="text-xs text-[color:var(--x-text-muted)] hover:text-rose-500 transition-colors">
                削除
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-[color:var(--x-text-muted)] mt-1.5">JPEG・PNG・WebP・5MB以下。</p>
      </div>

      {/* ── 表示名 ── */}
      <div>
        <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block mb-1.5 px-1">表示名</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="表示名を入力"
          maxLength={DISPLAY_MAX}
          className="w-full px-4 py-3 rounded-xl border border-[color:var(--x-border-strong)] text-sm bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        <p className="text-[11px] text-[color:var(--x-text-muted)] mt-1 text-right">
          {displayName.length}/{DISPLAY_MAX}
        </p>
      </div>

      {/* ── 自己紹介 ── */}
      <div>
        <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block mb-1.5 px-1">自己紹介（任意）</label>
        <textarea
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="自己紹介を入力"
          maxLength={BIO_MAX}
          className="w-full px-4 py-3 rounded-xl border border-[color:var(--x-border-strong)] text-sm bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none"
        />
        <p className="text-[11px] text-[color:var(--x-text-muted)] mt-1 text-right">
          {bio.length}/{BIO_MAX}
        </p>
      </div>

      {/* ── リンク（任意・http/https のみ）── text-base(16px) で iOS 自動ズーム抑止 */}
      <div>
        <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block mb-1.5 px-1">リンク（任意）</label>
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://example.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full px-4 py-3 rounded-xl border border-[color:var(--x-border-strong)] text-base bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        <p className="text-[10px] text-[color:var(--x-text-muted)] mt-1 px-1">http:// または https:// のリンク（プロフィールに表示されます）</p>
      </div>

      {/* ── プライバシー：DM受付（全kind共通） ── */}
      <div className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={dmDisabled}
            onChange={(e) => setDmDisabled(e.target.checked)}
            className="mt-0.5 w-4 h-4 accent-indigo-500 flex-shrink-0"
          />
          <span>
            <span className="text-sm font-bold text-[color:var(--x-text-primary)]">メッセージ（DM）を受け付けない</span>
            <span className="block text-[11px] text-[color:var(--x-text-muted)] mt-1 leading-relaxed">
              オンにすると誰からもメッセージを受け取れません。既存の会話への送信も（あなた・相手とも）できなくなります。
            </span>
          </span>
        </label>
      </div>

      {/* ── オファー受付（求人スカウト・未所属セラピストのみ）── お店・運営にのみ /x/offers で表示される ── */}
      {canOffer && (
        <div className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={offerEnabled}
              onChange={(e) => setOfferEnabled(e.target.checked)}
              className="mt-0.5 w-4 h-4 accent-indigo-500 flex-shrink-0"
            />
            <span>
              <span className="text-sm font-bold text-[color:var(--x-text-primary)]">オファーを受け付ける（お店・運営にのみ表示されます）</span>
              <span className="block text-[11px] text-[color:var(--x-text-muted)] mt-1 leading-relaxed">
                オンにすると、認証済みのお店・運営が見られるオファー一覧に表示され、フォローなしでメッセージを受け取れます。所属が決まると自動で一覧から外れます。
              </span>
            </span>
          </label>

          {offerEnabled && (
            <div className="mt-4 space-y-4">
              {/* PR文（最大300文字・任意） */}
              <div>
                <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block mb-1.5 px-1">PR文（任意）</label>
                <textarea
                  rows={4}
                  value={offerComment}
                  onChange={(e) => setOfferComment(e.target.value)}
                  placeholder="経験や希望条件など、お店へのアピールを書けます"
                  maxLength={300}
                  className="w-full px-4 py-3 rounded-xl border border-[color:var(--x-border-strong)] text-sm bg-[color:var(--x-surface)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none"
                />
                <p className="text-[11px] text-[color:var(--x-text-muted)] mt-1 text-right">{offerComment.length}/300</p>
              </div>

              {/* 希望エリア（複数選択可・固定8種） */}
              <div>
                <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block mb-2 px-1">希望エリア（複数選択可）</label>
                <div className="flex flex-wrap gap-2">
                  {X_OFFER_AREAS.map((area) => {
                    const selected = offerAreas.includes(area);
                    return (
                      <button
                        key={area}
                        type="button"
                        onClick={() => toggleOfferArea(area)}
                        className={`text-xs font-bold rounded-full px-3 py-1.5 border transition-colors ${
                          selected
                            ? 'border-indigo-400 bg-indigo-500 text-white'
                            : 'border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] hover:border-indigo-300'
                        }`}
                      >
                        {area}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 住所（お店アカウントのみ・任意）── text-base(16px) で iOS 自動ズーム抑止 */}
      {isShop && (
        <div>
          <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block mb-1.5 px-1">住所（任意）</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="例: 博多区住吉"
            className="w-full px-4 py-3 rounded-xl border border-[color:var(--x-border-strong)] text-base text-[color:var(--x-text-primary)] placeholder:text-[color:var(--x-text-muted)] bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          />
          <p className="text-[10px] text-[color:var(--x-text-muted)] mt-1 px-1">プロフィールの @ID の横に表示されます。</p>
        </div>
      )}

      {/* ── お店カード画像（認証済みお店のみ・最大8枚）── タイムライン「お店」タブのショーケース用 */}
      {isShop && !profile.is_verified && (
        <div className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
          <p className="text-sm font-bold text-[color:var(--x-text-primary)]">お店カード画像</p>
          <p className="text-[12px] text-[color:var(--x-text-secondary)] mt-1 leading-relaxed">
            お店カード画像は、フクエス認証済みのお店のみ設定できます。
          </p>
        </div>
      )}
      {isShop && profile.is_verified && (
        <div>
          <p className="text-[11px] font-bold text-[color:var(--x-text-muted)] mb-1.5 px-1">お店カード画像（8枚まで）</p>
          <p className="text-[10px] text-[color:var(--x-text-muted)] mb-2 px-1 leading-relaxed">
            タイムラインの「お店」タブに、店名と一緒に表示されます（4列×2段）。主にセラピスト画像の設定を想定しています。
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {showcaseImages.map((url, i) => (
              <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-[color:var(--x-border)] bg-[color:var(--x-inset)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`お店カード画像${i + 1}`} className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeShowcase(i)}
                  aria-label="削除"
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/60 text-white text-xs font-bold flex items-center justify-center hover:bg-rose-500 transition-colors"
                >
                  ✕
                </button>
              </div>
            ))}
            {showcaseImages.length < 8 && (
              <label className="aspect-square rounded-lg border-2 border-dashed border-indigo-200 text-indigo-500 flex flex-col items-center justify-center cursor-pointer hover:bg-indigo-50 transition-colors">
                <span className="text-lg leading-none">＋</span>
                <span className="text-[10px] font-bold mt-0.5">{showcaseUploading ? 'アップ中...' : '追加'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={onShowcase}
                  disabled={showcaseUploading}
                  className="hidden"
                />
              </label>
            )}
          </div>
          <p className="text-[10px] text-[color:var(--x-text-muted)] mt-1.5 px-1">JPEG・PNG・WebP・5MB以下。承認済みで1枚以上設定すると「お店」タブに表示されます。</p>
        </div>
      )}

      {/* ── 年齢・スリーサイズ（セラピストアカウントのみ・すべて任意）── text-base(16px) で iOS 自動ズーム抑止 */}
      {isTherapist && (
      <div className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4">
        <p className="text-[11px] font-bold text-[color:var(--x-text-muted)] mb-3 px-1">年齢・スリーサイズ（任意）</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="年齢" unit="歳" value={age} onChange={setAge} />
          <NumberField label="身長 T" unit="cm" value={height} onChange={setHeight} />
          <NumberField label="バスト B" unit="cm" value={bust} onChange={setBust} />
          <div>
            <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block mb-1.5 px-1">カップ</label>
            <input
              type="text"
              value={cup}
              onChange={(e) => setCup(e.target.value)}
              placeholder="例: F"
              maxLength={4}
              autoCapitalize="characters"
              className="w-full px-4 py-3 rounded-xl border border-[color:var(--x-border-strong)] text-base text-[color:var(--x-text-primary)] placeholder:text-[color:var(--x-text-muted)] bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          <NumberField label="ウエスト W" unit="cm" value={waist} onChange={setWaist} />
          <NumberField label="ヒップ H" unit="cm" value={hip} onChange={setHip} />
        </div>
        <p className="text-[10px] text-[color:var(--x-text-muted)] mt-2 px-1">入力した項目だけ「@ID」の横に表示されます。空欄の項目は表示されません。</p>
      </div>
      )}

      {/* ── 変更不可（読み取り専用）：ID・種別・ログインメール ── */}
      <div className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-4 space-y-3">
        <p className="text-[11px] font-bold text-[color:var(--x-text-muted)]">変更できない項目</p>
        <ReadonlyRow label="ID（@ユーザー名）" value={`@${profile.handle}`} note="IDは変更できません" />
        <ReadonlyRow label="アカウント種別" value={KIND_LABEL[profile.kind] ?? profile.kind} note="種別は変更できません" />
        <ReadonlyRow label="ログインID（メールアドレス）" value={email ?? '—'} note="メールの変更は今後対応予定です" />
      </div>

      {/* ── 保存 ── */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={busy || !displayOk}
          className="flex-1 py-3.5 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
        <Link
          href={`/x/u/${profile.handle}`}
          className="px-5 py-3.5 rounded-xl border border-[color:var(--x-border-strong)] text-[color:var(--x-text-secondary)] font-bold text-sm hover:border-slate-300 transition-colors"
        >
          キャンセル
        </Link>
      </div>

      {/* ── 所属の解除（自主脱退）：所属ありセラピストのみ ── */}
      {profile.kind === 'therapist' && shop && (
        <div className="mt-2 rounded-2xl border border-rose-100 bg-rose-50/50 p-4">
          <p className="text-sm font-bold text-slate-800">所属の解除</p>
          <p className="text-[12px] text-slate-500 mt-0.5 mb-3 leading-relaxed">
            現在「<span className="font-bold">{shop.displayName}</span>」に所属しています。解除すると、あなたのプロフィール・投稿から所属表示が消え、店舗の所属一覧からも外れます。
          </p>
          <button
            type="button"
            onClick={leaveShop}
            disabled={removing}
            className="px-4 py-2 rounded-lg border border-rose-200 text-rose-600 bg-[color:var(--x-surface)] text-xs font-bold hover:bg-rose-100 transition-colors disabled:opacity-50"
          >
            {removing ? '解除中...' : '所属を解除する'}
          </button>
        </div>
      )}

      {/* ── アカウント削除（危険操作・ページ最下部）。二段階確認＋@handle 入力一致で確定。 ── */}
      <div className="mt-2 rounded-2xl border-2 border-rose-300 bg-rose-50/60 p-4">
        <p className="text-sm font-black text-rose-700">アカウント削除</p>

        {!deleteOpen ? (
          <>
            <p className="text-[12px] text-slate-600 mt-1 mb-3 leading-relaxed">
              fukuX アカウントを削除します。
            </p>
            <button
              type="button"
              onClick={() => {
                setError('');
                setDeleteOpen(true);
              }}
              className="px-4 py-2 rounded-lg border border-rose-300 text-rose-600 bg-[color:var(--x-surface)] text-xs font-bold hover:bg-rose-100 transition-colors"
            >
              アカウントを削除する
            </button>
          </>
        ) : (
          <div className="mt-2">
            <p className="text-[12px] text-slate-700 leading-relaxed">
              fukuX アカウントを削除すると、
              <span className="font-bold">プロフィール・投稿・フォロー・いいね・保存・メッセージ・通知</span>
              がすべて削除され、<span className="font-bold text-rose-700">二度と復元できません</span>。
            </p>

            <label className="block text-[12px] font-bold text-slate-600 mt-3 mb-1">
              確認のため、あなたのID <span className="text-rose-600 font-black">@{profile.handle}</span> を入力してください
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={`@${profile.handle}`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="w-full px-4 py-3 rounded-xl border border-rose-200 text-base text-slate-900 placeholder:text-slate-400 bg-[color:var(--x-surface)] focus:outline-none focus:ring-2 focus:ring-rose-300"
            />

            <div className="flex items-center gap-2 mt-3">
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={!confirmOk || deleting}
                className="px-4 py-2.5 rounded-lg bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {deleting ? '削除中...' : '完全に削除する'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setDeleteOpen(false);
                  setConfirmText('');
                }}
                disabled={deleting}
                className="px-4 py-2.5 rounded-lg border border-[color:var(--x-border-strong)] text-slate-500 text-xs font-bold hover:border-slate-300 transition-colors disabled:opacity-50"
              >
                キャンセル
              </button>
            </div>
          </div>
        )}
      </div>

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
      )}

      {/* ヘッダー画像のクロップエディタ（3:1）。選択時に開き、保存で切り抜き→アップロード。 */}
      {headerCropFile && (
        <XImageCropModal file={headerCropFile} onCancel={() => setHeaderCropFile(null)} onSave={onHeaderCropSave} />
      )}
    </div>
  );
}

// 数値入力欄（年齢・スリーサイズ用）。text-base(16px) で iOS の自動ズームを抑止。
function NumberField({
  label,
  unit,
  value,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="text-[11px] font-bold text-[color:var(--x-text-muted)] block mb-1.5 px-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={0}
          className="w-full px-4 py-3 pr-10 rounded-xl border border-[color:var(--x-border-strong)] text-base text-[color:var(--x-text-primary)] placeholder:text-[color:var(--x-text-muted)] bg-[color:var(--x-inset)] focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[color:var(--x-text-muted)] pointer-events-none">{unit}</span>
      </div>
    </div>
  );
}

function ReadonlyRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-[color:var(--x-text-muted)]">{label}</p>
      <p className="text-sm text-[color:var(--x-text-secondary)] break-all mt-0.5">{value}</p>
      <p className="text-[10px] text-[color:var(--x-text-muted)] mt-0.5">{note}</p>
    </div>
  );
}
