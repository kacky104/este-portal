'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getMyListingAgreement, submitListingAgreement, type AgreementRecord, type MyAgreementPage,
} from '@/app/actions/listingAgreement';
import {
  AGREEMENT_CHECK_LABEL, AGREEMENT_IMPORTANT, AGREEMENT_LEAD, AGREEMENT_NOTES, AGREEMENT_OPERATOR, AGREEMENT_PLEDGES,
  AGREEMENT_PRIVACY_NOTE, AGREEMENT_TERMS, AGREEMENT_TITLE, AGREEMENT_VERSION_LABEL,
  agreementInputError, normalizeAgreementInput, type AgreementInput,
} from '@/lib/listingAgreement';
import { SignaturePad, SIGNATURE_MIN_INK, type SignaturePadHandle } from '@/app/components/agreement/SignaturePad';
import { AgreementCopy } from '@/app/components/agreement/AgreementCopy';

// 広告掲載 申込書 兼 誓約書（店舗がサインするページ）（第1174便・2026-10-04・カッキーさん）。
// ★ 運営が LINE・QR で送るリンクの行き先（https://fukues.com/mypage/agreement）。全店で同じリンク。
//   /mypage の中なので、開くとログインを求める（未ログインは /owner/login → ログイン後ここへ戻る）。
//   ＝「代筆は無効」: オーナー本人のアカウントでしかサインできない。誰のアカウントでサインしたかも残る。
// ★ 店舗の入力は最小限: 代表者名だけ。店舗名・所在地・電話・メールは登録内容を入れておく（空のものがあるときだけ入力欄を開く）。
// ★ サイン済み（いまの版）なら控えを出す。内容が変わったときは「出し直す」で新しく出せる（前のものは消えない）。
// ★ 読み取りは開いたときに1回（店舗1本＋サイン1本）。文面は lib/listingAgreement.ts。

const input = 'w-full border border-slate-300 bg-white px-3 py-2.5 text-[15px] text-slate-800 focus:border-pink-400 focus:outline-none';

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="mt-6 mb-2.5 text-[16px] font-black text-slate-800 border-l-4 border-pink-500 pl-2.5">{children}</h2>;
}

