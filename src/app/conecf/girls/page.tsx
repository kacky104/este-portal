'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ConecfShell } from '../ConecfShell';
import { useConecfHref } from '../ConecfBase';
import { useToast } from '@/app/components/useToast';
import { listConecfGirls, createConecfGirl, type ConecfGirlRow } from '@/app/actions/conecfGirls';
import { setTherapistActive } from '@/app/actions/therapistAdmin';
import { revalidateSalon, revalidateTherapist } from '@/app/lib/revalidateTop';
import { getConecfFirstImport, requestConecfFirstImport, type FirstImportStatus } from '@/app/actions/conecfFirstImport';
import { parseBodyType } from '@/lib/bodyType';

// コネックエフ「女性一覧」（第398便・1c → 第413便でベンリー型に）。
// ★★ ベンリー（mrvenrey.jp の女性一覧）の形に寄せた（★ ベンリーから移る店舗様が迷わないため）。
//   ・上に緑の丸いボタン（＋新規登録・女性取り込み）
//   ・丸い検索欄と「1-N人 / N人中」
//   ・表：編集（青）｜写真 60×80｜名前｜年齢｜新人｜サイズ（T. と B.W.H. の2行）｜入店日｜公開状態（スイッチ）
//   ★ 寸法・色はベンリーの実物で測った値（見出し 12px 太字・本文 14px・緑 #218925・青 #1558d6）。
// ★ 親データはフクエスの therapists（★ ここに出る人＝フクエスに居る人）。

const GREEN_PILL = 'inline-flex items-center gap-1.5 h-10 px-5 rounded-[28px] bg-[#218925] text-white text-[12px] shadow-sm disabled:opacity-40';
const COLS = 'grid grid-cols-[64px_68px_1fr_48px_72px] md:grid-cols-[80px_76px_1fr_64px_72px_190px_110px_110px]';

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

