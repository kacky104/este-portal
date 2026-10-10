'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { getMediaOverview, setMediaLinkMode } from '@/app/actions/mediaCredentials';
import { workProblemShort, type WorkProblem } from '@/lib/workProblem';
import { consentRecheckNotice, conecfConsentNeededNotice } from '@/lib/mediaConsent';
import { loginRejectNoticeText } from '@/lib/loginAutoPause';
import { useConecfHref } from './ConecfBase';

// コネックエフのホーム（第396便・1b・2026-09-17）。
//
// ★★ フクエスリンクのホーム（MediaHome）とは【作りを分けた】。
//   ★ コネックエフは入力する場所がコネックエフだけ（設計メモ §1）。★ 「駅ちかから反映／フクエスから反映」の選択を置かない。
//   ★ サイトごとに「更新する／更新しない」だけ。★ 裏の仕組み（link_mode）は同じ（write / none）。
// ★ 状態の出どころは getMediaOverview（MediaHome と同じ）。★ ここで数えない・決めない。
// ★ フクエスは同じ仕組みの中にあるので、常に「更新中」（★ 第452便で言い方を揃えた）。

type Site = {
  provider: string;
  slot: number;
  label: string;
  direction: string;
  canSwitch: boolean;
  autoOn: boolean;
  hasCredential: boolean;
  needsConsent: boolean;
  /** ★ 第1287便: いまの同意が【読むだけ（フクエスリンクの文）】。「取り直し」ではなく「ご同意が必要」と言う */
  consentReadOnly?: boolean;
  /** ★ 第1294便: ID・パスワードを一時停止しているだけ（登録は残っている） */
  credentialPaused?: boolean;
  /** ★ 第1378便: 「ID・パスワードが違う」ために自動で止めた（続けてログインできなかった） */
  credentialRejected?: boolean;
  capabilities: string[];
  /** ★ 第1275便: いまうまくいっていないこと。無ければ null */
  problem?: WorkProblem | null;
};

type Overview = { therapistCount: number; sites: Site[] };

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

