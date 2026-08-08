'use client';

import { useState } from 'react';
import Link from 'next/link';
import { submitBannerReport } from '@/app/actions/bannerReport';

// フクエス本体テーマのリンクバナー設置報告フォーム（/banner/report・2026-08-08 新設）。
// fukuX版（/x/banner/report）とは Server Action・テーブル（banner_reports）を共用し、UIだけ本体テーマ。
// 相違点:
//   - 「貼ったバナーの種類」を3つのチェックボックスで選択（既定は3つともON＝無料掲載の条件）
//   - 無料掲載枠（/salons のテキスト掲載）への転記用に 地域・電話番号・公式HP を任意で受け取る
//   - source:'fukues' を渡して運営通知メールの件名を【フクエス】にする
// 入力欄は text-base(16px) 相当を確保して iOS の自動ズームを避ける。
const INPUT =
  'w-full rounded-xl border border-slate-200 px-3 py-2.5 text-base text-slate-700 bg-white focus:outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-100';
const LABEL = 'block text-[11px] font-bold text-slate-500 mb-1';
const HINT = 'text-[10px] text-slate-400 mt-1 leading-relaxed';

// チェックボックスの並び順＝/banner のバナー掲載順（本体→ワーク→fukuX）。
const SITE_OPTIONS = [
  { value: 'fukues', label: 'フクエス（本体）' },
  { value: 'work', label: 'フクエスワーク（求人）' },
  { value: 'fukux', label: 'fukuX（SNS）' },
] as const;

