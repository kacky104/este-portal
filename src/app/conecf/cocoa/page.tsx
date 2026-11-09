'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfSession } from '../ConecfSession';
import { useToast } from '@/app/components/useToast';
import { widthCount, bodyTooLong, COCOA_TITLE_MAX, COCOA_BODY_MAX, COCOA_SCHEDULE_MAX, cocoaMinLabel } from '@/lib/conecfCocoa';
import { TextMarkToolbar, TextMarkPreview } from '@/app/components/TextMarkTools';
import {
  getConecfCocoa, saveConecfCocoaSettings, saveConecfCocoaTemplate, setConecfCocoaTemplateActive,
  deleteConecfCocoaTemplate, postConecfCocoaNow, type CocoaData, type CocoaTemplateRow,
  saveConecfCocoaAccount, postConecfCocoaAccountNow, uploadConecfCocoaImage, type CocoaAccountRow,
} from '@/app/actions/conecfCocoa';

// コネックエフ「ココア店長ブログ」（第404便・2026-09-17）。
// ★ 駅ちか新着情報の応用：テンプレを何本か持ち、1日1回、順に自動投稿。★ メールでココアへ投稿。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const INPUT = 'w-full border border-slate-200 px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-200';

function hm(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d) : '';
}

/** ★ 第1834便: ブラウザで長い辺 1440px の JPEG に縮める（サーバーアクションの上限 1MB の内側） */
async function shrinkToJpeg(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = () => reject(new Error('read')); el.src = url; });
    const scale = Math.min(1, 1440 / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); if (!ctx) throw new Error('canvas');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    return await new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('blob'))), 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

