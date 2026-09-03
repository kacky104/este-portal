'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getSalonTherapists,
  getMediaRoster,
  getMediaOverview,
  startMediaRosterRead,
} from '@/app/actions/mediaCredentials';
import type { RosterResult } from '@/lib/mediaRoster';
import { therapistSiteState, therapistSiteLabel, type TherapistSiteState } from '@/lib/mediaOverview';
import { findDuplicateNames, duplicateNotice } from '@/lib/therapistDuplicates';

// セラピスト一覧（第62便・㉞ その4・★ いまは【見るだけ】）。
//
// ★★★ 主役はフクエスに登録されているセラピスト。各サイトはその【出先】（設計メモ §180）。
//   ★ 「フクエスに登録されている方だけを出しています」と画面に書く。
//     フクエスを直せば各サイトに揃う、という運営の形を、画面から伝えるため。
//
// ★★ 「出す・消す」は付けない。
//   §81 の順番（削除が先・登録は最後）と、㉟（エステラブの二重登録の挙動）が未確認のため。
//   ★ 第49便の作法どおり:【直す前に、まず見えることを作る】。
//
// ★★★ 「いません」と書いてよい場面を狭くしている（mediaOverview.therapistSiteState）。
//   番号が結びついていない人 … 「まだ結びついていません」（★ いない、ではない）
//   向こうを読めていないとき  … 「まだ確かめていません」（★ います、でもない）

type Therapist = {
  id: string; name: string; age: string | null; imageUrl: string | null;
  isNewFace: boolean; newFaceSince: string | null; isActive: boolean;
};
type Site = { provider: string; slot: number; label: string; direction: string; hasCredential: boolean };
type Filter = 'all' | 'todo' | 'new';

function fmtDate(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', timeZone: 'Asia/Tokyo' })
    .format(new Date(t));
}

const STATE_CLASS: Record<string, string> = {
  present: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  missing: 'bg-rose-50 text-rose-700 border-rose-200',
  unlinked: 'bg-white text-slate-400 border-slate-200',
  unknown: 'bg-white text-slate-400 border-slate-200',
};

function Photo({ url, name }: { url: string | null; name: string }) {
  if (url) {
    // ★ next/image を使わない。★ 店舗が外部URLを入れている場合があり、
    //   remotePatterns に無いホストだと実行時に落ちる。★ ここは管理画面なので素の img で足りる
    return (
      <span className="w-[46px] h-[58px] flex-none overflow-hidden border border-slate-200 bg-slate-100 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={name} loading="lazy" className="w-full h-full object-cover" />
      </span>
    );
  }
  // ★ 空白にしない。★ 写真が無いのか読み込めていないのか、空白では分からない
  return (
    <span className="w-[46px] h-[58px] flex-none border border-slate-200 bg-slate-100 grid place-items-center text-[11px] font-bold leading-tight text-slate-400 text-center">
      写真<br />なし
    </span>
  );
}

