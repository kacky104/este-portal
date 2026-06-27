'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';
import type { XKind } from '../xProfile';

const supabase = createClient();

// handle（@ID）：英数字とアンダースコア、3〜20文字。
const HANDLE_RE = /^[A-Za-z0-9_]{3,20}$/;
const DISPLAY_MAX = 30;
const BIO_MAX = 160;

// 種別と権限の一言説明（DB側はRLSで強制済み。ここはUI表示のみ）。
const KINDS: { key: XKind; label: string; desc: string }[] = [
  { key: 'user', label: 'ユーザー', desc: '見る・フォローする専用（投稿はできません）' },
  { key: 'therapist', label: 'セラピスト', desc: '投稿できます／フォロワーを集められます（フォローはしません）' },
  { key: 'shop', label: 'お店', desc: '投稿・フォロー・フォロワーすべて可能（運営確認で認証バッジが付きます）' },
];

type HandleState = 'idle' | 'bad' | 'checking' | 'ok' | 'taken';

function validateImageFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

export function OnboardingForm({ userId }: { userId: string }) {
  const router = useRouter();

  const [kind, setKind] = useState<XKind>('user');
  const [handle, setHandle] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const [handleState, setHandleState] = useState<HandleState>('idle');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState<null | 'user' | 'therapist' | 'shop'>(null);

  // ── handle のリアルタイム検証（形式→重複） ──
  useEffect(() => {
    if (!handle) {
      setHandleState('idle');
      return;
    }
    if (!HANDLE_RE.test(handle)) {
      setHandleState('bad');
      return;
    }
    let cancelled = false;
    setHandleState('checking');
    const t = setTimeout(async () => {
      const { data } = await supabase.from('x_profiles').select('handle').eq('handle', handle).maybeSingle();
      if (cancelled) return;
      setHandleState(data ? 'taken' : 'ok');
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [handle]);

  // ── アバター（任意）アップロード：x-images バケットの本人フォルダ配下に固定 ──
  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const verr = validateImageFile(file);
    if (verr) {
      setError(verr);
      e.target.value = '';
      return;
    }
    setError('');
    setAvatarUploading(true);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${userId}/${Date.now()}.${ext}`; // RLS が先頭フォルダ = 本人UID を要求
    const { error: upErr } = await supabase.storage.from('x-images').upload(path, file);
    if (upErr) {
      setError(`画像のアップロードに失敗しました: ${upErr.message}`);
      setAvatarUploading(false);
      e.target.value = '';
      return;
    }
    const {
      data: { publicUrl },
    } = supabase.storage.from('x-images').getPublicUrl(path);
    setAvatarUrl(publicUrl);
    setAvatarUploading(false);
    e.target.value = '';
  };

  const displayOk = displayName.trim().length >= 1 && displayName.trim().length <= DISPLAY_MAX;
  const canSubmit = handleState === 'ok' && displayOk && !submitting && !avatarUploading;

  const submit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError('');
    // status はトリガが自動設定するため送らない。auth_user_id は本人UID固定（RLSが auth.uid() 一致を要求）。
    const { data, error: insErr } = await supabase
      .from('x_profiles')
      .insert({
        auth_user_id: userId,
        kind,
        handle: handle.trim(),
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        avatar_url: avatarUrl,
      })
      .select('kind, status')
      .single();
    setSubmitting(false);

    if (insErr) {
      const msg = insErr.message ?? '';
      const isUnique = insErr.code === '23505' || /duplicate|unique/i.test(msg);
      if (isUnique && /handle/i.test(msg)) {
        setHandleState('taken');
        setError('このIDは使われています。別のIDをお試しください。');
        return;
      }
      if (isUnique) {
        // auth_user_id の一意制約 = 既に開設済み。トップへ。
        router.replace('/x');
        return;
      }
      setError('開設に失敗しました。時間をおいて再度お試しください。');
      return;
    }

    // 新設計：全 kind が即 approved。承認待ちは無い。shop だけ認証バッジの案内を出す。
    void data; // status は参照しない（承認ゲート廃止）
    setDone(kind);
    if (kind !== 'shop') {
      setTimeout(() => {
        router.replace('/x');
        router.refresh();
      }, 1200);
    }
  };

  // ── 完了画面 ──
  if (done === 'shop') {
    return (
      <div className="py-10 text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="text-xl font-black mb-2">お店アカウントを開設しました</h2>
        <div className="mx-auto max-w-sm p-4 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-700 text-[13px] leading-relaxed">
          すぐに投稿・フォローを始められます。運営が確認すると<strong>認証バッジ</strong>が付きます。
        </div>
        <button
          type="button"
          onClick={() => {
            router.replace('/x');
            router.refresh();
          }}
          className="mt-6 inline-block px-8 py-3 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity"
          style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
        >
          fukuX を始める
        </button>
      </div>
    );
  }
  if (done) {
    return (
      <div className="py-16 text-center">
        <div className="text-4xl mb-4">🎉</div>
        <h2 className="text-xl font-black mb-1">アカウントを開設しました</h2>
        <p className="text-sm text-slate-400">fukuX へ移動します...</p>
      </div>
    );
  }

  // ── 開設フォーム ──
  const handleHint = (() => {
    switch (handleState) {
      case 'bad':
        return { text: '半角英数字とアンダースコア（_）、3〜20文字で入力してください', cls: 'text-rose-500' };
      case 'checking':
        return { text: '確認中...', cls: 'text-slate-400' };
      case 'ok':
        return { text: '✓ 使用できます', cls: 'text-emerald-600' };
      case 'taken':
        return { text: 'このIDは使われています', cls: 'text-rose-500' };
      default:
        return { text: '半角英数字とアンダースコア（_）、3〜20文字', cls: 'text-slate-400' };
    }
  })();

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-xl bg-rose-50 border border-rose-100 text-rose-500 text-[12px] font-medium text-center">
          ⚠️ {error}
        </div>
      )}

      {/* ① 種別選択 */}
      <div>
        <p className="text-[11px] font-bold text-slate-400 mb-2 px-1">アカウント種別</p>
        <div className="space-y-2">
          {KINDS.map((k) => {
            const selected = kind === k.key;
            return (
              <button
                key={k.key}
                type="button"
                onClick={() => setKind(k.key)}
                aria-pressed={selected}
                className={`w-full text-left p-3.5 rounded-2xl border transition-all ${
                  selected
                    ? 'border-indigo-400 bg-indigo-50/60 ring-1 ring-indigo-300'
                    : 'border-slate-200 bg-white hover:border-indigo-200'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`w-4 h-4 rounded-full border-2 flex-shrink-0 ${
                      selected ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300'
                    }`}
                  />
                  <span className="font-bold text-sm text-slate-900">{k.label}</span>
                </div>
                <p className="text-[12px] text-slate-500 mt-1 ml-6 leading-relaxed">{k.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* ② アバター（任意） */}
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
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                onChange={onAvatar}
                disabled={avatarUploading}
                className="hidden"
              />
            </label>
            {avatarUrl && (
              <button
                type="button"
                onClick={() => setAvatarUrl(null)}
                className="text-xs text-slate-400 hover:text-rose-500 transition-colors"
              >
                削除
              </button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-slate-400 mt-1.5">JPEG・PNG・WebP・5MB以下。あとから設定もできます。</p>
      </div>

      {/* ③ handle（@ID） */}
      <div>
        <label className="text-[11px] font-bold text-slate-400 block mb-1.5 px-1">ID（@ユーザー名）</label>
        <div className="flex items-center rounded-xl border border-slate-200 bg-slate-50/50 focus-within:ring-2 focus-within:ring-indigo-400 focus-within:border-transparent overflow-hidden">
          <span className="pl-3 pr-1 text-slate-400 font-bold select-none">@</span>
          <input
            type="text"
            value={handle}
            onChange={(e) => setHandle(e.target.value)}
            placeholder="your_id"
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 py-3 pr-3 bg-transparent text-sm focus:outline-none"
          />
        </div>
        <p className={`text-[11px] mt-1 ${handleHint.cls}`}>{handleHint.text}</p>
      </div>

      {/* ④ display_name */}
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

      {/* ⑤ bio（任意） */}
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

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        className="w-full py-3.5 rounded-xl text-white font-bold text-sm shadow-md hover:opacity-95 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
        style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
      >
        {submitting ? '作成中...' : 'アカウントを開設する'}
      </button>
      {kind === 'shop' && (
        <p className="text-[11px] text-slate-400 text-center -mt-2">
          ※ 開設後すぐに利用できます。運営が確認すると認証バッジが付きます。
        </p>
      )}
    </div>
  );
}