function GirlsBody({ enabled, onToast }: { enabled: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [rows, setRows] = useState<ConecfGirlRow[] | null>(null);
  const [salonId, setSalonId] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newIsNew, setNewIsNew] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toggling, setToggling] = useState<number | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importBusy, setImportBusy] = useState(false);

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

  const needEnabled = (m: string) => { onToast(m); };

  const onAdd = async () => {
    setBusy(true);
    const res = await createConecfGirl({ name: newName, isNewFace: newIsNew });
    setBusy(false);
    if (!res.ok) { onToast(res.error); return; }
    if (salonId != null) void revalidateSalon(salonId);
    window.location.href = href(`/girls/${res.data.id}`);
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

  if (error) return <div className="bg-white border border-slate-200 p-5 text-[14px] text-slate-500">読み込めませんでした（{error}）</div>;

  const shown = (rows ?? []).filter((r) => q.trim() === '' || r.name.includes(q.trim()));
  const total = rows?.length ?? 0;
  const st = imp.st;
  const canImport = !!st && st.hasEkichika && st.phase === 'none';

  return (
    <div className="space-y-4 text-[14px] text-[#212121]">
      {/* ── 上のボタン（ベンリーと同じ緑の丸いボタン）── */}
      <div className="flex flex-wrap items-center gap-2.5">
        <button
          type="button"
          onClick={() => (enabled ? setAdding((x) => !x) : needEnabled('登録するには、ホームで「コネックエフに切り替える」を押してください'))}
          className={GREEN_PILL}
        >
          <span className="text-[18px] leading-none">＋</span>新規登録
        </button>
        {canImport && (
          <button
            type="button"
            onClick={() => (enabled ? setImportOpen((x) => !x) : needEnabled('取り込むには、ホームで「コネックエフに切り替える」を押してください'))}
            className={GREEN_PILL}
          >
            <span className="text-[16px] leading-none">⤓</span>女性取り込み
          </button>
        )}
        <Link href={href('/girls/sync')} className="inline-flex items-center h-8 px-3 rounded border border-slate-300 bg-[#fefdfd] text-[12px]">
          サイトへ登録
        </Link>
      </div>

      {/* ── 新規登録 ── */}
      {adding && (
        <div className="bg-white border border-slate-200 p-4 space-y-3">
          <p className="font-bold">新しい女性を登録</p>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="女性名（10文字まで）"
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
          <p className="font-bold">駅ちかから女性と出勤を取り込む（最初の1回だけ）</p>
          <ul className="text-[13px] text-slate-600 leading-relaxed list-disc pl-5">
            <li>駅ちかに載っている女性・年齢・サイズ・1週間の出勤を、まとめて取り込みます</li>
            <li>まだ居ない女性は公開で追加します（新人マークは付けません）</li>
            <li>入力済みの出勤の日はそのまま残します／年齢・サイズは空欄だけ埋めます</li>
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
      {st && (st.phase === 'waiting' || st.phase === 'running') && (
        <p className="bg-white border border-slate-200 px-4 py-2.5 text-[13px] text-[#1558d6]">駅ちかから取り込んでいます…（20分ほどで反映されます）</p>
      )}
      {st && st.phase === 'done' && st.summary && st.summary.unmatched.length > 0 && (
        <p className="bg-white border border-slate-200 px-4 py-2.5 text-[12px] text-slate-500">
          駅ちかから取り込めなかった女性：{st.summary.unmatched.join('、')}（「＋新規登録」から登録してください）
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
              placeholder="女性名で検索"
              className="flex-1 min-w-0 bg-transparent text-[14px] focus:outline-none"
            />
          </label>
          <span className="ml-auto text-[14px] tabular-nums">{rows ? `${shown.length > 0 ? 1 : 0}-${shown.length}人 / ${total}人中` : ''}</span>
        </div>

        <div className={`${COLS} items-center px-2 h-9 border-b border-slate-200 text-[12px] font-bold text-black/50`}>
          <span />
          <span />
          <span>名前</span>
          <span className="text-center">年齢</span>
          <span className="text-center">新人</span>
          <span className="hidden md:block">サイズ</span>
          <span className="hidden md:block">入店日</span>
          <span className="hidden md:block text-center">公開状態</span>
        </div>

        {!rows && <p className="p-5 text-slate-400">読み込み中…</p>}
        {rows && rows.length === 0 && <p className="p-5 text-slate-500">まだ女性が登録されていません。</p>}
        <ul>
          {shown.map((g) => {
            const [t, bwh] = sizeLines(g.bodyType);
            return (
              <li key={g.id} className={`${COLS} items-center px-2 py-2.5 border-b border-slate-100 hover:bg-black/[0.03]`}>
                <span className="pl-2">
                  <Link href={href(`/girls/${g.id}`)} className="inline-flex items-center gap-1 text-[12px] text-[#1558d6] underline underline-offset-2">
                    <span aria-hidden>✎</span>編集
                  </Link>
                </span>
                <Link href={href(`/girls/${g.id}`)} className="block w-[60px] h-[80px] bg-slate-100 overflow-hidden">
                  {g.imageUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={g.imageUrl} alt="" className="w-full h-full object-cover" />
                    : <span className="w-full h-full grid place-items-center text-[11px] text-slate-400">写真なし</span>}
                </Link>
                <span className={`min-w-0 truncate pr-2 ${g.isActive ? '' : 'text-slate-400'}`}>{g.name || '（名前なし）'}</span>
                <span className="text-center tabular-nums">{g.age ?? ''}</span>
                <span className="flex items-center justify-center gap-1 text-[13px]">
                  <span className={`w-4 h-4 grid place-items-center rounded-sm border ${g.isNewFace ? 'bg-[#1e88e5] border-[#1e88e5] text-white' : 'border-slate-400'}`} aria-hidden>
                    {g.isNewFace ? '✓' : ''}
                  </span>
                  <span className={g.isNewFace ? 'font-bold' : ''}>新人</span>
                </span>
                <span className="hidden md:block leading-snug tabular-nums">
                  {t}{t && <br />}{bwh}
                </span>
                <span className="hidden md:block tabular-nums">{g.joinedOn ? g.joinedOn.replace(/-0?/g, '/').replace(/^(\d{4})\//, '$1/') : ''}</span>
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
    <ConecfShell current="girls" title="女性一覧" toast={toast}>
      {(a) => <GirlsBody enabled={!!a.enabledAt} onToast={showToast} />}
    </ConecfShell>
  );
}
