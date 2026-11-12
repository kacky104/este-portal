'use client';

// フクエスCRM 設定タブ「連絡文のひな形」（第1947便・2026-11-12）。
// ★ 予約の「連絡文▼」から、女子への予約連絡などをボタン1つでコピーするためのひな形を作る（風俗CTIv2 の「テンプレート」）。
// ★ 差し込みは日本語の {日付} {コース} など。右の一覧を押すと、本文のカーソルの所に入る。
// ★ 「差し込みが空の行は消す」で、オプションの無い予約では「[オプション]：」の行ごと消える。
// ★ プレビューは本日の予約から選ぶ。★ 「保存する」はこのタブの中（下の保存バーは使わない）。

import { appConfirm } from '@/app/components/AppConfirm';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLoadOnMount } from '@/app/components/useLoadOnMount';
import {
  deleteCrmMessageTemplate,
  getCrmMessageExtras,
  listCrmMessageTemplates,
  reorderCrmMessageTemplates,
  saveCrmMessageTemplate,
  type CrmMessageTemplate,
} from '@/app/actions/crmMessage';
import { getCrmSchedule } from '@/app/actions/crm';
import type { CrmScheduleData } from '@/app/lib/crm/types';
import {
  CRM_MESSAGE_SAMPLE_BODY,
  CRM_MESSAGE_SAMPLE_NAME,
  CRM_MESSAGE_TOGGLE_PREFIX,
  CRM_MESSAGE_VARS,
  renderCrmMessage,
  unknownCrmMessageVars,
} from '@/lib/crmMessage';
import { safeAction } from './CrmBase';
import { crmMessageContextOf, type CrmMessageExtras } from './messageContext';
import { getBusinessDateJST } from '@/lib/dutyStatus';

type Draft = { id?: number; name: string; body: string; hideEmptyLines: boolean; isActive: boolean };
const EMPTY: Draft = { name: '', body: '', hideEmptyLines: true, isActive: true };

