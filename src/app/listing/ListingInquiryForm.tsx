'use client';

import { useState } from 'react';
import { submitListingInquiry } from '@/app/actions/listingInquiry';

// 掲載お問い合わせフォーム（/listing）。未ログインで送信可。
// company はハニーポット（CSSで非表示・人間は空のまま）。送信成功で完了表示に切り替える。
//
// アクセシビリティ（2026-08-06）: 各 label は htmlFor で入力欄の id と紐付ける
// （ラベルタップでフォーカスが当たる／スクリーンリーダーが項目名を読む）。
// id は他ページと衝突しないよう listing- 接頭辞。name はブラウザの自動入力ヒント用。
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

  // 送信完了画面。
  // ★ 2026-08-17（第20便）に自動返信メールを追加したので、文言もそれに合わせてある。
  //   「確認メールを送った」と明示することで、届かなかった人が
  //   【アドレスを打ち間違えたかも】と自分で気づける。
  //   迷惑メールフォルダの案内も入れている（自動返信は迷惑メール判定されやすい）。
  // ★ 返信の目安「2営業日以内」は sendListingAutoReply.ts の REPLY_LEAD_TIME と対。
  //   片方だけ変えると、画面とメールで違う日数を約束することになる。
  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <p className="text-sm font-bold text-slate-800 mb-1">お問い合わせを送信しました</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          ご入力いただいたメールアドレス宛に確認メールをお送りしました。<br />
          担当より<strong className="text-slate-700">2営業日以内</strong>にご連絡いたしますので、今しばらくお待ちください。
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed mt-3">
          確認メールが届かない場合は、迷惑メールフォルダをご確認ください。
          それでも見当たらないときは、メールアドレスの入力に誤りがあった可能性があります。
          お手数ですが <a href="mailto:info@fukues.com" className="text-pink-600 hover:underline">info@fukues.com</a> までご連絡ください。
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
          <label htmlFor="listing-shop-name" className={labelClass}>店舗名 <span className="text-rose-400">*</span></label>
          <input id="listing-shop-name" name="shopName" type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} maxLength={100} required placeholder="例: アロマサロン〇〇 博多店" className={inputClass} />
        </div>
        <div>
          <label htmlFor="listing-area" className={labelClass}>所在エリア <span className="text-rose-400">*</span></label>
          <input id="listing-area" name="area" type="text" value={area} onChange={(e) => setArea(e.target.value)} maxLength={100} required placeholder="例: 博多・天神・北九州 など" className={inputClass} />
        </div>
        <div>
          <label htmlFor="listing-contact-name" className={labelClass}>ご担当者名 <span className="text-rose-400">*</span></label>
          <input id="listing-contact-name" name="contactName" type="text" autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={50} required placeholder="例: 山田" className={inputClass} />
        </div>
        <div>
          <label htmlFor="listing-email" className={labelClass}>メールアドレス <span className="text-rose-400">*</span></label>
          <input id="listing-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required placeholder="例: owner@example.com" className={inputClass} />
        </div>
        <div>
          <label htmlFor="listing-phone" className={labelClass}>電話番号（任意）</label>
          <input id="listing-phone" name="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="例: 092-000-0000" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="listing-website" className={labelClass}>店舗ホームページ等（任意）</label>
          <input id="listing-website" name="website" type="text" value={website} onChange={(e) => setWebsite(e.target.value)} maxLength={300} placeholder="例: https://example.com" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="listing-message" className={labelClass}>ご質問・メッセージ（任意）</label>
          <textarea id="listing-message" name="message" value={message} onChange={(e) => setMessage(e.target.value)} maxLength={2000} rows={5} placeholder="掲載時期のご希望やご質問など、自由にご記入ください" className={inputClass} />
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
