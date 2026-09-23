'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  MEDIA_SITES,
  capabilityLabel,
  mediaSiteSlots,
  siteLoginStatus,
  canRegisterSite,
  notYetLabel,
  sendableCapabilities,
  sortSitesForLogin,
  loginIdLabelOf,
  type MediaSite,
} from '@/lib/mediaSites';
import { MEDIA_CONSENT_SECTIONS, MEDIA_CONSENT_AGREE_LABEL } from '@/lib/mediaConsent';
import { canReadProvider, credentialPauseLabel, credentialPauseAskText, credentialPauseDoneText } from '@/lib/mediaOverview';
import {
  getMediaCredentials,
  saveMediaCredential,
  setMediaCredentialEnabled,
  deleteMediaCredential,
  startMediaConnectionTest,
} from '@/app/actions/mediaCredentials';
import { useConecfHref } from '../ConecfBase';

// コネックエフ「ID・PASS登録」（第412便・2026-09-17・カッキーさん）。
//
// ★★ ベンリー（mrvenrey.jp の ID・PASS登録）の形に寄せた。★ ベンリーから移る店舗様が迷わないため。
//   ・タブ：対応サイト一覧／登録済／未登録
//   ・表：左に「＋登録」（緑）か「編集」（青）、サイト名、ステータス（丸い札）、メモ
//   ・押すと「ID・PASS設定」の窓（600px）：STEP1 ログイン情報 → STEP2 お預かりする情報の取り扱い → キャンセル／保存（緑）
//   ★ 寸法・色はベンリーの実物で測った値（12px の札・14px の本文・緑 #218925・青 #1558d6・窓の角 9px）。
// ★★ 中身の決めごとはフクエスリンクの LoginBoard と同じ（★ 同じ server action を呼ぶだけ）
//   ・説明を読んでチェックしないと保存できない／パスワードは二度と見せない／いつでも止められる・消せる
// ★ フクエスリンク（/mypage/media）の LoginBoard は触っていない。

type CredRow = {
  provider: string; slot: number; shopId: string; loginId: string; passwordMask: string; hasPassword: boolean;
  isEnabled: boolean; needsConsent: boolean; consentAgreedAt: string | null; lastVerifiedAt: string | null;
  lastError: string | null; linkMode: string | null;
};

type Tab = 'all' | 'registered' | 'unregistered';

const GREEN = 'text-[#218925]';
const BLUE = 'text-[#1558d6]';

const fmtDay = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('ja-JP', { month: '2-digit', day: '2-digit' });
};

/** ベンリーの丸い札（有・無・求…）に寄せた札。★ 送れるものは青、それ以外は出さない */
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center h-[22px] px-2 rounded-full border border-[#b9d2e8] bg-[#e5f1fc] text-[12px] text-[#1e88e5] whitespace-nowrap">
      {children}
    </span>
  );
}

