'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MEDIA_SITES,
  siteCapabilityLabels,
  mediaSiteSlots,
  siteLoginStatus,
  loginStatusLabel,
  loginTally,
  loginDirection,
  loginDirectionText,
  canRegisterSite,
  type MediaSite,
} from '@/lib/mediaSites';
import {
  MEDIA_CONSENT_SECTIONS,
  MEDIA_CONSENT_AGREE_LABEL,
  CONSENT_RECHECK_BADGE,
  consentRecheckNotice,
} from '@/lib/mediaConsent';
// ★ 「変える」の選択肢と文は1か所から出す（第87便）。★ ホームと同じものを使う
import {
  switchChoices, switchDoneText,
  canReadProvider,
  credentialPauseLabel, credentialPauseAskText, credentialPauseDoneText,
  credentialPausedNotice,
  CREDENTIAL_PAUSE_WHEN, CREDENTIAL_PAUSE_NOT_FOR_STOPPING,
  CREDENTIAL_PAUSE_BLOCKS_SWITCH,
} from '@/lib/mediaOverview';
import {
  getMediaCredentials,
  saveMediaCredential,
  setMediaCredentialEnabled,
  deleteMediaCredential,
  startMediaConnectionTest,
  setMediaLinkMode,
} from '@/app/actions/mediaCredentials';

// ログイン情報（第63便・㉞ その5）。
//
// ★★★ この画面がしていることは【店舗のアカウントを預かること】。
//   第39便の全部入り（MediaLinkPanel）から、この節だけを持ってきて4サイトに広げた。
//   ★ 中身の決めごとは変えていない：
//     ・説明を読まずに保存できない（チェック必須）
//     ・パスワードは保存後に二度と表示しない（●●●●）
//     ・いつでも止められる（停止／削除）
//
// ★★ 変えたのは3つ（2026-08-30・カッキーさんと決めた）:
//   1. 4サイトを【カード】で並べ、開く前に状態が読めるようにした
//   2. 「送れるもの」をサイトごとに出した ← ★ カッキーさんの要望。可視化そのものが目的
//   3. 同意文を【チェックのすぐ上】へ移した
//      ★ 全部入りでは「同意文 → フォーム → チェック」で離れていた。
//        離れていると読まずにチェックできる。読む場所と押す場所をくっつける。
//
// ★★★ まだ受け付けていないサイトでは、保存の口そのものを出さない（mediaSites.accepting）。
//   ★ 送る仕組みが無いのに鍵だけ預かると、店舗から見れば「連携したつもり」になる。
//     それは §185（できないことを、できない理由といっしょに出す）の逆。

type CredRow = {
  provider: string;
  slot: number;
  shopId: string;
  loginId: string;
  passwordMask: string;
  hasPassword: boolean;
  isEnabled: boolean;
  needsConsent: boolean;
  consentAgreedAt: string | null;
  lastVerifiedAt: string | null;
  lastError: string | null;
  linkMode: string | null;
};

const fmt = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const CARD = 'bg-white border border-slate-200 shadow-[0_1px_2px_rgba(31,35,51,0.05)]';

