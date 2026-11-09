'use client';

// コネックエフ「運営お問い合わせ」（第1868便・2026-11-10・カッキーさん）。
// ★ ベンリーの「お問合せ」と同じ考え方: 不具合はできるだけ詳しく書いてもらう／
//   早く直すため、運営が管理画面にログインして直接直すことがあると、送る前に必ず目に入る所に書く。

import { useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import { getConecfInquiryDefaults, submitConecfInquiry } from '@/app/actions/conecfInquiry';

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const INPUT = 'w-full border border-slate-200 bg-white px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-sky-200';
const KINDS = ['不具合', '使い方のご質問', 'ご要望', 'その他'];

const BUG_HINT = `不具合の場合は、次のことをできるだけ詳しくお書きください。

・いつ（例: 11/10 0:15ごろ）
・どの画面で（例: 出勤スケジュール、セラピスト登録状況一覧）
・どのサイト・どのセラピストで（例: 駅ちか（福岡市・博多）の○○さん）
・何をしたら（例: 「保存する」を押したら）
・どうなったか（例: 「失敗しました」と出た／サイトに反映されない）
・表示されたメッセージ（そのまま書き写してください）`;

function Form({ onToast }: { onToast: (m: string) => void }) {
  const [kind, setKind] = useState('不具合');
  const [contactName, setContactName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [body, setBody] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => { void getConecfInquiryDefaults().then((d) => setEmail((e) => e || d.email)); }, []);

  const submit = async () => {
    if (!agree) { onToast('「ご注意」を確認して、チェックを入れてください'); return; }
    setBusy(true);
    try {
      const r = await submitConecfInquiry({ kind, contactName, email, phone, body });
      if (!r.ok) { onToast(r.error); return; }
      setSent(true); setBody(''); setAgree(false);
      onToast('送信しました。運営からご連絡いたします');
    } finally { setBusy(false); }
  };

  if (sent) {
    return (
      <div className={`${CARD} p-6 space-y-3`}>
        <p className="text-[17px] font-black text-slate-800">お問い合わせを受け付けました</p>
        <p className="text-[14px] text-slate-600 leading-relaxed">内容を確認し、ご連絡先メールアドレスへご返信いたします。状況の確認のため、管理画面にログインして調べることがあります。</p>
        <button type="button" onClick={() => setSent(false)} className="px-4 py-2 border border-slate-300 bg-white text-[14px] font-bold text-slate-600 hover:bg-slate-50">続けてお問い合わせする</button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <p className="text-[14.5px] text-slate-700">お問い合わせの内容をご入力ください。</p>

      <div className="border border-amber-300 bg-amber-50 px-4 py-3 space-y-1.5">
        <p className="text-[15px] font-black text-rose-600">ご注意</p>
        <ul className="text-[13.5px] text-rose-600 leading-relaxed list-disc pl-5 space-y-1">
          <li>不具合の場合は、<b className="font-bold">発生した日時・画面・サイト・セラピスト名・行った操作・表示されたメッセージ</b>を、できるだけ詳しくご記入ください。詳しいほど早く直せます。</li>
          <li>早期改善のため、運営がお客様の管理画面（コネックエフ・各サイトの管理画面）に<b className="font-bold">ログインし、設定の確認や直接の修正</b>を行うことがあります。</li>
          <li>調査のため、テスト用のデータや出勤時刻などを一時的に登録する場合があります。調査が終わりしだい、すみやかに元の状態に戻します。</li>
          <li>ご都合の悪いことがある場合（触ってほしくない設定・時間帯など）は、お問い合わせ内容にお書き添えください。</li>
        </ul>
      </div>

      <div className={`${CARD} divide-y divide-slate-100`}>
        <Row label="種別" required>
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`px-3 py-1.5 border text-[14px] font-bold ${kind === k ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50'}`}>{k}</button>
            ))}
          </div>
        </Row>
        <Row label="ご担当者様名">
          <input className={INPUT} value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="例：鈴木 太郎" maxLength={50} />
        </Row>
        <Row label="ご連絡先メールアドレス" required>
          <input className={INPUT} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="例：info@example.com" maxLength={200} />
        </Row>
        <Row label="ご連絡先電話番号">
          <input className={INPUT} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="例：090-0000-0000" maxLength={30} />
        </Row>
        <Row label="お問い合わせ内容" required>
          <textarea className={`${INPUT} min-h-[280px] bg-amber-50/40 leading-relaxed`} value={body} onChange={(e) => setBody(e.target.value)}
            placeholder={kind === '不具合' ? BUG_HINT : 'お問い合わせ内容をご入力ください'} maxLength={4000} />
          <p className="mt-1 text-right text-[12px] text-slate-400">{body.length} / 4000</p>
        </Row>
      </div>

      <label className="flex items-start gap-2 text-[14px] text-slate-700">
        <input type="checkbox" className="mt-1" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>「ご注意」を確認しました（調査・修正のため、運営が管理画面にログインして直接直すことがあることに同意します）</span>
      </label>

      <button type="button" disabled={busy || !agree || body.trim() === '' || email.trim() === ''} onClick={() => void submit()}
        className="w-full md:w-auto px-8 py-3 bg-sky-600 text-white text-[15px] font-bold hover:bg-sky-700 disabled:opacity-40">
        {busy ? '送信しています…' : '運営へ送信する'}
      </button>
    </div>
  );
}

function Row({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col md:flex-row gap-2 md:gap-4 px-4 py-3">
      <div className="md:w-[200px] flex-none flex items-center gap-2 text-[14px] font-bold text-slate-600 md:pt-1 md:items-start">
        {label}
        {required && <span className="px-1.5 py-0.5 bg-rose-100 text-rose-600 text-[11px] font-bold">必須</span>}
      </div>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

export default function ConecfContactPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="contact" title="運営お問い合わせ" toast={toast}>
      {() => <Form onToast={showToast} />}
    </ConecfShell>
  );
}
