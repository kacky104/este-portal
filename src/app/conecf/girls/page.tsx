'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { matchesSearch } from '@/lib/searchNormalize';
import { listConecfGirls, createConecfGirl, saveConecfGirlOrder, type ConecfGirlRow } from '@/app/actions/conecfGirls';
import { manualOrderToSave, moveInList } from '@/lib/therapistOrder';
import { setTherapistActive } from '@/app/actions/therapistAdmin';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';
import { getConecfFirstImport, requestConecfFirstImport, getConecfPhotoImport, requestConecfPhotoImport, type FirstImportStatus, type PhotoImportStatus } from '@/app/actions/conecfFirstImport';
import { parseBodyType } from '@/lib/bodyType';
import { startConecfEkichikaBulkEdit, previewConecfEkichikaPhotoRemovals, startConecfEsutamaBulkEdit, previewConecfEsutamaPhotoRemovals } from '@/app/actions/conecfGirlEdit';
import { PhotoRemoveConfirm, type PhotoRemoval } from './PhotoRemoveConfirm';
// ★ 第877便: 「セラピストページ連携」列（〇／✕）
import { CastLinkMark, useCastLinked } from '@/app/mypage/media/CastLinkMark';

// コネックエフ「女性一覧」（第398便・1c → 第413便でベンリー型に）。
// ★★ ベンリー（mrvenrey.jp の女性一覧）の形に寄せた（★ ベンリーから移る店舗様が迷わないため）。
//   ・上に緑の丸いボタン（＋新規登録・女性取り込み）
//   ・丸い検索欄と「1-N人 / N人中」
//   ・表：編集（青）｜写真 60×80｜名前（新人は上に NEW）｜年齢｜サイズ（T. と B.W.H. の2行）｜公開状態（スイッチ）
//   ★ 寸法・色はベンリーの実物で測った値（見出し 12px 太字・本文 14px・緑 #218925・青 #1558d6）。
// ★ 親データはフクエスの therapists（★ ここに出る人＝フクエスに居る人）。

const GREEN_PILL = 'inline-flex items-center gap-1.5 h-10 px-5 rounded-[28px] bg-[#218925] text-white text-[12px] shadow-sm disabled:opacity-40';
// ★ 第746便（カッキーさん）: 新規登録だけピンク
const PINK_PILL = 'inline-flex items-center gap-1.5 h-10 px-5 rounded-[28px] bg-[#e91e63] text-white text-[12px] shadow-sm disabled:opacity-40';
// ★ 第747便（カッキーさん）: PC では名前を固定幅（200px）にして、年齢との間の空白を無くす。★ 余りは右端（公開状態の右）に
// ★ 第762便（カッキーさん）: 「新人」「入店日」の列を消した（新人は名前の上に NEW）
// ★ 第877便（カッキーさん）: 公開状態の右に「セラピストページ連携」（PC 150px）。★ 第881便: スマホでは出さない
// ★ 第1384便（カッキーさん）: 左端に「つまみ」（並べ替え）・右端に「先頭へ」を足した。
//   スマホ: つまみ＋チェック＋編集 96px｜写真 68px｜名前｜年齢 32px｜先頭へ 40px ／ PC: 先頭の列を 96→124px・「先頭へ」は右端の余り（1fr）
const COLS = 'grid grid-cols-[96px_68px_1fr_32px_40px] md:grid-cols-[124px_76px_150px_64px_210px_110px_150px_1fr]'; // ★ 第763便: 名前 200→150px（年齢を名前に寄せる）・サイズ 210px

/** つまみの絵（点が6つ） */
function GripIcon() {
  return (
    <svg width="12" height="18" viewBox="0 0 12 18" fill="currentColor" aria-hidden>
      <circle cx="3" cy="3" r="1.6" /><circle cx="9" cy="3" r="1.6" />
      <circle cx="3" cy="9" r="1.6" /><circle cx="9" cy="9" r="1.6" />
      <circle cx="3" cy="15" r="1.6" /><circle cx="9" cy="15" r="1.6" />
    </svg>
  );
}

