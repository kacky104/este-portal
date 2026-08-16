'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import { HP_TEMPLATES, HP_COLOR_VARIANTS, isHpTemplateKey } from '@/app/lib/hpSite';
import { hpListingStatusLabel } from '@/app/lib/hp/inquiryStatus';

// /admin「HP制作のお申し込み」一覧（hp_inquiries）。
// /hp/templates/contact の公開フォームから送られた申し込みを、掲載お問い合わせと同じ作法で管理する
// （未対応を先頭・未対応⇔対応済みトグル・削除）。RLS: 管理者のみ全操作可。
//
// ★ 表示名はキーから引き直す（hpListingStatusLabel / HP_COLOR_VARIANTS）。
//   保存しているのはキーだけなので、あとで表示名を変えても過去の申し込みが揃って直る。
//   逆に、使わなくなったキーが過去データに残っていても落ちないよう「(不明)」に落ちる。
type HpInquiry = {
  id: string;
  shop_name: string;
  contact_name: string;
  email: string;
  phone: string | null;
  listing_status: string;
  template_key: string | null;
  color_key: string | null;
  note: string | null;
  status: 'open' | 'done';
  created_at: string;
};

function formatDateTimeJST(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(d);
}

function designLabel(templateKey: string | null, colorKey: string | null): string {
  if (!templateKey) return '未選択';
  const tLabel = HP_TEMPLATES.find((t) => t.key === templateKey)?.label ?? templateKey;
  if (!colorKey) return `${tLabel}（カラー未選択）`;
  const cLabel = isHpTemplateKey(templateKey)
    ? HP_COLOR_VARIANTS[templateKey].find((v) => v.key === colorKey)?.label ?? colorKey
    : colorKey;
  return `${tLabel}／${cLabel}`;
}

export default function HpInquiryManager({
  onToast,
  onOpenCount,
}: {
  onToast: (msg: string) => void;
  /** 未対応件数を親（/admin）へ通知する。タブのチップとアコーディオン見出しのバッジに使う。 */
  onOpenCount?: (n: number) => void;
}) {
  const supabase = createClient();
  const [inquiries, setInquiries] = useState<HpInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('hp_inquiries')
      .select('id, shop_name, contact_name, email, phone, listing_status, template_key, color_key, note, status, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setErrorMsg('hp_inquiries テーブルの読み込みに失敗しました。マイグレーションを適用したか確認してください。');
      setLoading(false);
      return;
    }
    setErrorMsg('');
    setInquiries((data ?? []) as HpInquiry[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchList(); }, [fetchList]);

  // 未対応件数を親へ通知（読み込み・状態切替・削除のたびに inquiries から再計算）。
  // ★ このコンポーネントはアコーディオンが閉じていても、タブが非表示でもマウントされている
  //   （閉時は display:none にするだけで unmount しない作り）。
  //   だから /admin を開いた瞬間に件数が分かり、タブのチップにバッジが出る。
  //   ここを「開いたときだけ読む」に変えると、バッジが出なくなるので注意。
  useEffect(() => {
    onOpenCount?.(inquiries.filter((q) => q.status === 'open').length);
  }, [inquiries, onOpenCount]);

  const toggleStatus = async (q: HpInquiry) => {
    const next = q.status === 'open' ? 'done' : 'open';
    setBusyId(q.id);
    const { error } = await supabase.from('hp_inquiries').update({ status: next }).eq('id', q.id);
    setBusyId(null);
    if (error) { onToast(`更新に失敗しました: ${error.message}`); return; }
    setInquiries(prev => prev.map(x => (x.id === q.id ? { ...x, status: next } : x)));
  };

  const deleteInquiry = async (q: HpInquiry) => {
    if (!window.confirm(`「${q.shop_name}」のお申し込みを削除しますか？\nこの操作は取り消せません。`)) return;
    setBusyId(q.id);
    const { data: deleted, error } = await supabase.from('hp_inquiries').delete().eq('id', q.id).select('id');
    setBusyId(null);
    if (error || !deleted || deleted.length === 0) {
      onToast(error ? `削除に失敗しました: ${error.message}` : '削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    setInquiries(prev => prev.filter(x => x.id !== q.id));
    onToast('お申し込みを削除しました');
  };

  // 未対応を先頭に（同状態内は新着順のまま＝取得順を保持する安定ソート）。
  const sorted = [...inquiries].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      {/* ★ 未対応件数のバッジはここには出さない。アコーディオンの見出しと
          「公式HP」タブのチップに出しているので、中にも置くと同じ数字が3回並ぶ。 */}
      <p className="text-[11px] text-slate-400 leading-relaxed mb-4">
        /hp/templates/contact のフォームから送られたホームページ制作のお申し込み一覧です。対応したら「対応済み」に切り替えてください。
      </p>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          ホームページ制作のお申し込みはまだありません。
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map(q => (
            <div key={q.id} className={`rounded-xl border p-3 ${q.status === 'open' ? 'border-amber-200 bg-amber-50/40' : 'border-slate-100'}`}>
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <span className="text-[11px] text-slate-400">{formatDateTimeJST(q.created_at)}</span>
                {q.status === 'open' ? (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">未対応</span>
                ) : (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-200">対応済み</span>
                )}
                <button
                  onClick={() => toggleStatus(q)}
                  disabled={busyId === q.id}
                  className="ml-auto flex-shrink-0 text-[11px] font-bold text-slate-400 hover:text-pink-600 disabled:opacity-40 transition-colors"
                >
                  {busyId === q.id ? '更新中…' : q.status === 'open' ? '対応済みにする' : '未対応に戻す'}
                </button>
                <button
                  onClick={() => deleteInquiry(q)}
                  disabled={busyId === q.id}
                  className="flex-shrink-0 text-[11px] font-bold text-rose-400 hover:text-rose-500 disabled:opacity-40 transition-colors"
                >
                  削除
                </button>
              </div>
              <p className="text-xs font-bold text-slate-700">
                {q.shop_name}
                <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">
                  {hpListingStatusLabel(q.listing_status)}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                担当: {q.contact_name}／メール: <a href={`mailto:${q.email}`} className="text-pink-600 hover:underline">{q.email}</a>
                {q.phone && <>／電話: {q.phone}</>}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                希望デザイン: {designLabel(q.template_key, q.color_key)}
              </p>
              {q.note && (
                <p className="text-[11px] text-slate-500 whitespace-pre-wrap break-words mt-1">{q.note}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