export function BannerReportForm() {
  const [salonName, setSalonName] = useState('');
  const [email, setEmail] = useState('');
  const [pageUrl, setPageUrl] = useState('');
  // 既定は3つともON（無料掲載の条件＝3サイト設置なので、外す人だけ外してもらう）。
  const [sites, setSites] = useState<string[]>(['fukues', 'work', 'fukux']);
  const [area, setArea] = useState('');
  const [phone, setPhone] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [xHandle, setXHandle] = useState('');
  const [comment, setComment] = useState('');
  const [website, setWebsite] = useState(''); // honeypot（画面外に隠す。人間は触らない）
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const toggleSite = (value: string) =>
    setSites((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));

  const canSubmit =
    salonName.trim() !== '' && email.trim() !== '' && pageUrl.trim() !== '' && sites.length > 0 && !sending;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError('');
    try {
      const res = await submitBannerReport({
        salonName,
        email,
        sites,
        pageUrl,
        xHandle,
        comment,
        website,
        area,
        phone,
        officialUrl,
        source: 'fukues',
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
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <p className="text-sm font-bold text-slate-800 mb-2">ご報告ありがとうございました</p>
        <p className="text-xs text-slate-500 leading-relaxed">
          当事務局でバナーの設置を確認のうえ、対応いたします。確認には数日いただく場合があります。
          <br />
          無料掲載をご希望の場合は、確認完了後に
          <Link href="/salons" className="text-pink-600 hover:underline">店舗一覧</Link>
          へ掲載いたします。
          <br />
          設置が確認できなかった場合、または返信が必要な内容の場合は、ご記入のメールアドレスへご連絡いたします。
        </p>
        <Link href="/listing" className="inline-block mt-4 text-sm font-bold text-pink-600 hover:underline">
          掲載についてのページへ戻る
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      {/* honeypot（スパムボット対策）：視覚・支援技術の双方から隠す。人間はここを埋めない。 */}
      <div className="hidden" aria-hidden="true">
        <label>
          ウェブサイト
          <input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>

      {/* ── 貼ったバナーの種類 ── */}
      <fieldset>
        <legend className={LABEL}>
          設置したバナー <span className="text-rose-400">*</span>
        </legend>
        <div className="space-y-1.5">
          {SITE_OPTIONS.map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={sites.includes(o.value)}
                onChange={() => toggleSite(o.value)}
                className="w-4 h-4 accent-pink-600"
              />
              {o.label}
            </label>
          ))}
        </div>
        <p className={HINT}>無料掲載をご希望の場合は3つすべての設置が条件です。</p>
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="br-salon-name" className={LABEL}>
            店舗名 <span className="text-rose-400">*</span>
          </label>
          <input
            id="br-salon-name"
            name="salonName"
            type="text"
            autoComplete="organization"
            value={salonName}
            onChange={(e) => setSalonName(e.target.value)}
            maxLength={100}
            required
            placeholder="例: アロマサロン〇〇 博多店"
            className={INPUT}
          />
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="br-email" className={LABEL}>
            連絡先メールアドレス <span className="text-rose-400">*</span>
          </label>
          <input
            id="br-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            maxLength={254}
            required
            placeholder="例: info@example.com"
            className={INPUT}
          />
          <p className={HINT}>設置が確認できなかった場合や、返信が必要な内容の場合のご連絡に使用します。</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="br-page-url" className={LABEL}>
            バナーを設置したページのURL <span className="text-rose-400">*</span>
          </label>
          <input
            id="br-page-url"
            name="pageUrl"
            type="url"
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
            maxLength={500}
            required
            placeholder="例: https://example.com/links"
            className={INPUT}
          />
        </div>
      </div>

      {/* ── 無料掲載をご希望の店舗様向けの任意項目 ──
          /admin「無料掲載枠」へ手入力する内容（店名・地域・電話・公式HP）をここで受け取り、
          運営から追加で問い合わせる往復をなくす。 */}
      <div className="rounded-2xl border border-pink-100 bg-pink-50/40 px-4 py-4">
        <p className="text-xs font-bold text-slate-700 mb-1">無料掲載をご希望の場合（任意）</p>
        <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
          <Link href="/salons" className="text-pink-600 hover:underline">店舗一覧</Link>
          へのテキスト掲載に使用する情報です。ご記入いただくと確認後の掲載がスムーズです。
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="br-area" className={LABEL}>所在エリア</label>
            <input
              id="br-area"
              name="area"
              type="text"
              value={area}
              onChange={(e) => setArea(e.target.value)}
              maxLength={100}
              placeholder="例: 博多・天神・北九州 など"
              className={INPUT}
            />
          </div>
          <div>
            <label htmlFor="br-phone" className={LABEL}>電話番号</label>
            <input
              id="br-phone"
              name="phone"
              type="tel"
              autoComplete="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={30}
              placeholder="例: 092-000-0000"
              className={INPUT}
            />
          </div>
          <div className="sm:col-span-2">
            <label htmlFor="br-official-url" className={LABEL}>公式ホームページのURL</label>
            <input
              id="br-official-url"
              name="officialUrl"
              type="url"
              value={officialUrl}
              onChange={(e) => setOfficialUrl(e.target.value)}
              maxLength={500}
              placeholder="例: https://example.com"
              className={INPUT}
            />
            <p className={HINT}>トップページのURLをご記入ください（上の「設置したページ」と同じ場合も改めてご記入ください）。</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor="br-x-handle" className={LABEL}>fukuXの@ID（任意）</label>
          <input
            id="br-x-handle"
            name="xHandle"
            type="text"
            value={xHandle}
            onChange={(e) => setXHandle(e.target.value)}
            maxLength={31}
            placeholder="例: @your_shop"
            className={INPUT}
          />
          <p className={HINT}>fukuXのお店アカウントをお持ちの場合、特典（お店カード画像+4枚）の開放がスムーズになります。</p>
        </div>

        <div className="sm:col-span-2">
          <label htmlFor="br-comment" className={LABEL}>補足コメント（任意）</label>
          <textarea
            id="br-comment"
            name="comment"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="補足があればご記入ください"
            className={INPUT}
          />
        </div>
      </div>

      {error && <p className="text-xs text-rose-500">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full sm:w-auto px-8 py-2.5 rounded-xl bg-pink-600 text-white text-sm font-bold hover:bg-pink-500 transition-colors disabled:opacity-40 disabled:cursor-not-allowed shadow-sm shadow-pink-500/20"
      >
        {sending ? '送信中…' : '設置を報告する'}
      </button>
    </form>
  );
}
