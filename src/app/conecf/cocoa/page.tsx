'use client';

import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfSession } from '../ConecfSession';
import { useToast } from '@/app/components/useToast';
import { createClient } from '@/app/lib/supabase/client';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import {
  widthCount, bodyTooLong, COCOA_TITLE_MAX, COCOA_BODY_MAX,
  COCOA_MARKS, parseCocoaMarks, stripCocoaMarks, cocoaMarkStyle, expandCocoaSelection, type CocoaNode,
} from '@/lib/conecfCocoa';
import {
  getConecfCocoa, saveConecfCocoaSettings, saveConecfCocoaTemplate, setConecfCocoaTemplateActive,
  deleteConecfCocoaTemplate, postConecfCocoaNow, type CocoaData, type CocoaTemplateRow,
} from '@/app/actions/conecfCocoa';

// コネックエフ「ココア店長ブログ」（第404便・2026-09-17）。
// ★ 駅ちか新着情報の応用：テンプレを何本か持ち、1日1回、順に自動投稿。★ メールでココアへ投稿。

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const INPUT = 'w-full border border-slate-200 px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-200';
const supabase = createClient();
const BUCKET = 'salon-images';

function hm(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo' }).format(d) : '';
}

// ★★ 第1320便: 文字の飾り（色・大きさ・太字）。本文には [赤]…[/赤] のような印で入れ、送るときにタグへ置き換える（lib/conecfCocoa.ts）。
const MARK_BTN = 'px-2.5 py-1 border border-slate-300 bg-white text-[13px] font-bold leading-none hover:bg-slate-50';

