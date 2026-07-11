'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// 新規店舗の初回情報入力フォーム（salon_intakes）の発行・管理。
// authenticated クライアント直（RLSで admin UUID のみ許可）。
// 「発行」でトークン付きワンタイムURLを作成し、コピーしてメール/LINEで店舗へ送る。
// 店舗が送信すると status='submitted'（入力済み）になり、内容を展開表示できる。
// サロンページ作成が済んだら「対応済み」にする。期限切れ・不要になった行は削除（写真も掃除）。
const EXPIRE_DAYS = 14;
const PHOTO_BUCKET = 'salon-intake-photos';

type Intake = {
  id: string;
  token: string;
  label: string | null;
  status: 'pending' | 'submitted' | 'done';
  expires_at: string;
  salon_name: string | null;
  area: string | null;
  area2: string | null;
  dispatch: string | null; // 出張の有無（'あり' / 'なし'）
  address: string | null;
  access: string | null;
  phone: string | null;
  hours: string | null;
  closed_days: string | null;
  price_courses: string | null;
  description: string | null;
  payment_methods: string | null;
  official_url: string | null;
  contact_name: string | null;
  contact_email: string | null;
  note: string | null;
  photo_urls: string[];
  created_at: string;
  submitted_at: string | null;
};

const COLS =
  'id, token, label, status, expires_at, salon_name, area, area2, dispatch, address, access, phone, hours, closed_days, price_courses, description, payment_methods, official_url, contact_name, contact_email, note, photo_urls, created_at, submitted_at';

