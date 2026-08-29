'use client';

import { useCallback, useEffect, useState } from 'react';
import { isWriteDirection } from '@/lib/mediaLinkMode';
import { evidenceMessage, rosterHasFindings, type RosterResult } from '@/lib/mediaRoster';
import {
  MEDIA_CONSENT_SECTIONS,
  MEDIA_CONSENT_AGREE_LABEL,
  MEDIA_CONSENT_VERSION,
} from '@/lib/mediaConsent';
import {
  getMediaCredentials,
  getMediaAutoEligible,
  saveMediaCredential,
  setMediaCredentialEnabled,
  deleteMediaCredential,
  getMediaAuditRows,
  startMediaConnectionTest,
  startMediaWorkDryRun,
  getMediaWorkPlan,
  setMediaLinkMode,
  startMediaWorkPush,
  getMediaRoster,
  startMediaRosterRead,
  startMediaMailImport,
  type WorkPlanView,
} from '@/app/actions/mediaCredentials';

// mypage「媒体連携」タブ（第39便・第3弾の入口）。
//
// ★★★ この画面がしていることは【店舗のアカウントを預かること】。
//   第1弾（公開ページを読む）とは責任の重さが違うので、
//   ・説明を読まずに保存できない（チェック必須）
//   ・何をしたかが同じ画面で見える（履歴）
//   ・いつでも止められる（停止／削除）
//   の3つを1画面に置く。★ どれか1つでも別の場所にあると、店舗は見に行かない。
//
// ★ パスワードは保存後に二度と表示しない（●●●●）。
//   「確認のためにもう一度見たい」は起こるが、見せる口を作るとそこが漏れ口になる。
//   入れ直せば済むので、見せない側に倒す。

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
  /** 連携の向き（第45便）。null は取り込み設定の行がまだ無い枠 */
  linkMode: string | null;
};

/**
 * 連携の向きの見せ方（第45便・設計メモ §11-2）。
 * ★★ 3択は【1つの決定】。「出勤は書くけどプロフィールは読む」のような混ぜ方はできない。
 *   画面でもそう見えるように、1行で言い切る。
 * ★ 切り替えのボタンはまだ置かない（書き込みの経路ができてから・第46便）。
 *   いま切り替えられるようにすると、write にした瞬間【読み取りが止まり、書き込みもできない】
 *   という何も動かない状態を店舗が自分で作れてしまう。
 */
const LINK_MODE_LABEL: Record<string, { title: string; desc: string; tone: string }> = {
  read: {
    title: '駅ちかから取り込んでいます',
    desc: '出勤・プロフィール・即ヒメを駅ちかから読み取って、フクエスに反映しています。フクエスから駅ちかへは書き込みません。',
    tone: 'text-sky-600',
  },
  write: {
    title: 'フクエスから駅ちかへ反映します',
    desc: 'フクエスの内容を駅ちかへ書き込みます。この向きのあいだ、駅ちかからの取り込みは行いません。',
    tone: 'text-pink-600',
  },
  write_auto: {
    title: 'フクエスから駅ちかへ自動で反映しています',
    desc: 'フクエスの内容を、承認なしで駅ちかへ反映します。反映できない理由があるときは送らずに止め、この画面に出します。',
    tone: 'text-pink-600',
  },
  none: {
    title: '連携していません',
    desc: '読み取りも書き込みも行いません。',
    tone: 'text-slate-500',
  },
};

type AuditRow = {
  id: number;
  provider: string;
  slot: number;
  outcome: string;
  summary: string;
  createdAt: string;
};

const SLOTS = [1, 2, 3];
const PROVIDER = 'ekichika';

