'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  getSalonDiaryForwards,
  getMediaOverview,
  startMediaMailImport,
} from '@/app/actions/mediaCredentials';

// 写メ日記の投稿先（第58便・㉞ その3）。
//
// ★★★ 受け取れるのは【駅ちかとエステラブだけ】。
//   エステ魂はメール投稿が無く、全国エステランキングは写メ日記機能そのものが無い
//   （2026-08-26 調査・migration 20260826_diary_forward.sql）。
//   ★ 4サイトのうち2つだけであることを、画面にそのまま書く。
//
// ★★ アドレスは秘密値なので伏せ字で出す（maskAddress）。
//   ★ 1人ぶんを直すのはセラピスト画面の仕事。ここは【一覧して確かめる】場所。
//
// ★ 取り込みは2段のまま（確認 → 登録）。★ 常に上書きすることを押す前に書く。

/** 写メ日記を受け取れる媒体。★ ここに無い媒体には投稿先そのものが無い */
const DIARY_PROVIDERS = ['ekichika', 'esulove'];

type Site = { provider: string; slot: number; label: string; hasCredential: boolean };
type Forward = { therapistId: string; provider: string; slot: number; addressMask: string; isEnabled: boolean };
type Data = {
  diarySource: string;
  therapists: Array<{ id: string; name: string }>;
  forwards: Forward[];
  lastRead: { at: string; applied: boolean; created: number; updated: number; unchanged: number; unmatched: number } | null;
};

function fmt(iso: string | null): string {
  if (!iso) return '';
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Tokyo',
  }).format(new Date(t));
}

