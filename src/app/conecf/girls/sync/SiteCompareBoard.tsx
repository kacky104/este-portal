'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getSalonTherapists, getMediaOverview, getMediaLinkPairs,
  linkTherapistMediaId, unlinkTherapistMediaId, startMediaRosterRead, startMediaTherapistCreate, startMediaTherapistCreatePush,
} from '@/app/actions/mediaCredentials';
import { listConecfTargetOffs, getConecfGirlOrder } from '@/app/actions/conecfGirls';
import { sortTherapistsByManual } from '@/lib/therapistOrder';
import { canLink, strengthLabel, missingLinkKind, type LinkPairs } from '@/lib/mediaLinkPairs';
import { waitToastNote } from '@/lib/relayWait';
import { useMediaBrand } from '@/app/mypage/media/mediaBrand';
import { summarizeCreatePlan } from '@/app/mypage/media/createPlanSummary';

// コネックエフ「女性をサイトへ登録」（第736便・2026-09-23・カッキーさんの決定）。
// ★ ベンリーの「女性登録状況一覧」と同じ形: 縦に女性、横にサイト、○×で一目。
//   ★ それまでの TherapistBoard（サイトごとのタブ → 連携済み／確かめられていない方／新人 → 1人1行）は
//     「この子はどこに出ていてどこに出ていないか」を頭の中で合成する必要があった。★ 表なら合成が要らない。
//   ★ 「新人」の絞りは無くした（名前の横に印を出す）。絞りは「差異がある子だけ」の1つ。
// ★ 中身（名簿の読み直し・連携・登録）は TherapistBoard と同じ action。★ 画面の形だけ変えた。
//
// マスの意味:
//   ○ 連携済み（番号が結びつき、名簿にもいる）
//   △ 確かめられません（番号が無い）→ 押すと候補と連携／一覧から選ぶ／登録
//   × 名簿にいません（番号はあるが向こうに無い）→ 押すと連携を外す／登録
//   ◌ 反映待ち（第1699便: 結びついたのが名簿を読んだあと＝作ったばかり。名簿を読み直せば ○）→ 押すと再読込の案内
//   — まだ読んでいません（名簿の写しが無い）
//   NO DATA ID・PASS が無いサイト

type Therapist = { id: string; name: string; imageUrl: string | null; isNewFace: boolean; isActive: boolean };
type Site = { provider: string; slot: number; label: string; direction: string; hasCredential: boolean };
type Cell = 'ok' | 'unlinked' | 'missing' | 'pending' | 'unknown';

const ROSTER_STALE_MS = 30 * 60 * 1000;
/** ★ 第1700便（B-2）: 名簿を読んでから・押してから、この間は「再読込」を押せない（押すたびに相手サイトへログインするため） */
const REREAD_COOLDOWN_MS = 2 * 60 * 1000;
const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

function fmtAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // ★ 第774便（カッキーさん）: 日付だけ（時刻は出さない・列を詰めるため）
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
// ★ 第759便: 運営向けの印（★）と強調（**）も剥がす（試し打ちの注意の文言に入っている）
function plainText(s: string): string { return s.replace(/<[^>]+>/g, '').replace(/★+\s*/g, '').replace(/\*\*/g, ''); }