function fmt(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function MediaLinkPanel({
  salonId,
  active,
  onToast,
}: {
  salonId: number | null;
  active: boolean;
  onToast: (m: string) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<CredRow[]>([]);
  const [audit, setAudit] = useState<AuditRow[]>([]);
  /** 保存してある「反映内容」（試し打ちの結果）。★ まだ送っていない計画（第44便） */
  const [plan, setPlan] = useState<WorkPlanView | null>(null);

  const [slot, setSlot] = useState(1);
  const [shopId, setShopId] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [openConsent, setOpenConsent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);
  /** 接続テストを投げた枠。★ 押しっぱなしの二度押しを止めるだけ（結果は履歴に出る） */
  const [testing, setTesting] = useState<number | null>(null);
  /** 試し打ちを投げた枠（第43便）。★ こちらも結果は履歴に出る */
  const [planning, setPlanning] = useState<number | null>(null);
  /** 向きの切り替え中／反映の送信中（二度押し防止・第46便） */
  const [switching, setSwitching] = useState(false);
  const [pushing, setPushing] = useState(false);
  /** 反映ボタンの確認（1回目で確認・2回目で実行） */
  const [confirmPush, setConfirmPush] = useState(false);
  /** ★ 自動にできる枠（`provider#slot`）。1回目の承認が済んでいるものだけ入る（第48便） */
  const [autoEligible, setAutoEligible] = useState<Set<string>>(new Set());
  /**
   * ★ 名簿の突き合わせ（第49便）。取り込みの設定行がある枠だけが入る。
   *   ★ 配列に無い枠は「0人」ではなく「設定がまだ無い」。まとめないこと。
   */
  const [roster, setRoster] = useState<RosterResult[]>([]);
  /** ★ 名簿を読みに行った直後（二度押し防止）。結果は非同期で届く */
  const [readingRoster, setReadingRoster] = useState(false);
  /** ★ 投稿用アドレスの取り込み中（二度押し防止）。結果は「連携の記録」に出る */
  const [importingMail, setImportingMail] = useState(false);
  /** ★ 登録の確認（1回目で確認・2回目で実行）。★ 上書きするので一度止める */
  const [confirmMail, setConfirmMail] = useState(false);

  const current = rows.find((r) => r.provider === PROVIDER && r.slot === slot) ?? null;
  // ★ この枠の突き合わせ。★ 見つからない＝「0名」ではなく「取り込みの設定がまだ無い」
  const currentRoster = roster.find((x) => x.provider === PROVIDER && x.slot === slot) ?? null;
  // ★ すでにいまの版で同意済みの枠は、毎回チェックを求めない
  const consentRequired = !current || current.needsConsent;

  const load = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    const [c, a, p, e, ro] = await Promise.all([
      getMediaCredentials({ salonId }),
      getMediaAuditRows({ salonId, limit: 30 }),
      getMediaWorkPlan({ salonId, provider: PROVIDER, slot }),
      getMediaAutoEligible({ salonId }),
      getMediaRoster({ salonId }),
    ]);
    if (c.ok) setRows(c.data.rows);
    else onToast(c.error);
    // ★ 自動にできる枠（第48便）。★ 取れなかったらスイッチを出さないだけ（黙って空にする）
    setAutoEligible(new Set((e.ok ? e.data : []).filter((x) => x.eligible).map((x) => `${x.provider}#${x.slot}`)));
    if (a.ok) setAudit(a.data);
    // ★ 名簿は取れなかったら黙って空にする（節ごと出さない）。
    //   ここで「0名」と出すと、揃っているように見えてしまう（§1-5 の全国0人と同じ形）。
    setRoster(ro.ok ? ro.data : []);
    // ★ 反映内容は「無い」のが普通の状態（まだ一度も確認していない）。エラーだけ黙らない。
    if (p.ok) setPlan(p.data);
    else onToast(p.error);
    setLoading(false);
  }, [salonId, slot, onToast]);

  useEffect(() => {
    if (active) void load();
  }, [active, load]);

  // 枠を切り替えたら、その枠の登録内容をフォームに写す（パスワードは写さない）
  useEffect(() => {
    const r = rows.find((x) => x.provider === PROVIDER && x.slot === slot);
    setShopId(r?.shopId ?? '');
    setLoginId(r?.loginId ?? '');
    setPassword('');
    setAgreed(false);
    setConfirmDelete(null);
  }, [slot, rows]);

  const onSave = async () => {
    if (!salonId) return;
    setSaving(true);
    const res = await saveMediaCredential({
      salonId, provider: PROVIDER, slot,
      shopId, loginId, password,
      agreed: consentRequired ? agreed : true,
      consentVersion: MEDIA_CONSENT_VERSION,
    });
    setSaving(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast('保存しました');
    setPassword('');
    await load();
  };

  /**
   * ★★ 駅ちかの名簿を読みに行く（第50便）。★ 読むだけ。駅ちかへは1文字も書かない。
   *   ★ 結果は中継役が引き取ってから届くので、ここでは待たない。
   *     「押した」と「読めた」を混ぜないこと（第43便-b の教訓と同じ形）。
   */
  const onReadRoster = async () => {
    if (!salonId) return;
    setReadingRoster(true);
    const res = await startMediaRosterRead({ salonId, provider: PROVIDER, slot });
    setReadingRoster(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast('駅ちかの名簿を読みに行きました。数分後にこの画面を開き直してください');
  };

  /**
   * ★★ 駅ちかの投稿用メールアドレスを取り込む（第53便）。
   *   ★ 駅ちかへは1文字も書かない。書き換えるのはフクエス側の転送先。
   *   ★ apply=false が既定（試し打ち）。★ 登録は確認を1回挟む。
   */
  const onImportMail = async (apply: boolean) => {
    if (!salonId) return;
    setImportingMail(true);
    const res = await startMediaMailImport({ salonId, provider: PROVIDER, slot, apply });
    setImportingMail(false);
    setConfirmMail(false);
    if (!res.ok) { onToast(res.error); return; }
    onToast(
      apply
        ? '投稿先の登録を始めました。数分後に「連携の記録」でご確認ください'
        : '取り込む内容を確認しています。数分後に「連携の記録」でご確認ください',
    );
  };

  const onToggle = async (r: CredRow) => {
    if (!salonId) return;
    const res = await setMediaCredentialEnabled({
      salonId, provider: r.provider, slot: r.slot, enabled: !r.isEnabled,
    });
    if (!res.ok) { onToast(res.error); return; }
    onToast(r.isEnabled ? '連携を停止しました' : '連携を再開しました');
    await load();
  };

  /**
   * 接続テスト。★ 読むだけ（ログイン → 出勤ページを1回読む）。駅ちかを書き換えない。
   * ★★ 結果はその場では返らない。中継役が引き取ってから履歴に出る。
   *   「押した ＝ 終わった」と読めてしまう文言にしないこと。
   */
  const onTest = async (r: CredRow) => {
    if (!salonId) return;
    setTesting(r.slot);
    try {
      const res = await startMediaConnectionTest({ salonId, provider: r.provider, slot: r.slot });
      if (!res.ok) { onToast(res.error); return; }
      onToast('接続テストを受け付けました。数分後に下の「連携の記録」でご確認ください');
      await load();
    } finally {
      setTesting(null);
    }
  };

  /**
   * 試し打ち（第43便）。★ 読むだけ。駅ちかへは送らない。
   * ★★ 文言で「送った」と読めないようにすること。ここが崩れると
   *   「押したから反映された」と思われる＝いちばん危ない誤解になる。
   */
  const onDryRun = async (r: CredRow) => {
    if (!salonId) return;
    setPlanning(r.slot);
    try {
      const res = await startMediaWorkDryRun({ salonId, provider: r.provider, slot: r.slot });
      if (!res.ok) { onToast(res.error); return; }
      onToast('確認を受け付けました。数分後にこの画面を開き直すと、下に「駅ちかへ反映する内容」が出ます（まだ送っていません）');
      await load();
    } finally {
      setPlanning(null);
    }
  };

  /**
   * 連携の向きを変える（第46便）。★ 切り替えただけでは駅ちかへ何も送らない。
   * ★★ read へ戻すときは、フクエスの出勤が駅ちかの内容で上書きされることを先に伝える（§11-4）。
   */
  const onSwitchMode = async (r: CredRow, mode: 'read' | 'write' | 'write_auto') => {
    if (!salonId) return;
    if (mode === 'read') {
      if (!confirm('駅ちかから取り込む向きに戻します。\n\nフクエスの出勤は、次の取り込みで駅ちかの内容に置き換わります。よろしいですか？')) return;
    }
    // ★★ read → write は【送る前なら戻せる】軽い操作なので、重い門にはしない（重い門は承認側）。
    //   ★ ただし「取り込みが止まる」ことだけは、押す前に必ず目に入れる。
    //     押したまま放置されると出勤がどこからも更新されない（mediaLinkStall.ts の見張りが拾う側）。
    if (mode === 'write') {
      if (!confirm(
        'フクエスから駅ちかへ反映する向きに変えます。\n\n'
        + '・駅ちかからの取り込みが止まります（出勤・プロフィール・今すぐ）\n'
        + '・この操作では駅ちかへ何も送りません\n'
        + '・いつでも「駅ちかから取り込む」に戻せます\n\n'
        + '変えたあとは「反映内容を確認」→ 内容を見て承認、の順に進みます。よろしいですか？'
      )) return;
    }
    // ★★★ 自動にする＝【人が見ずに駅ちかを書き換える】に変える。ここは重い門でよい。
    //   ★ 切り替え（軽い）と違い、これは押した瞬間から効く性質のもの。
    if (mode === 'write_auto') {
      if (!confirm(
        '毎回の承認をやめて、自動で反映するように変えます。\n\n'
        + '・以降、フクエスの出勤が自動で駅ちかへ反映されます\n'
        + '・人が見ずに送るため、見張りは厳しくします。止まった回は送りません\n'
        + '・止まった内容は、この画面でご確認のうえ承認してください\n'
        + '・3回続けて送れなかったときは、自動をやめて「毎回ご承認」に戻します\n\n'
        + 'よろしいですか？'
      )) return;
    }
    setSwitching(true);
    try {
      const res = await setMediaLinkMode({ salonId, provider: r.provider, slot: r.slot, mode });
      if (!res.ok) { onToast(res.error); return; }
      onToast(
        mode === 'write_auto' ? '自動で反映するように変更しました'
        : mode === 'write' ? '「フクエスから駅ちかへ反映する」に変更しました。まず「反映内容を確認」を押してください'
        : '「駅ちかから取り込む」に戻しました');
      setConfirmPush(false);
      await load();
    } finally {
      setSwitching(false);
    }
  };

  /**
   * ★★★ 承認して実際に送る（第46便）。**ここが駅ちかを書き換える唯一の場所。**
   * ★ 送るのは「いま画面に出ている差分」ではなく、中継が読み直して作り直した差分。
   *   指紋が変わっていたら送らずに止まる。だから古い差分を送ることはない。
   */
  const onPush = async (r: CredRow) => {
    if (!salonId || !plan) return;
    setPushing(true);
    try {
      const res = await startMediaWorkPush({
        salonId, provider: r.provider, slot: r.slot, fingerprint: plan.fingerprint,
      });
      if (!res.ok) { onToast(res.error); return; }
      onToast('反映を受け付けました。数分後に下の「連携の記録」で結果をご確認ください');
      setConfirmPush(false);
      await load();
    } finally {
      setPushing(false);
    }
  };

  const onDelete = async (r: CredRow) => {
    if (!salonId) return;
    const res = await deleteMediaCredential({ salonId, provider: r.provider, slot: r.slot });
    if (!res.ok) { onToast(res.error); return; }
    onToast('削除しました');
    setConfirmDelete(null);
    await load();
  };

  if (!salonId) return null;

  return (
    <div className="space-y-4">

      {/* ── 何のための画面か ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-2">
        <h2 className="text-sm font-bold text-slate-700">駅ちかとの連携</h2>
        <p className="text-[11px] text-slate-500 leading-relaxed">
          フクエスに登録された出勤情報を、駅ちかの管理画面へ自動で書き込むための設定です。
          ご登録いただくと、フクエスで出勤を更新するだけで駅ちか側にも反映されます。
        </p>
        <p className="text-[11px] text-slate-400 leading-relaxed">
          ※ 掲載枠が複数ある場合は、枠ごとにログイン情報が異なります。枠ごとにご登録ください。
        </p>
      </div>

      {/* ── 同意文言 ──
          ★ 折りたたみにはするが、【既定で開いた状態】にする。
            閉じた状態が既定だと、読まずにチェックできてしまう。 */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <button
          type="button"
          onClick={() => setOpenConsent((v) => !v)}
          className="w-full flex items-center justify-between text-left"
        >
          <span className="text-sm font-bold text-slate-700">お預かりする情報の取り扱い</span>
          <span className="text-[11px] font-bold text-pink-500">{openConsent ? '閉じる' : '開く'}</span>
        </button>

        {openConsent && (
          <ol className="space-y-3 list-none">
            {MEDIA_CONSENT_SECTIONS.map((s, i) => (
              <li key={s.heading}>
                <p className="text-[12px] font-bold text-slate-600">
                  {i + 1}. {s.heading}
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{s.body}</p>
              </li>
            ))}
          </ol>
        )}

        {current && !current.needsConsent && (
          <p className="text-[11px] text-slate-400">
            枠{slot}：{fmt(current.consentAgreedAt)} に同意済み
          </p>
        )}
      </div>

      {/* ── 登録フォーム ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-700">ログイン情報の登録</h3>

        <div>
          <label className="text-[11px] font-bold text-slate-500">掲載枠</label>
          <div className="flex gap-1.5 mt-1">
            {SLOTS.map((n) => {
              const has = rows.some((r) => r.provider === PROVIDER && r.slot === n);
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setSlot(n)}
                  aria-pressed={slot === n}
                  className={`px-3 py-1.5 rounded-full border text-[11px] font-bold transition-colors ${
                    slot === n
                      ? 'bg-pink-50 text-pink-600 border-pink-300'
                      : 'bg-white text-slate-400 border-slate-200 hover:text-slate-600'
                  }`}
                >
                  枠{n}{has ? '（登録済み）' : ''}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-500">店舗ID（shopid）</label>
          <input
            value={shopId}
            onChange={(e) => setShopId(e.target.value)}
            inputMode="numeric"
            placeholder="例: 37168"
            className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
          {/* ★ 掲載ページのURLに出ている番号とは別。ここを取り違えるとログインできない（第38便 §5-2） */}
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            駅ちかのログイン画面で入力している「店舗ID」です。
            掲載ページのURLに出ている番号とは別の番号なのでご注意ください。
            分からない場合はお知らせください、こちらでお調べします。
          </p>
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-500">ログインID</label>
          <input
            value={loginId}
            onChange={(e) => setLoginId(e.target.value)}
            autoComplete="off"
            className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
        </div>

        <div>
          <label className="text-[11px] font-bold text-slate-500">パスワード</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            placeholder={current?.hasPassword ? current.passwordMask + '（変更するときだけ入力）' : ''}
            className="w-full mt-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-pink-200"
          />
          {current?.hasPassword && (
            <p className="text-[11px] text-slate-400 mt-1">
              登録済みです。空のまま保存すると、パスワードは変更されません。
            </p>
          )}
        </div>

        {/* ★ 同意のチェック。★ これが入るまで保存ボタンを押せない */}
        {consentRequired && (
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5 accent-pink-500"
            />
            <span className="text-[11px] text-slate-600 leading-relaxed">{MEDIA_CONSENT_AGREE_LABEL}</span>
          </label>
        )}

        <button
          type="button"
          onClick={onSave}
          disabled={saving || (consentRequired && !agreed)}
          className="w-full py-2.5 rounded-full bg-pink-500 text-white text-sm font-bold disabled:bg-slate-200 disabled:text-slate-400 transition-colors"
        >
          {saving ? '保存中…' : '保存する'}
        </button>
        {consentRequired && !agreed && (
          <p className="text-[11px] text-slate-400 text-center">
            上の説明をお読みのうえ、チェックを入れると保存できます
          </p>
        )}
      </div>

      {/* ── 登録済みの枠 ── */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-700">登録済みの連携</h3>
        {loading && <p className="text-[11px] text-slate-400">読み込み中…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-[11px] text-slate-400">まだ登録されていません。</p>
        )}
        {rows.map((r) => (
          <div key={`${r.provider}-${r.slot}`} className="rounded-2xl border border-slate-100 p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-[12px] font-bold text-slate-600">
                駅ちか（枠{r.slot}）
                <span className={`ml-2 text-[10px] font-bold ${r.isEnabled ? 'text-pink-500' : 'text-slate-400'}`}>
                  {r.isEnabled ? '連携中' : '停止中'}
                </span>
              </p>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => onTest(r)}
                  disabled={!r.hasPassword || !r.isEnabled || testing === r.slot}
                  className="px-3 py-1 rounded-full border border-pink-200 text-[11px] font-bold text-pink-500 hover:bg-pink-50 disabled:opacity-40"
                >
                  {testing === r.slot ? '送信中…' : '接続テスト'}
                </button>
                <button
                  type="button"
                  onClick={() => onDryRun(r)}
                  disabled={!r.hasPassword || !r.isEnabled || planning === r.slot}
                  className="px-3 py-1 rounded-full border border-pink-200 text-[11px] font-bold text-pink-500 hover:bg-pink-50 disabled:opacity-40"
                >
                  {planning === r.slot ? '確認中…' : '反映内容を確認'}
                </button>
                <button
                  type="button"
                  onClick={() => onToggle(r)}
                  className="px-3 py-1 rounded-full border border-slate-200 text-[11px] font-bold text-slate-500 hover:text-slate-700"
                >
                  {r.isEnabled ? '連携を停止' : '再開する'}
                </button>
                {confirmDelete === r.slot ? (
                  <button
                    type="button"
                    onClick={() => onDelete(r)}
                    className="px-3 py-1 rounded-full bg-rose-500 text-white text-[11px] font-bold"
                  >
                    本当に削除
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(r.slot)}
                    className="px-3 py-1 rounded-full border border-slate-200 text-[11px] font-bold text-slate-400 hover:text-rose-500"
                  >
                    削除
                  </button>
                )}
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              店舗ID {r.shopId} ／ ログインID {r.loginId} ／ パスワード {r.passwordMask || '未登録'}
            </p>
            <p className="text-[11px] text-slate-400">
              最後に接続を確認できた日時：{fmt(r.lastVerifiedAt)}
            </p>
            {/* ★ 連携の向き（第45便）。★★ 読みと書きは同時に立たない＝1行で言い切る。
                切り替えのボタンは書き込みができてから（第46便）。 */}
            {r.linkMode && LINK_MODE_LABEL[r.linkMode] && (
              <div className="rounded-xl bg-slate-50 px-3 py-2 space-y-0.5">
                <p className={`text-[12px] font-bold ${LINK_MODE_LABEL[r.linkMode].tone}`}>
                  いまの向き：{LINK_MODE_LABEL[r.linkMode].title}
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  {LINK_MODE_LABEL[r.linkMode].desc}
                </p>
                {/* ★ 切り替え。押しても駅ちかへは何も送らない（送るのは承認ボタンだけ）。 */}
                {/* ★ write_auto からは直接 read へ戻さない。まず自動をやめてもらう。
                      ★ 一度に2つ変えると「どちらのつもりで押したのか」が分からなくなる */}
                {(r.linkMode === 'read' || r.linkMode === 'write') && (
                  <button
                    type="button"
                    onClick={() => onSwitchMode(r, r.linkMode === 'read' ? 'write' : 'read')}
                    disabled={switching || !r.isEnabled}
                    className="mt-1 px-3 py-1 rounded-full border border-slate-300 text-[11px] font-bold text-slate-600 hover:bg-white disabled:opacity-40"
                  >
                    {r.linkMode === 'read'
                      ? 'フクエスから駅ちかへ反映する向きに変える'
                      : '駅ちかから取り込む向きに戻す'}
                  </button>
                )}
                {/* ★★★ 自動のスイッチ（第48便・設計メモ §54）。
                      ★ 1回目の承認が済むまで出さない。§32 と同じ作法で、
                        「立てられない状態を作ってから禁じる」をしない。 */}
                {r.linkMode === 'write' && autoEligible.has(`${r.provider}#${r.slot}`) && (
                  <button
                    type="button"
                    onClick={() => onSwitchMode(r, 'write_auto')}
                    disabled={switching || !r.isEnabled}
                    className="mt-1 ml-1 px-3 py-1 rounded-full border border-slate-300 text-[11px] font-bold text-slate-600 hover:bg-white disabled:opacity-40"
                  >
                    毎回の承認をやめて自動にする
                  </button>
                )}
                {r.linkMode === 'write_auto' && (
                  <button
                    type="button"
                    onClick={() => onSwitchMode(r, 'write')}
                    disabled={switching || !r.isEnabled}
                    className="mt-1 px-3 py-1 rounded-full border border-slate-300 text-[11px] font-bold text-slate-600 hover:bg-white disabled:opacity-40"
                  >
                    自動をやめて毎回ご承認に戻す
                  </button>
                )}
              </div>
            )}
            {r.lastError && (
              <p className="text-[11px] text-rose-500">直近のエラー：{r.lastError}</p>
            )}
            {/* ★ 「読むだけ」であることを、押す場所のそばに書く。
                別の場所に書くと、店舗は押す前に読まない */}
            <p className="text-[10px] text-slate-400">
              接続テストは駅ちかにログインして出勤ページを1回読むだけです。出勤内容は書き換えません。
              結果は少し経ってから下の記録に出ます。
            </p>
            {/* ★ 「反映内容を確認」も読むだけであることを、押す場所のそばに書く。
                ★★ 「確認」という言葉は「実行」と誤読されやすい。**送らない**と明記する */}
            <p className="text-[10px] text-slate-400">
              「反映内容を確認」は、フクエスの出勤を駅ちかへ反映したら何がどう変わるかを調べるだけです。
              <span className="text-pink-500 font-bold">駅ちかへは送りません。</span>
            </p>
          </div>
        ))}
      </div>

      {/* ── 反映内容（試し打ちの結果）──
          ★★★ この画面でいちばん誤解が起きやすい場所。**まだ送っていない**を繰り返し書く。
            「確認しました」と「反映しました」は別。前者しか起きていない。
          ★ 並びは【止めた理由 → 伝えること → 差分の表】。
            人が承認する前に見るべきものから先に出す（差分を先に出すと理由が読まれない）。 */}
      {plan && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-700">駅ちかへ反映する内容</h3>
            <span className="text-[11px] text-slate-400">{fmt(plan.createdAt)} に確認</span>
          </div>
          <p className="text-[11px] text-pink-500 font-bold">
            これは「反映したらこうなる」という内容です。駅ちかへはまだ送っていません。
          </p>

          {/* ★ 突き合わせ0人は「一致」ではない。ここを最初に出す（第43便-b） */}
          {plan.targets === 0 ? (
            <p className="text-[12px] text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
              駅ちかの出勤表と結びつく方が1人も見つかりませんでした。内容を比べられていません。
            </p>
          ) : (
            <p className="text-[12px] text-slate-500">
              {plan.targets}名を突き合わせ、フクエス側の出勤 {plan.activeShifts}件を確認しました。
            </p>
          )}

          {/* 止めた理由 */}
          {plan.blockers.length > 0 && (
            <ul className="space-y-1.5">
              {plan.blockers.map((b, i) => (
                <li key={`b-${i}`} className="text-[12px] text-rose-600 bg-rose-50 rounded-xl px-3 py-2">
                  {b.detail}
                </li>
              ))}
            </ul>
          )}

          {/* 送るが伝えること */}
          {plan.notes.length > 0 && (
            <ul className="space-y-1.5">
              {plan.notes.map((n, i) => (
                <li key={`n-${i}`} className="text-[12px] text-slate-500 bg-slate-50 rounded-xl px-3 py-2">
                  {n.detail}
                </li>
              ))}
            </ul>
          )}

          {/* 差分の表 */}
          {plan.changeCount === 0 ? (
            plan.targets > 0 && (
              <p className="text-[12px] text-slate-500">
                いまの駅ちかの内容と一致しています。変えるところはありません。
              </p>
            )
          ) : (
            <div className="space-y-2">
              <p className="text-[12px] font-bold text-slate-700">変わるところ（{plan.changeCount}件）</p>
              <div className="overflow-x-auto">
                <table className="w-full text-[12px]">
                  <thead>
                    <tr className="text-slate-400 text-left">
                      <th className="font-medium py-1 pr-3 whitespace-nowrap">セラピスト</th>
                      <th className="font-medium py-1 pr-3 whitespace-nowrap">日付</th>
                      <th className="font-medium py-1 pr-3 whitespace-nowrap">いまの駅ちか</th>
                      <th className="font-medium py-1 whitespace-nowrap">反映後</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.diff.map((d, i) => (
                      <tr key={`d-${i}`} className="border-t border-slate-100 align-top">
                        <td className="py-1.5 pr-3 text-slate-700 break-words">{d.name || d.girlId}</td>
                        <td className="py-1.5 pr-3 text-slate-500 whitespace-nowrap">
                          {plan.dateLabels[d.dayIndex] ?? `日${d.dayIndex}`}
                        </td>
                        <td className="py-1.5 pr-3 text-slate-400 whitespace-nowrap">{d.before}</td>
                        <td className="py-1.5 text-pink-600 font-bold whitespace-nowrap">{d.after}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* 日別の増減（総量の見張りを人にも見せる） */}
              {plan.dateLabels.length > 0 && (
                <div className="overflow-x-auto">
                  <table className="w-full text-[11px] text-slate-500">
                    <tbody>
                      <tr className="border-t border-slate-100">
                        <td className="py-1 pr-3 whitespace-nowrap text-slate-400">日付</td>
                        {plan.dateLabels.map((l) => (
                          <td key={l} className="py-1 px-2 whitespace-nowrap">{l}</td>
                        ))}
                      </tr>
                      <tr className="border-t border-slate-100">
                        <td className="py-1 pr-3 whitespace-nowrap text-slate-400">いま</td>
                        {plan.countsBefore.map((c, i) => (
                          <td key={`cb-${i}`} className="py-1 px-2 tabular-nums">{c}</td>
                        ))}
                      </tr>
                      <tr className="border-t border-slate-100">
                        <td className="py-1 pr-3 whitespace-nowrap text-slate-400">反映後</td>
                        {plan.countsAfter.map((c, i) => (
                          <td
                            key={`ca-${i}`}
                            className={`py-1 px-2 tabular-nums ${
                              c < (plan.countsBefore[i] ?? 0) ? 'text-rose-600 font-bold' : ''
                            }`}
                          >
                            {c}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ★★★ 承認して送る。**この画面で唯一、駅ちかを書き換えるボタン。**
              ★ 出すのは「向きが write」かつ「送れる状態」かつ「変えるところがある」ときだけ。
                §11-5「選ばなかった側を出さない」。read の店にこのボタンは出さない。 */}
          {/* ★ write_auto の枠でも承認ボタンは出す（第48便）。自動が止まった回を人が通せるように */}
          {plan.sendable && plan.changeCount > 0 && isWriteDirection(current?.linkMode) ? (
            <div className="pt-1 space-y-2">
              {!confirmPush ? (
                <button
                  type="button"
                  onClick={() => setConfirmPush(true)}
                  className="w-full px-4 py-2.5 rounded-xl text-sm font-bold text-white shadow-sm"
                  style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
                >
                  この内容で駅ちかへ反映する
                </button>
              ) : (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 space-y-2">
                  {/* ★★ 押す前に、取り消せないことを伝える。第38便 §17-12 */}
                  <p className="text-[12px] text-rose-700 leading-relaxed">
                    駅ちかの出勤を <span className="font-bold">{plan.changeCount}件</span> 変更します。
                    駅ちかに書き込むと、連携している他の媒体にもすぐ反映されるため、
                    <span className="font-bold">あとから「なかったこと」にはできません。</span>
                    上の表をもう一度ご確認ください。
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => current && onPush(current)}
                      disabled={pushing}
                      className="flex-1 px-4 py-2 rounded-xl text-sm font-bold text-white shadow-sm disabled:opacity-40"
                      style={{ background: 'linear-gradient(95deg,#FB923C,#DB2777)' }}
                    >
                      {pushing ? '送信中…' : 'この内容で反映する'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmPush(false)}
                      className="px-4 py-2 rounded-xl border border-slate-300 text-sm font-bold text-slate-600"
                    >
                      やめる
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-slate-400">
              {isWriteDirection(current?.linkMode)
                ? 'この内容は「反映内容を確認」を押すたびに新しくなります。'
                : '駅ちかへ反映するには、上で「フクエスから駅ちかへ反映する向き」に変えてください。'}
            </p>
          )}
        </div>
      )}

      {/* ── 写メ日記の投稿先（第53便・設計メモ 追記26）──
          ★★ 駅ちかが発行した投稿用メールアドレスを、こちらから読み取って登録する。
            ★ 手で登録させると40名の店で40回の入力になる（§2-2「操作回数がゼロになること」）。
          ★ 置き場所は将来 /mypage/media のセラピスト情報へ移す（カッキーさんの決定）。
            ★ その画面がまだ無いので、当面ここに置く。 */}
      {current && current.hasPassword && (
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
          <div className="flex items-baseline justify-between gap-2 flex-wrap">
            <h3 className="text-sm font-bold text-slate-700">写メ日記の投稿先</h3>
            <span className="text-[11px] text-slate-400">駅ちか（枠{slot}）</span>
          </div>
          <p className="text-[12px] text-slate-500 leading-relaxed">
            駅ちかがセラピストごとに発行している投稿用メールアドレスを読み取って、
            フクエスの転送先に登録します。駅ちかの内容は変更しません。
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onImportMail(false)}
              disabled={importingMail}
              className="px-3 py-1.5 rounded-full border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {importingMail ? '受付中…' : '取り込む内容を確認'}
            </button>
            {!confirmMail ? (
              <button
                type="button"
                onClick={() => setConfirmMail(true)}
                disabled={importingMail}
                className="px-3 py-1.5 rounded-full border border-pink-200 text-[12px] text-pink-600 hover:bg-pink-50 disabled:opacity-50"
              >
                取り込んで登録する
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => onImportMail(true)}
                  disabled={importingMail}
                  className="px-3 py-1.5 rounded-full bg-pink-500 text-white text-[12px] font-bold hover:bg-pink-600 disabled:opacity-50"
                >
                  登録します
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmMail(false)}
                  className="px-3 py-1.5 rounded-full border border-slate-200 text-[12px] text-slate-500 hover:bg-slate-50"
                >
                  やめる
                </button>
              </>
            )}
          </div>

          {/* ★ 上書きすることを隠さない。★ 押す前に読める場所に書く */}
          <p className="text-[11px] text-slate-400 leading-relaxed">
            登録すると、いま入っている投稿先は<strong className="text-slate-500">駅ちかの内容で上書き</strong>されます。
            駅ちか側でアドレスが再発行されたときに、古いまま送り続けないためです。
            結果の件数は下の「連携の記録」に出ます。
          </p>
        </div>
      )}

      {/* ── 名簿の突き合わせ（第49便・設計メモ §1-4 / §2-1の2 / §8）──
          ★★★ ここは【見るだけ】。直す機能はまだ無い。
            §4「新人登録を先にやらない。登録は人を増やす＝失敗すると重複掲載を自分で作る」。
            ズレを直す前に、まずズレが見えることを作る。ベンリーが 0人のまま8日放置されたのは
            機能が無かったからではなく、**誰の目にも入らなかったから**（§1-5）。

          ★★★ この節でいちばん大事なのは③の【分かりません】。
            「駅ちかにいてフクエスにいない人が0名」と「取り込んだ記録が無いので分からない」は
            画面上まったく同じ見た目になる。★ 0名と書かない。判定は mediaRoster.ts が持っている。 */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-3">
        <div className="flex items-baseline justify-between gap-2 flex-wrap">
          <h3 className="text-sm font-bold text-slate-700">名簿の突き合わせ</h3>
          <span className="text-[11px] text-slate-400">駅ちか（枠{slot}）</span>
        </div>

        {/* ★★ 名簿を読みに行く（第50便）。★ 読むだけ。向きが書き込みの枠でも押してよい
            （取り込みの周とは別に、明示的に1回読むものだから） */}
        {current && current.hasPassword && (
          <div className="flex items-center gap-3 flex-wrap">
            <button
              type="button"
              onClick={onReadRoster}
              disabled={readingRoster}
              className="px-3 py-1.5 rounded-full border border-slate-200 text-[12px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {readingRoster ? '受付中…' : '駅ちかの名簿を読む'}
            </button>
            <span className="text-[11px] text-slate-400">
              駅ちかの管理画面から在籍の一覧を読み取ります。書き換えはしません。
            </span>
          </div>
        )}

        {!currentRoster ? (
          <p className="text-[11px] text-slate-400">
            この枠には取り込みの設定がまだありません。設定が入ると、フクエスと駅ちかの在籍を突き合わせて出します。
          </p>
        ) : (
          <>
            {/* ★ 根拠。fresh のときだけ何も出ない（「異常なし」の行を作らない） */}
            {evidenceMessage(currentRoster.evidence, currentRoster.source) && (
              <p
                className={`text-[12px] rounded-xl px-3 py-2 ${
                  currentRoster.evidence.kind === 'error'
                    ? 'text-rose-600 bg-rose-50'
                    : 'text-amber-700 bg-amber-50'
                }`}
              >
                {evidenceMessage(currentRoster.evidence, currentRoster.source)}
              </p>
            )}

            {/* ★ 設計メモ §2-1の2「サイトごとの登録人数を並べて出す」。
                ★ 駅ちか側の人数は【名簿を読んだときだけ】出る。読んでいなければ出さない
                  （0名と書かないのと同じ理由で、知らない数字を書かない） */}
            <p className="text-[12px] text-slate-600">
              フクエス {currentRoster.total}名（公開中 {currentRoster.active}名）
              {currentRoster.mediaTotal !== null && (
                <>　／　駅ちか {currentRoster.mediaTotal}名</>
              )}
              　／　結びついている {currentRoster.linked}名
            </p>

            <ul className="space-y-2">
              <li>
                <p className={`text-[12px] font-bold ${currentRoster.unlinked.length > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                  駅ちかと結びついていない　{currentRoster.unlinked.length}名
                </p>
                {currentRoster.unlinked.length > 0 && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {currentRoster.unlinked.map((x) => x.name).join('、')}
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  駅ちかに登録が無いか、名前の書き方が違って結びついていない方です。
                </p>
              </li>

              <li>
                <p className={`text-[12px] font-bold ${currentRoster.linkedButHidden.length > 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                  駅ちかと結びついているが、フクエスに出ていない　{currentRoster.linkedButHidden.length}名
                </p>
                {currentRoster.linkedButHidden.length > 0 && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {currentRoster.linkedButHidden.map((x) => x.name).join('、')}
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  取り込みが自動で作った方は非公開で始まるため、公開にしない限りフクエスには出ません。
                  退店にされた方が駅ちか側に残っている場合も、ここに出ます。
                </p>
              </li>

              <li>
                {/* ★★★ 0名と書かない場所。根拠が無いときは「分かりません」 */}
                <p
                  className={`text-[12px] font-bold ${
                    !currentRoster.onlyOnMediaKnown
                      ? 'text-amber-700'
                      : currentRoster.onlyOnMedia.length > 0
                        ? 'text-rose-600'
                        : 'text-slate-500'
                  }`}
                >
                  駅ちかにいて、フクエスにいない　
                  {currentRoster.onlyOnMediaKnown ? `${currentRoster.onlyOnMedia.length}名` : 'いまは分かりません'}
                </p>
                {currentRoster.onlyOnMedia.length > 0 && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {currentRoster.onlyOnMedia.join('、')}
                  </p>
                )}
                {/* ★★ 同じ数字でも意味の強さが違う。どこから来た数字かを必ず添える */}
                <p className="text-[11px] text-slate-400">
                  {currentRoster.source === 'snapshot'
                    ? '駅ちかの管理画面から読み取った名簿と比べています。'
                    : currentRoster.source === 'run'
                      ? '駅ちかの公開ページからの取り込みと比べています。管理画面にいて公開ページに出ていない方は含まれません。'
                      : '比べる相手がまだありません。「駅ちかの名簿を読む」を押すと分かります。'}
                </p>
              </li>

              {/* ④ 第52便。★ 削除された方が見える唯一の場所であり、
                  一覧を取りこぼしたときも同じ形で現れる（設計メモ §87・§107）。
                  ★ どちらかを機械が決めつけない。人数を見て人が判断する。 */}
              <li>
                <p
                  className={`text-[12px] font-bold ${
                    !currentRoster.missingOnMediaKnown
                      ? 'text-amber-700'
                      : currentRoster.missingOnMedia.length > 0
                        ? 'text-rose-600'
                        : 'text-slate-500'
                  }`}
                >
                  駅ちかにもういない（フクエスは番号を控えている）　
                  {currentRoster.missingOnMediaKnown
                    ? `${currentRoster.missingOnMedia.length}名`
                    : 'いまは分かりません'}
                </p>
                {currentRoster.missingOnMedia.length > 0 && (
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    {currentRoster.missingOnMedia.map((x) => x.name).join('、')}
                  </p>
                )}
                <p className="text-[11px] text-slate-400">
                  駅ちか側で削除された方です。人数が多いときは、名簿を最後まで読み取れていない可能性もあります。
                  {currentRoster.mediaTotal !== null && currentRoster.mediaTotal < currentRoster.linked && (
                    <>　駅ちかの人数（{currentRoster.mediaTotal}名）が、結びついている人数（{currentRoster.linked}名）より少なくなっています。</>
                  )}
                </p>
              </li>
            </ul>

            {/* ★ 設計メモ §8。ここを書かないと「連携すれば人数も揃う」と読まれる */}
            <p className="text-[11px] text-slate-400 leading-relaxed">
              ※ 出勤やプロフィールが揃っても、登録人数は自動では揃いません。駅ちかから退店された方を消す操作は、
              フクエスからは行っていないためです。人数のズレが気になるときはご相談ください。
            </p>
          </>
        )}
      </div>

      {/* ── 履歴 ──
          ★ 免責より先に「記録が残る・止められる」を見せる（第37便 §12）。
            画面の並びもその順にしてある。 */}
      <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-5 space-y-2">
        <h3 className="text-sm font-bold text-slate-700">連携の記録</h3>
        <p className="text-[11px] text-slate-400">
          フクエスが駅ちかに対して行ったことの記録です。あとから書き換えられません。
        </p>
        {audit.length === 0 && <p className="text-[11px] text-slate-400">まだ記録はありません。</p>}
        <ul className="space-y-1.5">
          {audit.map((a) => (
            <li key={a.id} className="flex items-start gap-2">
              <span
                className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  a.outcome === 'ok' ? 'bg-pink-400' : 'bg-rose-500'
                }`}
                aria-hidden
              />
              <span className="text-[11px] text-slate-500 leading-relaxed">
                <span className="text-slate-400">{fmt(a.createdAt)}</span>　{a.summary}
              </span>
            </li>
          ))}
        </ul>
      </div>

    </div>
  );
}