/** ココアでの見え方（めやす）。★ 送る形と同じ木から作る。打った文字は、そのまま文字として出す（HTML にしない） */
function PreviewNodes({ nodes }: { nodes: readonly CocoaNode[] }) {
  return (
    <>
      {nodes.map((n, i) => (n.t === 'mark'
        ? <span key={i} style={cocoaMarkStyle(n.k)}><PreviewNodes nodes={n.c} /></span>
        : n.v.split('\n').map((line, j) => <Fragment key={`${i}-${j}`}>{j > 0 && <br />}{line}</Fragment>)))}
    </>
  );
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

  // ★ 第1320便: 本文欄で選んでいる範囲（何も選んでいなければ null）
  const selected = (): { s: number; e: number } | null => {
    const el = bodyRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return null;
    return { s: el.selectionStart, e: el.selectionEnd };
  };
  const reselect = (s: number, e: number) => {
    requestAnimationFrame(() => { const el = bodyRef.current; if (!el) return; el.focus(); el.setSelectionRange(s, e); });
  };
  /** 選んだ文字の前後に印を足す */
  const wrap = (key: string) => {
    const sel = selected();
    if (!sel) { onToast('飾りを付けたい文字を選んでから、ボタンを押してください'); return; }
    const open = `[${key}]`;
    setBody(body.slice(0, sel.s) + open + body.slice(sel.s, sel.e) + `[/${key}]` + body.slice(sel.e));
    reselect(sel.s + open.length, sel.e + open.length);
  };
  /** 選んだ範囲（と、すぐ外側の印）から、印だけを消す */
  const unwrap = () => {
    const sel0 = selected();
    if (!sel0) { onToast('飾りを外したい文字を選んでから、ボタンを押してください'); return; }
    const sel = expandCocoaSelection(body, sel0.s, sel0.e);
    const mid = stripCocoaMarks(body.slice(sel.s, sel.e));
    setBody(body.slice(0, sel.s) + mid + body.slice(sel.e));
    reselect(sel.s, sel.s + mid.length);
  };
  /** ボタンを押しても、本文欄の選択を外さない */
  const keep = (e: React.MouseEvent) => e.preventDefault();

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    setUploading(true);
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    const path = `cocoa-${salonId}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
    setUploading(false);
    if (error) { onToast('アップロードに失敗しました: ' + error.message); return; }
    setImageUrl(supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl);
    onToast('写真をアップロードしました（保存を押すと反映されます）');
  };

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
        {/* ★ 第1320便: 文字の飾りのボタン（選んだ文字に付ける） */}
        <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
          <span className="text-[12px] text-slate-500">文字を選んで押す：</span>
          {COCOA_MARKS.filter((m) => m.kind === 'color').map((m) => (
            <button key={m.key} type="button" onMouseDown={keep} onClick={() => wrap(m.key)} className={MARK_BTN} style={cocoaMarkStyle(m.key)}>{m.key}</button>
          ))}
          <span className="w-px h-5 bg-slate-200" aria-hidden />
          {COCOA_MARKS.filter((m) => m.kind !== 'color').map((m) => (
            <button key={m.key} type="button" onMouseDown={keep} onClick={() => wrap(m.key)} className={`${MARK_BTN} text-slate-700`}>{m.key}</button>
          ))}
          <span className="w-px h-5 bg-slate-200" aria-hidden />
          <button type="button" onMouseDown={keep} onClick={unwrap} className="px-2.5 py-1 text-[13px] text-slate-500 underline">飾りを外す</button>
        </div>
        <textarea ref={bodyRef} className={`${INPUT} min-h-[160px]`} value={body} onChange={(e) => setBody(e.target.value)} />
        <p className={`text-[12px] mt-1 ${bOver ? 'text-rose-600 font-bold' : 'text-slate-400'}`}>全角{COCOA_BODY_MAX}文字まで。改行と絵文字はそのままココアに反映されます。外部リンクは載りません。</p>
        <p className="text-[12px] font-bold text-slate-500 mt-3 mb-1">ココアでの見え方（めやす）</p>
        <div className="border border-slate-200 bg-white px-3 py-2 min-h-[48px] text-[15px] leading-[1.8] text-slate-800 break-words">
          {body.trim() ? <PreviewNodes nodes={parseCocoaMarks(body)} /> : <span className="text-slate-300">本文を入れると、ここに出ます</span>}
        </div>
        <p className="text-[12px] text-slate-400 mt-1">[赤]…[/赤] のような印は、送るときに色・大きさ・太字に置き換わります。印が文字のまま見えるときは、対になっていません。</p>
      </div>
      <div>
        <label className="block text-[13px] font-bold text-slate-600 mb-1">写真（1枚・任意）</label>
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

function Body({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const [data, setData] = useState<CocoaData | null>(null);
  const [error, setError] = useState('');
  const [postEmail, setPostEmail] = useState('');
  const [editing, setEditing] = useState<CocoaTemplateRow | null | 'new'>(null);
  const [busy, setBusy] = useState('');

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
        ココアの「店長ブログ」へ、登録したテンプレを1日1回、順番に自動投稿します（メールで投稿）。
        投稿は3ヶ月で自動的に消えるため、定期的に投稿して新しく保てます。★ 投稿・編集あわせて残り回数の上限がココア側にあります。
      </div>

      {/* 自動投稿 */}
      <div className={`${CARD} p-4 space-y-3`}>
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
      </div>

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
              <li key={t.id} className={`flex items-center gap-3 px-4 py-3 ${t.isActive ? '' : 'opacity-50'}`}>
                <div className="w-12 h-12 flex-none bg-slate-100 overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {t.imageUrl && <img src={t.imageUrl} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <b className="block text-[15px] font-bold text-slate-800 truncate">{t.title || '（タイトルなし）'}</b>
                  <span className="block text-[12.5px] text-slate-400 truncate">{t.lastPostedAt ? `最後の投稿 ${hm(t.lastPostedAt)}` : 'まだ投稿していません'}</span>
                </div>
                <button type="button" disabled={busy !== ''} onClick={() => void toggleActive(t)} className="text-[12.5px] font-bold text-slate-500 border border-slate-200 px-2 py-1">{t.isActive ? '休む' : '使う'}</button>
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