export function ConecfLoginBoard({ salonId, onToast }: { salonId: number | null; onToast: (m: string) => void }) {
  const href = useConecfHref();
  const [rows, setRows] = useState<CredRow[]>([]);
  const [known, setKnown] = useState(false);
  const [consentVersion, setConsentVersion] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  // ── 窓 ──
  const [edit, setEdit] = useState<MediaSite | null>(null);
  const [slot, setSlot] = useState(1);
  const [shopId, setShopId] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState('');
  const [ask, setAsk] = useState<'' | 'delete' | 'pause' | 'resume'>('');

  const load = useCallback(async () => {
    if (salonId == null) return;
    const res = await getMediaCredentials({ salonId, service: 'conecf' });   // ★ 第716便: コネックエフの版で見る（厳密）
    if (res.ok) {
      setRows(res.data.rows as CredRow[]);
      setConsentVersion(res.data.consentVersion);
      setKnown(true);
      setLoadError('');
    } else {
      setKnown(false);
      setLoadError(res.error);
    }
    setLoading(false);
  }, [salonId]);

  useEffect(() => { void load(); }, [load]);

  const rowsOf = (provider: string) => rows.filter((r) => r.provider === provider);
  const rowAt = (provider: string, n: number) => rows.find((r) => r.provider === provider && r.slot === n) ?? null;

  const focusSlot = (site: MediaSite, n: number) => {
    setSlot(n);
    const r = rowAt(site.provider, n);
    setShopId(r?.shopId ?? '');
    setLoginId(r?.loginId ?? '');
    setPassword('');
    setAgreed(false);
    setAsk('');
  };

  const openEdit = (site: MediaSite) => {
    setEdit(site);
    const first = rowsOf(site.provider)[0]?.slot ?? mediaSiteSlots(site)[0];
    focusSlot(site, first);
  };
  const close = () => { setEdit(null); setAsk(''); setPassword(''); setAgreed(false); };

  const onSave = async () => {
    if (salonId == null || !edit) return;
    setSaving(true);
    const res = await saveMediaCredential({
      salonId, provider: edit.provider, slot,
      shopId: edit.needsShopId ? shopId : '',
      loginId, password, agreed, consentVersion,
    });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    await load();
    onToast(`${edit.name}${mediaSiteSlots(edit).length > 1 ? `（枠${slot}）` : ''}を保存しました`);
    close();
  };

  const onTest = async () => {
    if (salonId == null || !edit) return;
    setBusy('test');
    const res = await startMediaConnectionTest({ salonId, provider: edit.provider, slot });
    setBusy('');
    onToast(res.ok ? '接続テストを受け付けました。数分後に「更新結果」でご確認ください' : res.error);
  };

  const onPause = async (next: boolean) => {
    if (salonId == null || !edit) return;
    setBusy('enable');
    const res = await setMediaCredentialEnabled({ salonId, provider: edit.provider, slot, enabled: next });
    setBusy('');
    setAsk('');
    if (!res.ok) { onToast(res.error); return; }
    await load();
    onToast(credentialPauseDoneText(next ? 'resume' : 'pause', edit.name, canReadProvider(edit.provider)));
  };

  const onDelete = async () => {
    if (salonId == null || !edit) return;
    setBusy('del');
    const res = await deleteMediaCredential({ salonId, provider: edit.provider, slot });
    setBusy('');
    setAsk('');
    if (!res.ok) { onToast(res.error); return; }
    await load();
    focusSlot(edit, slot);
    onToast('登録を解除しました');
  };

  // ── 表の行 ──
  const sites = sortSitesForLogin(MEDIA_SITES);
  const isRegistered = (s: MediaSite) => rowsOf(s.provider).length > 0;
  const shown = sites.filter((s) => (tab === 'all' ? true : tab === 'registered' ? isRegistered(s) : !isRegistered(s)));
  // ★ フクエスは「対応サイト一覧」「登録済」に出す（★ ID・PASS はいらない・外せない）
  const showFukues = tab !== 'unregistered';
  const total = shown.length + (showFukues ? 1 : 0);

  const memoOf = (site: MediaSite): { text: string; tone: string } => {
    const siteRows = rowsOf(site.provider);
    const blocked = site.accepting === false && site.notYetKind === 'blocked';
    if (blocked) return { text: '写メ日記の転送のみ', tone: 'text-[#212121]' };
    if (!known) return { text: '読み込み中', tone: 'text-slate-400' };
    const st = siteLoginStatus({ known, rows: siteRows, accepting: site.accepting });
    if (st === 'site_closed') return { text: 'いまは使えません（登録は残っています）', tone: 'text-rose-600' };
    if (!canRegisterSite(site) && siteRows.length === 0) return { text: notYetLabel(site), tone: 'text-slate-400' };
    if (siteRows.some((r) => r.needsConsent)) return { text: '同意の取り直しが必要です（いまは送っていません）', tone: 'text-amber-700' };
    if (siteRows.length === 0) return { text: '', tone: '' };
    const slots = mediaSiteSlots(site).length > 1 ? siteRows.map((r) => `枠${r.slot}`).join('・') + ' ／ ' : '';
    if (st === 'disabled') return { text: `${slots}一時停止中`, tone: 'text-slate-500' };
    return { text: `${slots}連携中`, tone: 'text-[#212121]' };
  };

  const row = edit ? rowAt(edit.provider, slot) : null;
  const needConsent = !row || row.needsConsent;

  const TABS: Array<[Tab, string]> = [['all', '対応サイト一覧'], ['registered', '登録済'], ['unregistered', '未登録']];

  return (
    <div className="text-[14px] text-[#212121]">
      {/* ── タブ（ベンリーと同じ3枚）── */}
      <div className="flex gap-1 pl-0">
        {TABS.map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            aria-pressed={tab === k}
            className={`h-10 px-6 text-[12px] ${tab === k ? 'bg-white font-bold border-t-2 border-t-[#1e88e5]' : 'bg-black/[0.07] font-normal text-[#212121]'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200">
        <div className="flex items-center justify-end px-5 py-3 text-[14px]">{known ? `${total}件` : ''}</div>

        {loadError && (
          <p className="px-5 pb-3 text-[14px] text-rose-600">ID・PASSを読み込めませんでした：{loadError}</p>
        )}

        {/* ── 見出し ── */}
        <div className="grid grid-cols-[88px_1fr_auto] md:grid-cols-[88px_200px_1fr_220px] items-center px-2 h-9 border-b border-slate-200 text-[12px] font-bold text-black/50">
          <span />
          <span>サイト名</span>
          <span className="hidden md:block">ステータス</span>
          <span className="text-right md:text-left">メモ</span>
        </div>

        {loading && <p className="px-5 py-4 text-slate-400">読み込み中…</p>}

        <ul>
          {showFukues && !loading && (
            <li className="grid grid-cols-[88px_1fr_auto] md:grid-cols-[88px_200px_1fr_220px] items-center px-2 min-h-12 py-2 border-b border-slate-100">
              <span className="text-[12px] text-slate-400 pl-2">—</span>
              <span>フクエス</span>
              <span className="hidden md:flex flex-wrap gap-1"><Chip>出勤</Chip><Chip>セラピスト</Chip><Chip>写メ日記</Chip><Chip>今すぐ</Chip><Chip>お知らせ</Chip></span>
              <span className={`text-[12px] ${GREEN} text-right md:text-left`}>枠1 ／ 連携中</span>
            </li>
          )}
          {!loading && shown.map((site) => {
            const reg = isRegistered(site);
            const canReg = canRegisterSite(site);
            const memo = memoOf(site);
            return (
              <li key={site.provider} className="grid grid-cols-[88px_1fr_auto] md:grid-cols-[88px_200px_1fr_220px] items-center px-2 min-h-12 py-2 border-b border-slate-100 hover:bg-black/[0.03]">
                <span className="pl-2">
                  {reg ? (
                    <button type="button" onClick={() => openEdit(site)} className={`text-[12px] ${BLUE} hover:underline`}>
                      編集
                    </button>
                  ) : canReg ? (
                    <button type="button" onClick={() => openEdit(site)} className={`inline-flex items-center gap-1 text-[12px] ${GREEN} underline underline-offset-2`}>
                      <span className="text-[16px] leading-none">＋</span>登録
                    </button>
                  ) : null}
                </span>
                <span>{site.name}</span>
                <span className="hidden md:flex flex-wrap gap-1">
                  {sendableCapabilities(site).map((c) => <Chip key={c}>{capabilityLabel(c)}</Chip>)}
                </span>
                <span className={`text-[12px] ${memo.tone} text-right md:text-left`}>
                  {memo.text}
                  {site.accepting === false && site.notYetKind === 'blocked' && (
                    <>　<Link href={href('/diary')} className={`${BLUE} underline`}>設定</Link></>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
        {/* ★ 第751便（カッキーさん）: フクエスが ID・PASS なしで連携する理由を、表の下に1行 */}
        <p className="px-4 py-3 text-[12.5px] text-slate-500">※フクエスはID・PASS不要で連携します。（コネックエフの利用条件）</p>
      </div>

      {/* ── ID・PASS設定の窓（ベンリーと同じ 600px）── */}
      {edit && (
        <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" role="dialog" aria-modal="true" onClick={close}>
          <div className="w-full max-w-[600px] max-h-[90vh] overflow-y-auto bg-[#fefdfd] rounded-[9px] shadow-xl" onClick={(e) => e.stopPropagation()}>
            {/* 見出し */}
            <div className="flex items-start gap-3 px-6 pt-5 pb-3 border-b border-slate-200">
              <div className="flex-1 min-w-0">
                <p className="text-[14px]">ID・PASS設定</p>
                <p className="text-[12px] mt-0.5">{edit.name}</p>
              </div>
              {row && (
                ask === 'delete' ? (
                  <button type="button" onClick={() => void onDelete()} disabled={busy !== ''} className="h-8 px-3 rounded bg-rose-600 text-white text-[12px] disabled:opacity-40">
                    {busy === 'del' ? '解除しています…' : '本当に解除する'}
                  </button>
                ) : (
                  <button type="button" onClick={() => setAsk('delete')} className="h-8 px-3 rounded border border-rose-200 text-rose-600 text-[12px]">
                    登録解除
                  </button>
                )
              )}
              <button type="button" onClick={close} aria-label="閉じる" className="text-slate-500 text-[20px] leading-none px-1">×</button>
            </div>

            <div className="px-6 py-4 space-y-5">
              {/* STEP1 */}
              <section className="space-y-3">
                <p className="flex items-center gap-2">
                  <span className="inline-flex items-center h-6 px-2 bg-black text-white text-[12px]">STEP1</span>
                  <span>ログイン情報を設定</span>
                </p>

                {mediaSiteSlots(edit).length > 1 && (
                  <div className="flex items-center gap-3">
                    <span className="w-[120px] flex-none">掲載枠</span>
                    <div className="flex gap-1 flex-wrap">
                      {mediaSiteSlots(edit).map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => focusSlot(edit, n)}
                          aria-pressed={slot === n}
                          className={`h-8 px-3 rounded text-[12px] border ${slot === n ? 'border-[#1e88e5] bg-[#e5f1fc] text-[#1e88e5]' : 'border-slate-200 bg-white text-slate-500'}`}
                        >
                          枠{n}{rowAt(edit.provider, n) ? '（登録済み）' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {edit.needsShopId && (
                  <label className="flex items-center gap-3">
                    <span className="w-[120px] flex-none">{edit.idLabel}</span>
                    <input value={shopId} onChange={(e) => setShopId(e.target.value)} inputMode="numeric"
                      className="flex-1 min-w-0 h-[30px] px-2 border border-slate-300 rounded text-[14px] focus:outline-none focus:border-[#1e88e5]" />
                  </label>
                )}
                <label className="flex items-center gap-3">
                  <span className="w-[120px] flex-none">{loginIdLabelOf(edit) === 'ログインID' ? 'ID' : loginIdLabelOf(edit)}</span>
                  <input value={loginId} onChange={(e) => setLoginId(e.target.value)} autoComplete="off"
                    className="flex-1 min-w-0 h-[30px] px-2 border border-slate-300 rounded text-[14px] focus:outline-none focus:border-[#1e88e5]" />
                </label>
                <label className="flex items-center gap-3">
                  <span className="w-[120px] flex-none">PASS</span>
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password"
                    placeholder={row?.hasPassword ? `${row.passwordMask}（変更するときだけ入力）` : ''}
                    className="flex-1 min-w-0 h-[30px] px-2 border border-slate-300 rounded text-[14px] focus:outline-none focus:border-[#1e88e5]" />
                </label>

                {row && (
                  <div className="pl-[132px] space-y-1.5 text-[12px]">
                    <p className="text-slate-500">
                      最終確認 {fmtDay(row.lastVerifiedAt)}
                      {!row.isEnabled && <span className="ml-2 text-amber-700">一時停止中</span>}
                      {row.lastError && <span className="ml-2 text-rose-600">直近のエラー：{row.lastError}</span>}
                    </p>
                    <p className="flex flex-wrap gap-x-4 gap-y-1">
                      <button type="button" onClick={() => void onTest()} disabled={!row.hasPassword || !row.isEnabled || busy !== ''} className={`${BLUE} hover:underline disabled:opacity-40`}>
                        {busy === 'test' ? '送信中…' : '接続テスト'}
                      </button>
                      <button type="button" onClick={() => setAsk(row.isEnabled ? 'pause' : 'resume')} disabled={busy !== ''} className={`${BLUE} hover:underline disabled:opacity-40`}>
                        {credentialPauseLabel(row.isEnabled)}
                      </button>
                    </p>
                    {(ask === 'pause' || ask === 'resume') && (
                      <div className="border border-slate-200 bg-white p-3 space-y-2">
                        <p className="text-[13px] font-bold">{credentialPauseAskText(ask, edit.name, canReadProvider(edit.provider)).title}</p>
                        <p className="text-slate-500 leading-relaxed">{credentialPauseAskText(ask, edit.name, canReadProvider(edit.provider)).body}</p>
                        <div className="flex justify-end gap-2">
                          <button type="button" onClick={() => setAsk('')} className="h-8 px-3 rounded bg-black/[0.07]">やめる</button>
                          <button type="button" onClick={() => void onPause(ask === 'resume')} disabled={busy !== ''} className="h-8 px-3 rounded bg-[#1558d6] text-white disabled:opacity-40">
                            {credentialPauseLabel(ask === 'pause')}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </section>

              {/* STEP2 */}
              <section className="space-y-3">
                <p className="flex items-center gap-2">
                  <span className="inline-flex items-center h-6 px-2 bg-black text-white text-[12px]">STEP2</span>
                  <span>お預かりする情報の取り扱い</span>
                </p>
                <details open={needConsent} className="border border-slate-200 bg-white">
                  <summary className="cursor-pointer list-none px-3 py-2 text-[12px] font-bold text-black/50">
                    {needConsent ? '内容をお読みください' : '同意済み（読み返す）'}
                  </summary>
                  <ol className="px-3 pb-3 space-y-2 max-h-[220px] overflow-y-auto">
                    {MEDIA_CONSENT_SECTIONS.map((s, i) => (
                      <li key={s.heading}>
                        <p className="text-[13px] font-bold">{i + 1}. {s.heading}</p>
                        <p className="text-[12px] text-slate-600 leading-relaxed mt-0.5">{s.body}</p>
                      </li>
                    ))}
                  </ol>
                </details>
                {needConsent && (
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-1 accent-[#218925]" />
                    <span className="text-[13px] leading-relaxed">{MEDIA_CONSENT_AGREE_LABEL}</span>
                  </label>
                )}
              </section>
            </div>

            {/* 下のボタン（ベンリーと同じ：キャンセル＝灰／保存＝緑）*/}
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
              <button type="button" onClick={close} className="h-8 min-w-[77px] px-4 rounded bg-black/[0.07] text-[12px]">キャンセル</button>
              <button
                type="button"
                onClick={() => void onSave()}
                disabled={saving || (needConsent && !agreed)}
                className="h-8 min-w-[80px] px-4 rounded bg-[#218925] text-white text-[12px] disabled:opacity-40"
              >
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
