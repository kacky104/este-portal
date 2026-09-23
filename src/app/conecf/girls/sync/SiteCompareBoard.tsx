'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  getSalonTherapists, getMediaOverview, getMediaLinkPairs,
  linkTherapistMediaId, unlinkTherapistMediaId, startMediaRosterRead, startMediaTherapistCreate, startMediaTherapistCreatePush,
} from '@/app/actions/mediaCredentials';
import { listConecfTargetOffs } from '@/app/actions/conecfGirls';
import { canLink, strengthLabel, type LinkPairs } from '@/lib/mediaLinkPairs';
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
//   — まだ読んでいません（名簿の写しが無い）
//   NO DATA ID・PASS が無いサイト

type Therapist = { id: string; name: string; imageUrl: string | null; isNewFace: boolean; isActive: boolean };
type Site = { provider: string; slot: number; label: string; direction: string; hasCredential: boolean };
type Cell = 'ok' | 'unlinked' | 'missing' | 'unknown';

const ROSTER_STALE_MS = 30 * 60 * 1000;
const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

function fmtAt(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// ★ 第759便: 運営向けの印（★）と強調（**）も剥がす（試し打ちの注意の文言に入っている）
function plainText(s: string): string { return s.replace(/<[^>]+>/g, '').replace(/★+\s*/g, '').replace(/\*\*/g, ''); }

export function SiteCompareBoard({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const brand = useMediaBrand();
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [pairsOf, setPairsOf] = useState<Record<string, { pairs: LinkPairs; readAt: string | null }>>({});
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
    const [t, ov, offs] = await Promise.all([getSalonTherapists({ salonId }), getMediaOverview({ salonId }), listConecfTargetOffs()]);
    setTargetOffs(new Set(offs.ok ? offs.data.offs : []));
    if (!t.ok) { setError(t.error); setLoading(false); return; }
    setTherapists(t.data.map((x) => ({ id: x.id, name: x.name, imageUrl: x.imageUrl, isNewFace: x.isNewFace, isActive: x.isActive })));
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
      return [key(s), { pairs: r.data.pairs, readAt: r.data.readAtISO }] as const;
    }));
    const m: Record<string, { pairs: LinkPairs; readAt: string | null }> = {};
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
    return l.onMedia ? 'ok' : 'missing';
  };

  const onRead = async (s: Site) => {
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
      onToast(`${s.label}へ登録を送りました。結果は「更新結果」に出ます。数分後に「再読み込み」を押すと、この表にも反映されます`);
      setOpen(null); setPreview(null);
    } finally { setBusy(''); }
  };

  const shown = therapists.filter((t) => {
    if (q && !t.name.includes(q)) return false;
    if (onlyDiff) return sites.some((s) => s.hasCredential && cellOf(t, s) !== 'ok');
    return true;
  });

  const MARK: Record<Cell, { text: string; cls: string; title: string }> = {
    ok: { text: '○', cls: 'text-sky-500', title: '連携済み' },
    unlinked: { text: '△', cls: 'text-amber-500', title: '確かめられません（番号が無い）。押すと連携・登録できます' },
    missing: { text: '×', cls: 'text-rose-500', title: `名簿にいません。押すと登録できます` },
    unknown: { text: '—', cls: 'text-slate-300', title: 'まだ読んでいません' },
  };

  return (
    <div className="space-y-3">
      {/* ★ 第743便（カッキーさん）: 記号は表と同じ色で */}
      <p className="text-[13px] text-slate-500 leading-relaxed">
        各サイトへの登録状況一覧です。<b className="text-sky-500 font-black">○</b>＝連携済み、<b className="text-amber-500 font-black">△</b>＝確かめられません（名前が違うなど）、<b className="text-rose-500 font-black">×</b>＝サイトにいません。<b className="text-amber-500 font-black">△</b>や<b className="text-rose-500 font-black">×</b>を押すと、その場で連携・登録できます。
      </p>

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
        <div className={`${CARD} overflow-x-auto`}>
          {/* ★ 第770便（カッキーさん）: スマホは横スクロールでよいので、列を縮めず1行に（サイト 160×3）。
              ★ 第771・772便: スマホは名前 110px・サイト 122px に詰める（PC は 260px・160px のまま） */}
          <table className="text-[14px] table-fixed w-[476px] min-w-[476px] sm:w-[740px] sm:min-w-[740px] whitespace-nowrap">
            <thead>
              <tr className="border-b border-slate-200 align-bottom">
                {/* ★ 第738便: サイトの列は同じ幅（140px）。★ 第739便: 表を左に寄せる（名前 260px・右は空ける） */}
                <th className="text-left px-3 sm:px-4 py-3 font-bold text-slate-500 w-[110px] sm:w-[260px]">名前</th>
                <th className="px-1 sm:px-2 py-3 text-center w-[122px] sm:w-[160px]">
                  <div className="font-bold text-slate-800 text-[15.5px]">フクエス</div>
                  {/* ★ 第741便（カッキーさん）: ほかのサイトと同じ3行に（フクエスは正本なので常時確認・差異0） */}
                  <div className="text-[12.5px] text-slate-500 font-normal mt-0.5">最終確認 常時確認</div>
                  <div className="text-[13px] font-bold text-slate-400">△× 0人</div>
                  <div className="mt-1 text-[12.5px] text-slate-400">読み込み不要</div>
                </th>
                {sites.map((s) => {
                  const p = pairsOf[key(s)];
                  const bad = therapists.filter((t) => s.hasCredential && cellOf(t, s) !== 'ok').length;
                  return (
                    <th key={key(s)} className={`px-1 sm:px-2 py-3 text-center w-[122px] sm:w-[160px] ${s.hasCredential ? '' : 'bg-slate-50'}`}>
                      <div className="font-bold text-slate-800 text-[15.5px]">{s.label}</div>
                      {s.hasCredential ? (
                        <>
                          {/* ★ 第740便（カッキーさん）: 1行目 サイト名／2行目 最終確認／3行目 △×の人数。★ 文字も大きく */}
                          <div className="text-[12.5px] text-slate-500 font-normal mt-0.5">
                            {p?.readAt ? `最終確認 ${fmtAt(p.readAt)}` : 'まだ読んでいません'}
                          </div>
                          <div className={`text-[13px] font-bold ${bad > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                            {`△× ${bad}人`}
                          </div>
                          <button type="button" disabled={reading === key(s)} onClick={() => void onRead(s)}
                            className="mt-1 text-[12.5px] text-indigo-600 underline disabled:opacity-40">
                            {reading === key(s) ? '読み直しています…' : '再読み込み'}
                          </button>
                        </>
                      ) : (
                        <div className="text-[11px] text-slate-400 font-normal">ID・PASS未登録</div>
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
                          {t.isNewFace && <span className="text-pink-600 font-bold">新人</span>}
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
                        <button type="button" title={m.title} disabled={c === 'unknown' || c === 'ok'}
                          onClick={() => { setOpen({ tid: t.id, key: key(s) }); setPick(''); setPreview(null); }}
                          className={`text-[24px] leading-none ${m.cls} ${c === 'ok' || c === 'unknown' ? 'cursor-default' : 'hover:scale-110 transition-transform'}`}>
                          {m.text}
                        </button>
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
              {!preview && c === 'missing' && (
                <>
                  <p className="text-[13px] text-slate-500 leading-relaxed">番号はありますが、{s.label}の名簿にいません（{s.label}で削除された・読み取りが不完全 など）。連携を外すと、新しく登録し直せます。</p>
                  <button type="button" disabled={busy !== ''} onClick={() => void onUnlink(t, s)}
                    className="block w-full px-3 py-2 border border-slate-300 bg-white text-[13.5px] text-slate-600 disabled:opacity-40">連携を外す</button>
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