function sizeLines(raw: string | null): [string, string] {
  const b = parseBodyType(raw);
  if (!b) return ['', raw ?? ''];
  const t = b.height ? `T.${b.height}` : '';
  const bwh = [
    b.bust ? `B.${b.bust}${b.cup ? ` (${b.cup})` : ''}` : '',
    b.waist ? `W.${b.waist}` : '',
    b.hip ? `H.${b.hip}` : '',
  ].filter(Boolean).join(' ');
  return [t, bwh];
}

// ★★ 第406便: 駅ちかから最初に1回だけ取り込む（女性・年齢サイズ・週間の出勤）。
//   ★ 第413便: ベンリーの「女性取り込み」ボタンの位置へ。★ 押すと説明と確認が開く。
//   ★ 実際に読むのは VPS の周（15分ごと）なので、押してから数分〜20分ほどかかる。★ 1店舗1回だけ。
function useFirstImport(onDone: () => void) {
  const [st, setSt] = useState<FirstImportStatus | null>(null);
  const load = useCallback(async () => {
    const res = await getConecfFirstImport();
    if (res.ok) setSt(res.data);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const phase = st?.phase;
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'running') return;
    const id = window.setInterval(async () => {
      const res = await getConecfFirstImport();
      if (!res.ok) return;
      setSt(res.data);
      if (res.data.phase === 'done') onDone();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [phase, onDone]);
  return { st, load };
}

// ★★ 第427便: 駅ちかの写真だけ取り込む（1回）。★ 仕組みは最初の1回と同じ（VPS の周）。★ 写真が0枚の女性だけ
function usePhotoImport(onDone: () => void) {
  const [st, setSt] = useState<PhotoImportStatus | null>(null);
  const load = useCallback(async () => {
    const res = await getConecfPhotoImport();
    if (res.ok) setSt(res.data);
  }, []);
  useEffect(() => { void load(); }, [load]);
  const phase = st?.phase;
  useEffect(() => {
    if (phase !== 'waiting' && phase !== 'running') return;
    const id = window.setInterval(async () => {
      const res = await getConecfPhotoImport();
      if (!res.ok) return;
      setSt(res.data);
      if (res.data.phase === 'done') onDone();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [phase, onDone]);
  return { st, load };
}

function GirlsBody({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [rows, setRows] = useState<ConecfGirlRow[] | null>(null);
  const [salonId, setSalonId] = useState<number | null>(null);
  const castLinked = useCastLinked(salonId, true);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIsNew, setNewIsNew] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  // ★ 第420便: 駅ちかへまとめて更新（チェックした人）
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkNote, setBulkNote] = useState('');
  // ★★ 第428便: 駅ちかから写真が消える人がいるときの確認
  const [bulkRemovals, setBulkRemovals] = useState<PhotoRemoval[] | null>(null);

  const load = useCallback(async () => {
    const res = await listConecfGirls();
    if (res.ok) { setRows(res.data.girls); setSalonId(res.data.salonId); setError(''); }
    else setError(res.error);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onImportDone = useCallback(() => {
    void load();
    if (salonId != null) void revalidateSalon(salonId);
  }, [load, salonId]);
  const imp = useFirstImport(onImportDone);
  const photoImp = usePhotoImport(onImportDone);
  const [photoOpen, setPhotoOpen] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);

  const needEnabled = (m: string) => { onToast(m); };

  // ────────────────────────────────────────────────
  // ★★ 並べ替え（第1384便・2026-10-10・カッキーさん）: つまみをつまんで上下に動かす／「先頭へ」。
  //   ・動かせるのは公開中の方だけ（非公開の方は今までどおり下にまとめる）。
  //   ・離したら自動で保存（公開中の方の id を上から順に。受け口 saveConecfGirlOrder）。
  //   ・セラピスト登録状況一覧・週間スケジュールも、ここで決めた順になる。
  //   ・★ 検索で絞り込んでいる間は、つまみでは動かせない（一部しか見えていない状態で動かすと、思った場所に入らない）。
  //   ・★ マウスでも指でも動く形にするため、pointer の出来事を window で聞く（つまんだ行は並べ替えで DOM の中を動くので、
  //     行そのものに付けた聞き手・ポインターの捕まえ（setPointerCapture）は途中で外れることがある）。
  //     つまみには touch-none（指でつまんだとき、画面のスクロールにしない）。
  //   ・★ 画面の端まで持っていくと、自動で上下にスクロールする（40人いても下から上まで運べる）。
  const listRef = useRef<HTMLUListElement | null>(null);
  const rowsRef = useRef<ConecfGirlRow[] | null>(null);
  useEffect(() => { rowsRef.current = rows; }, [rows]);
  const [dragId, setDragId] = useState<number | null>(null);
  const [orderBusy, setOrderBusy] = useState(false);
  const dragStop = useRef<(() => void) | null>(null);
  useEffect(() => () => { dragStop.current?.(); }, []);

  const persistOrder = async (list: ConecfGirlRow[]) => {
    setOrderBusy(true);
    const res = await saveConecfGirlOrder({ ids: manualOrderToSave(list, (x) => x.id, (x) => !x.isActive) });
    setOrderBusy(false);
    if (!res.ok) { onToast(res.error); void load(); return; }
    onToast('並び順を保存しました');
  };

  const applyRows = (next: ConecfGirlRow[]) => { rowsRef.current = next; setRows(next); };

  const onGripDown = (e: React.PointerEvent<HTMLButtonElement>, g: ConecfGirlRow) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (!enabled) { needEnabled('並べ替えるには、ホームで「コネックエフに切り替える」を押してください'); return; }
    if (q.trim() !== '') { onToast('並べ替えは、検索の文字を消してから行ってください'); return; }
    if (orderBusy || dragStop.current) return;
    e.preventDefault();
    const pid = e.pointerId;
    const d = { id: g.id, y: e.clientY, moved: false, raf: 0 };

    // いま指（マウス）がある高さの行と入れ替える。★ 相手の行の半分を越えたときだけ（行ったり来たりしない）
    const reorder = () => {
      const ul = listRef.current;
      const cur = rowsRef.current;
      if (!ul || !cur) return;
      const box = ul.getBoundingClientRect();
      const el = document.elementFromPoint(box.left + Math.min(40, box.width / 2), d.y);
      const li = el instanceof Element ? (el.closest('li[data-gid]') as HTMLElement | null) : null;
      if (!li || !ul.contains(li) || li.dataset.pub !== '1') return;
      const targetId = Number(li.dataset.gid);
      if (targetId === d.id) return;
      const from = cur.findIndex((x) => x.id === d.id);
      const to = cur.findIndex((x) => x.id === targetId);
      if (from < 0 || to < 0) return;
      const r = li.getBoundingClientRect();
      const mid = r.top + r.height / 2;
      if (from < to ? d.y < mid : d.y > mid) return;
      const next = moveInList(cur, (x) => x.id, d.id, targetId);
      if (next === cur) return;
      d.moved = true;
      applyRows(next);
    };
    const tick = () => {
      const edge = 90;
      const h = window.innerHeight;
      const v = d.y < edge ? -Math.ceil((edge - d.y) / 5) : d.y > h - edge ? Math.ceil((d.y - (h - edge)) / 5) : 0;
      if (v !== 0) { window.scrollBy(0, v); reorder(); }
      d.raf = requestAnimationFrame(tick);
    };
    const move = (ev: PointerEvent) => { if (ev.pointerId !== pid) return; d.y = ev.clientY; reorder(); };
    const stop = () => {
      cancelAnimationFrame(d.raf);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      dragStop.current = null;
    };
    const end = (ev: PointerEvent) => {
      if (ev.pointerId !== pid) return;
      stop();
      setDragId(null);
      if (d.moved && rowsRef.current) void persistOrder(rowsRef.current);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
    dragStop.current = stop;
    d.raf = requestAnimationFrame(tick);
    setDragId(g.id);
  };

  const onMoveTop = async (g: ConecfGirlRow) => {
    if (!enabled) { needEnabled('並べ替えるには、ホームで「コネックエフに切り替える」を押してください'); return; }
    const cur = rowsRef.current;
    if (!cur || orderBusy || dragStop.current) return;
    const me = cur.find((x) => x.id === g.id);
    if (!me) return;
    const next = [me, ...cur.filter((x) => x.id !== g.id)];
    applyRows(next);
    await persistOrder(next);
  };

  const onBulk = async () => {
    if (!enabled) { needEnabled('更新するには、ホームで「コネックエフに切り替える」を押してください'); return; }
    if (picked.size === 0) { onToast('更新するセラピストにチェックを入れてください'); return; }
    setBulkBusy(true); setBulkNote('');
    const p = await previewConecfEkichikaPhotoRemovals({ ids: [...picked] });
    setBulkBusy(false);
    if (!p.ok) { onToast(p.error); return; }
    if (p.data.length > 0) { setBulkRemovals(p.data); return; }
    await sendBulk(false);
  };

  // ★★ 第430便: エステ魂へまとめて更新（プロフィールだけ・写真は送らない）
  const [esuRemovals, setEsuRemovals] = useState<PhotoRemoval[] | null>(null);
  const onBulkEsutama = async (allowRemove?: boolean) => {
    if (!enabled) { needEnabled('更新するには、ホームで「コネックエフに切り替える」を押してください'); return; }
    if (picked.size === 0) { onToast('更新するセラピストにチェックを入れてください'); return; }
    setBulkBusy(true); setBulkNote('');
    if (allowRemove === undefined) {
      const p = await previewConecfEsutamaPhotoRemovals({ ids: [...picked] });
      if (!p.ok) { setBulkBusy(false); onToast(p.error); return; }
      if (p.data.length > 0) { setBulkBusy(false); setEsuRemovals(p.data); return; }
    }
    const r = await startConecfEsutamaBulkEdit({ ids: [...picked], allowRemove: allowRemove === true });
    setBulkBusy(false);
    setEsuRemovals(null);
    if (!r.ok) { onToast(r.error); return; }
    if (r.data.queued > 0) { onToast(`${r.data.queued}名のエステ魂への更新を受け付けました。結果は「更新結果」に出ます`); setPicked(new Set()); }
    else onToast('更新できるセラピストがいませんでした');
    // ★ 第1289便: 始められなかった枠（notes）も出す
    setBulkNote([
      r.data.skipped.length > 0 ? `エステ魂へ更新しなかった方：${r.data.skipped.map((x) => `${x.name}（${x.reason}）`).join('、')}` : '',
      ...(r.data.notes ?? []),
    ].filter(Boolean).join('　／　'));
  };

  const sendBulk = async (allowRemove: boolean) => {
    setBulkBusy(true);
    const r = await startConecfEkichikaBulkEdit({ ids: [...picked], allowRemove });
    setBulkBusy(false);
    setBulkRemovals(null);
    if (!r.ok) { onToast(r.error); return; }
    const sk = r.data.skipped;
    if (r.data.queued > 0) {
      onToast(`${r.data.queued}名の駅ちかへの更新を受け付けました。結果は「更新結果」に出ます`);
      setPicked(new Set());
    } else onToast('更新できるセラピストがいませんでした');
    // ★ 第1289便: 始められなかった枠（notes）も出す
    setBulkNote([
      sk.length > 0 ? `更新しなかった方：${sk.map((x) => `${x.name}（${x.reason}）`).join('、')}` : '',
      ...(r.data.notes ?? []),
    ].filter(Boolean).join('　／　'));
  };

  const onAdd = async () => {
    setBusy(true);
    const res = await createConecfGirl({ name: newName, isNewFace: newIsNew });
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    if (salonId != null) void revalidateSalon(salonId);
    // ★ 第889便（カッキーさん）: 登録したら、編集ページで「リンク・QRで招待」の小窓をすぐ開く
    window.location.href = href(`/girls/${res.data.id}?invite=1`);
  };

  const onToggle = async (g: ConecfGirlRow) => {
    if (!enabled) { needEnabled('切り替えるには、ホームで「コネックエフに切り替える」を押してください'); return; }
    if (salonId == null) return;
    const next = !g.isActive;
    setToggling(g.id);
    const res = await setTherapistActive({ therapistId: g.id, salonId, isActive: next, via: 'conecf' });
    setToggling(null);
    if (!res.ok) { onToast(res.error); return; }
    setRows((p) => (p ? p.map((x) => (x.id === g.id ? { ...x, isActive: next } : x)) : p));
    void revalidateSalon(salonId); void revalidateTherapist(g.id);
    onToast(next ? `${g.name}さんを公開にしました` : `${g.name}さんを非公開にしました（今すぐと、この先の出勤は外しました）`);
  };

  const onImport = async () => {
    setImportBusy(true);
    const res = await requestConecfFirstImport();
    setImportBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    setImportOpen(false);
    onToast('受け付けました。20分ほどで反映されます');
    void imp.load();
  };

  const onPhotoImport = async () => {
    setPhotoBusy(true);
    const res = await requestConecfPhotoImport();
    setPhotoBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    setPhotoOpen(false);
    onToast('受け付けました。20分ほどで反映されます');
    void photoImp.load();
  };

  if (error) return <div className="bg-white border border-slate-200 p-5 text-[14px] text-slate-500">読み込めませんでした（{error}）</div>;

  const shown = (rows ?? []).filter((r) => matchesSearch(r.name, q));   // ★ 第444便: ひらがな・カタカナ・大小文字の違いを気にせず絞り込む（フクエスと同じ規則）
  const total = rows?.length ?? 0;
  const firstPublicId = (rows ?? []).find((r) => r.isActive)?.id ?? null;   // ★ 第1384便: いちばん上の方には「先頭へ」を出さない
  const canSort = enabled && q.trim() === '' && !orderBusy;
  const st = imp.st;
  const canImport = !!st && st.hasEkichika && st.phase === 'none';
  const pst = photoImp.st;
  const canPhotoImport = !!pst && pst.hasEkichika && pst.phase === 'none' && !pst.firstImportBusy && pst.noPhotoCount > 0;   // ★ 第429便: 最初の取り込みを押していない店（ラビリンス様）でも出す

  return (
    <div className="space-y-4 text-[14px] text-[#212121]">
      {/* ── 上のボタン（ベンリーと同じ緑の丸いボタン）── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => (enabled ? setAdding((x) => !x) : needEnabled('登録するには、ホームで「コネックエフに切り替える」を押してください'))}
          className={PINK_PILL}
        >
          <span className="text-[18px] leading-none">＋</span>新規登録
        </button>
        {canImport && (
          <button
            type="button"
            onClick={() => (enabled ? setImportOpen((x) => !x) : needEnabled('取り込むには、ホームで「コネックエフに切り替える」を押してください'))}
            className={GREEN_PILL}
          >
            <span className="text-[16px] leading-none">⤓</span>セラピスト取り込み
          </button>
        )}
        {canPhotoImport && (
          <button
            type="button"
            onClick={() => (enabled ? setPhotoOpen((x) => !x) : needEnabled('取り込むには、ホームで「コネックエフに切り替える」を押してください'))}
            className={GREEN_PILL}
          >
            <span className="text-[16px] leading-none">⤓</span>写真取り込み
          </button>
        )}
        <button
          type="button"
          disabled={bulkBusy}
          onClick={() => void onBulk()}
          className="inline-flex items-center h-8 px-3 rounded border border-[#218925] bg-[#fefdfd] text-[#218925] text-[12px] disabled:opacity-40"
        >
          {bulkBusy ? '受け付けています…' : `駅ちかへまとめて更新${picked.size > 0 ? `（${picked.size}名）` : ''}`}
        </button>
        <button
          type="button"
          disabled={bulkBusy}
          onClick={() => void onBulkEsutama()}
          className="inline-flex items-center h-8 px-3 rounded border border-[#218925] bg-[#fefdfd] text-[#218925] text-[12px] disabled:opacity-40"
        >
          {bulkBusy ? '受け付けています…' : `エステ魂へまとめて更新${picked.size > 0 ? `（${picked.size}名）` : ''}`}
        </button>
        <Link href={href('/girls/sync')} className="inline-flex items-center h-8 px-3 rounded border border-slate-300 bg-[#fefdfd] text-[12px]">
          サイトへ登録
        </Link>
      </div>

      {esuRemovals && (
        <PhotoRemoveConfirm site="エステ魂" items={esuRemovals} busy={bulkBusy}
          onRemove={() => void onBulkEsutama(true)} onKeep={() => void onBulkEsutama(false)} onCancel={() => setEsuRemovals(null)} />
      )}
      {bulkRemovals && (
        <PhotoRemoveConfirm items={bulkRemovals} busy={bulkBusy}
          onRemove={() => void sendBulk(true)} onKeep={() => void sendBulk(false)} onCancel={() => setBulkRemovals(null)} />
      )}
      {bulkNote && <p className="bg-white border border-slate-200 px-4 py-2.5 text-[12px] text-amber-700">{bulkNote}</p>}

      {/* ── 新規登録 ── */}
      {adding && (
        <div className="bg-white border border-slate-200 p-4 space-y-3">
          <p className="font-bold">新しいセラピストを登録</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="セラピスト名（10文字まで）"
              maxLength={10}
              className="flex-1 min-w-[180px] h-[34px] border border-slate-300 rounded px-2 text-[14px] focus:outline-none focus:border-[#1e88e5]"
            />
            <label className="flex items-center gap-1.5">
              <input type="checkbox" checked={newIsNew} onChange={(e) => setNewIsNew(e.target.checked)} className="accent-[#1e88e5]" />
              新人に設定する
            </label>
            <button type="button" disabled={busy || newName.trim() === ''} onClick={() => void onAdd()} className="h-8 px-4 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">
              {busy ? '登録しています…' : '登録して編集へ'}
            </button>
          </div>
          <p className="text-[12px] text-slate-500">登録するとフクエスにも公開の状態で追加されます。駅ちか・エステ魂への登録は「サイトへ登録」から行います。</p>
        </div>
      )}

      {/* ── 女性取り込み（駅ちかから最初の1回だけ）── */}
      {importOpen && canImport && (
        <div className="bg-white border border-slate-200 p-4 space-y-3">
          <p className="font-bold">駅ちかからセラピストと出勤を取り込む（最初の1回だけ）</p>
          <ul className="text-[13px] text-slate-600 leading-relaxed list-disc pl-5">
            <li>駅ちかに載っているセラピスト・年齢・サイズ・1週間の出勤を、まとめて取り込みます</li>
            <li>まだ居ないセラピストは公開で追加します（新人マークは付けません）</li>
            <li>入力済みの出勤の日はそのまま残します／年齢・サイズは空欄だけ埋めます</li>
            <li>写真がまだ無いセラピストは、駅ちかの写真も取り込みます（写真を入れてあるセラピストはそのまま）</li>
            <li>1回だけ押せます</li>
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setImportOpen(false)} disabled={importBusy} className="h-8 px-4 rounded bg-black/[0.07] text-[12px]">キャンセル</button>
            <button type="button" onClick={() => void onImport()} disabled={importBusy} className="h-8 px-4 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">
              {importBusy ? '受け付けています…' : '取り込む'}
            </button>
          </div>
        </div>
      )}
      {/* ── 写真取り込み（駅ちかから1回だけ・第427便）── */}
      {photoOpen && canPhotoImport && (
        <div className="bg-white border border-slate-200 p-4 space-y-3">
          <p className="font-bold">駅ちかから写真を取り込む（1回だけ）</p>
          <ul className="text-[13px] text-slate-600 leading-relaxed list-disc pl-5">
            <li>写真がまだ無いセラピスト（{pst?.noPhotoCount ?? 0}名）に、駅ちかに載っている写真を取り込みます</li>
            <li>写真を入れてあるセラピストはそのままです</li>
            <li>駅ちかで写真の枠が空いている場合は、詰めて並べます（次に「駅ちかへ更新」したとき、駅ちか側も詰まります）</li>
            <li>取り込んだあとは、コネックエフで写真を消すと駅ちかからも消えます</li>
            <li>1回だけ押せます</li>
          </ul>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPhotoOpen(false)} disabled={photoBusy} className="h-8 px-4 rounded bg-black/[0.07] text-[12px]">キャンセル</button>
            <button type="button" onClick={() => void onPhotoImport()} disabled={photoBusy} className="h-8 px-4 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40">
              {photoBusy ? '受け付けています…' : '取り込む'}
            </button>
          </div>
        </div>
      )}
      {pst && (pst.phase === 'waiting' || pst.phase === 'running') && (
        <p className="bg-white border border-slate-200 px-4 py-2.5 text-[13px] text-[#1558d6]">駅ちかから写真を取り込んでいます…（20分ほどで反映されます）</p>
      )}
      {pst && pst.phase === 'done' && pst.summary && pst.doneAt && Date.now() - Date.parse(pst.doneAt) < 24 * 60 * 60 * 1000 && (
        <p className="bg-white border border-slate-200 px-4 py-2.5 text-[12px] text-slate-500">駅ちかから写真を取り込みました（{pst.summary.people}名）</p>
      )}
      {st && (st.phase === 'waiting' || st.phase === 'running') && (
        <p className="bg-white border border-slate-200 px-4 py-2.5 text-[13px] text-[#1558d6]">駅ちかから取り込んでいます…（20分ほどで反映されます）</p>
      )}
      {st && st.phase === 'done' && st.summary && st.summary.unmatched.length > 0 && (
        <p className="bg-white border border-slate-200 px-4 py-2.5 text-[12px] text-slate-500">
          駅ちかから取り込めなかったセラピスト：{st.summary.unmatched.join('、')}（「＋新規登録」から登録してください）
        </p>
      )}

      {/* ── 表 ── */}
      <div className="bg-white border border-slate-200">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <label className="flex items-center gap-2 flex-1 min-w-[200px] max-w-[520px] h-10 px-4 rounded-full border border-[#90caf9] bg-[#f5faff]">
            <span className="text-slate-400" aria-hidden>⌕</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="セラピスト名で検索"
              className="flex-1 min-w-0 bg-transparent text-[14px] focus:outline-none"
            />
          </label>
          <span className="ml-auto text-[14px] tabular-nums">{rows ? `${shown.length > 0 ? 1 : 0}-${shown.length}人 / ${total}人中` : ''}</span>
        </div>
        {/* ★ 第1384便: 並べ替えの説明（2人以上いるときだけ） */}
        {rows && rows.length > 1 && (
          <p className="px-5 -mt-1.5 pb-3 text-[12px] leading-relaxed text-slate-500">
            左の<span className="inline-block align-[-3px] mx-1 text-slate-400"><GripIcon /></span>をつまんで上下に動かすと、並び順を変えられます（「先頭へ」でいちばん上へ）。
            セラピスト登録状況一覧・週間スケジュールも同じ順になります。
          </p>
        )}

        <div className={`${COLS} items-center px-2 h-9 border-b border-slate-200 text-[12px] font-bold text-black/50`}>
          <label className="pl-1 md:pl-2 flex items-center gap-1 font-normal cursor-pointer">
            <span className="w-7 md:mr-1" aria-hidden />
            <input
              type="checkbox"
              checked={shown.length > 0 && shown.every((g) => picked.has(g.id))}
              onChange={(e) => setPicked(e.target.checked ? new Set(shown.map((g) => g.id)) : new Set())}
              className="accent-[#1e88e5]"
              aria-label="すべて選ぶ"
            />
            全
          </label>
          <span />
          <span>名前</span>
          <span className="text-center">年齢</span>
          <span className="hidden md:block">サイズ</span>
          <span className="hidden md:block text-center">公開状態</span>
          <span className="hidden md:block text-center">セラピストページ連携</span>
          <span />
        </div>

        {!rows && <p className="p-5 text-slate-400">読み込み中…</p>}
        {rows && rows.length === 0 && <p className="p-5 text-slate-500">まだセラピストが登録されていません。</p>}
        <ul ref={listRef} className={dragId != null ? 'select-none' : undefined}>
          {shown.map((g) => {
            const [t, bwh] = sizeLines(g.bodyType);
            return (
              <li
                key={g.id}
                data-gid={g.id}
                data-pub={g.isActive ? '1' : '0'}
                className={`${COLS} items-center px-2 py-2.5 border-b border-slate-100 ${dragId === g.id ? 'relative z-10 bg-[#e3f2fd] shadow-[inset_0_0_0_2px_#1e88e5]' : 'hover:bg-black/[0.03]'}`}
              >
                <span className="pl-1 md:pl-2 flex items-center gap-1 md:gap-2">
                  {/* ★ 第1384便: つまみ（公開中の方だけ）。つまんで上下に動かすと並び順が変わる */}
                  {g.isActive ? (
                    <button
                      type="button"
                      onPointerDown={(e) => onGripDown(e, g)}
                      title={canSort ? 'つまんで上下に動かす' : q.trim() !== '' ? '検索の文字を消すと並べ替えられます' : undefined}
                      aria-label={`${g.name}の並び順を動かす`}
                      className={`w-7 h-11 flex-none grid place-items-center rounded touch-none select-none ${canSort ? 'cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 hover:bg-black/5' : 'text-slate-200'}`}
                    >
                      <GripIcon />
                    </button>
                  ) : (
                    <span className="w-7 flex-none" aria-hidden />
                  )}
                  <input
                    type="checkbox"
                    checked={picked.has(g.id)}
                    onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(g.id); else n.delete(g.id); return n; })}
                    className="accent-[#1e88e5]"
                    aria-label={`${g.name}を選ぶ`}
                  />
                  <Link href={href(`/girls/${g.id}`)} className="inline-flex items-center gap-1 text-[12px] text-[#1558d6] underline underline-offset-2">
                    編集
                  </Link>
                </span>
                <Link href={href(`/girls/${g.id}`)} className="block w-[60px] h-[80px] bg-slate-100 overflow-hidden">
                  {g.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={g.imageUrl} alt="" className="w-full h-full object-cover" />
                    : <span className="w-full h-full grid place-items-center text-[11px] text-slate-400">写真なし</span>}
                </Link>
                <span className={`min-w-0 pr-2 ${g.isActive ? '' : 'text-slate-400'}`}>
                  {g.isNewFace && (
                    <span className="block w-fit mb-1 px-1.5 rounded-sm bg-[#e91e63] text-white text-[10.5px] font-bold leading-[18px] tracking-wide">NEW</span>
                  )}
                  <span className="block truncate">{g.name || '（名前なし）'}</span>
                </span>
                <span className="text-center tabular-nums">{g.age ?? ''}</span>
                <span className="hidden md:block leading-snug tabular-nums">
                  {t}{t && <br />}{bwh}
                </span>
                <span className="hidden md:flex justify-center">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={g.isActive}
                    disabled={toggling === g.id}
                    onClick={() => void onToggle(g)}
                    className={`relative h-6 w-[76px] rounded-full text-[11px] text-white transition-colors disabled:opacity-50 ${g.isActive ? 'bg-[#1e88e5]' : 'bg-slate-400'}`}
                  >
                    <span className={`absolute top-1/2 -translate-y-1/2 ${g.isActive ? 'left-2' : 'right-2'}`}>{g.isActive ? '公開中' : '非公開'}</span>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow ${g.isActive ? 'right-0.5' : 'left-0.5'}`} />
                  </button>
                </span>
                <span className="hidden md:block text-center">
                  {castLinked && <CastLinkMark linked={castLinked.has(String(g.id))} />}
                </span>
                {/* ★ 第1384便: 先頭へ（公開中で、いちばん上でない方） */}
                <span className="flex justify-center md:justify-start md:pl-3">
                  {g.isActive && g.id !== firstPublicId && (
                    <button
                      type="button"
                      onClick={() => void onMoveTop(g)}
                      disabled={orderBusy}
                      title="いちばん上へ動かす"
                      aria-label={`${g.name}をいちばん上へ動かす`}
                      className="h-8 px-2 md:px-2.5 inline-flex items-center gap-1 rounded border border-slate-300 bg-white text-[11px] text-slate-600 whitespace-nowrap hover:bg-slate-50 disabled:opacity-40"
                    >
                      <span aria-hidden className="text-[13px] leading-none">⤒</span>
                      <span className="hidden md:inline">先頭へ</span>
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

export default function ConecfGirlsPage() {
  const { toast, showToast } = useToast();
  return (
    <ConecfShell current="girls" title="セラピスト一覧" toast={toast}>
      {(a) => <GirlsBody enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