function Editor({ salonId, tpl, onDone, onCancel, onToast }: {
  salonId: number; tpl: CocoaTemplateRow | null; onDone: () => void; onCancel: () => void; onToast: (m: string) => void;
}) {
  const [title, setTitle] = useState(tpl?.title ?? '');
  const [body, setBody] = useState(tpl?.body ?? '');
  const [imageUrl, setImageUrl] = useState<string | null>(tpl?.imageUrl ?? null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement | null>(null);
  // ★ 第1834便: 写真はサーバー経由で上げる（運営が店を操作中でも入る）。ブラウザで長い辺 1440px の JPEG に縮めてから送る（上限 1MB の内側）
  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', await shrinkToJpeg(file), 'photo.jpg');
      const res = await uploadConecfCocoaImage(fd);
      if (!res.ok) { onToast(res.error); return; }
      setImageUrl(res.data.url);
      onToast('写真をアップロードしました（保存を押すと反映されます）');
    } catch {
      onToast('写真を読めませんでした（JPEG・PNG にしてください）');
    } finally {
      setUploading(false);
    }
  };

  // ★ 第1836便（2026-11-09・カッキーさん）: 本文の途中に画像を入れる。
  //   ★ ココアのメール投稿は本文の <img> を通す（11/9 17:00 オイルクエスト様のココア（A）で確かめた・blogid40310534 で画像が出た）。
  //   ★ 画像は写真と同じ置き場（salon-images）へ上げ、カーソルの位置に <img src="…" width="540"> を入れる（送るときに " は外れる）
  const [inlineUp, setInlineUp] = useState(false);
  const onInlineImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setInlineUp(true);
    try {
      const fd = new FormData();
      fd.append('file', await shrinkToJpeg(file), 'photo.jpg');
      const res = await uploadConecfCocoaImage(fd);
      if (!res.ok) { onToast(res.error); return; }
      const tag = `<img src="${res.data.url}" width="540">`;
      const el = bodyRef.current;
      const at = el ? el.selectionStart : body.length;
      const before = body.slice(0, at), after = body.slice(at);
      const next = before + (before === '' || before.endsWith('\n') ? '' : '\n') + tag + (after.startsWith('\n') ? '' : '\n') + after;
      setBody(next);
      onToast('本文に画像を入れました（保存を押すと反映されます）');
    } catch {
      onToast('画像を読めませんでした（JPEG・PNG にしてください）');
    } finally {
      setInlineUp(false);
    }
  };
  const inlineImages = [...body.matchAll(/<img\b[^>]*\ssrc=["']?(https:\/\/[^"'\s>]+)/gi)].map((m) => m[1]);

  const save = async () => {
    setBusy(true);
    const res = await saveConecfCocoaTemplate({ id: tpl?.id, title, body, imageUrl });
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast('保存しました'); onDone();
  };

  const tOver = widthCount(title) > COCOA_TITLE_MAX * 2;
  const bOver = bodyTooLong(body);   // ★ 第1318便: 送る形（改行を <br> にしたあと）で数える。保存のときの判定と同じ関数

  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <p className="text-[15px] font-black text-slate-800">{tpl ? 'テンプレを編集' : '新しいテンプレ'}</p>
      <div>
        <label className="block text-[13px] font-bold text-slate-600 mb-1">タイトル</label>
        <input className={INPUT} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="例）⭐️セラピストさん大募集⭐️" />
        <p className={`text-[12px] mt-1 ${tOver ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>全角{COCOA_TITLE_MAX}文字まで（いま {Math.ceil(widthCount(title) / 2)}）</p>
      </div>
      <div>
        <label className="block text-[13px] font-bold text-slate-600 mb-1">本文</label>
        {/* ★ 第1320便: 文字の飾りのボタン（選んだ文字に付ける）。★ 第1321便で共通の部品にした（駅ちか新着情報と同じもの） */}
        <TextMarkToolbar textareaRef={bodyRef} value={body} onChange={setBody} />
        <div className="mb-1.5 flex flex-wrap items-center gap-2">
          <label className="cursor-pointer border border-indigo-200 px-3 py-1 text-[13px] font-bold text-indigo-600 hover:bg-indigo-50">
            {inlineUp ? 'アップロード中…' : '🖼 本文に画像を入れる'}
            <input type="file" accept="image/*" className="hidden" disabled={inlineUp} onChange={(e) => void onInlineImage(e)} />
          </label>
          <span className="text-[12px] text-slate-400">本文のカーソルの位置に画像が入ります（何枚でも）。消すときは &lt;img …&gt; の行を消してください。</span>
        </div>
        <textarea ref={bodyRef} className={`${INPUT} min-h-[160px]`} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className={`text-[12px] mt-1 ${bOver ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>全角{COCOA_BODY_MAX}文字まで。改行と絵文字はそのままココアに反映されます。外部リンクは載りません。</p>
        <TextMarkPreview value={body} label="ココアでの見え方（めやす）" />
        {inlineImages.length > 0 && (
          <div className="mt-1.5">
            <p className="text-[12px] text-slate-500">本文に入っている画像（{inlineImages.length}枚・上から順）</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {inlineImages.map((u, i) => <img key={i} src={u} alt="" className="h-20 w-20 border border-slate-200 object-cover" />)}
            </div>
          </div>
        )}
      </div>
      <div>
        <label className="block text-[13px] font-bold text-slate-600 mb-1">添付の写真（1枚・任意・記事の上か下に出ます）</label>
        <div className="flex items-center gap-3">
          <div className="w-20 h-20 flex-none bg-slate-100 border border-slate-200 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {imageUrl && <img src={imageUrl} alt="" className="w-full h-full object-cover" />}
          </div>
          <label className="text-[13px] font-bold text-indigo-600 border border-indigo-200 px-3 py-1.5 cursor-pointer hover:bg-indigo-50">
            {uploading ? 'アップロード中…' : imageUrl ? '写真を変える' : '写真を選ぶ'}
            <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(e) => void onUpload(e)} />
          </label>
          {imageUrl && <button type="button" onClick={() => setImageUrl(null)} className="text-[13px] text-rose-600 underline">外す</button>}
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <button type="button" onClick={onCancel} disabled={busy} className="px-4 py-2 border border-slate-300 text-[14px] font-bold text-slate-600">やめる</button>
        <button type="button" onClick={() => void save()} disabled={busy || tOver || bOver} className="px-6 py-2 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[14px] font-bold disabled:opacity-50">
          {busy ? '保存しています…' : '保存する'}
        </button>
      </div>
    </div>
  );
}

/** 「12:00」「翌1:00」→ 朝6時はじまりの分 */
function parseCocoaTime(t: string): number {
  // ★ 第1838便: 全角の数字・コロン（２１：４２）や「時」区切りでも通す
  const m = /^(翌)?\s*(\d{1,2})\s*[:時]\s*(\d{2})\s*分?$/.exec(t.normalize('NFKC').trim());
  if (!m) return NaN;
  const v = Number(m[2]) * 60 + Number(m[3]);
  return m[1] || v < 360 ? v + 1440 : v;
}

/**
 * ★★ 第1833便（カッキーさん）: A・B・C の3アカウントのカード（開け閉めできる）。
 *   アカウントごとに 投稿用メールアドレス・自動の ON/OFF・「時刻＋テンプレート（または順番に）」の行（ベンリーの時刻指定更新と同じ）
 */
function AccountCard({ a, templates, open, onToggle, guard, onToast, reload }: {
  a: CocoaAccountRow; templates: CocoaTemplateRow[]; open: boolean; onToggle: () => void; guard: () => boolean; onToast: (m: string) => void; reload: () => Promise<void>;
}) {
  const [postEmail, setPostEmail] = useState(a.postEmail);
  const [auto, setAuto] = useState(a.enabled);
  const [rows, setRows] = useState<Array<{ time: string; templateId: string }>>(() =>
    a.effective.map((r) => ({ time: cocoaMinLabel(r.min), templateId: r.templateId === null ? '' : String(r.templateId) })));
  const [busy, setBusy] = useState(false);
  const [nowTpl, setNowTpl] = useState('');
  const save = async () => {
    if (!guard()) return;
    const used = rows.filter((r) => r.time.trim() !== '');
    const mins = used.map((r) => parseCocoaTime(r.time));
    if (mins.some((m) => !Number.isFinite(m))) { onToast('時刻は「12:00」のように入れてください（翌朝は「翌1:00」）'); return; }
    if (new Set(mins).size !== mins.length) { onToast('同じ時刻が2つあります'); return; }
    setBusy(true);
    const res = await saveConecfCocoaAccount({ slot: a.slot, enabled: auto, postEmail, schedule: used.map((r, i) => ({ min: mins[i], templateId: r.templateId === '' ? null : Number(r.templateId) })) });
    setBusy(false);
    onToast(res.ok ? '保存しました' : res.error);
    if (res.ok) await reload();
  };
  const now = async () => {
    if (!guard()) return;
    setBusy(true);
    const res = await postConecfCocoaAccountNow({ slot: a.slot, templateId: nowTpl === '' ? null : Number(nowTpl) });
    setBusy(false);
    onToast(res.ok ? `「${res.data.title}」を投稿しました。ココアの店長ブログをご確認ください` : res.error);
    if (res.ok) await reload();
  };
  const last = a.lastPostedAt ? `${hm(a.lastPostedAt)}（${a.lastResult?.startsWith('sent') ? '成功' : a.lastResult ?? ''}）` : 'まだ';
  const active = templates.filter((t) => t.isActive);
  return (
    <div className={`${CARD} p-4 space-y-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1 text-left">
          <span className={`inline-block w-4 text-indigo-600 transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          <span className="text-[16px] font-black text-slate-800">{a.label}</span>
          <span className={`border px-2 py-0.5 text-[12px] font-bold ${a.enabled ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-slate-50 text-slate-500'}`}>{a.enabled ? '自動 ON' : '自動 OFF'}</span>
          {!open && <span className="truncate text-[12px] text-slate-500">{a.effective.map((r) => cocoaMinLabel(r.min)).join('・') || '—'} ／ 最後：{last}</span>}
        </button>
        {/* ★ 第1835便: 「いま1回」で送るテンプレートを選べる（選ばなければ順番に） */}
        <select value={nowTpl} onChange={(e) => setNowTpl(e.target.value)} className="max-w-[200px] border border-slate-200 px-2 py-1.5 text-[13px]">
          <option value="">順番に</option>
          {active.map((t) => <option key={t.id} value={t.id}>{t.title || '（タイトルなし）'}</option>)}
        </select>
        <button type="button" disabled={busy || active.length === 0} onClick={() => void now()} className="px-3 py-1.5 border border-indigo-300 text-[13px] text-indigo-700 font-bold disabled:opacity-40">{busy ? '…' : 'いま1回投稿する'}</button>
      </div>
      {open && (<>
        <div>
          <label className="block text-[13px] font-bold text-slate-600 mb-1">投稿用メールアドレス</label>
          <input className={`${INPUT} max-w-[420px]`} value={postEmail} onChange={(e) => setPostEmail(e.target.value)} placeholder="ココアの店長ブログ「アドレス管理」に出るアドレス" />
          <p className="text-[12px] text-slate-400 mt-1">{a.label}の管理画面 → 店長ブログ → アドレス管理 に出ている投稿用アドレスを入れてください。</p>
        </div>
        <div className="space-y-1.5">
          <p className="text-[13px] font-bold text-slate-600">投稿する時刻とテンプレート</p>
          {rows.map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-[14px]">
              <input value={r.time} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, time: e.target.value } : x)))} placeholder="12:00" className="w-24 border border-slate-200 px-2 py-1.5" />
              <select value={r.templateId} onChange={(e) => setRows((rs) => rs.map((x, k) => (k === i ? { ...x, templateId: e.target.value } : x)))} className="min-w-[220px] border border-slate-200 px-2 py-1.5">
                <option value="">順番に（最後に投稿したのが古いもの）</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{(t.title || '（タイトルなし）') + (t.isActive ? '' : '（休み中）')}</option>)}
              </select>
              <button type="button" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} className="text-[12.5px] font-bold text-rose-500">消す</button>
            </div>
          ))}
          {rows.length < COCOA_SCHEDULE_MAX && <button type="button" onClick={() => setRows((rs) => [...rs, { time: '', templateId: '' }])} className="border border-dashed border-indigo-300 px-3 py-1 text-[13px] text-indigo-700">＋ 時刻を足す</button>}
          <p className="text-[12px] text-slate-400">1日は朝6時はじまりです（翌朝は「翌1:00」）。残り回数は店長ブログ・動画投稿で共通です。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3 text-[14px]">
          <label className="flex items-center gap-2 font-bold"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 自動で投稿する</label>
          <button type="button" disabled={busy} onClick={() => void save()} className="px-4 py-1.5 bg-indigo-600 text-white font-bold disabled:opacity-50">保存</button>
          <span className="text-[12.5px] text-slate-400">最後の投稿：{last}</span>
        </div>
      </>)}
    </div>
  );
}

