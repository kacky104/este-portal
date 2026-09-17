'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMediaOverview, setMediaLinkMode } from '@/app/actions/mediaCredentials';
import { autoOffWorkSites, autoOffNoticeText } from '@/lib/mediaOverview';
import { consentRecheckNotice } from '@/lib/mediaConsent';
import { useConecfHref } from './ConecfBase';

// コネックエフのホーム（第396便・1b・2026-09-17）。
//
// ★★ フクエスリンクのホーム（MediaHome）とは【作りを分けた】。
//   ★ コネックエフは入力する場所がコネックエフだけ（設計メモ §1）。★ 「駅ちかから反映／フクエスから反映」の選択を置かない。
//   ★ サイトごとに「更新する／更新しない」だけ。★ 裏の仕組み（link_mode）は同じ（write / none）。
// ★ 状態の出どころは getMediaOverview（MediaHome と同じ）。★ ここで数えない・決めない。
// ★ フクエスは同じ仕組みの中にあるので、常に「自動で連携済み」。

type Site = {
  provider: string;
  slot: number;
  label: string;
  direction: string;
  canSwitch: boolean;
  autoOn: boolean;
  hasCredential: boolean;
  needsConsent: boolean;
  capabilities: string[];
};

type Overview = { therapistCount: number; sites: Site[] };

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

