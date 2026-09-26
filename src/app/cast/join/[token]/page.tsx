'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { acceptCastInviteLink, getCastInviteLinkInfo } from '@/app/actions/castInvite';

// ★ 第887便（カッキーさん）: 「リンク・QRで招待」の着地ページ。
// ★ セラピスト本人が自分のメールを入れる → 今までと同じ招待メールが届く → メールのリンクからパスワードを決めて連携。
// ★ ログイン不要（リンクを持っている人＝本人）。★ リンクは24時間・1回だけ（判断はサーバー: acceptCastInviteLink）。

type Info = { therapistName: string; salonName: string };

export default function CastJoinPage() {
  const params = useParams<{ token: string }>();
  const token = String(params?.token ?? '');
  const [info, setInfo] = useState<Info | null>(null);
  const [error, setError] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ email: string; warning?: string } | null>(null);
  const [formError, setFormError] = useState('');

  useEffect(() => {
    let alive = true;
    getCastInviteLinkInfo({ token }).then((r) => {
      if (!alive) return;
      if (r.ok) setInfo({ therapistName: r.therapistName, salonName: r.salonName });
      else setError(r.error);
    }).catch(() => { if (alive) setError('読み込めませんでした。時間をおいて開き直してください。'); });
    return () => { alive = false; };
  }, [token]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const v = email.trim();
    if (!v) { setFormError('メールアドレスを入れてください'); return; }
    setBusy(true);
    const r = await acceptCastInviteLink({ token, email: v });
    setBusy(false);
    if (!r.ok) { setFormError(r.error); return; }
    setDone({ email: v, warning: r.warning });
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Image src="/logo.png" alt="フクエス" width={48} height={48} priority className="w-12 h-12 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-900">セラピストページ連携</h1>
          <p className="text-sm text-slate-500 mt-1">フクエス セラピスト専用ページ</p>
        </div>

        {error ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4 text-center">
            <p className="text-sm text-slate-700 leading-relaxed">{error}</p>
            <Link href="/cast/login" className="inline-block text-sm text-pink-600 font-medium hover:underline">セラピストログインへ</Link>
          </div>
        ) : !info ? (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center text-sm text-slate-400">読み込み中…</div>
        ) : done ? (
          done.warning ? (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-4 text-center">
              <p className="text-sm text-slate-700 leading-relaxed">
                <b>{done.email}</b> はすでにフクエスに登録されています。
                セラピストログインから、このメールアドレスでログインすると連携されます。
              </p>
              <Link href="/cast/login" className="block w-full py-2.5 rounded-lg bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700">
                セラピストログインへ
              </Link>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-3 text-center">
              <p className="text-sm font-bold text-slate-800">招待メールを送りました</p>
              <p className="text-sm text-slate-600 leading-relaxed">
                <b>{done.email}</b> に届いたメールのリンクを開き、パスワードを決めると連携が完了します。
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">メールが見当たらないときは、迷惑メールのフォルダも確認してください。</p>
            </div>
          )
        ) : (
          <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 space-y-5">
            <p className="text-sm text-slate-700 leading-relaxed">
              <b>{info.salonName || 'お店'}</b> の <b>{info.therapistName || 'セラピスト'}</b> さんとして、セラピストページと連携します。
            </p>
            <div>
              <label htmlFor="cast-join-email" className="block text-sm font-medium text-slate-700 mb-1.5">メールアドレス</label>
              <input
                id="cast-join-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@mail.com"
                className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:border-transparent transition"
              />
              <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">ご自分で確認できるメールアドレスを入れてください。招待メールが届きます。</p>
            </div>
            {formError && <p className="text-sm text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{formError}</p>}
            <button
              type="submit"
              disabled={busy}
              className="w-full py-2.5 rounded-lg bg-pink-600 text-white text-sm font-semibold hover:bg-pink-700 disabled:opacity-60 transition"
            >
              {busy ? '送っています…' : '招待メールを受け取る'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
