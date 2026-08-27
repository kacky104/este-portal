'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  MEDIA_CONSENT_SECTIONS,
  MEDIA_CONSENT_AGREE_LABEL,
  MEDIA_CONSENT_VERSION,
} from '@/lib/mediaConsent';
import {
  getMediaCredentials,
  saveMediaCredential,
  setMediaCredentialEnabled,
  deleteMediaCredential,
  getMediaAuditRows,
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

  const [slot, setSlot] = useState(1);
  const [shopId, setShopId] = useState('');
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [openConsent, setOpenConsent] = useState(true);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null);

  const current = rows.find((r) => r.provider === PROVIDER && r.slot === slot) ?? null;
  // ★ すでにいまの版で同意済みの枠は、毎回チェックを求めない
  const consentRequired = !current || current.needsConsent;

  const load = useCallback(async () => {
    if (!salonId) return;
    setLoading(true);
    const [c, a] = await Promise.all([
      getMediaCredentials({ salonId }),
      getMediaAuditRows({ salonId, limit: 30 }),
    ]);
    if (c.ok) setRows(c.data.rows);
    else onToast(c.error);
    if (a.ok) setAudit(a.data);
    setLoading(false);
  }, [salonId, onToast]);

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

  const onToggle = async (r: CredRow) => {
    if (!salonId) return;
    const res = await setMediaCredentialEnabled({
      salonId, provider: r.provider, slot: r.slot, enabled: !r.isEnabled,
    });
    if (!res.ok) { onToast(res.error); return; }
    onToast(r.isEnabled ? '連携を停止しました' : '連携を再開しました');
    await load();
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
            {r.lastError && (
              <p className="text-[11px] text-rose-500">直近のエラー：{r.lastError}</p>
            )}
          </div>
        ))}
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
