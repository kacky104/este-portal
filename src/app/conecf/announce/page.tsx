'use client';

// コネックエフ「フクエスお知らせ」（第475便・2026-09-18・カッキーさんの指示）。
//
// ★★ マイページの「お知らせ」タブ（/mypage?tab=news）と【同じこと】をコネックエフでできるようにする。
//   新規（タイトル・本文・画像1枚・公開・fukuX同時投稿）／自動投稿の状態／1件ずつの編集・保存／
//   公開・非公開／自動投稿の入り切り／再投稿（fukuX同時投稿つき）／削除
// ★★ DB の読み書きはマイページと同じ道（★ 新しい道は作らない）:
//   announcements … ログイン中のオーナー本人の権限（RLS）でブラウザから
//   手動で出した記録 … postAnnouncementManually（★ 自動の1日1回・押し直し30分の決まりはここが守る）
//   画像 … announcement-images（{salon_id}/{ts}.{ext}）・不要になった画像は掃除（best-effort）
//   fukuX … x_posts（★ 同じ認証のクライアントで insert・店舗アカウントと連携しているときだけ）
//   ISR … revalidateSalon
// ★ マイページのお知らせタブはそのまま（★ どちらで書いても同じお知らせ・カッキーさんの決定）。
// ★ 保存できるのは「コネックエフに切り替える」を押した店だけ（★ ほかの画面と同じ）。

import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useToast } from '@/app/components/useToast';
import { createClient } from '@/app/lib/supabase/client';
import { STORAGE_CACHE_CONTROL } from '@/app/lib/storage';
import { revalidateSalon } from '@/app/lib/revalidateTop';
import { getLinkedXProfileForSalon } from '@/app/lib/xLink';
import { postAnnouncementManually, getAnnounceState } from '@/app/actions/announcePost';

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';
const INPUT = 'w-full border border-slate-200 px-3 py-2 text-[15px] focus:outline-none focus:ring-2 focus:ring-indigo-200';
const LABEL = 'block text-[13px] font-bold text-slate-600 mb-1';
const SAVE_BTN = 'px-6 py-2 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[14px] font-bold disabled:opacity-50';
const BUCKET = 'announcement-images';
const X_BODY_MAX = 500;
const supabase = createClient();

type Announcement = {
  id: string; title: string; content: string | null; is_published: boolean;
  published_at: string; image_url: string | null; auto_rotate: boolean;
};
type Form = { title: string; content: string; is_published: boolean; image_url: string | null };
type AutoState = { message: string; targetCount: number; autoTimeLabel: string | null; cycleMessage: string | null };

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d);
}

/** announcement-images の公開URL → バケット内パス。★ 対象外のURLは null（マイページと同じ） */
function storagePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = '/' + BUCKET + '/';
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}
async function removeImage(url: string | null | undefined) {
  const path = storagePath(url);
  if (!path) return;
  const { error } = await supabase.storage.from(BUCKET).remove([path]);
  if (error) console.error('[conecf announce] 旧画像の削除に失敗:', path, error.message);
}
function validateImage(file: File): string | null {
  if (file.size > 5 * 1024 * 1024) return '5MB以下の画像を選択してください';
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return 'JPEG・PNG・WebPのみ対応しています';
  return null;
}

