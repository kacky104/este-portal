'use client';

import { useEffect, useState } from 'react';
import {
  answerCrmGroupJoin, getCrmGroupJoinTodo, signCrmGroupApply,
  type CrmGroupApplyView, type CrmGroupApprovalView,
} from '@/app/actions/crmGroupJoin';
import { CRM_GROUP_ALERT_SOURCE_LABEL } from '@/lib/crmGroup';
import { CRM_GROUP_SIGNER_NAME_MAX } from '@/lib/crmGroupApply';

// フクエスCRM：グループ・提携店の共有を、画面で申し込む／ほかの店が加わることを認める（第1328便・2026-10-09・カッキーさん）。
//   ・署名は「名前の入力 ＋ 同意のチェック」（手書きサイン・パスワードの入れ直しは無し＝カッキーさんの決定）。
//   ・申込書: 署名待ちの店に出る。あとから足される店には、今いる全部の店が認めたあとで出る（サーバーが判定）。
//   ・確認: 今いる店に「次のお店が加わります。認めますか？」と出る。1店でも認めなければ、加わらない。
// ★★★ この画面には、相手の店の名前が出る（お互いを相手として認めるための署名なので、ここだけは隠せない）。
//   署名・承認が済んだあとは、店の名前を出さない（サーバーが返さない）。
// ★ 運営のアカウント（運営で表示中）では、署名・承認はできない（見るだけ）。

const inputCls = 'w-full border border-slate-300 bg-white px-2.5 py-2 text-[14px] focus:border-indigo-400 focus:outline-none';
const labelCls = 'mb-1 block text-[12px] font-bold text-slate-500';

type Todo = { apply: CrmGroupApplyView | null; approvals: CrmGroupApprovalView[]; isAdmin: boolean };

export function GroupJoinTodo({ salonId, fallback = null }: { salonId: number; fallback?: React.ReactNode }) {
  const [todo, setTodo] = useState<Todo | null>(null);
  const [err, setErr] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    getCrmGroupJoinTodo(salonId).then((res) => {
      if (!alive) return;
      if (!res.ok) { setErr(res.error); return; }
      setErr('');
      setTodo({ apply: res.apply, approvals: res.approvals, isAdmin: res.isAdmin });
    }).catch(() => { if (alive) setErr('読み込めませんでした（通信を確認してください）'); });
    return () => { alive = false; };
  }, [salonId, tick]);

  if (err) return <p className="mb-3 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-[13px] font-bold text-rose-700">{err}</p>;
  if (!todo) return fallback ? <p className="p-10 text-center text-[14px] text-slate-400">読み込み中です…</p> : null;
  if (!todo.apply && todo.approvals.length === 0) return <>{fallback}</>;

  return (
    <div className="mb-3 space-y-3">
      {todo.isAdmin && (
        <p className="border-l-4 border-amber-500 bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-800">
          運営で表示中のため、署名・承認はできません（見るだけです）。店舗様のアカウントで行ってください。
        </p>
      )}
      {todo.apply && (
        <ApplyCard
          salonId={salonId}
          view={todo.apply}
          readOnly={todo.isAdmin}
          // ★ 入れたら、ページごと読み直す（上のタブと、共有リストを出すため）
          onDone={(joined) => { if (joined) window.location.reload(); else setTick((n) => n + 1); }}
        />
      )}
      {todo.approvals.map((v) => (
        <ApprovalCard key={v.inviteId} salonId={salonId} view={v} readOnly={todo.isAdmin} onDone={() => window.location.reload()} />
      ))}
    </div>
  );
}