// ★ 第756便（カッキーさん）: enabled=false（コネックエフに切り替える前）は【見るだけ】。
//   ★ 更新しているサイトは 0、各サイトは「更新していません」（駅ちかだけ「フクエスリンクで反映中」を出す）、ボタンは出さない。
//   ★ 切り替える前に「コネックエフから更新する」を押せて向きが変わる穴を塞ぐ。
// ★ 第1294便: stopped=true（切り替え済みで、セットのご契約が確認できない店＝保存と各サイトへの更新を止めている）は「更新中」と言わない。
export function ConecfHome({ salonId, enabled = true, stopped = false, onToast }: { salonId: number | null; enabled?: boolean; stopped?: boolean; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [data, setData] = useState<Overview | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (salonId == null) return;
    let alive = true;
    getMediaOverview({ salonId, service: 'conecf' }).then((res) => {   // ★ 第1287便: 同意はコネックエフの文で見る
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
      const back = await getMediaOverview({ salonId, service: 'conecf' });
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
  // ★ 第1287便: 「取り直し」（古い版）と「読むだけの同意のまま」（フクエスリンクから切り替えた店）を言い分ける。
  //   ★ 後者の帯は切り替えたあとだけ（★ 切り替える前は見るだけ。フクエスリンクとしては同意済み）。
  const recheck = sites.filter((s) => s.needsConsent && !s.consentReadOnly);
  const needAgree = enabled ? sites.filter((s) => s.needsConsent && s.consentReadOnly) : [];
  const updating = sites.filter((s) => s.direction === 'write' && !s.needsConsent);
  // ★ 第1378便（カッキーさん）: 「ID・パスワードが違う」ために自動で止めた枠。開いたとき、いちばん上で分かるように。
  //   ★ メールを見ないオーナー様もいるので、画面で言う。入れ直して保存すると再開して、この帯は消える。
  const rejected = sites.filter((s) => s.credentialRejected);
  const slotName = (s: Site) => s.label + (s.slot > 1 ? `（枠${s.slot}）` : '');

  return (
    <div className="space-y-3">
      {/* ── 第1378便: ID・パスワードが違うため、ログインを止めている（赤）── */}
      {rejected.length > 0 && (
        <div className="border-2 border-rose-300 bg-rose-50 px-4 py-3">
          <p className="text-[15.5px] font-black text-rose-700">{loginRejectNoticeText(rejected.map(slotName)).title}</p>
          <p className="mt-1 text-[14px] text-rose-900/80 leading-relaxed">{loginRejectNoticeText(rejected.map(slotName)).body}</p>
          <Link href={href('/sites')} className="inline-block mt-2.5 px-3 py-1.5 border border-rose-400 bg-white text-[13.5px] font-bold text-rose-700 hover:bg-rose-100">ID・パスワードを入れ直す</Link>
        </div>
      )}

      {/* ── 同意の取り直し（琥珀）── */}
      {recheck.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-[15px] font-bold text-amber-800">{consentRecheckNotice(recheck.map((x) => x.label)).title}</p>
          <p className="mt-1 text-[14px] text-amber-900/80 leading-relaxed">{consentRecheckNotice(recheck.map((x) => x.label)).body}</p>
          <Link href={href('/sites')} className="inline-block mt-2 text-[14px] font-bold text-amber-800 underline underline-offset-4">ID・パスワード登録を開く ›</Link>
        </div>
      )}

      {/* ── 第1287便: 読むだけの同意（フクエスリンク）のまま切り替えた店（琥珀）── */}
      {needAgree.length > 0 && (
        <div className="border border-amber-300 bg-amber-50 px-4 py-3">
          <p className="text-[15px] font-bold text-amber-800">{conecfConsentNeededNotice(needAgree.map((x) => x.label)).title}</p>
          <p className="mt-1 text-[14px] text-amber-900/80 leading-relaxed">{conecfConsentNeededNotice(needAgree.map((x) => x.label)).body}</p>
          <Link href={href('/sites')} className="inline-block mt-2 text-[14px] font-bold text-amber-800 underline underline-offset-4">ID・パスワード登録を開く ›</Link>
        </div>
      )}

      {/* ★★ 第442便（カッキーさん）: 出勤の自動更新の赤い帯はやめた。
          ★ 同じことを、下の【そのサイトの行】に1行で出している（第437便）。★ 二重に出さない。 */}

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
            {data ? (enabled && !stopped ? updating.length + 1 : 0) : '—'}<span className="text-[13px] font-bold text-slate-400 ml-0.5">サイト</span>
          </div>
        </div>
      </div>

      {/* ── サイトごとの状態 ── */}
      <div className={CARD}>
        <p className="px-4 pt-3.5 pb-2 text-[15px] font-black text-slate-800">各サイトの状態</p>
        <ul className="divide-y divide-slate-100 border-t border-slate-100">
          <li className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <b className="text-[15.5px] font-black text-slate-800">フクエス</b>
            {/* ★ 第721便（カッキーさん）: 写メ日記はフクエスから投稿だが、利用者に分かりやすいよう並べて出す */}
            {/* ★ 第769便（カッキーさん）: スマホは 1行目 サイト名／2行目 送るもの／3行目 状態 */}
            <div className="basis-full sm:basis-auto">
              <span className="inline-block text-[12px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5">出勤・セラピスト・写メ日記・今すぐ・お知らせ</span>
            </div>
            {stopped
              ? <span className="sm:ml-auto text-[13.5px] font-bold text-amber-700">止めています</span>
              : enabled
                ? <span className="sm:ml-auto text-[13.5px] font-bold text-emerald-700">更新中</span>
                : <span className="sm:ml-auto text-[13.5px] font-bold text-slate-400">更新していません</span>}
          </li>

          {!data && <li className="px-4 py-3 text-[14px] text-slate-400">読み込み中…</li>}

          {sites.map((s) => {
            const k = s.provider + '#' + s.slot;
            let status: { text: string; tone: string };
            let action: React.ReactNode = null;
            /** ★ 第437便: 状態の下に出す1行（★ 直し方まで書く） */
            let note: { text: string; tone: string; link: { href: string; label: string } | null } | null = null;

            if (!enabled) {
              // ★ 第756便: 切り替える前は見るだけ。★ 駅ちかから反映中だけは事実として出す
              status = s.direction === 'read'
                ? { text: 'フクエスリンクで反映中', tone: 'text-amber-700' }
                : { text: '更新していません', tone: 'text-slate-400' };
            } else if (s.needsConsent) {
              status = { text: s.consentReadOnly ? 'ご同意が必要です（いまは更新していません）' : '同意の取り直しが必要です（いまは更新していません）', tone: 'text-amber-700' };
              action = <Link href={href('/sites')} className="text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">開く</Link>;
            } else if (!s.hasCredential && s.credentialRejected) {
              // ★ 第1378便: 自動で止めた枠は、理由を言う（店舗様が自分で止めた「一時停止中」と分ける）
              status = { text: 'ID・パスワードが違うため止めています', tone: 'text-rose-700' };
              action = <Link href={href('/sites')} className="text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">入れ直す</Link>;
            } else if (!s.hasCredential && s.credentialPaused) {
              // ★ 第1294便: 一時停止しただけの枠を「未登録」と言わない（登録は残っている。再開は ID・パスワード登録から）
              status = { text: 'ID・パスワードを一時停止中', tone: 'text-slate-500' };
              action = <Link href={href('/sites')} className="text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">開く</Link>;
            } else if (!s.hasCredential) {
              status = { text: 'ID・パスワード未登録', tone: 'text-slate-400' };
              action = <Link href={href('/sites')} className="text-[13.5px] font-bold text-indigo-600 underline underline-offset-4">登録する</Link>;
            } else if (s.direction === 'write') {
              // ★★ 第437便（カッキーさん）: 「更新中（出勤の自動更新は未設定）」＋「更新しない」は、
              //   ★ いまの状態なのか、押すと何が起きるのかが読み取れない（★ 実際に迷った）。
              //   → 状態は【コネックエフから更新中】の1つだけ。出勤の自動更新は【別の行】で直し方まで出す。
              //   → ボタンは押したあとの結果が分かる言葉（★ 「更新を止める」）にする。
              // ★ 第1294便: 止めている店（セットのご契約が確認できない）は、送っていないので「更新中」と言わない
              status = stopped ? { text: '止めています', tone: 'text-amber-700' } : { text: '更新中', tone: 'text-emerald-700' };
              action = (
                <button type="button" disabled={busy !== ''} onClick={() => void onSet(s, 'none')}
                  className="px-3 py-1.5 border border-slate-300 bg-white text-[13px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40">
                  {busy === k ? '変えています…' : '更新を止める'}
                </button>
              );
              // ★★★ 第1275便: うまくいっていないことがあれば、それを先に言う（「自動で更新しています」と言い切らない）。
              //   ★ 自動が切られた店に「未設定です」と出していた（＝設定し忘れに見える）。「止まりました」と言う。
              //   ★ 詳しい説明と直し方は行き先の画面が出す。ここは1行と行き先だけ。
              note = stopped
                ? { text: 'フクエスCRMのご契約が確認できないため、更新を止めています', tone: 'text-amber-700', link: null }
                : s.problem
                ? {
                    text: workProblemShort(s.problem), tone: 'text-rose-700',
                    link: s.problem.kind === 'login'
                      ? { href: href('/sites'), label: 'ID・パスワードを確認する' }
                      : { href: href('/schedule/sync'), label: s.problem.kind === 'auto_off' ? '再開する' : '確認する' },
                  }
                : s.autoOn
                  ? { text: '出勤は自動で更新しています', tone: 'text-slate-500', link: null }
                  : { text: '出勤の自動更新が未設定です', tone: 'text-rose-700', link: { href: href('/schedule/sync'), label: '設定する' } };
            } else if (s.direction === 'read') {
              status = { text: 'フクエスリンクで反映中', tone: 'text-amber-700' };
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
                  <div className="basis-full sm:basis-auto">
                    {/* ★ 第769便（カッキーさん）: 駅ちかはココア（店長ブログ）にも送れるので最後に足す */}
                    <span className="inline-block text-[12px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5">{[...s.capabilities, ...(s.provider === 'ekichika' ? ['ココア'] : [])].join('・')}</span>
                  </div>
                )}
                <span className={`sm:ml-auto text-[13.5px] font-bold ${status.tone}`}>{status.text}</span>
                {action && <span className="ml-auto sm:ml-0">{action}</span>}
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
              まだどのサイトも登録されていません。<Link href={href('/sites')} className="font-bold text-indigo-600 underline underline-offset-4">ID・パスワード登録</Link>から始めてください。
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