export function TherapistBoard({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [roster, setRoster] = useState<RosterResult[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [reading, setReading] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const [t, r, ov] = await Promise.all([
      getSalonTherapists({ salonId }),
      getMediaRoster({ salonId }),
      getMediaOverview({ salonId }),
    ]);
    if (!t.ok) { setError(t.error); setLoading(false); return; }
    setTherapists(t.data);
    // ★ 名簿が取れなかったら黙って空にする。★ ここで「0人」と出すと揃っているように見える
    setRoster(r.ok ? r.data : []);
    setSites(ov.ok ? ov.data.sites : []);
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  const onRead = async (s: Site) => {
    if (salonId == null) return;
    setReading(true);
    try {
      const res = await startMediaRosterRead({ salonId, provider: s.provider, slot: s.slot });
      if (!res.ok) { onToast(res.error); return; }
      onToast('名簿を読みに行きました。数分後にこの画面を開き直すと反映されます');
    } finally {
      setReading(false);
    }
  };

  if (salonId == null) return null;

  // ★ いまは駅ちかだけが「向こうを読める」媒体。★ 他は出先として名前だけ並べる
  const readSite = sites.find((s) => s.direction === 'read') ?? null;
  const rosterOf = readSite
    ? roster.find((x) => x.provider === readSite.provider && x.slot === readSite.slot) ?? null
    : null;

  const unlinkedIds = new Set((rosterOf?.unlinked ?? []).map((p) => String(p.id)));
  const missingIds = new Set((rosterOf?.missingOnMedia ?? []).map((p) => String(p.id)));
  const known = rosterOf?.missingOnMediaKnown === true;

  const stateOf = (t: Therapist): TherapistSiteState =>
    therapistSiteState({
      isUnlinked: unlinkedIds.has(t.id),
      isMissing: missingIds.has(t.id),
      known,
    });

  // ★ 同じ名前で公開中の方（★ 0件なら空文字が返り、何も出さない）
  const dupNotice = duplicateNotice(findDuplicateNames(therapists));
  const todoCount = therapists.filter((t) => stateOf(t) !== 'present').length;
  const filtered = therapists.filter((t) => {
    if (filter === 'new') return t.isNewFace;
    if (filter === 'todo') return stateOf(t) !== 'present';
    return true;
  });
  const shown = showAll ? filtered : filtered.slice(0, 10);

  // ★ フクエスにいないのに媒体側に残っている名前。★ 読めていないときは空＝「分からない」
  const onlyOnMedia = rosterOf?.onlyOnMediaKnown === true ? (rosterOf?.onlyOnMedia ?? []) : [];
  const onlyKnown = rosterOf?.onlyOnMediaKnown === true;

  return (
    <div className="space-y-3">

      {/* ── いまの状態 ─────────────────────────────── */}
      <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
        {loading ? (
          <p className="text-[14px] text-slate-400">読み込み中…</p>
        ) : error ? (
          <p className="text-[14px] text-rose-600 leading-relaxed">
            セラピストを読み込めませんでした（{error}）。しばらくしてから開き直してください。
          </p>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[19px] font-black text-slate-800">
                  フクエスのセラピスト {therapists.length}名
                </p>
                {/* ★★ 第119便（カッキーさん・2026-09-03）: 「ここが元になります」だけでは、
                    ★ 新人さんが各サイトに出ないときに【何をすればよいか】が分からなかった。
                    ★ 出るのはフクエスに登録した方だけ＝**登録が入口**、と言い切る。 */}
                <p className="mt-0.5 text-[14px] text-slate-500 leading-relaxed">
                  各サイトへの転送はフクエスでの登録が必要です。
                  新しく入った方がまだの場合は、先に<b className="font-bold text-slate-700">フクエスでセラピスト登録</b>をしてください。{' '}
                  {/* ★ 「登録してください」で終わらせない。★ 探しに戻らせず、その場から行ける道を置く */}
                  <Link href="/mypage" className="font-bold text-indigo-600 underline">
                    ⇨ マイページのセラピストを開く
                  </Link>
                </p>
              </div>

            </div>

            {/* ★★★ 同じ名前で公開中の方がいたら知らせる（第119便・カッキーさん）。
                ★ フクエスは【受け取る側】にもなった（外から登録が入る）。★ 二重に作られることがある。
                ★★ ここは【気づかせるだけ】。★ 消さない・止めない・原因を決めつけない
                  （他社名を書かない。★ 店舗様がご自身で窓口に確かめられればよい）。 */}
            {dupNotice && (
              <div className="mt-3 border border-amber-200 bg-amber-50 px-3 py-2.5">
                <p className="text-[14px] leading-relaxed text-slate-700">{dupNotice}</p>
                <p className="mt-1 text-[13px] text-slate-500 leading-relaxed">
                  同じ方であれば、どちらか一方を非公開にしてください。別の方であればそのままで問題ありません。
                </p>
              </div>
            )}

            <dl className="mt-3.5 grid grid-cols-3 border border-slate-200">
              <div className="px-3 py-2.5 border-r border-slate-200">
                <dt className="text-[12.5px] font-bold text-slate-400">フクエスの登録</dt>
                <dd className="text-[21px] font-black text-slate-800 tabular-nums">
                  {therapists.length}<span className="text-[13.5px] font-bold text-slate-400 ml-0.5">名</span>
                </dd>
              </div>
              <div className="px-3 py-2.5 border-r border-slate-200">
                <dt className="text-[12.5px] font-bold text-slate-400">
                  {readSite ? `${readSite.label}で確かめられていない` : '確かめられていない'}
                </dt>
                <dd className="text-[21px] font-black text-slate-800 tabular-nums">
                  {todoCount}<span className="text-[13.5px] font-bold text-slate-400 ml-0.5">名</span>
                </dd>
              </div>
              <div className="px-3 py-2.5">
                <dt className="text-[12.5px] font-bold text-slate-400">
                  {readSite ? `${readSite.label}に残っている` : '媒体に残っている'}
                </dt>
                <dd className="text-[21px] font-black text-slate-800 tabular-nums">
                  {/* ★ 読めていないときに 0 と書かない */}
                  {onlyKnown ? onlyOnMedia.length : '—'}
                  {onlyKnown && <span className="text-[13.5px] font-bold text-slate-400 ml-0.5">名</span>}
                </dd>
              </div>
            </dl>

            <p className="mt-2.5 text-[13.5px] text-slate-400 leading-relaxed">
              各サイトへの掲載の内容、名前やプロフィールの変更などもフクエスを直せば揃います。
            </p>
          </>
        )}
      </div>

      {/* ── 一覧 ──────────────────────────────────── */}
      {!loading && !error && (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h3 className="text-[15.5px] font-bold text-slate-700">どのサイトに出ているか</h3>
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-slate-400 tabular-nums">
                {shown.length} / {therapists.length}名中
              </span>
              {readSite && (
                <button
                  onClick={() => onRead(readSite)}
                  disabled={reading}
                  className="text-[13px] font-bold px-3 py-1.5 border border-slate-200 text-slate-600 disabled:opacity-50"
                >
                  {readSite.label}の名簿を読み直す
                </button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mb-3">
            {([['all', 'すべて'], ['todo', '確かめられていない方'], ['new', '新人']] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setFilter(k); setShowAll(false); }}
                aria-pressed={filter === k}
                className={`px-3 py-1.5 border text-[14px] font-bold transition-colors ${
                  filter === k ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="overflow-x-auto border border-slate-200">
            <table className="w-full text-[14.5px] min-w-[520px]">
              <thead>
                <tr className="bg-slate-50 text-left">
                  <th className="font-bold text-[12.5px] text-slate-400 px-3 py-2">セラピスト</th>
                  <th className="font-bold text-[12.5px] text-slate-400 px-3 py-2 whitespace-nowrap">
                    {readSite ? readSite.label : '媒体'}
                    <br />
                    <span className="font-bold">向こうを読んだ結果</span>
                  </th>
                  {sites
                    .filter((s) => s.direction === 'write')
                    .map((s) => (
                      <th key={s.provider + '#' + s.slot} className="font-bold text-[12.5px] text-slate-400 px-3 py-2 whitespace-nowrap">
                        {s.label}
                        <br />
                        <span className="font-bold">送った記録</span>
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => {
                  const st = stateOf(t);
                  return (
                    <tr key={t.id} className="border-t border-slate-100 align-top">
                      <td className="px-3 py-2.5">
                        <span className="flex gap-2.5 items-start">
                          <Photo url={t.imageUrl} name={t.name} />
                          <span className="min-w-0">
                            <b className="block text-[15px] font-bold text-slate-800 break-words">{t.name || '（名前なし）'}</b>
                            {t.age && <span className="block text-[13px] text-slate-400">{t.age}歳</span>}
                            {t.isNewFace && (
                              <span className="inline-block mt-1 text-[12px] font-bold px-1.5 py-px border border-rose-200 bg-rose-50 text-rose-700">
                                新人{t.newFaceSince ? ` ${fmtDate(t.newFaceSince)}` : ''}
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <span className={`text-[13px] font-bold px-2.5 py-0.5 border ${STATE_CLASS[st]}`}>
                          {therapistSiteLabel(st)}
                        </span>
                      </td>
                      {sites
                        .filter((s) => s.direction === 'write')
                        .map((s) => (
                          <td key={s.provider + '#' + s.slot} className="px-3 py-2.5 text-slate-400 whitespace-nowrap">
                            まだ送っていません
                          </td>
                        ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length > shown.length && (
            <button onClick={() => setShowAll(true)} className="mt-3 text-[14px] font-bold text-slate-500 underline">
              残り{filtered.length - shown.length}名を見る
            </button>
          )}

          {/* ★ 言い方の意味を書く。★ 「いません」と「まだ結びついていません」は別 */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-slate-400">
            <span><b className="font-bold text-emerald-700">います</b>　向こうの名簿で確かめました</span>
            <span><b className="font-bold text-rose-700">いません</b>　番号は知っているのに、向こうの名簿にありませんでした</span>
            <span><b className="font-bold text-slate-500">まだ結びついていません</b>　向こうの番号が分かっていません</span>
            <span><b className="font-bold text-slate-500">まだ確かめていません</b>　向こうの名簿をまだ読めていません</span>
          </div>

          <p className="mt-3 text-[13.5px] text-slate-400 leading-relaxed">
            写真はフクエスに登録されているものです。まだ入っていない方は「写真なし」と出ます。
          </p>

          <div className="mt-3 border border-sky-200 bg-sky-50 px-3 py-2.5">
            <p className="text-[14px] leading-relaxed text-slate-600">
              <b className="font-bold text-sky-700">この画面は見るだけです。</b>{' '}
              各サイトへ出す・消すは、まだ付けていません。出すのは取り返しが付きにくい操作なので、
              先に各サイトの振る舞いを確かめてから作ります。
            </p>
          </div>
        </div>
      )}

      {/* ── フクエスにいないのに、媒体に残っている方 ───────────── */}
      {!loading && !error && readSite && (
        <div className="bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-4">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-[15.5px] font-bold text-slate-700">
              フクエスにいないのに、{readSite.label}に残っている方
            </h3>
            <span className="text-[13px] font-bold px-2.5 py-0.5 border bg-white text-slate-400 border-slate-200 tabular-nums">
              {onlyKnown ? `${onlyOnMedia.length}名` : '—'}
            </span>
          </div>

          {!onlyKnown ? (
            /* ★ 読めていないことを「0名」と書かない */
            <p className="text-[14px] text-slate-500 leading-relaxed">
              {readSite.label}の名簿をまだ読めていないので、分かりません。
              上の「{readSite.label}の名簿を読み直す」を押すと確かめられます。
            </p>
          ) : onlyOnMedia.length === 0 ? (
            <p className="text-[14px] text-slate-500">ありません。</p>
          ) : (
            <>
              <ul className="border border-slate-200 divide-y divide-slate-100">
                {onlyOnMedia.map((n) => (
                  <li key={n} className="px-3 py-2.5 text-[15px] text-slate-700">{n}</li>
                ))}
              </ul>
              <p className="mt-3 text-[13.5px] text-slate-400 leading-relaxed">
                フクエスを辞めた方が、{readSite.label}側に残っていることがあります。
                フクエスにいない方なので上の一覧には出ません。ここだけ別に出しています。
              </p>
            </>
          )}
        </div>
      )}

      {!loading && !error && !readSite && (
        <div className="border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[14px] leading-relaxed text-slate-600">
            <b className="font-bold text-sky-700">向こうの名簿を読めるサイトがありません。</b>{' '}
            駅ちかから反映するようにすると、だれがどのサイトに出ているかを確かめられます。
          </p>
          <Link href="/mypage/media" className="mt-2 inline-block text-[14px] font-bold text-sky-700 underline">
            ホームで確かめる
          </Link>
        </div>
      )}
    </div>
  );
}