export default function ListingAgreementPage() {
  const [page, setPage] = useState<MyAgreementPage | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [form, setForm] = useState<AgreementInput>(normalizeAgreementInput({}));
  const [editInfo, setEditInfo] = useState(false);
  const [checked, setChecked] = useState(false);
  const [ink, setInk] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [redo, setRedo] = useState(false);
  const [justSigned, setJustSigned] = useState<AgreementRecord | null>(null);
  const padRef = useRef<SignaturePadHandle | null>(null);

  useEffect(() => {
    let alive = true;
    void getMyListingAgreement().then((res) => {
      if (!alive) return;
      if (!res.ok) { setLoadErr(res.error); return; }
      setPage(res);
      setForm(res.prefill);
      // 登録内容に空があるときは、初めから入力欄を開いておく
      setEditInfo(!res.prefill.salonName || !res.prefill.address || !res.prefill.phone || !res.prefill.email);
    });
    return () => { alive = false; };
  }, []);

  const set = (k: keyof AgreementInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((p) => ({ ...p, [k]: e.target.value }));

  const shell = (children: React.ReactNode) => (
    <main className="min-h-screen py-6 sm:py-10 px-3 sm:px-4 print:p-0">
      <div className="max-w-2xl mx-auto">{children}</div>
    </main>
  );

  if (loadErr) {
    return shell(
      <div className="bg-white border border-slate-200 p-6 text-center">
        <p className="text-[15px] font-bold text-slate-700">{loadErr}</p>
        <Link href="/mypage" className="mt-4 inline-block bg-slate-800 px-5 py-2.5 text-[14px] font-bold text-white">マイページへ戻る</Link>
      </div>,
    );
  }
  if (!page) return shell(<p className="py-16 text-center text-[14px] text-slate-400">読み込み中…</p>);

  const signed = justSigned ?? (page.signedCurrent && !redo ? page.latest : null);

  // ── 控え（サイン済み）──
  if (signed) {
    return shell(
      <>
        <div className="mb-4 border border-emerald-300 bg-emerald-50 px-4 py-3.5 print:hidden">
          <p className="text-[16px] font-black text-emerald-800">{justSigned ? 'ご提出ありがとうございました。' : 'ご提出済みです。'}</p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-emerald-900/80">
            下が控えです。印刷や PDF での保存は「印刷する」からできます。{justSigned ? 'ご登録のメールアドレスにも、受付のお知らせをお送りしました。' : ''}
          </p>
        </div>
        <AgreementCopy record={signed} />
        <div className="mt-4 flex flex-col gap-2.5 sm:flex-row print:hidden">
          <button type="button" onClick={() => window.print()} className="flex-1 bg-pink-600 py-3.5 text-[15px] font-black text-white hover:opacity-95">印刷する</button>
          <Link href="/mypage" className="flex items-center justify-center bg-slate-800 px-6 py-3.5 text-[14.5px] font-bold text-white hover:opacity-90">マイページへ戻る</Link>
        </div>
        <p className="mt-4 text-center text-[13px] text-slate-500 print:hidden">
          店舗名・所在地・代表者などが変わったときは、
          <button type="button" onClick={() => { setJustSigned(null); setRedo(true); setChecked(false); setInk(0); }} className="font-bold text-pink-600 underline">出し直す</button>
          ことができます。
        </p>
      </>,
    );
  }

  // ── 記入してサイン ──
  const clean = normalizeAgreementInput(form);
  const inputErr = agreementInputError(clean);
  const canSend = !inputErr && checked && ink >= SIGNATURE_MIN_INK && !busy;
  const hint = inputErr ?? (!checked ? '同意のチェックを入れてください' : ink < SIGNATURE_MIN_INK ? 'サインを書いてください' : '');

  const send = async () => {
    if (!canSend || !padRef.current) return;
    setBusy(true); setErr('');
    const res = await submitListingAgreement(clean, true, padRef.current.toDataUrl());
    setBusy(false);
    if (!res.ok) { setErr(res.error); return; }
    setJustSigned(res.record);
    setRedo(false);
    window.scrollTo({ top: 0 });
  };

  const info: [string, keyof AgreementInput, string][] = [
    ['店舗名', 'salonName', 'text'],
    ['所在地', 'address', 'text'],
    ['連絡先（電話番号）', 'phone', 'tel'],
    ['メールアドレス', 'email', 'email'],
  ];

  return shell(
    <div className="bg-white border border-slate-200 px-4 py-6 sm:px-8 sm:py-8 text-slate-800">
      {page.latest && !page.signedCurrent && (
        <p className="mb-4 border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13.5px] font-bold text-amber-800">文面が新しくなりました。お手数ですが、あらためてご提出をお願いします。</p>
      )}
      <h1 className="text-[22px] sm:text-[25px] font-black tracking-tight">{AGREEMENT_TITLE}</h1>
      <p className="mt-1 text-[14px] font-bold text-slate-600">{AGREEMENT_OPERATOR} 御中</p>
      <p className="mt-4 text-[14.5px] leading-relaxed">{AGREEMENT_LEAD}</p>

      <H2>掲載規約</H2>
      <ol className="space-y-2.5">
        {AGREEMENT_TERMS.map((t, i) => (
          <li key={t.title} className="flex gap-2.5 text-[14px] leading-relaxed">
            <span className="flex-none font-black text-pink-600 tabular-nums">{i + 1}.</span>
            <span><b className="font-black">{t.title}</b>　{t.body}</span>
          </li>
        ))}
      </ol>
      <p className="mt-2.5 text-[13px] text-slate-500">
        {AGREEMENT_PRIVACY_NOTE}
        <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="ml-1 underline text-pink-600">プライバシーポリシー</Link>
      </p>

      <H2>重要事項（必ずご確認ください）</H2>
      <ul className="space-y-2.5 border border-pink-200 bg-pink-50 px-3.5 py-3.5">
        {AGREEMENT_IMPORTANT.map((t) => (
          <li key={t} className="flex gap-2 text-[14px] font-bold leading-relaxed text-slate-800">
            <span className="flex-none text-pink-600">●</span><span>{t}</span>
          </li>
        ))}
      </ul>

      <H2>誓約事項</H2>
      <ol className="space-y-2.5">
        {AGREEMENT_PLEDGES.map((t, i) => (
          <li key={i} className="flex gap-2.5 text-[14px] leading-relaxed">
            <span className="flex-none font-black text-pink-600 tabular-nums">{i + 1}.</span><span>{t}</span>
          </li>
        ))}
      </ol>

      <H2>誓約者（お申込者）ご記入欄</H2>
      <ul className="mb-3 space-y-1">
        {AGREEMENT_NOTES.map((t) => <li key={t} className="text-[12.5px] leading-relaxed text-slate-500">※ {t}</li>)}
      </ul>

      {/* ★ 第1177便（カッキーさん）: マイページはスタッフの方も開くので、ご本人が出すことと、メールで知らせることをここに書く。
          ★ 画面の案内だけ（誓約書の文面＝写しには入れない＝版は変えない） */}
      <p className="mb-3 border border-amber-300 bg-amber-50 px-3 py-2.5 text-[13.5px] font-bold leading-relaxed text-amber-900">
        店舗運営の代表者様、または媒体掲載責任者様ご本人がご記入・サインしてください。
        <span className="mt-0.5 block font-normal text-amber-800/90">提出すると、ご登録のメールアドレスに受付のお知らせが届きます。</span>
      </p>

      <label className="block">
        <span className="mb-1 block text-[13px] font-bold text-slate-700">代表者名 <span className="text-rose-500">*</span></span>
        <input type="text" value={form.representative} onChange={set('representative')} maxLength={60} autoComplete="name" placeholder="例：福岡 太郎" className={input} />
      </label>
      <label className="mt-3 block">
        <span className="mb-1 block text-[13px] font-bold text-slate-700">法人名 <span className="font-normal text-slate-400">（法人の場合だけ）</span></span>
        <input type="text" value={form.companyName} onChange={set('companyName')} maxLength={100} autoComplete="organization" className={input} />
      </label>

      {editInfo ? (
        <div className="mt-3 space-y-3">
          {info.map(([label, key, type]) => (
            <label key={key} className="block">
              <span className="mb-1 block text-[13px] font-bold text-slate-700">{label} <span className="text-rose-500">*</span></span>
              <input type={type} value={form[key]} onChange={set(key)} className={input} />
            </label>
          ))}
        </div>
      ) : (
        <div className="mt-3 border border-slate-200 bg-slate-50 px-3.5 py-3">
          <div className="flex items-center">
            <p className="text-[12.5px] font-bold text-slate-500">ご登録の内容（このまま記入されます）</p>
            <button type="button" onClick={() => setEditInfo(true)} className="ml-auto text-[13px] font-bold text-pink-600 underline">直す</button>
          </div>
          <dl className="mt-1.5 space-y-1 text-[14px]">
            {info.map(([label, key]) => (
              <div key={key} className="flex gap-2">
                <dt className="w-[7.5em] flex-none text-slate-500">{label.replace('連絡先（電話番号）', '電話番号')}</dt>
                <dd className="min-w-0 break-all font-bold">{form[key]}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <label className="mt-5 flex cursor-pointer items-start gap-3 border-2 border-slate-300 p-3">
        <input type="checkbox" className="mt-0.5 h-6 w-6 shrink-0 accent-pink-600" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
        <span className="text-[15.5px] font-bold leading-snug">{AGREEMENT_CHECK_LABEL}</span>
      </label>

      <div className="mt-4">
        <div className="mb-1 flex items-center">
          <p className="text-[13px] font-bold text-slate-700">サイン（指やマウスで書いてください）</p>
          <button type="button" onClick={() => padRef.current?.clear()} className="ml-auto text-[13px] font-bold text-slate-500 underline">書き直す</button>
        </div>
        <SignaturePad ref={padRef} onInk={setInk} />
      </div>

      {err && <p className="mt-3 text-[14px] font-bold text-rose-600">{err}</p>}
      <button type="button" disabled={!canSend} onClick={() => void send()} className="mt-4 w-full bg-pink-600 py-4 text-[17px] font-black text-white disabled:bg-slate-300">
        {busy ? '送信中…' : 'サインして提出する'}
      </button>
      {!canSend && !busy && hint && <p className="mt-2 text-center text-[12.5px] text-slate-400">{hint}</p>}
      <p className="mt-4 text-center text-[12px] text-slate-400">{AGREEMENT_VERSION_LABEL}</p>
    </div>,
  );
}
