'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import { normalizeLinkUrl } from '../xLink';
import type { XProfile } from '../xProfile';
import type { ShopMini } from '../xAffiliation';

const supabase = createClient();

const DISPLAY_MAX = 30;
const BIO_MAX = 160;

const KIND_LABEL: Record<string, string> = { user: 'ユーザー', therapist: 'セラピスト', shop: 'お店' };

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
  // 住所（お店アカウントのみ・任意）。
  const isShop = profile.kind === 'shop';
  const [address, setAddress] = useState(profile.address ?? '');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(profile.avatar_url);
  const [headerUrl, setHeaderUrl] = useState<string | null>(profile.header_url);

  const [avatarUploading, setAvatarUploading] = useState(false);
  const [headerUploading, setHeaderUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  // 自主脱退（解除）の状態。解除済みならボタンを消す。
  const [shop, setShop] = useState<ShopMini | null>(affiliatedShop);
  const [removing, setRemoving] = useState(false);

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
    const { error: upErr } = await supabase.storage.from('x-images').upload(path, file);
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

  const onHeader = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setHeaderUploading(true);
    const url = await uploadImage(file);
    if (url) setHeaderUrl(url);
    setHeaderUploading(false);
  };

  const displayOk = displayName.trim().length >= 1 && displayName.trim().length <= DISPLAY_MAX;
  const busy = saving || avatarUploading || headerUploading;

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
        age: toIntOrNull(age),
        height: toIntOrNull(height),
        bust: toIntOrNull(bust),
        cup: cup.trim() || null,
        waist: toIntOrNull(waist),
        hip: toIntOrNull(hip),
        // 住所はお店アカウントのみ保存対象（他種別では欄を出さず、キーも送らない）。
        ...(isShop ? { address: address.trim() || null } : {}),
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

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium text-center">
          ⚠️ {error}
        </div>
      )}

      {/* ── ヘッダー画像 ── */}
      <div>
        <p className="text-[11px] font-bold text-slate-400 mb-2 px-1">ヘッダー画像（任意・横長）</p>
        <div className="relative h-28 rounded-2xl overflow-hidden bg-gradient-to-br from-indigo-100 to-sky-100 border border-slate-100">
          {headerUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={headerUrl} alt="" className="w-full h-full object-cover" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-2">
          <label className="px-3 py-2 rounded-xl border border-indigo-300 text-indigo-600 text-xs font-bold hover:bg-indigo-50 cursor-pointer transition-colors">
            {headerUploading ? 'アップ中...' : headerUrl ? '変更' : '画像を選ぶ'}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onHeader} disabled={headerUploading} className="hidden" />
          </label>
          {headerUrl && (
            <button type="button" onClick={() => setHeaderUrl(null)} className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
              削除
            </button>
          )}
        </div>
      </div>

      {/* ── アバター ── */}
      <div>
        <p className="text-[11px] font-bold text-slate-400 mb-2 px-1">アイコン画像（任意）</p>
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
            <label className="px-3 py-2 rounded-xl border border-indigo-300 text-indigo-600 text-xs font-bold hover:bg-indigo-50 cursor-pointer transition-colors">
              {avatarUploading ? 'アップ中...' : avatarUrl ? '変更' : '画像を選ぶ'}
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={onAvatar} disabled={avatarUploading} className="hidden" />
            </label>
            {avatarUrl && (
              <button type="button" onClick={() => setAvatarUrl(null)} className="text-xs text-slate-400 hover:text-rose-500 transition-colors">
                削除
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">JPEG・PNG・WebP・5MB以下。</p>
      </div>

      {/* ── 表示名 ── */}
      <div>
        <label className="text-[11px] font-bold text-slate-400 block mb-1.5 px-1">表示名</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="表示名を入力"
          maxLength={DISPLAY_MAX}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        <p className="text-[11px] text-slate-400 mt-1 text-right">
          {displayName.length}/{DISPLAY_MAX}
        </p>
      </div>

      {/* ── 自己紹介 ── */}
      <div>
        <label className="text-[11px] font-bold text-slate-400 block mb-1.5 px-1">自己紹介（任意）</label>
        <textarea
          rows={3}
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder="自己紹介を入力"
          maxLength={BIO_MAX}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent resize-none"
        />
        <p className="text-[11px] text-slate-400 mt-1 text-right">
          {bio.length}/{BIO_MAX}
        </p>
      </div>

      {/* ── リンク（任意・http/https のみ）── text-base(16px) で iOS 自動ズーム抑止 */}
      <div>
        <label className="text-[11px] font-bold text-slate-400 block mb-1.5 px-1">リンク（任意）</label>
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://example.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        <p className="text-[10px] text-slate-400 mt-1 px-1">http:// または https:// のリンク（プロフィールに表示されます）</p>
      </div>

      {/* ── 住所（お店アカウントのみ・任意）── text-base(16px) で iOS 自動ズーム抑止 */}
      {isShop && (
        <div>
          <label className="text-[11px] font-bold text-slate-400 block mb-1.5 px-1">住所（任意）</label>
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="例: 博多区住吉"
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base text-slate-900 placeholder:text-slate-400 bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
          />
          <p className="text-[10px] text-slate-400 mt-1 px-1">プロフィールの @ID の横に表示されます。</p>
        </div>
      )}

      {/* ── 年齢・スリーサイズ（すべて任意・プロフィールに表示されます）── text-base(16px) で iOS 自動ズーム抑止 */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
        <p className="text-[11px] font-bold text-slate-400 mb-3 px-1">年齢・スリーサイズ（任意）</p>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="年齢" unit="歳" value={age} onChange={setAge} />
          <NumberField label="身長 T" unit="cm" value={height} onChange={setHeight} />
          <NumberField label="バスト B" unit="cm" value={bust} onChange={setBust} />
          <div>
            <label className="text-[11px] font-bold text-slate-400 block mb-1.5 px-1">カップ</label>
            <input
              type="text"
              value={cup}
              onChange={(e) => setCup(e.target.value)}
              placeholder="例: F"
              maxLength={4}
              autoCapitalize="characters"
              className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
            />
          </div>
          <NumberField label="ウエスト W" unit="cm" value={waist} onChange={setWaist} />
          <NumberField label="ヒップ H" unit="cm" value={hip} onChange={setHip} />
        </div>
        <p className="text-[10px] text-slate-400 mt-2 px-1">入力した項目だけ「@ID」の横に表示されます。空欄の項目は表示されません。</p>
      </div>

      {/* ── 変更不可（読み取り専用）：ID・種別・ログインメール ── */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4 space-y-3">
        <p className="text-[11px] font-bold text-slate-400">変更できない項目</p>
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
          className="px-5 py-3.5 rounded-xl border border-slate-200 text-slate-500 font-bold text-sm hover:border-slate-300 transition-colors"
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
            className="px-4 py-2 rounded-lg border border-rose-200 text-rose-600 bg-white text-xs font-bold hover:bg-rose-100 transition-colors disabled:opacity-50"
          >
            {removing ? '解除中...' : '所属を解除する'}
          </button>
        </div>
      )}

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-slate-900/90 text-white text-sm font-bold shadow-lg">
          {toast}
        </div>
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
      <label className="text-[11px] font-bold text-slate-400 block mb-1.5 px-1">{label}</label>
      <div className="relative">
        <input
          type="number"
          inputMode="numeric"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          min={0}
          className="w-full px-4 py-3 pr-10 rounded-xl border border-slate-200 text-base text-slate-900 placeholder:text-slate-400 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">{unit}</span>
      </div>
    </div>
  );
}

function ReadonlyRow({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-400">{label}</p>
      <p className="text-sm text-slate-500 break-all mt-0.5">{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{note}</p>
    </div>
  );
}
