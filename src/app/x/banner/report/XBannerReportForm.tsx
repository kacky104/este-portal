'use client';

import { useState } from 'react';
import Link from 'next/link';
import { submitBannerReport } from '@/app/actions/bannerReport';
import { BANNER_SITES, BANNER_SITE_LABEL } from '../bannerSites';

// リンクバナー設置報告フォーム（未ログイン可）。送信は Server Action（バリデーション＋honeypot＋24h重複防止）。
// 入力欄は設定フォームと同じ作法: x-inset面・text-base(16px)でiOS自動ズーム抑止。
const INPUT =
  'w-full rounded-xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] px-3 py-2.5 text-base text-[color:var(--x-text-primary)] placeholder:text-[color:var(--x-text-muted)] focus:outline-none focus:ring-2 focus:ring-indigo-300';
const LABEL = 'block text-[11px] font-bold text-[color:var(--x-text-muted)] mb-1.5 px-1';

export function XBannerReportForm() {
  const [salonName, setSalonName] = useState('');
  const [email, setEmail] = useState('');
  const [sites, setSites] = useState<string[]>([]);
  const [pageUrl, setPageUrl] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [comment, setComment] = useState('');
  const [website, setWebsite] = useState(''); // honeypot（画面外に隠す。人間は触らない）
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const toggleSite = (s: string) => {
    setSites((prev) => (prev.includes(s) ? prev.filter((v) => v !== s) : [...prev, s]));
  };

  const canSubmit =
    salonName.trim().length > 0 && email.trim().length > 0 && sites.length > 0 && pageUrl.trim().length > 0 && !sending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError('');
    const res = await submitBannerReport({ salonName, email, sites, pageUrl, xHandle, comment, website });
    setSending(false);
    if (res.ok) {
      setDone(true);
    } else {
      setError(res.error ?? '送信に失敗しました');
    }
  };

  if (done) {
    return (
      <div className="rounded-2xl border border-[color:var(--x-border-strong)] bg-[color:var(--x-inset)] p-6 text-center">
        <p className="text-base font-bold text-[color:var(--x-text-primary)]">ご報告ありがとうございました</p>
        <p className="text-sm text-[color:var(--x-text-secondary)] mt-2 leading-relaxed">
          運営が設置を確認のうえ、特典（fukuXはお店カード画像の追加枠）を開放致します。
          <br />
          特典の開放をもって確認完了のご連絡に代えさせていただきます。
          <br />
          設置確認が取れなかった場合、又は返信が必要な内容の場合は、ご記入のメールアドレスへご連絡致します。
          <br />
          確認・開放には数日いただく場合があります。
        </p>
        <Link href="/x" className="inline-block mt-4 text-sm font-bold text-[color:var(--x-accent)] hover:underline">
          タイムラインへ戻る
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* honeypot: 視覚・支援技術から隠す（bot だけが埋める想定） */}
      <div className="absolute -left-[9999px] top-auto" aria-hidden="true">
        <label>
          ウェブサイト
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      <div>
        <label className={LABEL}>サロン名（必須）</label>
        <input
          type="text"
          value={salonName}
          onChange={(e) => setSalonName(e.target.value)}
          maxLength={100}
          placeholder="例: アロマサロン◯◯"
          className={INPUT}
        />
      </div>

      <div>
        <label className={LABEL}>連絡先メールアドレス（必須）</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          maxLength={254}
          placeholder="例: info@example.com"
          className={INPUT}
        />
        <p className="text-[10px] text-[color:var(--x-text-muted)] mt-1 px-1">
          設置確認が取れなかった場合や、返信が必要な内容の場合のご連絡に使用します。
        </p>
      </div>

      <div>
        <p className={LABEL}>貼ったバナーの種類（必須・複数選択可）</p>
        <div className="space-y-2">
          {BANNER_SITES.map((s) => (
            <label
              key={s}
              className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 cursor-pointer transition-colors ${
                sites.includes(s)
                  ? 'border-indigo-400 bg-[color:var(--x-inset)]'
                  : 'border-[color:var(--x-border-strong)] hover:bg-[color:var(--x-surface-hover)]'
              }`}
            >
              <input type="checkbox" checked={sites.includes(s)} onChange={() => toggleSite(s)} />
              <span className="text-sm font-bold text-[color:var(--x-text-primary)]">{BANNER_SITE_LABEL[s]}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className={LABEL}>バナーを設置したページのURL（必須）</label>
        <input
          type="url"
          value={pageUrl}
          onChange={(e) => setPageUrl(e.target.value)}
          maxLength={500}
          placeholder="例: https://example.com/links"
          className={INPUT}
        />
      </div>

      <div>
        <label className={LABEL}>fukuXの@ID（任意）</label>
        <input
          type="text"
          value={xHandle}
          onChange={(e) => setXHandle(e.target.value)}
          maxLength={31}
          placeholder="例: @your_shop"
          className={INPUT}
        />
        <p className="text-[10px] text-[color:var(--x-text-muted)] mt-1 px-1">
          fukuXのお店アカウントをお持ちの場合、特典（お店カード画像+4枚）の開放がスムーズになります。
        </p>
      </div>

      <div>
        <label className={LABEL}>補足コメント（任意）</label>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="補足があればご記入ください"
          className={INPUT}
        />
      </div>

      {error && <p className="text-sm font-bold text-rose-400">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-3 rounded-full text-sm font-bold text-white disabled:opacity-50 active:scale-[0.99] transition"
        style={{ background: 'linear-gradient(100deg,#6366F1,#8B5CF6)' }}
      >
        {sending ? '送信中...' : '設置を報告する'}
      </button>
    </form>
  );
}