export function ConecfHome({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (salonId == null) return;
    let alive = true;
    getMediaOverview({ salonId }).then((res) => {
      if (!alive) return;
      if (res.ok) setData(res.data as Overview);
      else setError(res.error);
    }).catch(() => { if (alive) setError('読み込めませんでした'); });
    return () => { alive = false; };
  }, [salonId]);

  const onSet = async (s: Site, mode: 'write' | 'none') => {
    if (salonId == null) return;
    setBusy(s.provider + '#' + s.slot);
    const res = await setMediaLinkMode({ salonId, provider: s.provider, slot: s.slot, mode });
    if (res.ok) {
      const back = await getMediaOverview({ salonId });
      if (back.ok) setData(back.data as Overview);
      onToast(mode === 'write'
        ? `${s.label}への更新を始めました。出勤の自動更新は「出勤をサイトへ」で設定してください`
        : `${s.label}への更新をやめました。いつでも戻せます`);
    } else {
      onToast(res.error);
    }
    setBusy('');
  };

  if (salonId == null) {
    return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>店舗が選ばれていません。</div>;
  }
  if (error) {
    return <div className={`${CARD} p-5 text-[14px] text-slate-500`}>連携の状態を読み込めませんでした（{error}）。しばらくしてから開き直してください。</div>;
  }

  const sites = data?.sites ?? [];
  const recheck = sites.filter((s) => s.needsConsent);
  const autoOff = autoOffWorkSites(sites);
  const updating = sites.filter((s) => s.direction === 'write' && !s.needsConsent);

  return (
    <div className="space-y-3">
      {/* ── 同意の取り直し（琥珀）── */}
      {recheck.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-[15px] font-bold text-amber-800">{consentRecheckNotice(recheck.map((x) => x.label)).title}</p>
          <p className="mt-1 text-[14px] text-amber-900/80 leading-relaxed">{consentRecheckNotice(recheck.map((x) => x.label)).body}</p>
          <Link href={href('/sites')} className="inline-block mt-2 text-[14px] font-bold text-amber-800 underline underline-offset-4">ID・PASS登録を開く ›</Link>
        </div>
      )}

      {/* ── 出勤の自動更新が未設定（赤）── */}
      {autoOff.length > 0 && (
        <div className="border border-rose-300 bg-rose-50 px-4 py-3">
          <p className="text-[15px] font-bold text-rose-700">{autoOffNoticeText(autoOff.map((x) => x.label)).title}</p>
          <p className="mt-1 text-[14px] text-rose-900 leading-relaxed">{autoOffNoticeText(autoOff.map((x) => x.label)).body}</p>
          <Link href={href('/schedule/sync')} className="inline-block mt-2 text-[14px] font-bold text-rose-700 underline underline-offset-4">出勤をサイトへを開く ›</Link>
        </div>
      )}

      {/* ── 数 ── */}
      <div className={`${CARD} grid grid-cols-2`}>
        <div className="px-4 py-3 border-r border-slate-200">
          <div className="text-[12.5px] font-bold text-slate-400">セラピスト</div>
          <div className="text-[22px] font-black text-slate-800 tabular-nums">
            {data ? data.therapistCount : '—'}<span className="text-[13px] font-bold text-slate-400 ml-0.5">名</span>
          </div>
        </div>
        <div className="px-4 py-3">
          <div className="text-[12.5px] font-bold text-slate-400">更新しているサイト</div>
          <div className="text-[22px] font-black text-slate-800 tabular-nums">
            {data ? updating.length + 1 : '—'}<span className="text-[13px] font-bold text-slate-400 ml-0.5">サイト</span>
          </div>
        </div>
      </div>

      {/* ── サイトごとの状態 ── */}
      <div className={CARD}>
        <p className="px-4 pt-3.5 pb-2 text-[15px] font-black text-slate-800">各サイトの状態</p>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          <li className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <b className="text-[15.5px] font-black text-slate-800">フクエス</b>
            <span className="text-[12px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5">出勤・今すぐ・セラピスト</span>
            <span className="ml-auto text-[13.5px] font-bold text-emerald-700">自動で連携済み</span>
          </li>

          {!data && <li className="px-4 py-3 text-[14px] text-slate-400">読み込み中…</li>}

          {sites.map((s) => {
            const k = s.provider + '#' + s.slot;
            let status: { text: string; tone: string };
            let action: React.ReactNode = null;
            /** ★ 第437便: 状態の下に出す1行（★ 直し方まで書く） */
            let note: { text: string; tone: string; link: { href: string; label: string } | null } | null = null;

            if (s.needsConsent) {
              status = { text: '同意の取り直しが必要です（いまは更新していません）', tone: 'text-amber-700' };
              action = <Link href={href('/sites')} className="text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">開く</Link>;
            } else if (!s.hasCredential) {
              status = { text: 'ID・PASS未登録', tone: 'text-slate-400' };
              action = <Link href={href('/sites')} className="text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">登録する</Link>;
            } else if (s.direction === 'write') {
              // ★★ 第437便（カッキーさん）: 「更新中（出勤の自動更新は未設定）」＋「更新しない」は、
              //   ★ いまの状態なのか、押すと何が起きるのかが読み取れない（★ 実際に迷った）。
              //   → 状態は【コネックエフから更新中】の1つだけ。出勤の自動更新は【別の行】で直し方まで出す。
              //   → ボタンは押したあとの結果が分かる言葉（★ 「更新を止める」）にする。
              status = { text: 'コネックエフから更新中', tone: 'text-emerald-700' };
              action = (
                <button type="button" disabled={busy !== ''} onClick={() => void onSet(s, 'none')}
                  className="px-3 py-1.5 border border-slate-300 bg-white text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  {busy === k ? '変えています…' : '更新を止める'}
                </button>
              );
              note = s.autoOn
                ? { text: '出勤は自動で更新しています', tone: 'text-slate-500', link: null }
                : { text: '出勤の自動更新が未設定です', tone: 'text-rose-700', link: { href: href('/schedule/sync'), label: '設定する' } };
            } else if (s.direction === 'read') {
              status = { text: `${s.label}から取り込み中（コネックエフからは更新していません）`, tone: 'text-amber-700' };
              action = (
                <button type="button" disabled={busy !== ''} onClick={() => void onSet(s, 'write')}
                  className="px-3 py-1.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[13px] font-bold disabled:opacity-40">
                  {busy === k ? '変えています…' : 'コネックエフから更新する'}
                </button>
              );
            } else {
              status = { text: '更新していません', tone: 'text-slate-400' };
              action = (
                <button type="button" disabled={busy !== ''} onClick={() => void onSet(s, 'write')}
                  className="px-3 py-1.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[13px] font-bold disabled:opacity-40">
                  {busy === k ? '変えています…' : '更新する'}
                </button>
              );
            }

            return (
              <li key={k} className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <b className="text-[15.5px] font-black text-slate-800">{s.label}</b>
                {s.capabilities.length > 0 && (
                  <span className="text-[12px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5">{s.capabilities.join('・')}</span>
                )}
                <span className={`ml-auto text-[13.5px] font-bold ${status.tone}`}>{status.text}</span>
                {action}
                {note && (
                  <span className={`basis-full text-[12.5px] font-bold ${note.tone}`}>
                    {note.text}
                    {note.link && (
                      <Link href={note.link.href} className="ml-2 font-bold text-indigo-600 underline underline-offset-4">{note.link.label} ›</Link>
                    )}
                  </span>
                )}
              </li>
            );
          })}

          {data && sites.length === 0 && (
            <li className="px-4 py-3 text-[14px] text-slate-500">
              まだどのサイトも登録されていません。<Link href={href('/sites')} className="font-bold text-indigo-600 underline underline-offset-4">ID・PASS登録</Link>から始めてください。
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
