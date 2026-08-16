'use client';

import { useState } from 'react';
import { submitHpInquiry } from '@/app/actions/hpInquiry';
import { HP_TEMPLATES, HP_COLOR_VARIANTS, type HpTemplateKey } from '@/app/lib/hpSite';
import { HP_LISTING_STATUSES } from '@/app/lib/hp/inquiryStatus';

// 公式ホームページ制作のお申し込みフォーム（/hp/templates/contact）。未ログインで送信可。
// company はハニーポット（CSSで非表示・人間は空のまま）。送信成功で完了表示に切り替える。
//
// アクセシビリティ: 各 label は htmlFor で入力欄の id と紐付ける（/listing と同じ作法）。
// id は他ページと衝突しないよう hpq- 接頭辞。name はブラウザの自動入力ヒント用。
//
// ★ 希望デザインは「ひな形を選ぶ → その ひな形のカラーだけが並ぶ」2段構え。
//   ひな形を変えたらカラーは必ず未選択に戻すこと（タイプSの 'wine' を選んだまま
//   タイプBに切り替えると、B に存在しないキーが送られてサーバー側で捨てられる）。
// ★ 選択肢は HP_TEMPLATES / HP_COLOR_VARIANTS から作る。ここにベタ書きしないこと
//   （色を増減したときにフォームだけ古いまま残る）。
export function HpInquiryForm() {
  const [shopName, setShopName] = useState('');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [listingStatus, setListingStatus] = useState('');
  const [templateKey, setTemplateKey] = useState('');
  const [colorKey, setColorKey] = useState('');
  const [note, setNote] = useState('');
  const [company, setCompany] = useState(''); // honeypot
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const colorOptions =
    templateKey && (HP_TEMPLATES as readonly { key: string }[]).some((t) => t.key === templateKey)
      ? HP_COLOR_VARIANTS[templateKey as HpTemplateKey]
      : [];

  const canSubmit =
    shopName.trim() !== '' &&
    contactName.trim() !== '' &&
    email.trim() !== '' &&
    listingStatus !== '' &&
    !sending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError('');
    try {
      const res = await submitHpInquiry({
        shopName, contactName, email, phone, listingStatus, templateKey, colorKey, note, company,
      });
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
      <div
        role="status"
        className="rounded-2xl border border-[#e6cba0] bg-white px-6 py-10 text-center shadow-sm"
      >
        <p className="text-[15px] font-bold text-[#3f342e] mb-2">お申し込みを送信しました</p>
        <p className="text-[13px] leading-relaxed text-[#6d5d53]">
          ご入力いただいたメールアドレス宛に、担当より折り返しご連絡いたします。
          <br className="hidden sm:block" />
          数日お待ちいただいてもご連絡が届かない場合は、お手数ですが
          <a href="mailto:info@fukues.com" className="mx-1 underline text-[#b98d4f] hover:text-[#9a743c]">info@fukues.com</a>
          までご連絡ください。
        </p>
      </div>
    );
  }

  const inputClass =
    'w-full rounded-xl border border-[#ecdcdc] bg-white px-3 py-2.5 text-[14px] text-[#3f342e] ' +
    'focus:outline-none focus:border-[#d5a86b] focus:ring-2 focus:ring-[#f3e2c4]';
  const labelClass = 'block mb-1 text-[12px] font-bold text-[#6d5d53]';
  const reqMark = <span className="ml-1 text-[#c9808f]">*</span>;

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl border border-[#f0dde0] bg-white p-5 sm:p-7 shadow-sm space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="hpq-shop-name" className={labelClass}>店舗名{reqMark}</label>
          <input id="hpq-shop-name" name="shopName" type="text" value={shopName} onChange={(e) => setShopName(e.target.value)} maxLength={100} required placeholder="例: アロマサロン〇〇 博多店" className={inputClass} />
        </div>
        <div>
          <label htmlFor="hpq-contact-name" className={labelClass}>ご担当者名{reqMark}</label>
          <input id="hpq-contact-name" name="contactName" type="text" autoComplete="name" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={50} required placeholder="例: 山田" className={inputClass} />
        </div>
        <div>
          <label htmlFor="hpq-email" className={labelClass}>メールアドレス{reqMark}</label>
          <input id="hpq-email" name="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={200} required placeholder="例: owner@example.com" className={inputClass} />
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="hpq-phone" className={labelClass}>電話番号（任意）</label>
          <input id="hpq-phone" name="phone" type="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="例: 092-000-0000" className={inputClass} />
        </div>
      </div>

      {/* フクエスの掲載状況（必須）。運営が優先度を判断するのに使う */}
      <fieldset className="rounded-xl border border-[#f0dde0] bg-[#fdf8f5] px-4 py-3">
        <legend className="px-1 text-[12px] font-bold text-[#6d5d53]">フクエスの掲載状況{reqMark}</legend>
        <div className="mt-1 space-y-1.5">
          {HP_LISTING_STATUSES.map((s) => (
            <label key={s.key} htmlFor={`hpq-status-${s.key}`} className="flex items-center gap-2.5 cursor-pointer py-1">
              <input
                id={`hpq-status-${s.key}`}
                type="radio"
                name="listingStatus"
                value={s.key}
                checked={listingStatus === s.key}
                onChange={(e) => setListingStatus(e.target.value)}
                required
                className="h-4 w-4 flex-none accent-[#c9808f]"
              />
              <span className="text-[13px] text-[#3f342e]">{s.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* 希望デザイン（任意）。ひな形を選ぶと、そのひな形のカラーだけが並ぶ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label htmlFor="hpq-template" className={labelClass}>希望のひな形（任意）</label>
          <select
            id="hpq-template"
            name="templateKey"
            value={templateKey}
            onChange={(e) => { setTemplateKey(e.target.value); setColorKey(''); }}
            className={inputClass}
          >
            <option value="">選択しない（相談して決める）</option>
            {HP_TEMPLATES.map((t) => (
              <option key={t.key} value={t.key}>{t.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="hpq-color" className={labelClass}>希望のカラー（任意）</label>
          <select
            id="hpq-color"
            name="colorKey"
            value={colorKey}
            onChange={(e) => setColorKey(e.target.value)}
            disabled={colorOptions.length === 0}
            className={`${inputClass} disabled:bg-[#faf6f4] disabled:text-[#a08e84]`}
          >
            <option value="">{colorOptions.length === 0 ? '先にひな形を選んでください' : '選択しない'}</option>
            {colorOptions.map((v) => (
              <option key={v.key} value={v.key}>{v.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="hpq-note" className={labelClass}>備考（任意）</label>
        <textarea id="hpq-note" name="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} rows={5} placeholder="公開のご希望時期、載せたい内容、ご質問など、自由にご記入ください" className={inputClass} />
      </div>

      {/* honeypot（スパムボット対策）：視覚・支援技術の双方から隠す。人間はここを埋めない。 */}
      <div className="hidden" aria-hidden="true">
        <label>会社名<input type="text" value={company} onChange={(e) => setCompany(e.target.value)} tabIndex={-1} autoComplete="off" /></label>
      </div>

      {error && <p role="alert" className="text-[13px] font-bold text-[#c9808f]">{error}</p>}

      <div className="pt-1">
        <button
          type="submit"
          disabled={!canSubmit}
          className="w-full sm:w-auto inline-flex items-center justify-center rounded-full px-10 py-3 text-[14px] font-bold text-white shadow-md bg-gradient-to-r from-[#d18f9d] to-[#c9808f] hover:from-[#c9808f] hover:to-[#b96f7e] transition-colors disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#f3d4da]"
        >
          {sending ? '送信中…' : 'この内容で申し込む'}
        </button>
        <p className="mt-3 text-[11px] leading-relaxed text-[#a08e84]">
          送信いただいた内容は、ホームページ制作のご連絡にのみ使用します。
          この時点では費用は発生しません。内容を確認のうえ、担当よりご連絡いたします。
        </p>
      </div>
    </form>
  );
}