/** 営業日（朝6時区切り）の YYYY-MM-DD。★ 第1986便: 正本は lib/dutyStatus（写しを4か所に持たない） */
const businessTodayJST = (): string => getBusinessDateJST();
function hm(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

export function MessageTemplatesSection({ salonId }: { salonId: number }) {
  const [list, setList] = useState<CrmMessageTemplate[] | null>(null);
  const [ready, setReady] = useState(true);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saved, setSaved] = useState<Draft | null>(null);
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [delConfirm, setDelConfirm] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // プレビュー用（本日の予約）
  const [sched, setSched] = useState<CrmScheduleData | null>(null);
  const [pick, setPick] = useState('');
  const [extras, setExtras] = useState<CrmMessageExtras | null>(null);

  const load = useCallback(async () => {
    const r = await safeAction(listCrmMessageTemplates(salonId));
    if (!r.ok) { setErr(r.error); setList([]); return; }
    setReady(r.ready);
    setList(r.templates);
  }, [salonId]);

  useLoadOnMount(load);
  useEffect(() => {
    let alive = true;
    void (async () => {
      const r = await safeAction(getCrmSchedule(salonId, businessTodayJST()));
      if (!alive || !r.ok || r.lite) return;
      setSched(r.data);
      const first = r.data.bookings.find((b) => b.status !== 'cancelled');
      if (first) setPick(first.id);
    })();
    return () => { alive = false; };
  }, [salonId]);
  useEffect(() => {
    if (!pick) return;
    let alive = true;
    void (async () => {
      const r = await safeAction(getCrmMessageExtras(salonId, pick));
      if (alive && r.ok) setExtras({ salonName: r.salonName, salonTel: r.salonTel, prev: r.prev });
    })();
    return () => { alive = false; };
  }, [salonId, pick]);

  const dirty = !!draft && JSON.stringify(draft) !== JSON.stringify(saved);

  const open = async (t: CrmMessageTemplate | null) => {
    if (dirty && !(await appConfirm('保存していない変更があります。捨てて切り替えますか？', { ok: '捨てて切り替える', danger: true }))) return;
    const d: Draft = t ? { id: t.id, name: t.name, body: t.body, hideEmptyLines: t.hideEmptyLines, isActive: t.isActive } : { ...EMPTY };
    setDraft(d); setSaved(t ? d : null); setErr(''); setMsg(''); setDelConfirm(false);
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true); setErr(''); setMsg('');
    const r = await safeAction(saveCrmMessageTemplate(salonId, draft));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    const d: Draft = { id: r.template.id, name: r.template.name, body: r.template.body, hideEmptyLines: r.template.hideEmptyLines, isActive: r.template.isActive };
    setDraft(d); setSaved(d);
    setMsg('保存しました');
    await load();
  };

  const remove = async () => {
    if (!draft?.id) return;
    setBusy(true); setErr('');
    const r = await safeAction(deleteCrmMessageTemplate(salonId, draft.id));
    setBusy(false);
    if (!r.ok) { setErr(r.error); return; }
    setDraft(null); setSaved(null); setDelConfirm(false);
    setMsg('削除しました');
    await load();
  };

  const move = async (id: number, dir: -1 | 1) => {
    if (!list) return;
    const i = list.findIndex((t) => t.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    const r = await safeAction(reorderCrmMessageTemplates(salonId, next.map((t) => t.id)));
    if (!r.ok) { setErr(r.error); await load(); }
  };

  const addSample = async () => {
    if (dirty && !(await appConfirm('保存していない変更があります。捨てて見本を開きますか？', { ok: '捨てて見本を開く', danger: true }))) return;
    setDraft({ name: CRM_MESSAGE_SAMPLE_NAME, body: CRM_MESSAGE_SAMPLE_BODY, hideEmptyLines: true, isActive: true });
    setSaved(null); setErr(''); setMsg('見本を開きました。直してから「保存する」を押してください');
  };

  const insert = (key: string) => {
    if (!draft) return;
    const token = `{${key}}`;
    const el = bodyRef.current;
    const s = el?.selectionStart ?? draft.body.length;
    const e = el?.selectionEnd ?? draft.body.length;
    const body = draft.body.slice(0, s) + token + draft.body.slice(e);
    setDraft({ ...draft, body });
    requestAnimationFrame(() => {
      if (!el) return;
      el.focus();
      el.setSelectionRange(s + token.length, s + token.length);
    });
  };

  const unknown = useMemo(() => (draft ? unknownCrmMessageVars(draft.body) : []), [draft]);
  const pickedBooking = sched?.bookings.find((b) => b.id === pick) ?? null;
  const preview = useMemo(() => {
    if (!draft || !sched || !pickedBooking) return '';
    return renderCrmMessage(draft.body, crmMessageContextOf(pickedBooking, sched, pick ? extras : null), draft.hideEmptyLines);
  }, [draft, sched, pickedBooking, extras, pick]);
  const toggleVars = (sched?.settings.customToggles ?? []).map((t) => ({ key: `${CRM_MESSAGE_TOGGLE_PREFIX}${t.title}`, label: `出勤情報の「${t.title}」`, example: '' }));

  if (!ready) {
    return (
      <section className="mt-4 border border-slate-200 bg-white p-5">
        <h2 className="text-[17px] font-black text-slate-800">連絡文のひな形</h2>
        <p className="mt-2 text-[13px] font-bold text-amber-800">準備中です。もうしばらくお待ちください。</p>
      </section>
    );
  }

  return (
    <section className="mt-4 border border-slate-200 bg-white p-5">
      <h2 className="text-[17px] font-black text-slate-800">連絡文のひな形</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        本日スケジュールで予約を開き、下の「<b>連絡文▼</b>」からひな形を選ぶと、予約の中身が入った文章がコピーされます。
        女子への予約連絡などを LINE に貼り付けて送るときにお使いください。使わない場合は、ひな形を作らなければ何も出ません。
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-slate-500">
        ※ お客様の電話番号は入れられません（セラピストに電話番号を見せないため）。コピーした文章はフクエスCRMには残りません。
      </p>

      {/* 一覧 */}
      <div className="mt-4 border border-slate-200">
        {(list ?? []).length === 0 ? (
          <p className="px-3 py-3 text-[13px] text-slate-500">{list == null ? '読み込み中…' : 'まだひな形がありません。'}</p>
        ) : (
          (list ?? []).map((t, i) => (
            <div key={t.id} className={`flex items-center gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 ${draft?.id === t.id ? 'bg-indigo-50' : ''}`}>
              <button type="button" onClick={() => open(t)} className="text-left text-[14px] font-bold text-[#3f51b5] underline decoration-dotted underline-offset-2">
                {t.name}
              </button>
              {!t.isActive && <span className="border border-slate-300 px-1 text-[11px] font-bold text-slate-400">使わない</span>}
              <span className="ml-auto flex gap-1">
                <button type="button" disabled={i === 0} onClick={() => move(t.id, -1)} className="border border-slate-300 px-1.5 text-[12px] disabled:opacity-30" aria-label="上へ">▲</button>
                <button type="button" disabled={i === (list ?? []).length - 1} onClick={() => move(t.id, 1)} className="border border-slate-300 px-1.5 text-[12px] disabled:opacity-30" aria-label="下へ">▼</button>
              </span>
            </div>
          ))
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={() => open(null)} className="border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-[13px] font-bold text-indigo-700">
          ＋ 新しいひな形
        </button>
        <button type="button" onClick={addSample} className="border border-slate-300 bg-white px-3 py-1.5 text-[13px] font-bold text-slate-700">
          見本（予約連絡）を開く
        </button>
      </div>

      {err && <p className="mt-3 text-[13px] font-bold text-rose-600">{err}</p>}
      {msg && !dirty && <p className="mt-3 text-[13px] font-bold text-emerald-700">{msg}</p>}

      {/* 編集 */}
      {draft && (
        <div className="mt-4 grid gap-4 border-t border-slate-200 pt-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div>
            <label className="block text-[13px] font-bold text-slate-600">ひな形の名前</label>
            <input
              value={draft.name}
              maxLength={40}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例）予約連絡"
              className="mt-1 w-full max-w-xs border border-slate-300 px-3 py-2 text-[14px] focus:border-indigo-400 focus:outline-none"
            />
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[13px] text-slate-700">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
                予約の「連絡文▼」に出す
              </label>
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={draft.hideEmptyLines} onChange={(e) => setDraft({ ...draft, hideEmptyLines: e.target.checked })} />
                差し込みが空の行は消す（例：オプションが無い予約では「[オプション]：」の行ごと消す）
              </label>
            </div>
            <label className="mt-3 block text-[13px] font-bold text-slate-600">本文</label>
            <textarea
              ref={bodyRef}
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              rows={16}
              maxLength={4000}
              className="mt-1 w-full resize-y border border-slate-300 px-3 py-2 font-mono text-[13px] leading-relaxed focus:border-indigo-400 focus:outline-none"
            />
            {unknown.length > 0 && (
              <p className="mt-1 text-[12px] font-bold text-rose-600">
                知らない差し込みがあります（そのまま文字で出ます）：{unknown.map((u) => `{${u}}`).join('、')}
              </p>
            )}

            {/* プレビュー */}
            <p className="mt-4 text-[13px] font-bold text-slate-600">プレビュー（本日の予約から選ぶ）</p>
            {sched && sched.bookings.filter((b) => b.status !== 'cancelled').length > 0 ? (
              <>
                <select value={pick} onChange={(e) => setPick(e.target.value)} className="mt-1 w-full max-w-md border border-slate-300 bg-white px-2 py-1.5 text-[13px]">
                  {sched.bookings.filter((b) => b.status !== 'cancelled').map((b) => {
                    const t = sched.therapists.find((x) => x.id === b.therapistId);
                    return (
                      <option key={b.id} value={b.id}>
                        {hm(b.slotStartISO)}〜{hm(b.slotEndISO)} {t?.name ?? 'フリー'}／{b.customer?.name || b.customerName || '(名前なし)'}
                      </option>
                    );
                  })}
                </select>
                <pre className="mt-2 max-h-[420px] overflow-auto whitespace-pre-wrap border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] leading-relaxed text-slate-800">{preview}</pre>
              </>
            ) : (
              <p className="mt-1 text-[12px] text-slate-500">{sched ? '本日の予約が無いため、プレビューできません。' : '読み込み中…'}</p>
            )}

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button type="button" disabled={busy || !draft.name.trim() || !dirty} onClick={save} className="bg-emerald-600 px-4 py-2 text-[14px] font-bold text-white disabled:opacity-40">
                {busy ? '保存中…' : '保存する'}
              </button>
              {dirty && <span className="text-[12px] font-bold text-amber-700">未保存の変更があります</span>}
              {draft.id && (
                delConfirm ? (
                  <button type="button" disabled={busy} onClick={remove} className="ml-auto bg-rose-600 px-3 py-1.5 text-[12px] font-bold text-white">本当に削除</button>
                ) : (
                  <button type="button" onClick={() => setDelConfirm(true)} className="ml-auto text-[12px] font-bold text-slate-400 underline">このひな形を削除</button>
                )
              )}
            </div>
          </div>

          {/* 差し込みの一覧 */}
          <div className="lg:sticky lg:top-2 lg:self-start">
            <p className="text-[13px] font-bold text-slate-600">差し込み（押すと本文に入ります）</p>
            <div className="mt-1 max-h-[640px] overflow-y-auto border border-slate-200">
              {[...CRM_MESSAGE_VARS, ...(toggleVars.length ? [{ group: '出勤情報（追加の項目）', vars: toggleVars }] : [])].map((g) => (
                <div key={g.group}>
                  <p className="sticky top-0 bg-slate-100 px-2 py-1 text-[12px] font-bold text-slate-600">{g.group}</p>
                  {g.vars.map((v) => (
                    <button
                      key={v.key}
                      type="button"
                      onClick={() => insert(v.key)}
                      className="block w-full border-b border-slate-100 px-2 py-1.5 text-left hover:bg-indigo-50"
                    >
                      <span className="text-[13px] font-bold text-[#3f51b5]">{`{${v.key}}`}</span>
                      <span className="block text-[11px] leading-snug text-slate-500">{v.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