function ApplyCard({ salonId, view, readOnly, onDone }: { salonId: number; view: CrmGroupApplyView; readOnly: boolean; onDone: (joined: boolean) => void }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  if (view.signed) {
    return (
      <section className="border border-emerald-300 bg-emerald-50 p-4">
        <h2 className="text-[16px] font-black text-slate-800">お申込みを受け付けました</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-700">
          ほかのお店の署名を待っています{view.waiting ? `（${view.waiting.total}店のうち${view.waiting.signed}店が署名済み）` : ''}。全部そろうと、{CRM_GROUP_ALERT_SOURCE_LABEL}の共有が使えるようになります。
        </p>
      </section>
    );
  }

  const submit = async () => {
    setBusy(true); setErr('');
    const r = await signCrmGroupApply({ salonId, inviteId: view.inviteId, signerName: name, agree });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone(r.joined);
  };

  return (
    <section className="border border-indigo-300 bg-white">
      <h2 className="border-b border-indigo-200 bg-indigo-50 px-4 py-2.5 text-[16px] font-black text-slate-800">
        {CRM_GROUP_ALERT_SOURCE_LABEL}の共有：お申込み
      </h2>
      <div className="space-y-3 p-4">
        <p className="text-[13px] leading-relaxed text-slate-700">
          下のお店どうしで、NG・要注意のお客様を共有するためのお申込みです。参加するお店と申込書の内容を確かめて、お名前を入れ、同意のチェックを入れてください。全部のお店の署名がそろうと、共有が使えるようになります。
        </p>
        <div>
          <p className={labelCls}>参加するお店（{view.parties.length}店）</p>
          <ul className="divide-y divide-slate-100 border border-slate-200">
            {view.parties.map((p, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2 px-3 py-2 text-[14px]">
                <span className="font-bold text-slate-800">{p.name}</span>
                <span className="text-[12px] text-slate-500">{p.corp}</span>
                {p.self && <span className="bg-indigo-100 px-1.5 py-0.5 text-[11px] font-bold text-indigo-700">当店</span>}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-[11px] leading-relaxed text-slate-400">お店の顔ぶれに心当たりが無いときは、申し込まずに、運営にお知らせください。</p>
        </div>
        <div>
          <p className={labelCls}>申込書（版 {view.version}）</p>
          <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-800">{view.body}</div>
        </div>
        <div>
          <label className={labelCls}>お名前（代表の方、または任された方）<span className="text-rose-500"> 必須</span></label>
          <input className={inputCls} value={name} maxLength={CRM_GROUP_SIGNER_NAME_MAX} disabled={readOnly} onChange={(e) => setName(e.target.value)} placeholder="例）山田 太郎" />
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-[14px] font-bold text-slate-800">
          <input type="checkbox" className="mt-0.5 h-5 w-5 flex-none accent-indigo-600" checked={agree} disabled={readOnly} onChange={(e) => setAgree(e.target.checked)} />
          参加するお店と申込書の内容を読み、同意します
        </label>
        {err && <p className="whitespace-pre-line text-[13px] font-bold text-rose-600">{err}</p>}
        <button type="button" disabled={readOnly || busy || !agree || name.trim() === ''} onClick={submit} className="bg-indigo-600 px-5 py-2 text-[14px] font-bold text-white disabled:opacity-40">
          {busy ? '送信中…' : 'この内容で申し込む'}
        </button>
      </div>
    </section>
  );
}

function ApprovalCard({ salonId, view, readOnly, onDone }: { salonId: number; view: CrmGroupApprovalView; readOnly: boolean; onDone: () => void }) {
  const [name, setName] = useState('');
  const [agree, setAgree] = useState(false);
  const [sureNo, setSureNo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const send = async (approve: boolean) => {
    setBusy(true); setErr('');
    const r = await answerCrmGroupJoin({ salonId, inviteId: view.inviteId, signerName: name, approve });
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    onDone();
  };

  return (
    <section className="border border-amber-400 bg-white">
      <h2 className="border-b border-amber-300 bg-amber-50 px-4 py-2.5 text-[16px] font-black text-slate-800">
        新しいお店の参加について、確認をお願いします
      </h2>
      <div className="space-y-3 p-4">
        <p className="text-[13px] leading-relaxed text-slate-700">次のお店が、{CRM_GROUP_ALERT_SOURCE_LABEL}の共有に加わります。</p>
        <p className="border border-slate-200 px-3 py-2 text-[15px]">
          <span className="font-black text-slate-800">{view.name}</span>
          <span className="ml-2 text-[12px] text-slate-500">{view.corp}</span>
        </p>
        <p className="text-[13px] leading-relaxed text-slate-700">
          加わると、このお店にも、今までに共有した内容（{view.alertCount}件）が見えるようになります。このお店が共有した内容も、当店に見えるようになります。今いるお店が1店でも認めなければ、このお店は加わりません。
        </p>
        <div>
          <label className={labelCls}>お名前（代表の方、または任された方）<span className="text-rose-500"> 必須</span></label>
          <input className={inputCls} value={name} maxLength={CRM_GROUP_SIGNER_NAME_MAX} disabled={readOnly} onChange={(e) => setName(e.target.value)} placeholder="例）山田 太郎" />
        </div>
        <label className="flex cursor-pointer items-start gap-2 text-[14px] font-bold text-slate-800">
          <input type="checkbox" className="mt-0.5 h-5 w-5 flex-none accent-indigo-600" checked={agree} disabled={readOnly} onChange={(e) => { setAgree(e.target.checked); setSureNo(false); }} />
          このお店が加わることを認めます
        </label>
        {err && <p className="whitespace-pre-line text-[13px] font-bold text-rose-600">{err}</p>}
        {sureNo ? (
          <div className="border border-rose-300 bg-rose-50 p-3 text-[13px] text-rose-800">
            <p className="font-bold">「認めない」で返事をします。このお店は加わりません。あとから変えることはできません。</p>
            <div className="mt-2 flex gap-2">
              <button type="button" disabled={readOnly || busy || name.trim() === ''} onClick={() => send(false)} className="bg-rose-600 px-3 py-1.5 font-bold text-white disabled:opacity-40">{busy ? '送信中…' : '認めないで返事をする'}</button>
              <button type="button" disabled={busy} onClick={() => setSureNo(false)} className="border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-600">もどる</button>
            </div>
            {name.trim() === '' && <p className="mt-1 text-[12px]">お名前を入れてください。</p>}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={readOnly || busy || !agree || name.trim() === ''} onClick={() => send(true)} className="bg-indigo-600 px-5 py-2 text-[14px] font-bold text-white disabled:opacity-40">
              {busy ? '送信中…' : '認める'}
            </button>
            <button type="button" disabled={readOnly || busy} onClick={() => { setAgree(false); setSureNo(true); }} className="border border-slate-300 bg-white px-4 py-2 text-[14px] font-bold text-slate-600 disabled:opacity-40">
              認めない
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
