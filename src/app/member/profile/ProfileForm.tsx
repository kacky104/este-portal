'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/app/lib/supabase/client';

const NICKNAME_MAX = 20;

// 会員ニックネームの編集フォーム。
// 保存は /mypage と同じくクライアント側の supabase から行う（RLS で本人の行のみ更新可）。
// id は必ずサーバーで確定したログインユーザーの uid を使い、ユーザー入力の id は受け取らない。
export function ProfileForm({ userId, initialNickname }: { userId: string; initialNickname: string }) {
  const router = useRouter();
  const [nickname, setNickname] = useState(initialNickname);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState('');

  const handleSave = async () => {
    setSaving(true);
    setToast('');
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .upsert(
        { id: userId, nickname: nickname.trim() || null, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      );
    setSaving(false);
    if (error) {
      setToast('保存に失敗しました。時間をおいて再度お試しください。');
      return;
    }
    setToast('保存しました');
    // ダッシュボードへ反映（サーバー再取得）を促してから少し置いて遷移。
    router.refresh();
    setTimeout(() => router.push('/member'), 900);
  };

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="nickname" className="text-[11px] font-bold text-slate-400 block mb-1.5">
          ニックネーム
        </label>
        <input
          id="nickname"
          type="text"
          value={nickname}
          onChange={e => setNickname(e.target.value)}
          maxLength={NICKNAME_MAX}
          placeholder="ニックネームを入力"
          className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200"
        />
        <p className="text-[11px] text-slate-400 mt-1 text-right">{nickname.length}/{NICKNAME_MAX}</p>
      </div>

      {toast && (
        <p className={`text-sm font-medium ${toast === '保存しました' ? 'text-emerald-600' : 'text-rose-500'}`}>
          {toast}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 rounded-xl text-white font-bold text-sm shadow-sm disabled:opacity-50 transition-opacity"
          style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
        >
          {saving ? '保存中...' : '保存する'}
        </button>
        <Link href="/member" className="text-sm font-medium text-slate-500 hover:text-pink-600 transition-colors">
          マイページに戻る
        </Link>
      </div>
    </div>
  );
}