function ConsentText() {
  return (
    <ol className="space-y-2.5 list-none">
      {MEDIA_CONSENT_SECTIONS.map((s, i) => (
        <li key={s.heading}>
          <p className="text-[14px] font-bold text-slate-600">{i + 1}. {s.heading}</p>
          <p className="text-[13.5px] text-slate-500 leading-relaxed mt-0.5">{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

export function LoginBoard({
  salonId,
  onToast,
}: {
  salonId: number | null;
  onToast: (m: string) => void;
}) {
  const [rows, setRows] = useState<CredRow[]>([]);
  /** ★ 読み込めたか。★ false のあいだ「未登録」と言い切らない（mediaSites の known） */
  const [known, setKnown] = useState(false);
  const [consentVersion, setConsentVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [openKey, setOpenKey] = useState<string>('');
  const [slotOf, setSlotOf] = useState<Record<string, number>>({});

  const [shopId, setShopId] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);

  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  // ★ ログインの一時停止／再開を押す前の問い（第89便）。★ null のあいだは何も出さない
  const [askPause, setAskPause] =
    useState<{ site: MediaSite; slot: number; to: 'pause' | 'resume' } | null>(null);

  const load = useCallback(async () => {
    if (salonId == null) return;
    // ★ ここで setLoading(true) をしない。初回は loading=true で始まり、
    //   保存や削除のあとの読み直しでは「読み込み中…」を挟まない（画面がちらつくため）。
    const res = await getMediaCredentials({ salonId });
    if (res.ok) {
      setRows(res.data.rows as CredRow[]);
      setConsentVersion(res.data.consentVersion);
      setKnown(true);
      setLoadError('');
    } else {
      // ★★ 読めなかったときは known を立てない。★ 空の一覧を「未登録」と見せない
      setKnown(false);
      setLoadError(res.error);
    }
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  const rowsOf = useCallback(
    (provider: string) => rows.filter((r) => r.provider === provider),
    [rows],
  );
  const rowAt = useCallback(
    (provider: string, slot: number) => rows.find((r) => r.provider === provider && r.slot === slot) ?? null,
    [rows],
  );

  /** ★ 枠を切り替えたら、フォームはその枠の中身に入れ替える。★ パスワードと同意は必ず空に戻す */
  const focusSlot = useCallback((site: MediaSite, slot: number) => {
    setSlotOf((m) => ({ ...m, [site.provider]: slot }));
    const r = rowAt(site.provider, slot);
    setShopId(r?.shopId ?? '');
    setLoginId(r?.loginId ?? '');
    setPassword('');
    setAgreed(false);
    setConfirmDelete('');
  }, [rowAt]);

  const toggleOpen = (site: MediaSite) => {
    if (openKey === site.provider) { setOpenKey(''); return; }
    setOpenKey(site.provider);
    focusSlot(site, slotOf[site.provider] ?? mediaSiteSlots(site)[0]);
  };

  /**
   * ★★★ 同意の場所まで運ぶ（第89便・カッキーさんの指摘）。
   *
   * ★ 帯を出すだけでは足りない。★ 同意のチェックはカードの一番下にあり、
   *   開いてスクロールしないと出てこない。★ 「どこを押すのか」まで案内する。
   * ★ 開いた直後はまだ描かれていないので、少し待ってから運ぶ。
   */
  const openConsent = (site: MediaSite, slot: number) => {
    setOpenKey(site.provider);
    focusSlot(site, slot);
    window.setTimeout(() => {
      document.getElementById(`consent-${site.provider}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const onSave = async (site: MediaSite, slot: number) => {
    if (salonId == null) return;
    setSaving(true);
    const res = await saveMediaCredential({
      salonId, provider: site.provider, slot,
      // ★ 店舗IDを預からないサイトには空を送る（第81便）。
      //   ★ 画面に出していない値を、前のサイトの入力のまま持ち回さない
      shopId: site.needsShopId ? shopId : '',
      loginId, password,
      agreed,
      consentVersion,
    });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    setPassword('');
    setAgreed(false);
    await load();
    onToast(`${site.name}（枠${slot}）を保存しました`);
  };

  const onTest = async (site: MediaSite, slot: number) => {
    if (salonId == null) return;
    setBusy(`test:${site.provider}:${slot}`);
    const res = await startMediaConnectionTest({ salonId, provider: site.provider, slot });
    setBusy('');
    onToast(res.ok
      ? '接続テストを受け付けました。数分後に「連携の記録」でご確認ください'
      : res.error);
  };

  const onToggleEnabled = async (site: MediaSite, slot: number, next: boolean) => {
    if (salonId == null) return;
    setBusy(`enable:${site.provider}:${slot}`);
    const res = await setMediaCredentialEnabled({ salonId, provider: site.provider, slot, enabled: next });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    await load();
    // ★★ このボタンが倒すのは【鍵】の旗であって、連携そのものではない（第87便で確かめた）。
    //   ★ 「連携を停止しました」と書くと、取り込みまで止まったと読める。★ 止まらない
    //   ★★ 文言は mediaOverview に集めた（第89便）。★ 押す前の問いと【対】（点検で見張る）
    onToast(credentialPauseDoneText(
      next ? 'resume' : 'pause', site.name, canReadProvider(site.provider),
    ));
  };

  const onDelete = async (site: MediaSite, slot: number) => {
    if (salonId == null) return;
    setBusy(`del:${site.provider}:${slot}`);
    const res = await deleteMediaCredential({ salonId, provider: site.provider, slot });
    setBusy('');
    setConfirmDelete('');
    if (!res.ok) { onToast(res.error); return; }
    await load();
    focusSlot(site, slot);
    onToast('ログイン情報を削除しました');
  };

  const onSwitchMode = async (site: MediaSite, slot: number, mode: 'read' | 'write' | 'none') => {
    if (salonId == null) return;
    setBusy(`mode:${site.provider}:${slot}`);
    const res = await setMediaLinkMode({ salonId, provider: site.provider, slot, mode });
    setBusy('');
    if (!res.ok) { onToast(res.error); return; }
    await load();
    // ★ ホームと同じ文を使う。★ 2か所で違う言い方をしない（第87便）
    onToast(switchDoneText(mode, site.name));
  };

  // ★ 上の3つの数。★ 読めていなければ null（0 と書かない）
  // ★ accepting を渡す（第83便）。★ 渡さないと、送れないサイトが「連携中」になる
  const statuses = MEDIA_SITES.map((s) => siteLoginStatus({ known, rows: rowsOf(s.provider), accepting: s.accepting }));
  const tally = loginTally({ known, statuses });
  // ★★★ 同意の取り直しが要る枠（第89便）。★ 要るあいだ、その枠へは何も送っていない
  const recheck = MEDIA_SITES
    .map((site) => ({ site, rows: rowsOf(site.provider).filter((r) => r.needsConsent) }))
    .filter((x) => x.rows.length > 0);

  return (
    <div className="space-y-3">
      {/* ── この画面は何か ── */}
      <div className={`${CARD} p-4`}>
        <p className="text-[14.5px] text-slate-500 leading-relaxed">
          各サイトの管理画面へ<b className="text-slate-700">フクエスがログインするための情報</b>をお預かりします。
          <br />
          ここに登録があるサイトへ、出勤や写メ日記を送ります。
          <b className="text-slate-700">登録がないサイトへは、何も送りません。</b>
        </p>
      </div>

      {/* ── ★★★ 同意の取り直し（第89便）─────────────────────
          ★★ 版を上げると、何も知らせないまま送信と接続テストが止まる。
            ★ 取り直しの場所はカードの一番下で、開かなければ見えない。
            ★★★ 店舗様には「昨日まで送れていたのに、理由も出ずに止まった」に見える（§223）。
          ★ だから【いちばん上】に、止まっていることと、押す場所を出す。 */}
      {recheck.length > 0 && (
        <div className="border-2 border-amber-300 bg-amber-50 p-4">
          <p className="text-[15.5px] font-black text-amber-900">
            {consentRecheckNotice(recheck.map((x) => x.site.name)).title}
          </p>
          <p className="mt-1 text-[14px] text-amber-900/80 leading-relaxed">
            {consentRecheckNotice(recheck.map((x) => x.site.name)).body}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {recheck.map((x) => (
              <button
                key={x.site.provider}
                type="button"
                onClick={() => openConsent(x.site, x.rows[0].slot)}
                className="px-3 py-1.5 border border-amber-400 bg-white text-[13.5px] font-bold text-amber-900 hover:bg-amber-100"
              >
                {x.site.name}の同意を開く
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── 状態の要約 ── */}
      <div className={`${CARD} grid grid-cols-3`}>
        {([
          ['連携中', tally ? tally.enabled : null, 'text-emerald-700'],
          ['停止中', tally ? tally.disabled : null, 'text-slate-500'],
          ['未登録', tally ? tally.unregistered : null, 'text-amber-700'],
          // ★ サイト側の都合で使えないもの（第83便）。★ 0 のときは出さない
          //   ★ 「停止中」に混ぜない（あちらは店舗が止めたもの）
          ...(tally && tally.closed > 0
            ? [['使えません', tally.closed, 'text-rose-700'] as [string, number, string]]
            : []),
        ] as Array<[string, number | null, string]>).map(([label, n, tone], i) => (
          <div key={label} className={`px-3 py-2.5 ${i < 2 ? 'border-r border-slate-200' : ''}`}>
            <div className="text-[12.5px] font-bold text-slate-400">{label}</div>
            <div className={`text-[21px] font-black tabular-nums ${tone}`}>
              {/* ★★ 読めていなければ 0 ではなく「—」。数えられないものを 0 と書かない */}
              {n === null ? '—' : n}
              <span className="text-[13.5px] font-bold text-slate-400 ml-0.5">
                {n === null ? '' : `／${MEDIA_SITES.length}サイト`}
              </span>
            </div>
          </div>
        ))}
      </div>

      {loading && <p className="text-[14px] text-slate-400 px-1">読み込み中…</p>}
      {loadError && (
        <p className="text-[14px] text-rose-600 leading-relaxed px-1">
          ログイン情報を読み込めませんでした：{loadError}
          <br />
          ★ 登録が無いのか読めていないのかが分からないため、この画面では「未登録」と表示していません。
        </p>
      )}

      {/* ── サイトごと ── */}
      {MEDIA_SITES.map((site) => {
        const siteRows = rowsOf(site.provider);
        const status = siteLoginStatus({ known, rows: siteRows, accepting: site.accepting });
        const open = openKey === site.provider;
        const slot = slotOf[site.provider] ?? mediaSiteSlots(site)[0];
        const row = rowAt(site.provider, slot);
        const anyRow = siteRows[0] ?? null;

        const dir = loginDirection({ readable: site.readable, linkMode: row?.linkMode ?? null });
        const dirText = loginDirectionText(dir, site.name);

        const accent =
          status === 'enabled' ? 'border-l-emerald-600'
          : status === 'unregistered' ? 'border-l-amber-300'
          : status === 'unknown' ? 'border-l-slate-300'
          : 'border-l-slate-400';
        const chip =
          status === 'enabled' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : status === 'unregistered' ? 'bg-amber-50 text-amber-700 border-amber-200'
          // ★ サイト側の都合で使えない（第83便）。★ 停止中の灰色と分ける
          : status === 'site_closed' ? 'bg-rose-50 text-rose-700 border-rose-200'
          : 'bg-slate-50 text-slate-500 border-slate-200';

        const meta = !known
          ? 'まだ読み込めていません'
          // ★★ 使えないサイトで「登録済み」とだけ書かない（第83便）。
          //   ★ 登録は残っているが、送っていない。★ そこを言葉にする
          : status === 'site_closed'
            ? `${siteRows.map((r) => `枠${r.slot}`).join('・')} の登録は残っていますが、いまは使っていません`
            // ★★ 取り直しが要る枠は、時刻より先に【止まっていること】を書く（第89便）
            : siteRows.some((r) => r.needsConsent)
              ? `${siteRows.map((r) => `枠${r.slot}`).join('・')} を登録済み ／ ★ 同意の取り直しが必要です。いまは何も送っていません`
              : siteRows.length > 0
                ? `${siteRows.map((r) => `枠${r.slot}`).join('・')} を登録済み ／ 最後に確認できた ${fmt(anyRow?.lastVerifiedAt ?? null)}`
                : 'まだ登録されていません';

        const canRegister = canRegisterSite(site);
        const needConsent = !row || row.needsConsent;
        // ★ 枠と登録済みの表示を出すか。受け付けていて選ぶ意味があるとき、
        //   または既に行があるとき（止める・消すの口が要る）
        const showSlots = canRegister || siteRows.length > 0;

        return (
          <div key={site.provider} className={`${CARD} border-l-[3px] ${accent}`}>
            {/* 見出し（押すと開く） */}
            <button
              type="button"
              onClick={() => toggleOpen(site)}
              aria-expanded={open}
              className="w-full flex items-start gap-3 text-left px-4 py-3.5 hover:bg-slate-50/60 transition-colors"
            >
              <span className="flex-1 min-w-0 space-y-1.5">
                <span className="flex items-center gap-2 flex-wrap">
                  <b className="text-[16.5px] font-black text-slate-800">{site.name}</b>
                  <span className={`text-[13px] font-bold px-2 py-0.5 border ${chip}`}>
                    {loginStatusLabel(status)}
                  </span>
                  {/* ★ 「使えません」と出しているときは、重ねて「準備中」を出さない（第83便）。
                      ★ 2つのバッジが同時に出て、どちらを読めばよいか分からなくなっていた。 */}
                  {!canRegister && status !== 'site_closed' && (
                    <span className="text-[13px] font-bold px-2 py-0.5 border bg-white text-slate-400 border-slate-200">
                      準備中
                    </span>
                  )}
                  {/* ★★★ 開かなくても分かるようにする（第89便）。
                      ★ この印が出ているあいだ、この枠へは何も送っていない */}
                  {siteRows.some((r) => r.needsConsent) && (
                    <span className="text-[13px] font-bold px-2 py-0.5 border bg-amber-50 text-amber-800 border-amber-300">
                      {CONSENT_RECHECK_BADGE}
                    </span>
                  )}
                </span>
                {/* ★★ カッキーさんの要望：このサイトに何が送れるかの可視化 */}
                {/* ★★ 受け付けていないサイトでは「送れるもの」を出さない（第83便）。
                    ★ 送れないのに「送れるもの：出勤」と出ていた。★ 理由は下の notYet に書いてある。 */}
                <span className={`block text-[13.5px] text-slate-400 ${canRegister ? '' : 'hidden'}`}>
                  送れるもの：
                  {siteCapabilityLabels(site).map((c) => (
                    <span key={c} className="inline-block border border-slate-200 text-slate-500 px-1.5 mr-1">
                      {c}
                    </span>
                  ))}
                </span>
                <span className="block text-[13.5px] text-slate-500 tabular-nums">{meta}</span>
              </span>
              <svg
                width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                className={`flex-none text-slate-400 mt-1 transition-transform ${open ? 'rotate-180' : ''}`}
              >
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>

            {open && (
              <div className="border-t border-slate-100 p-4 space-y-4">
                {/* ── 向き ── */}
                <div className="border border-slate-200 bg-slate-50 px-3 py-2.5">
                  <p className="text-[14.5px] font-bold text-indigo-700">{dirText.title}</p>
                  <p className="text-[13.5px] text-slate-500 leading-relaxed mt-0.5">{dirText.desc}</p>
                  {/* ★ 切り替えは読めるサイトだけ。★ 押しても向こうへは何も送らない
                      ★★ 選択肢はホームと同じ関数から出す（第87便）。★ 2か所でずれない */}
                  {site.readable && row && row.linkMode !== 'write_auto' && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {switchChoices(
                        dir === 'read' || dir === 'write' || dir === 'off' ? dir : 'unset',
                        site.name,
                      ).map((c) => (
                        <button
                          key={c.mode}
                          type="button"
                          onClick={() => onSwitchMode(site, slot, c.mode)}
                          disabled={busy !== '' || !row.isEnabled}
                          className="px-3 py-1 border border-slate-300 bg-white text-[13.5px] font-bold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {row?.linkMode === 'write_auto' && (
                    <p className="mt-1.5 text-[13px] text-slate-400 leading-relaxed">
                      いまは自動で反映しています。自動をやめる操作は「出勤を送る」にあります。
                    </p>
                  )}
                  {/* ★★★ 灰色のボタンだけ見せない（§185・第91便）。
                      ★ 押せない理由と、押せるようにする方法を、その場に書く */}
                  {site.readable && row && row.linkMode !== 'write_auto' && !row.isEnabled && (
                    <p className="mt-1.5 text-[13px] text-amber-700 leading-relaxed">
                      {CREDENTIAL_PAUSE_BLOCKS_SWITCH}
                    </p>
                  )}
                </div>

                {/* ── 枠 ──
                    ★ 受け付けていないサイトでは出さない（第64便・設計メモ §200）。
                      ★ 登録できないのに枠を選べるのは、選ぶ意味が無い。
                      ★ ただし既に行があるサイトでは出す（止める・消すのために要る）。 */}
                {showSlots && (
                <div>
                  <div className="text-[13px] font-bold text-slate-500">掲載枠</div>
                  <div className="flex gap-1.5 mt-1.5 flex-wrap">
                    {mediaSiteSlots(site).map((n) => {
                      const has = !!rowAt(site.provider, n);
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => focusSlot(site, n)}
                          aria-pressed={slot === n}
                          className={`px-3 py-1.5 border text-[13.5px] font-bold transition-colors ${
                            slot === n
                              ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                              : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
                          }`}
                        >
                          枠{n}{has ? '（登録済み）' : ''}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[13px] text-slate-400 leading-relaxed mt-1.5">
                    掲載枠が複数ある場合は、枠ごとにログイン情報が異なります。枠ごとにご登録ください。
                  </p>
                </div>
                )}

                {/* ── 登録済みの枠 ── */}
                {!showSlots ? null : row ? (
                  <div className="border border-slate-200 p-3 space-y-2">
                    <p className="text-[13.5px] text-slate-500 leading-relaxed tabular-nums">
                      {/* ★ 預かっていないサイトでは店舗IDを見せない（第81便）。
                          ★ 見せると「これは何の番号か」で迷う */}
                      {site.needsShopId && (
                        <>店舗ID <b className="text-slate-700">{row.shopId}</b> ／ </>
                      )}
                      ログインID{' '}
                      <b className="text-slate-700">{row.loginId}</b> ／ パスワード{' '}
                      <b className="text-slate-700">{row.passwordMask || '未登録'}</b>
                    </p>
                    <p className="text-[13.5px] text-slate-500 tabular-nums">
                      最後に接続を確認できた日時：<b className="text-slate-700">{fmt(row.lastVerifiedAt)}</b>
                      {row.consentAgreedAt && !row.needsConsent && `　／　${fmt(row.consentAgreedAt)} に同意済み`}
                    </p>
                    {row.lastError && (
                      <p className="text-[13.5px] text-rose-600">直近のエラー：{row.lastError}</p>
                    )}
                    {/* ★★ いま一時停止しているなら、まずそれを言い切る（第89便）。
                        ★ ボタンには状態を書かない代わりに、状態はここに出す */}
                    {!row.isEnabled && (
                      <p className="border border-amber-200 bg-amber-50 px-3 py-2 text-[13.5px] font-bold text-amber-800 leading-relaxed">
                        {credentialPausedNotice(site.name)}
                      </p>
                    )}

                    {/* ── うまくいかないとき（第89便）─────────────────
                        ★★★ 接続テストと一時停止は【困ったときに押すもの】。
                          ★ ふだんの操作と同じ列に並べていたので、押しどきが読めなかった
                            （カッキーさんの指摘・2026-08-31 夜）。
                        ★ 削除は戻せないので、この区画には入れず下に分ける。 */}
                    <div className="border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">
                      <p className="text-[14px] font-bold text-slate-600">うまくいかないとき</p>
                      <div className="flex gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => onTest(site, slot)}
                          disabled={!row.hasPassword || !row.isEnabled || busy !== ''}
                          className="px-3 py-1 border border-indigo-200 bg-white text-[13.5px] font-bold text-indigo-700 hover:bg-indigo-50 disabled:opacity-40"
                        >
                          {busy === `test:${site.provider}:${slot}` ? '送信中…' : '接続テスト'}
                        </button>
                        {/* ★★ その場では変えない。★ 押す前に1度だけ問う（§353・第88便と同じ形） */}
                        <button
                          type="button"
                          onClick={() => setAskPause({ site, slot, to: row.isEnabled ? 'pause' : 'resume' })}
                          disabled={busy !== ''}
                          className="px-3 py-1 border border-slate-300 bg-white text-[13.5px] font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                        >
                          {busy === `enable:${site.provider}:${slot}`
                            ? '変えています…'
                            : credentialPauseLabel(row.isEnabled)}
                        </button>
                      </div>
                      {/* ★ 「読むだけ」であることを、押す場所のそばに書く */}
                      <p className="text-[13px] text-slate-400 leading-relaxed">
                        接続テストは、{site.name}にログインして1回読むだけです。掲載内容は書き換えません。
                        結果は少し経ってから「連携の記録」に出ます。
                      </p>
                      {/* ★ 滅多に押さないボタンなので、押しどきを一緒に置く */}
                      <p className="text-[13px] text-slate-400 leading-relaxed">{CREDENTIAL_PAUSE_WHEN}</p>
                      {/* ★★★ 取り違え防止。★ ここを押しても【送る設定は残る】。
                          ★ 残った設定を見張りが読んで、止まりとして毎日届けることになる（第87便） */}
                      <p className="text-[13px] text-slate-400 leading-relaxed">
                        {CREDENTIAL_PAUSE_NOT_FOR_STOPPING}{' '}
                        <Link href="/mypage/media" className="font-bold underline">
                          媒体連携のホームを開く
                        </Link>
                      </p>
                    </div>

                    {/* ── 削除 ──★ 戻せないので、他のボタンと並べない */}
                    <div className="flex justify-end">
                      {confirmDelete === `${site.provider}:${slot}` ? (
                        <button
                          type="button"
                          onClick={() => onDelete(site, slot)}
                          disabled={busy !== ''}
                          className="px-3 py-1 bg-rose-600 text-white text-[13.5px] font-bold disabled:opacity-40"
                        >
                          本当に削除
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(`${site.provider}:${slot}`)}
                          className="px-3 py-1 border border-rose-200 text-[13.5px] font-bold text-rose-600 hover:bg-rose-50"
                        >
                          削除
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="border border-dashed border-slate-200 p-3 text-[14px] text-slate-400 leading-relaxed">
                    {known
                      ? `枠${slot}は、まだ登録されていません。`
                      : `枠${slot}の登録は、まだ読み込めていません。`}
                  </p>
                )}

                {/* ── 登録フォーム ──
                    ★★★ 受け付けていないサイトでは、そもそも出さない。
                      押せないボタンを見せるより、無いほうがよい（§185 と同じ作法）。 */}
                {!canRegister ? (
                  <div className="border border-amber-200 bg-amber-50 px-3 py-2.5">
                    <p className="text-[14.5px] font-bold text-amber-800">
                      {site.name}のログイン情報は、まだお預かりしていません
                    </p>
                    <p className="text-[13.5px] text-amber-900/80 leading-relaxed mt-0.5">{site.notYet}</p>
                    {/* ★★ 手で入れれば写メ日記だけは送れるサイト（第84便）。
                        ★ 「使えません」で終わらせず、**できることへの道**を出す。
                        ★ できないことだけ言うと、店舗は使える機能まで諦める。 */}
                    {site.diaryAddressSource === 'manual' && (
                      <p className="text-[13.5px] text-amber-900/80 leading-relaxed mt-2">
                        ★ 写メ日記は、これまでどおりお送りできます。
                        {site.name}の投稿用アドレスは自動で読み取れないため、
                        セラピストさんごとに手でご入力いただく形になります。{' '}
                        <Link href="/mypage/media/diary" className="font-bold underline">
                          写メ日記の投稿先を開く
                        </Link>
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    {/* ★★ 受け付けてはいるが、まだ全部はできない段（第80便）。
                        ★ 開ける代わりに、いまどこまでできるかを同じ場所に書く。
                        ★ 黙って開けると『連携したつもり』になる —— それは §185 の逆。 */}
                    {site.stageNote && (
                      <div className="border border-sky-200 bg-sky-50 px-3 py-2.5">
                        <p className="text-[14.5px] font-bold text-sky-800">いまできること</p>
                        <p className="text-[13.5px] text-sky-900/80 leading-relaxed mt-0.5">{site.stageNote}</p>
                      </div>
                    )}
                    <div className="text-[15px] font-bold text-slate-700">
                      {row ? `枠${slot}の内容を変更する` : `枠${slot}を登録する`}
                    </div>

                    {/* ★★ 店舗IDを預かるサイトだけ出す（第81便）。
                        ★ エステラブはログインに店舗IDを使わない。出すと「何を入れるのか」で必ず止まる。
                        ★ 出勤に要る shop_id は、こちらが向こうの画面から読む（人に入れさせない）。 */}
                    {site.needsShopId && (
                      <div>
                        <label className="text-[13px] font-bold text-slate-500">{site.idLabel}</label>
                        <input
                          value={shopId}
                          onChange={(e) => setShopId(e.target.value)}
                          inputMode="numeric"
                          placeholder="例: 37168"
                          className="w-full mt-1 border border-slate-200 px-3 py-2 text-[16px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        <p className="text-[13px] text-slate-400 mt-1 leading-relaxed">{site.idHint}</p>
                      </div>
                    )}

                    <div className="grid md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[13px] font-bold text-slate-500">ログインID</label>
                        <input
                          value={loginId}
                          onChange={(e) => setLoginId(e.target.value)}
                          autoComplete="off"
                          className="w-full mt-1 border border-slate-200 px-3 py-2 text-[16px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                      </div>
                      <div>
                        <label className="text-[13px] font-bold text-slate-500">パスワード</label>
                        <input
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="new-password"
                          placeholder={row?.hasPassword ? `${row.passwordMask}（変更するときだけ入力）` : ''}
                          className="w-full mt-1 border border-slate-200 px-3 py-2 text-[16px] focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        />
                        {row?.hasPassword && (
                          <p className="text-[13px] text-slate-400 mt-1 leading-relaxed">
                            登録済みです。空のまま保存すると、パスワードは変更されません。
                          </p>
                        )}
                      </div>
                    </div>

                    {/* ★★ 同意文は【チェックのすぐ上】。既定で開いた状態にする。
                        ★ 閉じた状態が既定だと、読まずにチェックできてしまう。 */}
                    {needConsent ? (
                      <>
                        <details
                          open
                          id={`consent-${site.provider}`}
                          className="border-2 border-amber-300 bg-amber-50/40"
                        >
                          <summary className="cursor-pointer px-3 py-2.5 text-[14.5px] font-bold text-slate-700 list-none">
                            お預かりする情報の取り扱い
                          </summary>
                          <div className="px-3 pb-3"><ConsentText /></div>
                        </details>
                        <label className="flex items-start gap-2 cursor-pointer border border-indigo-200 bg-indigo-50 px-3 py-2.5">
                          <input
                            type="checkbox"
                            checked={agreed}
                            onChange={(e) => setAgreed(e.target.checked)}
                            className="mt-0.5 accent-indigo-600"
                          />
                          <span className="text-[13.5px] text-slate-600 leading-relaxed">
                            {MEDIA_CONSENT_AGREE_LABEL}
                          </span>
                        </label>
                      </>
                    ) : (
                      // ★ 同意済みでも読み返せる口は残す（何に同意したのか確かめられなくなるため）
                      <details className="border border-slate-200 bg-slate-50/60">
                        <summary className="cursor-pointer px-3 py-2.5 text-[14.5px] font-bold text-slate-600 list-none">
                          お預かりする情報の取り扱い（同意済み・読み返す）
                        </summary>
                        <div className="px-3 pb-3"><ConsentText /></div>
                      </details>
                    )}

                    <button
                      type="button"
                      onClick={() => onSave(site, slot)}
                      disabled={saving || (needConsent && !agreed)}
                      className="w-full py-2.5 bg-gradient-to-r from-indigo-700 to-indigo-500 text-white text-[16px] font-bold disabled:bg-none disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
                    >
                      {saving ? '保存中…' : '保存する'}
                    </button>
                    {needConsent && !agreed && (
                      <p className="text-[13px] text-slate-400 text-center">
                        上の説明をお読みのうえ、チェックを入れると保存できます
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* ── ★★★ 押す前の問い（第89便）───────────────────
          ★ ホームの切り替えと同じ形にする（MediaHome の ask と対）。
          ★ 既定は「やめる」側。★ 何もしないほうを、押しやすい位置に置く。
          ★★ 文言は mediaOverview から出す。★ 押したあとのトーストと対（点検で見張る） */}
      {askPause && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/40 grid place-items-center p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setAskPause(null)}
        >
          <div
            className="w-full max-w-[360px] bg-white border border-slate-200 shadow-lg p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-[17px] font-black text-slate-800">
              {credentialPauseAskText(
                askPause.to, askPause.site.name, canReadProvider(askPause.site.provider),
              ).title}
            </p>
            <p className="mt-2 text-[14px] text-slate-500 leading-relaxed">
              {credentialPauseAskText(
                askPause.to, askPause.site.name, canReadProvider(askPause.site.provider),
              ).body}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAskPause(null)}
                className="px-4 py-1.5 border border-slate-200 text-[14px] font-bold text-slate-500 hover:bg-slate-50"
              >
                やめる
              </button>
              <button
                type="button"
                onClick={() => {
                  const a = askPause;
                  setAskPause(null);
                  void onToggleEnabled(a.site, a.slot, a.to === 'resume');
                }}
                disabled={busy !== ''}
                className="px-4 py-1.5 border border-indigo-600 bg-indigo-600 text-[14px] font-bold text-white hover:bg-indigo-700 disabled:opacity-40"
              >
                {credentialPauseLabel(askPause.to === 'pause')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
