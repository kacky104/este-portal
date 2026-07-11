'use client';

import { useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { submitSalonIntake, createIntakePhotoUploadUrl } from '@/app/actions/salonIntake';
import { AREA_ORDER, ALL_AREA, DISPATCH_AREA } from '@/app/lib/areas';

// 新規店舗の初回情報入力フォーム（未ログイン・ワンタイムURL）。
// 写真は Server Action が発行する署名付きURLで salon-intake-photos へ直接アップロード
// （anon の storage 書き込みポリシーは無し＝トークン検証を通した人だけがアップできる）。
const supabase = createClient();

const PHOTO_BUCKET = 'salon-intake-photos';
const MAX_PHOTOS = 10;

// エリア候補（全域・出張はサロンの所在エリアではないため除外。出張対応は備考で受ける）。
const AREA_CHOICES = AREA_ORDER.filter((a) => a !== ALL_AREA && a !== DISPATCH_AREA);

const INPUT =
  'w-full px-3 py-2.5 rounded-xl border border-slate-200 text-base bg-white focus:outline-none focus:ring-2 focus:ring-pink-200';
const LABEL = 'text-[11px] font-bold text-slate-500 block mb-1';
const REQ = <span className="text-rose-400 ml-0.5">*</span>;

function validatePhotoFile(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

export function SalonIntakeForm({ token }: { token: string }) {
  const [salonName, setSalonName] = useState('');
  const [area, setArea] = useState('');
  const [area2, setArea2] = useState('');
  const [address, setAddress] = useState('');
  const [access, setAccess] = useState('');
  const [phone, setPhone] = useState('');
  const [hours, setHours] = useState('');
  const [closedDays, setClosedDays] = useState('');
  const [priceCourses, setPriceCourses] = useState('');
  const [description, setDescription] = useState('');
  const [paymentMethods, setPaymentMethods] = useState('');
  const [officialUrl, setOfficialUrl] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [note, setNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]); // アップロード済み公開URL
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  // 写真アップロード（複数可・空き枠ぶんだけ順次）。
  const onPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) {
      setError(`写真は${MAX_PHOTOS}枚までです`);
      return;
    }
    setError('');
    setUploading(true);
    const added: string[] = [];
    for (const file of files.slice(0, room)) {
      const bad = validatePhotoFile(file);
      if (bad) { setError(bad); continue; }
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg';
      const res = await createIntakePhotoUploadUrl(token, ext);
      if (!res.ok) { setError(res.error); break; }
      const { error: upErr } = await supabase.storage
        .from(PHOTO_BUCKET)
        .uploadToSignedUrl(res.path, res.signedToken, file);
      if (upErr) { setError('写真のアップロードに失敗しました。時間をおいてお試しください'); break; }
      added.push(res.publicUrl);
    }
    if (added.length > 0) setPhotos((prev) => [...prev, ...added].slice(0, MAX_PHOTOS));
    setUploading(false);
  };

  const removePhoto = (url: string) => setPhotos((prev) => prev.filter((u) => u !== url));

  const canSubmit =
    salonName.trim() !== '' && address.trim() !== '' && contactName.trim() !== '' && contactEmail.trim() !== '' &&
    !sending && !uploading;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setSending(true);
    setError('');
    const res = await submitSalonIntake(token, {
      salonName, area, area2, address, access, phone, hours, closedDays,
      priceCourses, description, paymentMethods, officialUrl,
      contactName, contactEmail, note, photoUrls: photos,
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
          <label className={LABEL}>エリア</label>
          <select value={area} onChange={(e) => setArea(e.target.value)} className={INPUT}>
            <option value="">選択してください</option>
            {AREA_CHOICES.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL}>第2エリア（任意・複数エリアで営業の場合）</label>
          <select value={area2} onChange={(e) => setArea2(e.target.value)} className={INPUT}>
            <option value="">なし</option>
            {AREA_CHOICES.filter((a) => a !== area).map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL}>住所{REQ}</label>
          <input type="text" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} placeholder="例: 福岡市博多区◯◯ 1-2-3 ◯◯ビル601" className={INPUT} />
          <p className="text-[10px] text-slate-400 mt-1">ビル名・号室まで公開したくない場合は、備考欄にその旨をご記入ください。</p>
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
          <label className={LABEL}>料金・コース</label>
          <textarea value={priceCourses} onChange={(e) => setPriceCourses(e.target.value)} maxLength={2000} rows={5} placeholder={'例:\n60分 10,000円\n90分 14,000円\n120分 18,000円\n指名料 1,000円 / 交通費 実費'} className={INPUT} />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL}>お店の紹介文・アピールポイント</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={5} placeholder="お店の雰囲気・コンセプト・強みなど、自由にご記入ください" className={INPUT} />
        </div>

        <div className="sm:col-span-2">
          <label className={LABEL}>支払い方法</label>
          <input type="text" value={paymentMethods} onChange={(e) => setPaymentMethods(e.target.value)} maxLength={200} placeholder="例: 現金・クレジットカード・PayPay" className={INPUT} />
        </div>
      </div>

      {/* 写真 */}
      <div>
        <label className={LABEL}>写真（任意・{MAX_PHOTOS}枚まで）</label>
        <p className="text-[10px] text-slate-400 mb-2">
          ロゴ・店内・施術ルームなどの写真をお送りください（JPEG・PNG・WebP、各5MB以下）。あとからメール等での追加も可能です。
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          {photos.map((url) => (
            <div key={url} className="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt="アップロード済み写真" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removePhoto(url)}
                aria-label="削除"
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-slate-900/60 text-white text-xs font-bold flex items-center justify-center hover:bg-rose-500 transition-colors"
              >
                ✕
              </button>
            </div>
          ))}
          {photos.length < MAX_PHOTOS && (
            <label className="aspect-square rounded-lg border-2 border-dashed border-pink-200 text-pink-500 flex flex-col items-center justify-center cursor-pointer hover:bg-pink-50 transition-colors">
              <span className="text-lg leading-none">＋</span>
              <span className="text-[10px] font-bold mt-0.5">{uploading ? 'アップ中...' : '追加'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={onPhotos} disabled={uploading} className="hidden" />
            </label>
          )}
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
