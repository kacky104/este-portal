'use client';

import { useState } from 'react';
import { submitListingInquiry } from '@/app/actions/listingInquiry';

// 掲載お問い合わせフォーム（/listing）。未ログインで送信可。
// company はハニーポット（CSSで非表示・人間は空のまま）。送信成功で完了表示に切り替える。
export function ListingInquiryForm() {
  const [shopName, setShopName] = useState('');
  const [area, setArea] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [message, setMessage] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const canSubmit =
    shopName.trim() !== '' && area.trim() !== '' && contactName.trim() !== '' && email.trim() !== '' && !sending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError('');
    try {
      const res = await submitListingInquiry({ shopName, area, contactName, email, phone, website, message, company });
      if (!res.ok) {
        setError(res.error ?? '送信に失敗しました');
        return;
      }
      setDone(true);
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <p className="text-sm font-bold text-slate-800 mb-1">お問い合わせを送信しました</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          ご入力いただいたメールアドレス宛に、担当より折り返しご連絡いたします。数日お待ちください。
        </p>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100';
  const labelClass = 'text-[11px] font-bold text-slate-500 block mb-1';

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={labelClass}>店舗名 <span className="text-rose-400">*</span></label>
          <input type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} maxLength={100} required placeholder="例: アロマサロン〇〇 博多店" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>所在エリア <span className="text-rose-400">*</span></label>
          <input type="text" value={area} onChange={(e) => setArea(e.target.value)} maxLength={100} required placeholder="例: 博多・天神・北九州 など" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>ご担当者名 <span className="text-rose-400">*</span></label>
          <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={50} required placeholder="例: 山田" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>メールアドレス <span className="text-rose-400">*</span></label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required placeholder="例: owner@example.com" className={inputClass} />
        </div>
        <div>
          <label className={labelClass}>電話番号（任意）</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="例: 092-000-0000" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>店舗ホームページ等（任意）</label>
          <input type="text" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={300} placeholder="例: https://example.com" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelClass}>ご質問・メッセージ（任意）</label>
          <textarea value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5} placeholder="掲載時期のご希望やご質問など、自由にご記入ください" className={inputClass} />
        </div>
      </div>

      {/* honeypot（スパムボット対策）：視覚・支援技術の双方から隠す。人間はここを埋めない。 */}
      <div className="hidden" aria-hidden="true">
        <label>会社名<input type="text" value={company} onChange={(e) => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" /></label>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full sm:w-auto px-8 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-pink-500/20"
      >
        {sending ? '送信中…' : '送信する'}
      </button>
    </form>
  );
}
