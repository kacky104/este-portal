'use client';

import { useState } from 'react';
import { submitSalonIntake } from '@/app/actions/salonIntake';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA } from '@/app/lib/areas';

// 新規店舗の初回情報入力フォーム（未ログイン・ワンタイムURL）。
// 2026-07-11 改修: 第2エリア・支払い方法・写真の入力を廃止（オーナー編集画面・別途問い合わせへ誘導）。
// 「出張専門」エリアと「出張の有無」を追加。

// エリア候補（全域は除外。出張は「出張専門」の表記で選択肢に含める）。
const AREA_CHOICES = [...AREA_ORDER.filter((a) => a !== ALL_AREA && a !== DISPATCH_AREA), '出張専門'];

const INPUT =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-base bg-white focus:outline-none focus:ring-2 focus:ring-pink-200';
const LABEL = 'text-[11px] font-bold text-slate-500 block mb-1';
const REQ = <span className="text-rose-400 ml-0.5">*</span>;

export function SalonIntakeForm({ token }: { token: string }) {
  const [salonName, setSalonName] = useState('');
  const [area, setArea] = useState('');
  const [dispatch, setDispatch] = useState(''); // 出張の有無（'あり' / 'なし'）
  const [address, setAddress] = useState('');
  const [access, setAccess] = useState('');
  const [phone, setPhone] = useState('');
  const [hours, setHours] = useState('');
  const [closedDays, setClosedDays] = useState('');
  const [description, setDescription] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [note, setNote] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const canSubmit =
    salonName.trim() !== '' && area !== '' && dispatch !== '' && address.trim() !== '' &&
    contactName.trim() !== '' && contactEmail.trim() !== '' &&
    !sending;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError('');
    const res = await submitSalonIntake(token, {
      salonName, area, area2: '', dispatch, address, access, phone, hours, closedDays,
      priceCourses: '', description, paymentMethods: '', officialUrl,
      contactName, contactEmail, note, photoUrls: [],
    });
    setSending(false);
    if (res.ok) setDone(true);
    else setError(res.error ?? '送信に失敗しました');
  };

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
        <p className="text-base font-bold text-slate-800">ご入力ありがとうございました</p>
        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          いただいた内容をもとにサロンページを作成し、担当よりご連絡いたします。
          <br />
          追加・変更のご希望はいつでも承ります。
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className={LABEL}>店舗名{REQ}</label>
          <input type="text" value={salonName} onChange={(e) => setSalonName(e.target.value)} maxLength={100} placeholder="例: アロマサロン◯◯ 博多店" className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>エリア{REQ}</label>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={INPUT}>
            <option value="">選択してください</option>
            {AREA_CHOICES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <p className="text-[10px] text-slate-400 mt-1">第2エリアも掲載したい場合は別途オプションになります。その際はお問い合わせください。</p>
        </div>
        <div>
          <label className={LABEL}>出張の有無{REQ}</label>
          <select value={dispatch} onChange={(e) => setDispatch(e.target.value)} className={INPUT}>
            <option value="">選択してください</option>
            <option value="なし">なし</option>
            <option value="あり">あり</option>
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL}>住所{REQ}</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="例: 福岡市博多区◯◯ 1-2-3 ◯◯ビル601" className={INPUT} />
          <p className="text-[10px] text-slate-400 mt-1">サイトに載せたい範囲で記入してください。</p>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL}>アクセス（最寄り駅・道順など）</label>
          <input type="text" value={access} onChange={(e) => setAccess(e.target.value)} maxLength={200} placeholder="例: 地下鉄◯◯駅 2番出口から徒歩3分" className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>電話番号</label>
          <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} placeholder="例: 092-000-0000" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>公式サイトURL</label>
          <input type="url" value={officialUrl} onChange={(e) => setOfficialUrl(e.target.value)} maxLength={300} placeholder="例: https://example.com" className={INPUT} />
        </div>

        <div>
          <label className={LABEL}>営業時間</label>
          <input type="text" value={hours} onChange={(e) => setHours(e.target.value)} maxLength={100} placeholder="例: 12:00〜翌3:00（最終受付2:00）" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>定休日</label>
          <input type="text" value={closedDays} onChange={(e) => setClosedDays(e.target.value)} maxLength={100} placeholder="例: 年中無休 / 毎週月曜" className={INPUT} />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL}>お店の紹介文・アピールポイント</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={5} placeholder="お店の雰囲気・コンセプト・強みなど、自由にご記入ください" className={INPUT} />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL}>支払い方法</label>
          <p className="text-xs text-slate-500 leading-relaxed rounded-xl border border-slate-200 bg-slate-50/50 px-3 py-2.5">
            現金のみの表示ではじまります。クレジットカード等お取り扱いの場合は、オーナー様の編集画面での操作をお願いいたします。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
        <div>
          <label className={LABEL}>ご担当者名{REQ}</label>
          <input type="text" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={50} placeholder="例: 山田" className={INPUT} />
        </div>
        <div>
          <label className={LABEL}>連絡先メールアドレス{REQ}</label>
          <input type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} maxLength={254} placeholder="例: info@example.com" className={INPUT} />
        </div>
        <div className="sm:col-span-2">
          <label className={LABEL}>備考（伝えておきたいこと・非公開希望の項目など）</label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} className={INPUT} />
        </div>
      </div>

      {/* オーナー編集画面のご案内（送信ボタン直上・最重要の案内） */}
      <div className="rounded-xl border border-pink-100 bg-pink-50/60 px-4 py-3">
        <p className="text-xs text-slate-600 leading-relaxed">
          店名とエリア以外の項目は、後からオーナー様の編集画面で変更できます。準備が整い次第、ご記入の連絡先メールアドレスにログインIDとオーナー編集ページの入り方をお送りいたします。
        </p>
      </div>

      {error && <p className="text-sm font-bold text-rose-500">{error}</p>}

      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full py-3 rounded-full text-sm font-bold text-white bg-gradient-to-r from-pink-500 to-fuchsia-500 shadow-sm disabled:opacity-50 hover:opacity-90 active:scale-[0.99] transition"
      >
        {sending ? '送信中...' : 'この内容で送信する'}
      </button>
      <p className="text-[10px] text-slate-400 text-center">
        送信は一度のみです。送信後の追加・修正は担当までお気軽にご連絡ください。
      </p>
    </form>
  );
}