async function fetchList(salonId: number): Promise<Announcement[]> {
  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, is_published, published_at, image_url, auto_rotate')
    .eq('salon_id', salonId)
    .order('published_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ ...(r as Announcement), id: String((r as { id: unknown }).id) }));
}

/** fukuX 同時投稿のチェック（新規・再投稿で共用） */
function CrosspostChecks({ linked, on, setOn, noReplies, setNoReplies }: {
  linked: boolean; on: boolean; setOn: (v: boolean) => void; noReplies: boolean; setNoReplies: (v: boolean) => void;
}) {
  return (
    <div className="space-y-2">
      <label className={`flex items-center gap-2 select-none ${linked ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}>
        <input type="checkbox" disabled={!linked} checked={linked && on}
          onChange={(e) => { setOn(e.target.checked); if (!e.target.checked) setNoReplies(false); }}
          className="w-4 h-4 accent-indigo-600" />
        <span className="text-[13.5px] font-bold text-slate-600">fukuX にも投稿する</span>
      </label>
      {!linked && <p className="text-[12px] text-slate-400 pl-6">fukuX店舗アカウントと連携すると同時投稿できます</p>}
      {linked && on && (
        <label className="flex items-center gap-2 cursor-pointer select-none pl-6">
          <input type="checkbox" checked={noReplies} onChange={(e) => setNoReplies(e.target.checked)} className="w-4 h-4 accent-indigo-600" />
          <span className="text-[13.5px] font-bold text-slate-600">リプライできないようにする</span>
        </label>
      )}
    </div>
  );
}

function ImagePicker({ url, uploading, onPick, onClear }: {
  url: string | null; uploading: boolean; onPick: (e: React.ChangeEvent<HTMLInputElement>) => void; onClear: () => void;
}) {
  return (
    <div>
      <label className={LABEL}>画像（任意・1枚）</label>
      <p className="text-[12px] text-slate-400 mb-1.5">推奨：800×450px（横長）／ JPEG・PNG・WebP・5MB以下</p>
      <div className="flex items-center gap-3">
        <div className="w-32 h-[72px] flex-none bg-slate-100 border border-slate-200 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {url && <img src={url} alt="" className="w-full h-full object-cover" />}
        </div>
        <label className="text-[13px] font-bold text-indigo-600 border border-indigo-200 px-3 py-1.5 cursor-pointer hover:bg-indigo-50">
          {uploading ? 'アップロード中…' : url ? '画像を変える' : '画像を選ぶ'}
          <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading} onChange={onPick} />
        </label>
        {url && <button type="button" onClick={onClear} className="text-[13px] text-rose-600 underline">外す</button>}
      </div>
    </div>
  );
}

function Body({ salonId, enabled, onToast }: { salonId: number; enabled: boolean; onToast: (m: string) => void }) {
  const [list, setList] = useState<Announcement[] | null>(null);
  const [error, setError] = useState('');
  const [forms, setForms] = useState<Record<string, Form>>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [autoState, setAutoState] = useState<AutoState | null>(null);
  const [xProfileId, setXProfileId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [uploading, setUploading] = useState('');
  // 新規
  const [newOpen, setNewOpen] = useState(false);
  const [draft, setDraft] = useState<Form>({ title: '', content: '', is_published: true, image_url: null });
  const [newX, setNewX] = useState(true);
  const [newNoReplies, setNewNoReplies] = useState(false);
  // 再投稿
  const [repostId, setRepostId] = useState<string | null>(null);
  const [repX, setRepX] = useState(true);
  const [repNoReplies, setRepNoReplies] = useState(false);

  const refreshAuto = useCallback(async () => {
    const r = await getAnnounceState({ salonId });
    setAutoState(r.ok ? r.data : null);
  }, [salonId]);

  const load = useCallback(async () => {
    try {
      const l = await fetchList(salonId);
      setList(l);
      setForms(Object.fromEntries(l.map((a) => [a.id, { title: a.title, content: a.content ?? '', is_published: a.is_published, image_url: a.image_url }])));
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [salonId]);

  useEffect(() => {
    void load();
    void refreshAuto();
    // ★ fukuX の店舗アカウント（ログイン中の本人の連携）。★ 読めなければ同時投稿は出さない
    supabase.auth.getUser()
      .then(({ data }) => getLinkedXProfileForSalon(data.user?.id ?? null))
      .then((p) => setXProfileId(p?.profileId ?? null))
      .catch(() => setXProfileId(null));
  }, [load, refreshAuto]);

  const guard = () => {
    if (!enabled) { onToast('保存するには、ホームで「コネックエフに切り替える」を押してください'); return false; }
    return true;
  };
  const toggleOpen = (id: string) => setOpen((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  /** fukuX へ同時投稿（best-effort）。★ 投稿しなかった／成功 → true、試して失敗 → false */
  const crosspost = async (on: boolean, noReplies: boolean, title: string, content: string | null, imageUrl: string | null) => {
    if (!on || !xProfileId) return true;
    const t = (title ?? '').trim(); const c = (content ?? '').trim();
    const body = t && c ? `${t}\n\n${c}` : (t || c);
    const images = imageUrl ? [imageUrl] : [];
    if (body.length === 0 && images.length === 0) return true;
    const clamped = body.length > X_BODY_MAX ? `${body.slice(0, X_BODY_MAX - 3)}…` : body;
    const { error: xErr } = await supabase.from('x_posts').insert({ author_profile_id: xProfileId, body: clamped || null, images, replies_disabled: noReplies });
    if (xErr) { console.error('[conecf announce] fukuX 同時投稿に失敗:', xErr); return false; }
    return true;
  };

  const upload = async (key: string, e: React.ChangeEvent<HTMLInputElement>): Promise<string | null> => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return null;
    if (!guard()) return null;
    const err = validateImage(file);
    if (err) { onToast(err); return null; }
    setUploading(key);
    const ext = file.name.split('.').pop() ?? 'jpg';
    const path = `${salonId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { cacheControl: STORAGE_CACHE_CONTROL });
    setUploading('');
    if (upErr) { onToast('アップロードに失敗しました: ' + upErr.message); return null; }
    return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  };

  // ── 新規 ──
  const onNewImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = await upload('new', e);
    if (!url) return;
    if (draft.image_url) void removeImage(draft.image_url);   // ★ 保存前の選び直しは前の画像を掃除
    setDraft((d) => ({ ...d, image_url: url }));
  };
  const onAdd = async () => {
    if (!guard()) return;
    const title = draft.title.trim(); const content = draft.content.trim();
    if (!title || !content) { onToast('タイトルと本文は必須です'); return; }
    setBusy('new');
    const { data: inserted, error: insErr } = await supabase.from('announcements')
      .insert({ salon_id: salonId, title, content, is_published: draft.is_published, image_url: draft.image_url })
      .select('id').maybeSingle();
    if (insErr) { setBusy(''); onToast('追加に失敗しました: ' + insErr.message); return; }
    // ★ 書いた事実をサーバ側に残す（自動配信の「その日に手動があったか」の材料・マイページと同じ）
    if (inserted?.id && draft.is_published) {
      const r = await postAnnouncementManually({ salonId, announcementId: String(inserted.id), kind: 'new' });
      if (!r.ok) console.error('[conecf announce] 手動配信の記録に失敗:', r.error);
    }
    const xOk = await crosspost(newX, newNoReplies, title, content, draft.image_url);
    setDraft({ title: '', content: '', is_published: true, image_url: null });
    setNewX(true); setNewNoReplies(false); setNewOpen(false);
    setBusy('');
    void revalidateSalon(salonId);
    await load(); void refreshAuto();
    onToast(xOk ? 'お知らせを追加しました' : 'お知らせを追加しました（fukuX投稿は失敗しました）');
  };

  // ── 1件ずつ ──
  const onSave = async (a: Announcement) => {
    if (!guard()) return;
    const f = forms[a.id]; if (!f) return;
    if (!f.title.trim() || !f.content.trim()) { onToast('タイトルと本文は必須です'); return; }
    setBusy('save:' + a.id);
    const { error: upErr } = await supabase.from('announcements').update({
      title: f.title.trim(), content: f.content.trim(), is_published: f.is_published, image_url: f.image_url,
      updated_at: new Date().toISOString(),
    }).eq('id', a.id);
    setBusy('');
    if (upErr) { onToast('保存に失敗しました: ' + upErr.message); return; }
    if (a.image_url && a.image_url !== f.image_url) void removeImage(a.image_url);
    void revalidateSalon(salonId);
    await load(); void refreshAuto();
    onToast('お知らせを保存しました');
  };
  const onItemImage = async (a: Announcement, e: React.ChangeEvent<HTMLInputElement>) => {
    const url = await upload(a.id, e);
    if (!url) return;
    const prev = forms[a.id]?.image_url ?? null;
    if (prev && prev !== a.image_url) void removeImage(prev);   // ★ DB に保存していない選び直しだけ掃除
    setForms((p) => ({ ...p, [a.id]: { ...p[a.id], image_url: url } }));
  };
  const onTogglePublish = async (a: Announcement) => {
    if (!guard()) return;
    const next = !a.is_published;
    setBusy('pub:' + a.id);
    const { error: upErr } = await supabase.from('announcements').update({ is_published: next }).eq('id', a.id);
    setBusy('');
    if (upErr) { onToast('変更に失敗しました: ' + upErr.message); return; }
    setList((p) => (p ?? []).map((x) => (x.id === a.id ? { ...x, is_published: next } : x)));
    setForms((p) => (p[a.id] ? { ...p, [a.id]: { ...p[a.id], is_published: next } } : p));
    void revalidateSalon(salonId); void refreshAuto();
    onToast(next ? '公開にしました' : '非公開にしました');
  };
  const onToggleAuto = async (a: Announcement) => {
    if (!guard()) return;
    const next = !a.auto_rotate;
    setBusy('auto:' + a.id);
    const { error: upErr } = await supabase.from('announcements').update({ auto_rotate: next }).eq('id', a.id);
    setBusy('');
    if (upErr) { onToast('変更に失敗しました: ' + upErr.message); return; }
    setList((p) => (p ?? []).map((x) => (x.id === a.id ? { ...x, auto_rotate: next } : x)));
    void refreshAuto();
    onToast(next ? '自動投稿にしました' : '自動投稿をやめました');
  };
  const onRepostOpen = (a: Announcement) => {
    if (!guard()) return;
    setRepX(true); setRepNoReplies(false); setRepostId(a.id);
  };
  const onRepost = async () => {
    const a = (list ?? []).find((x) => x.id === repostId);
    if (!a) { setRepostId(null); return; }
    setBusy('repost:' + a.id);
    // ★ 画面から published_at を直に書かない（押し直しは30分に1回・マイページと同じ口）
    const res = await postAnnouncementManually({ salonId, announcementId: a.id, kind: 'repost' });
    if (!res.ok) { setBusy(''); onToast('再投稿に失敗しました: ' + res.error); return; }
    const xOk = await crosspost(repX, repNoReplies, a.title, a.content, a.image_url);
    setBusy(''); setRepostId(null);
    void revalidateSalon(salonId);
    await load(); void refreshAuto();
    // ★ 「再投稿しました」と言い切らない（並びが動かなかった回もある）
    onToast(xOk ? res.data.message : `${res.data.message}（fukuX投稿は失敗しました）`);
  };
  const onDelete = async (a: Announcement) => {
    if (!guard()) return;
    if (!window.confirm('このお知らせを削除しますか？\nこの操作は取り消せません。')) return;
    setBusy('del:' + a.id);
    const { data: deleted, error: delErr } = await supabase.from('announcements').delete().eq('id', a.id).select('id');
    setBusy('');
    if (delErr) { onToast('削除に失敗しました: ' + delErr.message); return; }
    if (!deleted || deleted.length === 0) { onToast('削除できませんでした（権限エラーの可能性があります）'); return; }
    void removeImage(a.image_url);
    void revalidateSalon(salonId);
    await load(); void refreshAuto();
    onToast('お知らせを削除しました');
  };

  if (error) return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>読み込めませんでした（{error}）</div>;
  if (!list) return <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>;

  return (
    <div className="space-y-3">
      {!enabled && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3 text-[14px] text-amber-900 leading-relaxed">
          いまは見るだけです。保存するには、ホームで「コネックエフに切り替える」を押してください。
        </div>
      )}

      <div className={`${CARD} p-4 text-[13.5px] text-slate-500 leading-relaxed`}>
        フクエスの店舗ページとトップの新着に出る「お知らせ」です。自動投稿にしたお知らせは、1日1回・順番にフクエスの新着の先頭へ出します。
      </div>

      {/* 新規 */}
      <div className={CARD}>
        <button type="button" onClick={() => setNewOpen((v) => !v)} aria-expanded={newOpen}
          className="w-full flex items-center gap-2 px-4 py-3.5 text-left hover:bg-slate-50">
          <span className="text-[15px] font-black text-slate-800">お知らせを新規追加</span>
          <span className="ml-auto text-[13px] font-bold px-3 py-1 border border-indigo-200 text-indigo-700">{newOpen ? '閉じる' : '＋ 新しく書く'}</span>
        </button>
        {newOpen && (
          <div className="px-4 pb-4 pt-3 space-y-3 border-t border-slate-200">
            <div>
              <label className={LABEL}>タイトル <span className="text-rose-500">*</span></label>
              <input className={INPUT} value={draft.title} onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))} />
            </div>
            <div>
              <label className={LABEL}>本文 <span className="text-rose-500">*</span></label>
              <textarea rows={8} className={INPUT} value={draft.content} onChange={(e) => setDraft((d) => ({ ...d, content: e.target.value }))} />
            </div>
            <ImagePicker url={draft.image_url} uploading={uploading === 'new'} onPick={(e) => void onNewImage(e)}
              onClear={() => { void removeImage(draft.image_url); setDraft((d) => ({ ...d, image_url: null })); }} />
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={draft.is_published} onChange={(e) => setDraft((d) => ({ ...d, is_published: e.target.checked }))} className="w-4 h-4 accent-indigo-600" />
              <span className="text-[13.5px] font-bold text-slate-600">公開する（オフにすると非公開で保存）</span>
            </label>
            <CrosspostChecks linked={!!xProfileId} on={newX} setOn={setNewX} noReplies={newNoReplies} setNoReplies={setNewNoReplies} />
            <p className="text-[12.5px] text-slate-500 bg-slate-50 px-3 py-2">公開して新規投稿すると、フクエスで店舗を保存している会員に通知されます。内容を確かめてから追加してください。</p>
            <div className="flex justify-end">
              <button type="button" onClick={() => void onAdd()} disabled={busy !== '' || uploading !== ''} className={SAVE_BTN}>
                {busy === 'new' ? '追加しています…' : '追加する'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 自動投稿の状態（★ 周と同じ判定から来る1行・getAnnounceState） */}
      <div className={`${CARD} p-4 space-y-1`}>
        <p className="text-[15px] font-black text-slate-800">自動投稿（1日1回・順番で投稿）</p>
        {autoState ? (
          <>
            <p className="text-[13.5px] text-slate-600 leading-relaxed">{autoState.message}</p>
            {autoState.cycleMessage && <p className="text-[12.5px] text-slate-400">{autoState.cycleMessage}</p>}
          </>
        ) : (
          <p className="text-[13px] text-slate-400">自動投稿の状態を読み込み中です…</p>
        )}
      </div>

      {/* 一覧 */}
      {list.length === 0 ? (
        <div className={`${CARD} p-5 text-[14px] text-slate-400`}>登録されているお知らせがありません</div>
      ) : list.map((a) => {
        const f = forms[a.id] ?? { title: a.title, content: a.content ?? '', is_published: a.is_published, image_url: a.image_url };
        const isOpen = open.has(a.id);
        return (
          <div key={a.id} className={CARD}>
            <button type="button" onClick={() => toggleOpen(a.id)} aria-expanded={isOpen}
              className="w-full flex items-center gap-2 px-4 py-3.5 text-left hover:bg-slate-50">
              <span className={`text-[12px] font-bold px-2.5 py-1 flex-none ${a.is_published ? 'bg-indigo-50 text-indigo-700' : 'bg-slate-100 text-slate-400'}`}>
                {a.is_published ? '公開中' : '非公開'}
              </span>
              {a.auto_rotate && (
                <span className={`text-[12px] font-bold px-2.5 py-1 flex-none border ${a.is_published ? 'bg-emerald-50 text-emerald-700 border-emerald-100' : 'bg-white text-emerald-300 border-emerald-100'}`}
                  title={a.is_published ? '自動投稿に乗っています' : '印は付いていますが、非公開なので回りません'}>
                  自動投稿中
                </span>
              )}
              <span className="text-[15px] font-bold text-slate-800 truncate min-w-0">{a.title || '（タイトル未設定）'}</span>
              <span className="ml-auto hidden sm:inline text-[12px] text-slate-400 flex-none">{fmt(a.published_at)}</span>
            </button>
            {isOpen && (
              <div className="px-4 pb-4 pt-3 space-y-3 border-t border-slate-200">
                <div className="flex flex-wrap items-center gap-2 justify-end">
                  <button type="button" onClick={() => void onToggleAuto(a)} disabled={busy !== ''}
                    className={`px-3 py-1.5 border text-[13px] font-bold disabled:opacity-50 ${a.auto_rotate ? 'border-emerald-300 text-emerald-700 bg-emerald-50' : 'border-slate-200 text-slate-500 bg-white'}`}>
                    {a.auto_rotate ? '自動投稿中' : '自動投稿にする'}
                  </button>
                  <button type="button" onClick={() => void onTogglePublish(a)} disabled={busy !== ''}
                    className="px-3 py-1.5 border border-indigo-200 text-indigo-700 text-[13px] font-bold disabled:opacity-50">
                    {a.is_published ? '非公開にする' : '公開にする'}
                  </button>
                  <button type="button" onClick={() => onRepostOpen(a)} disabled={busy !== ''}
                    title="投稿日時を今の時刻にして、もう一度出します（保存している会員には通知されません）"
                    className="px-3 py-1.5 border border-emerald-300 text-emerald-700 bg-emerald-50 text-[13px] font-bold disabled:opacity-50">
                    {busy === 'repost:' + a.id ? '処理中…' : '再投稿'}
                  </button>
                  <button type="button" onClick={() => void onDelete(a)} disabled={busy !== ''}
                    className="px-3 py-1.5 border border-rose-200 text-rose-600 bg-rose-50 text-[13px] font-bold disabled:opacity-50">
                    {busy === 'del:' + a.id ? '削除しています…' : '削除'}
                  </button>
                </div>
                <div>
                  <label className={LABEL}>タイトル <span className="text-rose-500">*</span></label>
                  <input className={INPUT} value={f.title} onChange={(e) => setForms((p) => ({ ...p, [a.id]: { ...f, title: e.target.value } }))} />
                </div>
                <div>
                  <label className={LABEL}>本文 <span className="text-rose-500">*</span></label>
                  <textarea rows={8} className={INPUT} value={f.content} onChange={(e) => setForms((p) => ({ ...p, [a.id]: { ...f, content: e.target.value } }))} />
                </div>
                <ImagePicker url={f.image_url} uploading={uploading === a.id} onPick={(e) => void onItemImage(a, e)}
                  onClear={() => setForms((p) => ({ ...p, [a.id]: { ...f, image_url: null } }))} />
                <p className="text-[12px] text-slate-400">※ 画像の差し替え・削除は「保存する」で確定します。</p>
                <div className="flex justify-end">
                  <button type="button" onClick={() => void onSave(a)} disabled={busy !== '' || uploading !== ''} className={SAVE_BTN}>
                    {busy === 'save:' + a.id ? '保存しています…' : '保存する'}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* 再投稿の確認 */}
      {repostId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => { if (!busy) setRepostId(null); }}>
          <div className="bg-white shadow-xl w-full max-w-sm p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <p className="text-[15px] font-bold text-slate-800 leading-relaxed">このお知らせを再投稿しますか？<br />投稿日時が今の時刻になり、フクエスの新着の先頭に出ます。</p>
            <p className="text-[12.5px] text-slate-500 leading-relaxed bg-slate-50 p-3 whitespace-pre-line">{'同じ内容の再投稿でトップの新着が上がるのは、30分に1回までです。\n内容を書き替えた場合は、すぐに上がります。'}</p>
            <CrosspostChecks linked={!!xProfileId} on={repX} setOn={setRepX} noReplies={repNoReplies} setNoReplies={setRepNoReplies} />
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setRepostId(null)} disabled={busy !== ''} className="px-4 py-2 border border-slate-300 text-[14px] font-bold text-slate-600 disabled:opacity-50">やめる</button>
              <button type="button" onClick={() => void onRepost()} disabled={busy !== ''} className={SAVE_BTN}>{busy ? '処理中…' : '再投稿する'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ConecfAnnouncePage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="announce" title="フクエスお知らせ" toast={toast}>
      {(a) => (a.salonId == null
        ? <div className={`${CARD} p-5 text-[14px] text-slate-500`}>店舗が選ばれていません。</div>
        : <Body salonId={a.salonId} enabled={!!a.enabledAt} onToast={showToast} />)}
    </ConecfShell>
  );
}