function Body({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const [data, setData] = useState<CocoaData | null>(null);
  const [error, setError] = useState('');
  const [postEmail, setPostEmail] = useState('');
  const [editing, setEditing] = useState<CocoaTemplateRow | null | 'new'>(null);
  const [busy, setBusy] = useState('');
  // ★ 第1833便: 開いているアカウントのカード（はじめは閉じる）
  const [openSlots, setOpenSlots] = useState<Record<number, boolean>>({});

  // ★ 第1117便: 自動投稿のオン・オフを変えたら、外枠（メニューの「ココア店長ブログ」の出し分け）も読み直す
  const { refresh: refreshShell } = useConecfSession();
  const load = useCallback(async () => {
    const res = await getConecfCocoa();
    if (!res.ok) { setError(res.error); return; }
    setData(res.data); setPostEmail(res.data.postEmail); setError('');
  }, []);
  useEffect(() => { void load(); }, [load]);

  if (error) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>;
  if (!data) return <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>;

  const guard = () => { if (!enabled) { onToast('保存するには、ホームで「コネックエフに切り替える」を押してください'); return false; } return true; };

  const saveSettings = async (next: { enabled: boolean; postEmail: string }) => {
    if (!guard()) return;
    setBusy('settings');
    const res = await saveConecfCocoaSettings(next);
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast('保存しました'); await load();
    void refreshShell();
  };

  const toggleActive = async (t: CocoaTemplateRow) => {
    if (!guard()) return;
    setBusy('t' + t.id);
    const res = await setConecfCocoaTemplateActive({ id: t.id, isActive: !t.isActive });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    await load();
  };
  const del = async (t: CocoaTemplateRow) => {
    if (!guard()) return;
    setBusy('t' + t.id);
    const res = await deleteConecfCocoaTemplate({ id: t.id });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast('削除しました'); await load();
  };
  const postNow = async () => {
    if (!guard()) return;
    setBusy('now');
    const res = await postConecfCocoaNow();
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    onToast(`「${res.data.title}」を投稿しました。ココアの店長ブログをご確認ください`); await load();
  };

  const activeCount = data.templates.filter((t) => t.isActive).length;

  return (
    <div className="space-y-3">
      {!enabled && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
          いまは見るだけです。保存するには、ホームで「コネックエフに切り替える」を押してください。
        </div>
      )}

      {/* 説明 */}
      <div className={`${CARD} p-4 text-[13.5px] text-slate-500 leading-relaxed`}>
        ココアの「店長ブログ」へ、テンプレートを決めた時刻に自動投稿します。アカウント（A・B・C）ごとに時刻とテンプレートを決められます。
        投稿は3ヶ月で消えるので、定期的に投稿して新しく保てます。投稿・編集の回数にはココア側の上限があります。
      </div>

      {/* ★ 第1833便: A・B・C の3アカウント（表が無いときは下の今までの1つの画面） */}
      {data.accounts && !data.hasEkichika && (
        <div className="border border-rose-200 bg-rose-50 px-4 py-2 text-[13px] font-bold text-rose-700">駅ちかのID・パスワードが登録されていない（または一時停止中の）ため、いまは投稿しません。</div>
      )}
      {data.accounts && data.accounts.map((a) => (
        <AccountCard key={a.slot + String(a.lastPostedAt) + String(a.enabled) + a.postEmail + JSON.stringify(a.schedule)} a={a} templates={data.templates}
          open={openSlots[a.slot] === true} onToggle={() => setOpenSlots((m) => ({ ...m, [a.slot]: !m[a.slot] }))}
          guard={guard} onToast={onToast} reload={async () => { await load(); void refreshShell(); }} />
      ))}

      {/* 自動投稿（★ 第1833便の表が無いときだけ） */}
      {!data.accounts && <div className={`${CARD} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[16px] font-black text-slate-800">自動投稿</p>
            <p className="text-[12.5px] text-slate-500">1日1回・{data.timeLabel ?? '—'}ごろに、テンプレを順番に投稿します。</p>
            {/* ★ 第474便: 駅ちかのID・PASSが無いと投稿しない（★ 解除・一時停止したとき） */}
            {!data.hasEkichika && (
              <p className="mt-1 text-[12.5px] font-bold text-rose-700">
                駅ちかのID・パスワードが登録されていない（または一時停止中の）ため、いまは投稿しません。
              </p>
            )}
          </div>
          <button type="button" disabled={busy !== ''} onClick={() => void saveSettings({ enabled: !data.enabled, postEmail })}
            className={`px-4 py-2 text-[14px] font-bold border ${data.enabled ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300'}`}>
            {data.enabled ? '自動投稿中（押すと止める）' : '自動投稿を始める'}
          </button>
        </div>
        <div>
          <label className="block text-[13px] font-bold text-slate-600 mb-1">ココアの投稿用メールアドレス</label>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${INPUT} max-w-[420px]`} value={postEmail} onChange={(e) => setPostEmail(e.target.value)} placeholder="ココアの店長ブログ「アドレス管理」に出るアドレス" />
            <button type="button" disabled={busy !== ''} onClick={() => void saveSettings({ enabled: data.enabled, postEmail })} className="px-4 py-2 bg-indigo-600 text-white text-[14px] font-bold disabled:opacity-50">保存</button>
          </div>
          <p className="text-[12px] text-slate-400 mt-1">ココアの管理画面 → 店長ブログ → アドレス管理 に出ている投稿用アドレスを入れてください。</p>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-slate-400">
          <span>テンプレ {activeCount}/{data.max}本（公開中）</span>
          {data.lastPostedAt && <span>／ 最後の投稿 {hm(data.lastPostedAt)}（{data.lastResult === 'sent' ? '成功' : data.lastResult ?? ''}）</span>}
          <button type="button" disabled={busy !== '' || activeCount === 0} onClick={() => void postNow()} className="ml-auto px-3 py-1.5 border border-indigo-300 text-indigo-700 font-bold disabled:opacity-40">
            {busy === 'now' ? '投稿しています…' : 'いま1回投稿する'}
          </button>
        </div>
      </div>}

      {/* テンプレ */}
      {editing === 'new' || editing ? (
        <Editor salonId={data.salonId} tpl={editing === 'new' ? null : editing} onDone={() => { setEditing(null); void load(); }} onCancel={() => setEditing(null)} onToast={onToast} />
      ) : (
        <div className={CARD}>
          <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
            <p className="text-[15px] font-black text-slate-800">テンプレ</p>
            <button type="button" disabled={data.templates.length >= data.max} onClick={() => setEditing('new')} className="px-4 py-1.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[13px] font-bold disabled:opacity-40">＋ 追加</button>
          </div>
          {data.templates.length === 0 && <p className="px-4 pb-4 text-[14px] text-slate-500">まだテンプレがありません。「＋ 追加」で作ってください。</p>}
          <ul className="divide-y divide-slate-100 border-t border-slate-100">
            {data.templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                {/* ★ 第1837便: 休み中は写真と題名だけ薄くする（「使う」ボタンは押せる色のまま） */}
                <div className={`w-12 h-12 flex-none bg-slate-100 overflow-hidden ${t.isActive ? '' : 'opacity-50'}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t.imageUrl && <img src={t.imageUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className={`min-w-0 flex-1 ${t.isActive ? '' : 'opacity-50'}`}>
                  <b className="block text-[15px] font-bold text-slate-800 truncate">{t.title || '（タイトルなし）'}{!t.isActive && <span className="ml-2 text-[12px] font-bold text-slate-500">（休み中）</span>}</b>
                  <span className="block text-[12.5px] text-slate-400 truncate">{t.lastPostedAt ? `最後の投稿 ${hm(t.lastPostedAt)}` : 'まだ投稿していません'}</span>
                </div>
                <button type="button" disabled={busy !== ''} onClick={() => void toggleActive(t)} className={`text-[12.5px] font-bold px-2 py-1 border ${t.isActive ? 'text-slate-500 border-slate-200' : 'text-white bg-indigo-600 border-indigo-600'}`}>{t.isActive ? '休む' : '使う'}</button>
                <button type="button" onClick={() => setEditing(t)} className="text-[12.5px] font-bold text-indigo-600">編集</button>
                <button type="button" disabled={busy !== ''} onClick={() => void del(t)} className="text-[12.5px] font-bold text-rose-500">削除</button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default function ConecfCocoaPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="cocoa" title="ココア店長ブログ" toast={toast}>
      {(a) => <Body enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