export function DiaryTargets({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const [data, setData] = useState<Data | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [picked, setPicked] = useState<string>('ekichika');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmApply, setConfirmApply] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    if (salonId == null) return;
    const [d, ov] = await Promise.all([
      getSalonDiaryForwards({ salonId }),
      getMediaOverview({ salonId }),
    ]);
    if (!d.ok) { setError(d.error); setLoading(false); return; }
    setData(d.data);
    // ★ 写メ日記を受け取れる媒体だけ並べる。★ 連携していない媒体も「未設定」で出す
    const known = ov.ok ? ov.data.sites : [];
    setSites(
      DIARY_PROVIDERS.map((p) => {
        const hit = known.find((s) => s.provider === p);
        return {
          provider: p,
          slot: hit?.slot ?? 1,
          label: hit?.label ?? (p === 'ekichika' ? '駅ちか' : 'エステラブ'),
          hasCredential: hit?.hasCredential === true,
        };
      })
    );
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  const onImport = async (apply: boolean) => {
    if (salonId == null) return;
    const site = sites.find((s) => s.provider === picked);
    if (!site) return;
    setBusy(true);
    try {
      const res = await startMediaMailImport({
        salonId, provider: site.provider, slot: site.slot, apply,
      });
      if (!res.ok) { onToast(res.error); return; }
      onToast(apply
        ? '登録を受け付けました。結果は「連携の記録」に出ます'
        : '取り込む内容を確認しています。結果は「連携の記録」に出ます（まだ登録していません）');
      setConfirmApply(false);
    } finally {
      setBusy(false);
    }
  };

  if (salonId == null) return null;

  const site = sites.find((s) => s.provider === picked) ?? null;
  const rows = (data?.forwards ?? []).filter((f) => f.provider === picked);
  const nameOf = new Map((data?.therapists ?? []).map((t) => [t.id, t.name]));
  const withAddress = rows.filter((r) => r.addressMask.length > 0);
  const shown = showAll ? withAddress : withAddress.slice(0, 5);
  const total = data?.therapists.length ?? 0;

  return (
    <div className="space-y-3">

      {/* ── どのサイトを見るか ─────────────────────────── */}
      <div className="bg-white -[10px] border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
        <h3 className="text-sm font-bold text-slate-700 mb-3">どのサイトの投稿先を見ますか？</h3>

        {loading ? (
          <p className="text-[12px] text-slate-400">読み込み中…</p>
        ) : error ? (
          <p className="text-[12px] text-rose-600 leading-relaxed">
            投稿先を読み込めませんでした（{error}）。しばらくしてから開き直してください。
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {sites.map((s) => {
              const on = picked === s.provider;
              return (
                <button
                  key={s.provider}
                  onClick={() => { setPicked(s.provider); setConfirmApply(false); setShowAll(false); }}
                  aria-pressed={on}
                  className={`px-3 py-2 border text-[12px] font-bold transition-colors ${
                    on ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-slate-400 border-slate-200'
                  }`}
                >
                  {s.label}
                  {!s.hasCredential && <span className="ml-1 font-medium text-slate-400">（未設定）</span>}
                </button>
              );
            })}
          </div>
        )}

        {/* ★ 2サイトだけであることを、その場に書く */}
        <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
          写メ日記を受け取れるのはこの2サイトだけです。
          エステ魂はメールでの投稿ができず、全国エステランキングには写メ日記そのものがありません。
        </p>
      </div>

      {/* ── 正本の注意（二重投稿を防ぐ唯一の仕掛け）───────── */}
      {!loading && !error && data?.diarySource !== 'fukues' && (
        <div className="border border-sky-200 bg-sky-50 px-4 py-3">
          <p className="text-[12px] leading-relaxed text-slate-600">
            <b className="font-bold text-sky-700">いまは、フクエスから写メ日記を転送していません。</b>{' '}
            投稿先を登録しても、フクエスが正本になるまでは送りません。
            他社経由の転送と二重にならないようにするためです。
          </p>
        </div>
      )}

      {!loading && !error && site && !site.hasCredential ? (
        <div className="bg-white -[10px] border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
          <p className="text-[17px] font-black text-slate-800">{site.label}とはまだ連携していません</p>
          <p className="mt-1 text-[12px] text-slate-500 leading-relaxed">
            ログイン情報を登録すると、{site.label}が発行している投稿用アドレスを読み取れます。
          </p>
          <Link
            href="/mypage/media/login"
            className="mt-3 inline-block text-[12px] font-bold px-3 py-1.5 border border-slate-200 text-slate-600"
          >
            ログイン情報を登録する
          </Link>
        </div>
      ) : !loading && !error && site ? (
        <>
          {/* ── いまの状態 ────────────────────────────── */}
          <div className="bg-white -[10px] border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[17px] font-black text-slate-800">
                  {withAddress.length}名ぶん 登録済み
                </p>
                <p className="mt-0.5 text-[12px] text-slate-500">
                  {/* ★ 読んだ記録が無いことを「0件」と書かない */}
                  {data?.lastRead
                    ? `${fmt(data.lastRead.at)} に${site.label}から読み取りました`
                    : `まだ${site.label}から読み取っていません`}
                </p>
              </div>
              <span className="flex-none text-[11px] font-bold px-3 py-0.5 border bg-white text-slate-400 border-slate-200 tabular-nums">
                全{total}名中
              </span>
            </div>

            {data?.lastRead && (
              <dl className="mt-4 grid grid-cols-3 gap-px bg-slate-100 border border-slate-100 overflow-hidden">
                <div className="bg-white px-3 py-2.5">
                  <dt className="text-[10px] font-bold text-slate-400">新しく増えた</dt>
                  <dd className="text-[18px] font-black text-slate-800 tabular-nums">
                    {data.lastRead.created}<span className="text-[11px] font-bold text-slate-400 ml-0.5">名</span>
                  </dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="text-[10px] font-bold text-slate-400">宛先が変わった</dt>
                  <dd className="text-[18px] font-black text-slate-800 tabular-nums">
                    {data.lastRead.updated}<span className="text-[11px] font-bold text-slate-400 ml-0.5">名</span>
                  </dd>
                </div>
                <div className="bg-white px-3 py-2.5">
                  <dt className="text-[10px] font-bold text-slate-400">変わりなし</dt>
                  <dd className="text-[18px] font-black text-slate-800 tabular-nums">
                    {data.lastRead.unchanged}<span className="text-[11px] font-bold text-slate-400 ml-0.5">名</span>
                  </dd>
                </div>
              </dl>
            )}

            {data?.lastRead && data.lastRead.unmatched > 0 && (
              <p className="mt-2.5 text-[12px] text-rose-600 bg-rose-50 px-3 py-2 leading-relaxed">
                {data.lastRead.unmatched}名は、フクエスのセラピストと結びつきませんでした。
                お名前が違っている可能性があります。
              </p>
            )}

            {data?.lastRead && !data.lastRead.applied && (
              <p className="mt-2.5 text-[11px] font-bold text-indigo-600">
                これは確認したときの件数です。まだ登録していません。
              </p>
            )}

            {/* ★ 上書きすることを、押す前に読める場所に書く */}
            <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
              登録すると、いま入っている投稿先は{site.label}の内容で上書きされます。
              {site.label}側でアドレスが出し直されたときに、古いまま送り続けないためです。
            </p>

            <div className="mt-3 flex flex-wrap gap-2 justify-end">
              <button
                onClick={() => onImport(false)}
                disabled={busy}
                className="px-4 py-2 border border-slate-200 text-[12px] font-bold text-slate-600 disabled:opacity-50"
              >
                取り込む内容を確認
              </button>
              {confirmApply ? (
                <>
                  <button
                    onClick={() => setConfirmApply(false)}
                    className="px-4 py-2 border border-slate-200 text-[12px] font-bold text-slate-500"
                  >
                    やめる
                  </button>
                  <button
                    onClick={() => onImport(true)}
                    disabled={busy}
                    className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-[12px] font-bold shadow-sm disabled:opacity-50"
                  >
                    上書きして登録する（確定）
                  </button>
                </>
              ) : (
                <button
                  onClick={() => setConfirmApply(true)}
                  disabled={busy}
                  className="px-4 py-2 bg-gradient-to-r from-indigo-500 to-indigo-700 text-white text-[12px] font-bold shadow-sm disabled:opacity-50"
                >
                  取り込んで登録する
                </button>
              )}
            </div>
          </div>

          {/* ── だれの日記が、どこへ届くか ────────────────── */}
          <div className="bg-white -[10px] border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)] p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">だれの日記が、どこへ届くか</h3>

            {withAddress.length === 0 ? (
              <p className="text-[12px] text-slate-400">
                まだ登録されていません。「取り込んで登録する」を押すと、{site.label}から読み取って入れます。
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-[12px]">
                    <thead>
                      <tr className="text-slate-400 text-left">
                        <th className="font-medium py-1 pr-3 whitespace-nowrap">セラピスト</th>
                        <th className="font-medium py-1 pr-3 whitespace-nowrap">届け先</th>
                        <th className="font-medium py-1 whitespace-nowrap">状態</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.therapistId + '#' + r.slot} className="border-t border-slate-100">
                          <td className="py-1.5 pr-3 text-slate-700 break-words">
                            {nameOf.get(r.therapistId) || '（名前なし）'}
                          </td>
                          <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap tabular-nums">{r.addressMask}</td>
                          <td className="py-1.5 whitespace-nowrap">
                            {r.isEnabled ? (
                              <span className="text-[11px] font-bold px-2.5 py-0.5 border bg-emerald-50 text-emerald-700 border-emerald-200">
                                使えます
                              </span>
                            ) : (
                              <span className="text-[11px] font-bold px-2.5 py-0.5 border bg-white text-slate-400 border-slate-200">
                                止めています
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {withAddress.length > shown.length && (
                  <button
                    onClick={() => setShowAll(true)}
                    className="mt-3 text-[12px] font-bold text-slate-500 underline"
                  >
                    残り{withAddress.length - shown.length}名を見る
                  </button>
                )}

                {/* ★ アドレスを丸ごと出さない理由を書く。★ 隠していることを隠さない */}
                <p className="mt-3 text-[11px] text-slate-400 leading-relaxed">
                  アドレスは頭とドメインだけをお見せしています。
                  このアドレスを知っている人は誰でもその媒体に投稿できるためです。
                  全部を見たり直したりするときは、セラピストの画面をお使いください。
                </p>
              </>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