// 推測不能な48桁hexトークン（ブラウザの CSPRNG）。
function generateToken(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function storagePathFromUrl(url: string): string | null {
  const marker = `/${PHOTO_BUCKET}/`;
  const i = url.indexOf(marker);
  return i === -1 ? null : url.slice(i + marker.length);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// 入力済み内容の1行（ラベル＋値）。値が空の項目は出さない。
function Row({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex gap-2 text-xs">
      <span className="flex-shrink-0 w-24 font-bold text-slate-400">{label}</span>
      <span className="text-slate-700 whitespace-pre-wrap break-all">{value}</span>
    </div>
  );
}

export default function SalonIntakeManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [items, setItems] = useState<Intake[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [label, setLabel] = useState('');
  const [openId, setOpenId] = useState<string | null>(null); // 内容展開中の行

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('salon_intakes')
      .select(COLS)
      .order('created_at', { ascending: false })
      .limit(100);
    if (error) {
      setErrorMsg('salon_intakes テーブルの読み込みに失敗しました。マイグレーションを確認してください。');
      setLoading(false);
      return;
    }
    setErrorMsg('');
    setItems((data ?? []) as Intake[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const intakeUrl = (token: string) => `${window.location.origin}/salon-intake/${token}`;

  const copyUrl = async (token: string) => {
    try {
      await navigator.clipboard.writeText(intakeUrl(token));
      onToast('URLをコピーしました');
    } catch {
      onToast('コピーに失敗しました（URLを手動で選択してください）');
    }
  };

  // 発行：ラベル（店舗名メモ）→ トークン生成 → insert → URLをクリップボードへ。
  const handleIssue = async () => {
    const l = label.trim();
    if (!l) { onToast('店舗名（メモ）を入力してください'); return; }
    setBusy(true);
    const token = generateToken();
    const expiresAt = new Date(Date.now() + EXPIRE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('salon_intakes').insert({ token, label: l, expires_at: expiresAt });
    setBusy(false);
    if (error) {
      onToast(error.code === '42501'
        ? 'RLSにより発行が拒否されました。admin権限でログインしているか確認してください。'
        : `発行に失敗しました: ${error.message}`);
      return;
    }
    setLabel('');
    await fetchList();
    await copyUrl(token);
    onToast(`入力URLを発行しました（有効期限${EXPIRE_DAYS}日・コピー済み）`);
  };

  // 期限の再発行（トークンは変えず期限だけ延長。pending のみ）。
  const handleExtend = async (id: string) => {
    setBusy(true);
    const expiresAt = new Date(Date.now() + EXPIRE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { error } = await supabase.from('salon_intakes').update({ expires_at: expiresAt }).eq('id', id);
    setBusy(false);
    if (error) { onToast(`更新に失敗しました: ${error.message}`); return; }
    await fetchList();
    onToast(`有効期限を${EXPIRE_DAYS}日後まで延長しました`);
  };

  // 対応済み/入力済みの切り替え。
  const handleStatus = async (id: string, status: 'submitted' | 'done') => {
    setBusy(true);
    const { error } = await supabase.from('salon_intakes').update({ status }).eq('id', id);
    setBusy(false);
    if (error) { onToast(`更新に失敗しました: ${error.message}`); return; }
    setItems((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    onToast(status === 'done' ? '対応済みにしました' : '入力済みに戻しました');
  };

  // 削除：行削除 → 写真を掃除。
  const handleDelete = async (row: Intake) => {
    if (!window.confirm(`「${row.label ?? row.salon_name ?? 'この行'}」を削除しますか？\n入力内容・写真も消えます。この操作は取り消せません。`)) return;
    setBusy(true);
    const { data: deleted, error } = await supabase.from('salon_intakes').delete().eq('id', row.id).select('id');
    setBusy(false);
    if (error) { onToast(`削除に失敗しました: ${error.message}`); return; }
    if (!deleted || deleted.length === 0) { onToast('削除できませんでした（権限エラーの可能性があります）'); return; }
    const paths = (row.photo_urls ?? []).map(storagePathFromUrl).filter((p): p is string => !!p);
    if (paths.length > 0) {
      const { error: rmErr } = await supabase.storage.from(PHOTO_BUCKET).remove(paths);
      if (rmErr) console.error('[SalonIntake] 写真の削除に失敗:', paths, rmErr);
    }
    setItems((prev) => prev.filter((r) => r.id !== row.id));
    onToast('削除しました');
  };

  const inputClass = 'w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-pink-200';

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
        契約した新規店舗に、サロンページ作成用の情報を入力してもらうワンタイムURLを発行します（有効期限{EXPIRE_DAYS}日・送信は一度のみ）。
        発行したURLをコピーして、店舗様のメール・LINE等へ送ってください。送信されると「入力済み」になり内容を確認できます。
      </p>

      {/* 発行フォーム */}
      <div className="flex gap-2 mb-5">
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="店舗名（メモ）例: アロマサロン◯◯"
          className={`flex-1 min-w-0 ${inputClass}`}
        />
        <button
          type="button"
          onClick={handleIssue}
          disabled={busy}
          className="flex-shrink-0 px-5 py-2.5 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold text-xs shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity"
        >
          ＋ 入力URLを発行
        </button>
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          発行済みのURLはありません。
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => {
            const expired = r.status === 'pending' && new Date(r.expires_at).getTime() < Date.now();
            return (
              <div key={r.id} className="rounded-2xl border border-slate-100 bg-slate-50/40 p-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-700">{r.label ?? '（メモなし）'}</span>
                  {r.status === 'pending' && !expired && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-100">未入力</span>
                  )}
                  {expired && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-400 border border-slate-200">期限切れ</span>
                  )}
                  {r.status === 'submitted' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">入力済み</span>
                  )}
                  {r.status === 'done' && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100">対応済み</span>
                  )}
                  <span className="text-[10px] text-slate-400 ml-auto">
                    発行 {fmtDate(r.created_at)}
                    {r.status === 'pending' && ` ／ 期限 ${fmtDate(r.expires_at)}`}
                    {r.submitted_at && ` ／ 送信 ${fmtDate(r.submitted_at)}`}
                  </span>
                </div>

                <div className="flex items-center gap-2 flex-wrap mt-2">
                  {r.status === 'pending' && (
                    <>
                      <button onClick={() => copyUrl(r.token)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white shadow-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                        URLをコピー
                      </button>
                      {expired && (
                        <button onClick={() => handleExtend(r.id)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors">
                          期限を{EXPIRE_DAYS}日延長
                        </button>
                      )}
                    </>
                  )}
                  {(r.status === 'submitted' || r.status === 'done') && (
                    <>
                      <button onClick={() => setOpenId(openId === r.id ? null : r.id)} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors">
                        {openId === r.id ? '内容を閉じる' : '内容を見る'}
                      </button>
                      <button
                        onClick={() => handleStatus(r.id, r.status === 'done' ? 'submitted' : 'done')}
                        disabled={busy}
                        className={`text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                          r.status === 'done'
                            ? 'border border-slate-200 text-slate-500 hover:bg-slate-50'
                            : 'bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-sm hover:opacity-90'
                        }`}
                      >
                        {r.status === 'done' ? '入力済みに戻す' : '対応済みにする'}
                      </button>
                    </>
                  )}
                  <button onClick={() => handleDelete(r)} disabled={busy} className="text-[11px] font-bold px-3 py-1.5 rounded-lg border border-rose-200 text-rose-500 bg-rose-50 hover:bg-rose-100 disabled:opacity-50 transition-colors ml-auto">
                    削除
                  </button>
                </div>

                {/* 入力内容の展開表示 */}
                {openId === r.id && (r.status === 'submitted' || r.status === 'done') && (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-white p-4 space-y-1.5">
                    <Row label="店舗名" value={r.salon_name} />
                    <Row label="エリア" value={[r.area, r.area2].filter(Boolean).join(' ／ ') || null} />
                    <Row label="出張" value={r.dispatch} />
                    <Row label="住所" value={r.address} />
                    <Row label="アクセス" value={r.access} />
                    <Row label="電話番号" value={r.phone} />
                    <Row label="営業時間" value={r.hours} />
                    <Row label="定休日" value={r.closed_days} />
                    <Row label="料金・コース" value={r.price_courses} />
                    <Row label="紹介文" value={r.description} />
                    <Row label="支払い方法" value={r.payment_methods} />
                    <Row label="公式サイト" value={r.official_url} />
                    <Row label="担当者" value={r.contact_name} />
                    <Row label="連絡先" value={r.contact_email} />
                    <Row label="備考" value={r.note} />
                    {(r.photo_urls ?? []).length > 0 && (
                      <div className="pt-2">
                        <p className="text-xs font-bold text-slate-400 mb-1.5">写真（{r.photo_urls.length}枚・クリックで原寸）</p>
                        <div className="grid grid-cols-4 sm:grid-cols-6 gap-2">
                          {r.photo_urls.map((url) => (
                            <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-50 hover:opacity-90">
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img src={url} alt="店舗写真" className="w-full h-full object-cover" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