export function SiteCompareBoard({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const brand = useMediaBrand();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [pairsOf, setPairsOf] = useState<Record<string, { pairs: LinkPairs; readAt: string | null; linkedAtOf: Record<number, string> }>>({});
  const [targetOffs, setTargetOffs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [q, setQ] = useState('');
  const [reading, setReading] = useState('');
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<{ tid: string; key: string } | null>(null);
  const [pick, setPick] = useState('');
  // ★ 第759便: 「新しく登録」は先に送る内容を見せる（試し打ち＝サイトへは何も送らない）→「登録する」で送る
  const [preview, setPreview] = useState<{ plan: Record<string, unknown>; warnings: string[] } | null>(null);
  const autoRead = useRef<Set<string>>(new Set());

  const key = (s: { provider: string; slot: number }) => s.provider + '#' + s.slot;

  const load = useCallback(async () => {
    if (salonId == null) return;
    const [t, ov, offs, ord] = await Promise.all([getSalonTherapists({ salonId }), getMediaOverview({ salonId }), listConecfTargetOffs(), getConecfGirlOrder()]);
    setTargetOffs(new Set(offs.ok ? offs.data.offs : []));
    if (!t.ok) { setError(t.error); setLoading(false); return; }
    // ★ 第1384便: セラピスト一覧と同じ順（店舗様が決めた順。無ければ あいうえお順・非公開の方は下）
    setTherapists(sortTherapistsByManual(
      t.data.map((x) => ({ id: x.id, name: x.name, imageUrl: x.imageUrl, isNewFace: x.isNewFace, isActive: x.isActive })),
      (x) => Number(x.id), (x) => x.name, (x) => !x.isActive, ord.ok ? ord.data.order : [],
    ));
    const all = ov.ok ? (ov.data.sites as Site[]) : [];
    // ★ 列にするのは ID・PASS があるサイト（駅ちか・エステ魂）。★ 同じ枠は1列
    const cols: Site[] = [];
    for (const s of all) {
      if (!['ekichika', 'esutama'].includes(s.provider)) continue;
      if (cols.some((c) => c.provider === s.provider && c.slot === s.slot)) continue;
      cols.push(s);
    }
    setSites(cols);
    // ★ 各列の名簿の写し（結び）を読む。★ 古ければ読み直しを積む（TherapistBoard と同じ）
    const results = await Promise.all(cols.map(async (s) => {
      if (!s.hasCredential) return [key(s), null] as const;
      const r = await getMediaLinkPairs({ salonId, provider: s.provider, slot: s.slot });
      if (!r.ok) return [key(s), null] as const;
      const stale = !r.data.readAtISO || Date.now() - Date.parse(r.data.readAtISO) > ROSTER_STALE_MS;
      if (stale && !autoRead.current.has(key(s))) {
        autoRead.current.add(key(s));
        void startMediaRosterRead({ salonId, provider: s.provider, slot: s.slot });
      }
      return [key(s), { pairs: r.data.pairs, readAt: r.data.readAtISO, linkedAtOf: r.data.linkedAtOf ?? {} }] as const;
    }));
    const m: Record<string, { pairs: LinkPairs; readAt: string | null; linkedAtOf: Record<number, string> }> = {};
    for (const [k, v] of results) if (v) m[k] = v;
    setPairsOf(m);
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  if (salonId == null) return null;

  const cellOf = (t: Therapist, s: Site): Cell => {
    const p = pairsOf[key(s)];
    if (!p || !p.pairs.known) return 'unknown';
    if (p.pairs.unlinked.some((u) => String(u.therapistId) === t.id)) return 'unlinked';
    const l = p.pairs.linked.find((x) => String(x.therapistId) === t.id);
    if (!l) return 'unlinked';
    if (l.onMedia) return 'ok';
    // ★★ 第1699便（A-5・A-7）: 名簿を読んだあとに結びついた方は「反映待ち」（写しが古いだけ）。外させない
    return missingLinkKind(p.linkedAtOf[Number(t.id)], p.readAt) === 'pending' ? 'pending' : 'missing';
  };

  // ★ 第1700便（B-2）: 押した時刻（この画面を開いているあいだだけ覚える）
  const [pressedAt, setPressedAt] = useState<Record<string, number>>({});
  const [, setTick] = useState(0);
  useEffect(() => { const id = window.setInterval(() => setTick((n) => n + 1), 30_000); return () => window.clearInterval(id); }, []);
  /** 再読込を押せるまでの残り（ms）。0 なら押せる */
  const coolLeft = (s: Site): number => {
    const read = Date.parse(String(pairsOf[key(s)]?.readAt ?? ''));
    const last = Math.max(Number.isFinite(read) ? read : 0, pressedAt[key(s)] ?? 0);
    return Math.max(0, last + REREAD_COOLDOWN_MS - Date.now());
  };
  const onRead = async (s: Site) => {
    if (coolLeft(s) > 0) { onToast('少し前に読み直したばかりです。数分後に画面を開き直すと反映されます'); return; }
    setPressedAt((m) => ({ ...m, [key(s)]: Date.now() }));
    setReading(key(s));
    try {
      const res = await startMediaRosterRead({ salonId, provider: s.provider, slot: s.slot });
      if (!res.ok) { onToast(res.error); return; }
      onToast(`${s.label}の名簿を読み直しています。数分後にこの画面を開き直すと反映されます`);
    } finally { setReading(''); }
  };
  const onLink = async (t: Therapist, s: Site, castId: string) => {
    const p = pairsOf[key(s)];
    if (!p) return;
    const v = canLink(p.pairs, Number(t.id), castId);
    if (!v.ok) { onToast(v.error); return; }
    setBusy(t.id);
    try {
      const res = await linkTherapistMediaId({ salonId, provider: s.provider, slot: s.slot, therapistId: Number(t.id), castId });
      if (!res.ok) { onToast(res.error); return; }
      onToast('連携しました。次に送るときから、この登録へ反映します');
      setOpen(null); setPick('');
      void load();
    } finally { setBusy(''); }
  };
  const onUnlink = async (t: Therapist, s: Site) => {
    setBusy(t.id);
    try {
      const res = await unlinkTherapistMediaId({ salonId, provider: s.provider, slot: s.slot, therapistId: Number(t.id) });
      if (!res.ok) { onToast(res.error); return; }
      onToast(`${t.name}の${s.label}との連携を外しました`);
      setOpen(null);
      void load();
    } finally { setBusy(''); }
  };
  const onCreateCheck = async (t: Therapist, s: Site) => {
    setBusy('check');
    try {
      const res = await startMediaTherapistCreate({ salonId, provider: s.provider, slot: s.slot, therapistId: t.id });
      if (!res.ok) { onToast(plainText(res.error)); return; }
      setPreview({ plan: res.data.plan, warnings: res.data.warnings });
    } finally { setBusy(''); }
  };
  const onCreate = async (t: Therapist, s: Site) => {
    setBusy(t.id);
    try {
      const res = await startMediaTherapistCreatePush({ salonId, provider: s.provider, slot: s.slot, therapistId: t.id });
      if (!res.ok) { onToast(plainText(res.error)); return; }
      // ★ 第1296便: 前の更新が動いているときは順番待ち（断らない）。「送りました」と言い切らない
      onToast(res.data.waiting
        ? `${s.label}への登録を受け付けました。${waitToastNote([s.label])}。結果は「更新結果」に出ます`
        : `${s.label}へ登録を送りました。結果は「更新結果」に出ます。数分後に「再読込」を押すと、この表にも反映されます`);
      setOpen(null); setPreview(null);
    } finally { setBusy(''); }
  };

  const shown = therapists.filter((t) => {
    if (q && !t.name.includes(q)) return false;
    if (onlyDiff) return sites.some((s) => s.hasCredential && cellOf(t, s) !== 'ok');
    return true;
  });

  // ★ 第1506便（2026-10-15・カッキーさん）: △・× は「押せるボタン」に見えていなかった（ラビリンス様は見出しの「△× 2人」のほうを押していた）。
  //   → △・× は枠つきのボタンに「登録する」「確認する」の文字を添える。○ と — は今までどおり記号だけ。
  const MARK: Record<Cell, { text: string; cls: string; title: string; label?: string; btn?: string }> = {
    ok: { text: '○', cls: 'text-sky-500', title: '連携済み' },
    unlinked: { text: '△', cls: 'text-amber-600', title: '確かめられません（番号が無い）。押すと連携・登録できます', label: '登録する', btn: 'border-amber-400 bg-amber-50 hover:bg-amber-100' },
    missing: { text: '×', cls: 'text-rose-600', title: `名簿にいません（サイトで削除された可能性があります）。押すと連携を外せます`, label: '確認する', btn: 'border-rose-300 bg-rose-50 hover:bg-rose-100' },
    // ★ 第1699便: 作ったばかり（名簿の写しが古いだけ）
    pending: { text: '◌', cls: 'text-slate-500', title: '登録・連携したばかりで、名簿の読み直し待ちです', label: '反映待ち', btn: 'border-slate-300 bg-slate-50 hover:bg-slate-100' },
    unknown: { text: '—', cls: 'text-slate-300', title: 'まだ読んでいません' },
  };

  return (
    <div className="space-y-3">
      {/* ★ 第743便（カッキーさん）: 記号は表と同じ色で */}
      {/* ★ 第773便（カッキーさん）: 説明を「一文＋記号の凡例＋操作の一言」に分けて見やすく */}
      <div className="text-[13px] text-slate-600 leading-relaxed space-y-1">
        <p>各サイトへの登録状況一覧です。</p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">
          <li className="whitespace-nowrap"><b className="text-sky-500 font-black text-[15px] mr-1">○</b>連携済み</li>
          <li className="whitespace-nowrap"><b className="text-amber-500 font-black text-[15px] mr-1">△</b>確かめられません（名前が違うなど）</li>
          <li className="whitespace-nowrap"><b className="text-rose-500 font-black text-[15px] mr-1">×</b>サイトにいません</li>
          <li className="whitespace-nowrap"><b className="text-slate-500 font-black text-[15px] mr-1">◌</b>反映待ち（登録したばかり）</li>
        </ul>
        <p className="text-slate-500"><b className="text-amber-600 font-black">△ 登録する</b>・<b className="text-rose-600 font-black">× 確認する</b> のボタンを押すと、その場で連携・登録できます（○ は押す必要がありません）。</p>
      </div>

      <div className={`${CARD} p-3 flex flex-wrap items-center gap-3`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="セラピスト名で検索"
          className="border border-slate-300 rounded px-3 py-1.5 text-[14px] w-[240px]" />
        <label className="flex items-center gap-1.5 text-[13.5px] text-slate-600">
          <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="accent-indigo-600" />
          差異があるセラピストのみ表示
        </label>
        <span className="ml-auto text-[13px] text-slate-500">{shown.length}人 / {therapists.length}人中</span>
      </div>

      {error ? (
        <div className={`${CARD} p-5 text-[14px] text-rose-600`}>{error}</div>
      ) : loading ? (
        <div className={`${CARD} p-5 text-[14px] text-slate-400`}>読み込み中…</div>
      ) : (
        <div className={`${CARD} overflow-x-auto [--sync-name-v:110px] [--sync-col-v:100px] sm:[--sync-name-v:260px] sm:[--sync-col-v:120px]`}>
          {/* ★ 第770便（カッキーさん）: スマホは横スクロールでよいので、列を縮めず1行に（サイト 160×3）。
              ★ 第771・772便: スマホは名前 110px・サイト 122px に詰める（PC は 260px・160px のまま） */}
          {/* ★ 第1680便（カッキーさん）: 駅ちかが2枠（＋エステ魂）だと列が4本になり、幅 620px 固定では見出しが重なった → 列の数から幅を出す（名前 + 列×幅） */}
          <table className="text-[14px] table-fixed whitespace-nowrap" style={{ width: `calc(var(--sync-name-v, 110px) + var(--sync-col-v, 100px) * ${1 + sites.length})`, minWidth: `calc(var(--sync-name-v, 110px) + var(--sync-col-v, 100px) * ${1 + sites.length})` }}>
            <thead>
              <tr className="border-b border-slate-200 align-bottom">
                {/* ★ 第738便: サイトの列は同じ幅（140px）。★ 第739便: 表を左に寄せる（名前 260px・右は空ける） */}
                <th className="text-left px-3 sm:px-4 py-3 font-bold text-slate-500 w-[110px] sm:w-[260px]">名前</th>
                <th className="px-1 sm:px-2 py-3 text-center w-[100px] sm:w-[120px]">
                  <div className="font-bold text-slate-800 text-[15.5px]">フクエス</div>
                  {/* ★ 第741便（カッキーさん）: ほかのサイトと同じ3行に（フクエスは正本なので常時確認・差異0） */}
                  <div className="text-[12.5px] text-slate-500 font-normal mt-0.5">最終確認 常時</div>
                  <div className="text-[13px] font-bold text-slate-400">△× 0人</div>
                  <div className="mt-1 text-[12.5px] text-slate-400">読み込み不要</div>
                </th>
                {sites.map((s) => {
                  const p = pairsOf[key(s)];
                  const bad = therapists.filter((t) => s.hasCredential && cellOf(t, s) !== 'ok').length;
                  return (
                    <th key={key(s)} className={`px-1 sm:px-2 py-3 text-center w-[100px] sm:w-[120px] ${s.hasCredential ? '' : 'bg-slate-50'}`}>
                      {/* ★ 第1680便: 「駅ちか（中洲・天神）」はサイト名とエリアを2行に（1行だと隣の列と重なる） */}
                      {(() => {
                        const m = /^(.+?)（(.+)）$/.exec(s.label);
                        return m
                          ? <div className="font-bold text-slate-800 text-[15.5px] leading-tight">{m[1]}<span className="block text-[12px] font-bold text-slate-600">（{m[2]}）</span></div>
                          : <div className="font-bold text-slate-800 text-[15.5px]">{s.label}</div>;
                      })()}
                      {s.hasCredential ? (
                        <>
                          {/* ★ 第740便（カッキーさん）: 1行目 サイト名／2行目 最終確認／3行目 △×の人数。★ 文字も大きく */}
                          <div className="text-[12.5px] text-slate-500 font-normal mt-0.5">
                            {p?.readAt ? `最終確認 ${fmtAt(p.readAt)}` : 'まだ読んでいません'}
                          </div>
                          {/* ★ 第1506便: 押すと「差異がある方だけ表示」に絞り込む（押した場所に意味を持たせる） */}
                          {bad > 0 ? (
                            <button type="button" onClick={() => setOnlyDiff((v) => !v)}
                              title="押すと、△・× の方だけを表示します"
                              className={`text-[13px] font-bold text-rose-600 underline decoration-dotted underline-offset-4 ${onlyDiff ? 'bg-rose-50 px-1 rounded' : ''}`}>
                              {`△× ${bad}人`}{onlyDiff ? '（絞り込み中）' : ''}
                            </button>
                          ) : (
                            <div className="text-[13px] font-bold text-slate-400">△× 0人</div>
                          )}
                          {/* ★ 第1682便（カッキーさん）: スマホで「△× 39人」と「再読み込み」が重なった → 文字を「再読込」に短くし、人数とは別の行に */}
                          {/* ★ 第1700便（B-2）: 読んでから2分は押せない（続けて押すと相手サイトへ何度もログインする） */}
                          {coolLeft(s) > 0 && reading !== key(s) ? (
                            <div className="mt-1 text-[12px] text-slate-400">
                              {(pressedAt[key(s)] ?? 0) > Date.parse(String(p?.readAt ?? '0'))
                                ? '読み直しています（数分後に開き直し）'
                                : `${Math.max(1, Math.round((Date.now() - Date.parse(String(p?.readAt ?? ''))) / 60000))}分前に読込済み`}
                            </div>
                          ) : (
                            <button type="button" disabled={reading === key(s)} onClick={() => void onRead(s)}
                              className="mt-1 block mx-auto text-[12.5px] text-indigo-600 underline disabled:opacity-40">
                              {reading === key(s) ? '読込中…' : '再読込'}
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-400 font-normal">ID・パスワード未登録</div>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {shown.length === 0 ? (
                <tr><td colSpan={2 + sites.length} className="px-4 py-6 text-center text-slate-400">{onlyDiff ? '差異があるセラピストはいません。' : 'セラピストがいません。'}</td></tr>
              ) : shown.map((t) => (
                <tr key={t.id} className="border-b border-slate-100 align-middle">
                  <td className="px-3 sm:px-4 py-1.5 overflow-hidden">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-slate-100 overflow-hidden flex-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {t.imageUrl && <img src={t.imageUrl} alt="" className="w-full h-full object-cover" />}
                      </div>
                      <div className="min-w-0">
                        <Link href={brand.link('girls') + '/' + t.id} className="font-bold text-slate-800 hover:underline">{t.name}</Link>
                        <div className="text-[11px] text-slate-400 flex gap-1.5">
                          <span>{t.isActive ? '公開中' : '非公開'}</span>
                          {t.isNewFace && <span className="text-pink-600 font-bold">新</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-1 sm:px-3 py-1.5 text-center text-[24px] leading-none text-sky-500">○</td>
                  {sites.map((s) => {
                    if (!s.hasCredential) return <td key={key(s)} className="px-1 sm:px-3 py-1.5 text-center bg-slate-50 text-[12px] text-slate-300">NO DATA</td>;
                    const c = cellOf(t, s);
                    const m = MARK[c];
                    const off = targetOffs.has(`${t.id}#${s.provider}#${s.slot}`);
                    return (
                      <td key={key(s)} className="px-1 sm:px-3 py-1.5 text-center">
                        {m.btn ? (
                          <button type="button" title={m.title}
                            onClick={() => { setOpen({ tid: t.id, key: key(s) }); setPick(''); setPreview(null); }}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded border ${m.btn} ${m.cls} text-[12px] font-bold whitespace-nowrap`}>
                            <span className="text-[18px] leading-none">{m.text}</span>
                            <span>{m.label}</span>
                            <span aria-hidden="true">›</span>
                          </button>
                        ) : (
                          <span title={m.title} className={`text-[24px] leading-none ${m.cls}`}>{m.text}</span>
                        )}
                        {off && <div className="text-[10px] text-slate-400">送らない設定</div>}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ★ 第737便（カッキーさん）: △× を押したときはポップアップ（★ 行の中に広げない。行の高さも詰めた） */}
      {open && (() => {
        const t = therapists.find((x) => x.id === open.tid);
        const s = sites.find((x) => key(x) === open.key);
        const p = s ? pairsOf[key(s)] : undefined;
        if (!t || !s || !p) return null;
        const c = cellOf(t, s);
        const off = targetOffs.has(`${t.id}#${s.provider}#${s.slot}`);
        const unl = p.pairs.unlinked.find((u) => String(u.therapistId) === t.id) ?? null;
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 grid place-items-center p-4" role="dialog" aria-modal="true" onClick={() => { setOpen(null); setPreview(null); }}>
            <div className="w-full max-w-[460px] max-h-[90vh] overflow-y-auto bg-white border border-slate-200 shadow-lg p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
              <p className="text-[16px] font-black text-slate-800">{t.name} を {s.label} へ{preview ? '、この内容で登録します' : ''}</p>
              {preview ? (
                <>
                  <dl className="border border-slate-200 bg-white divide-y divide-slate-100">
                    {summarizeCreatePlan(preview.plan).map((r) => (
                      <div key={r.k} className="flex gap-3 px-3 py-1.5 text-[14px]">
                        <dt className="w-[52px] flex-none font-bold text-slate-400">{r.k}</dt>
                        <dd className="min-w-0 text-slate-700 break-words">{brand.text(r.v)}</dd>
                      </div>
                    ))}
                  </dl>
                  {preview.warnings.length > 0 && (
                    <ul className="border border-amber-200 bg-amber-50 px-3 py-2 space-y-1">
                      {preview.warnings.map((w, i) => (
                        <li key={i} className="text-[13px] leading-relaxed text-slate-700">{plainText(w)}</li>
                      ))}
                    </ul>
                  )}
                  <p className="text-[12.5px] text-slate-500 leading-relaxed">
                    登録は{s.label}に<b className="font-bold text-slate-700">すぐ公開</b>されます。消すときは、{s.label}の管理画面から直接消してください（この画面からは消せません）。同じ名前の方が{s.label}にすでにいる場合は、登録されずに終わります。
                  </p>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy !== ''} onClick={() => setPreview(null)}
                      className="flex-1 px-3 py-2.5 border border-slate-300 bg-white text-[14px] font-bold text-slate-600 disabled:opacity-40">やめる</button>
                    <button type="button" disabled={busy !== ''} onClick={() => void onCreate(t, s)}
                      className="flex-1 px-3 py-2.5 bg-[#218925] text-white text-[14px] font-bold disabled:opacity-40">
                      {busy === t.id ? '送っています…' : '登録する'}
                    </button>
                  </div>
                </>
              ) : c === 'unlinked' && (
                <>
                  <p className="text-[13px] text-slate-500 leading-relaxed">{s.label}の名簿に、この方と結びついた登録が見つかりません。すでに{s.label}にいるなら連携を、いないなら新しく登録してください。</p>
                  {unl && unl.candidates.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-[12px] font-bold text-slate-500">{s.label}にいる似た名前の方:</p>
                      {unl.candidates.map((cand) => (
                        <button key={cand.castId} type="button" disabled={busy !== ''} onClick={() => void onLink(t, s, cand.castId)}
                          className="block w-full text-left px-3 py-2 border border-indigo-200 bg-white text-[13.5px] text-indigo-700 hover:bg-indigo-50 disabled:opacity-40">
                          「{cand.mediaName}」と連携する（{strengthLabel(cand.strength)}）
                        </button>
                      ))}
                    </div>
                  )}
                  {p.pairs.free.length > 0 && (
                    <div className="flex gap-1.5">
                      <select value={pick} onChange={(e) => setPick(e.target.value)} className="flex-1 border border-slate-300 bg-white px-2 py-1.5 text-[13.5px]">
                        <option value="">{s.label}の一覧から選ぶ…</option>
                        {p.pairs.free.map((f) => <option key={f.castId} value={f.castId}>{f.name}</option>)}
                      </select>
                      <button type="button" disabled={!pick || busy !== ''} onClick={() => void onLink(t, s, pick)}
                        className="px-3 py-1.5 border border-indigo-600 bg-indigo-600 text-white text-[13.5px] font-bold disabled:opacity-40">連携</button>
                    </div>
                  )}
                  {off ? (
                    <p className="text-[12.5px] text-slate-400">送り先サイトで{s.label}へ「送らない」にしているため、新しく登録はできません。</p>
                  ) : (
                    <button type="button" disabled={busy !== ''} onClick={() => void onCreateCheck(t, s)}
                      className="block w-full px-3 py-2.5 bg-[#218925] text-white text-[14px] font-bold disabled:opacity-40">
                      {busy === 'check' ? '送る内容を確かめています…' : `${s.label}へ新しく登録する`}
                    </button>
                  )}
                </>
              )}
              {/* ★★ 第1699便（A-8・B-5）: 結びついたあとに読んだ名簿にいない＝サイトで削除された可能性が高い。連携を外す道をはっきり */}
              {!preview && c === 'missing' && (
                <>
                  <p className="text-[13px] text-slate-600 leading-relaxed">
                    {p.readAt ? `${fmtAt(p.readAt)} に読んだ` : ''}{s.label}の名簿に、この方が見当たりません。<b className="font-bold text-slate-800">{s.label}側で削除された可能性が高いです。</b>
                  </p>
                  <p className="text-[13px] text-slate-500 leading-relaxed">
                    {s.label}に出さない方なら「連携を外す」を押してください。外したあと「△ 登録する」から登録し直すこともできます。
                    {s.label}の管理画面でこの方が表示されているなら、上の「再読込」を押して数分後に開き直してください。
                  </p>
                  <button type="button" disabled={busy !== ''} onClick={() => void onUnlink(t, s)}
                    className="block w-full px-3 py-2 border border-rose-300 bg-white text-[13.5px] font-bold text-rose-700 disabled:opacity-40">連携を外す</button>
                </>
              )}
              {/* ★★ 第1699便（A-7）: 作ったばかり。名簿の写しが古いだけなので、外させない（えいみ様の結びつきが消えた件）。
                  作れたが写真の段で止まった方もここに来る → 画像タブで「保存して更新」の案内 */}
              {!preview && c === 'pending' && (
                <>
                  <p className="text-[13px] text-slate-600 leading-relaxed">
                    {s.label}への<b className="font-bold text-slate-800">登録・連携は済んでいます</b>。この表の元になる名簿をまだ読み直していないため、反映待ちになっています。
                  </p>
                  <p className="text-[13px] text-slate-500 leading-relaxed">
                    「名簿を読み直す」を押して、数分後にこの画面を開き直すと ○ になります。<b className="font-bold text-slate-700">連携は外さないでください。</b>
                  </p>
                  <p className="text-[13px] text-slate-500 leading-relaxed">
                    {s.label}で写真が付いていない（NOW PRINTING）ときは、
                    <Link href={brand.link('girls') + '/' + t.id + '?tab=images'} className="font-bold text-indigo-600 underline underline-offset-4">セラピスト編集の「画像」タブ</Link>
                    で「保存して…更新」を押すと付きます。
                  </p>
                  <button type="button" disabled={reading === key(s)} onClick={() => { void onRead(s); setOpen(null); }}
                    className="block w-full px-3 py-2.5 bg-indigo-600 text-white text-[14px] font-bold disabled:opacity-40">
                    {reading === key(s) ? '読込中…' : '名簿を読み直す'}
                  </button>
                </>
              )}
              <div className="flex justify-end">
                <button type="button" onClick={() => { setOpen(null); setPreview(null); }} className="px-4 py-1.5 border border-slate-200 text-[13.5px] font-bold text-slate-500 hover:bg-slate-50">もどる</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
