'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';

// /admin「店舗管理」タブの「掲載お問い合わせ」一覧（listing_inquiries）。
// /listing の公開フォームから送られた掲載希望を、オーナー問い合わせと同じ作法で管理する
// （未対応を先頭・未対応⇔対応済みトグル・削除）。RLS: 管理者のみ全操作可。
type ListingInquiry = {
  id: string;
  shop_name: string;
  area: string;
  contact_name: string;
  email: string;
  phone: string | null;
  website: string | null;
  message: string | null;
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

export default function ListingInquiryManager({ onToast }: { onToast: (msg: string) => void }) {
  const supabase = createClient();
  const [inquiries, setInquiries] = useState<ListingInquiry[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const fetchList = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('listing_inquiries')
      .select('id, shop_name, area, contact_name, email, phone, website, message, status, created_at')
      .order('created_at', { ascending: false });
    if (error) {
      setErrorMsg('listing_inquiries テーブルの読み込みに失敗しました。マイグレーションを適用したか確認してください。');
      setLoading(false);
      return;
    }
    setErrorMsg('');
    setInquiries((data ?? []) as ListingInquiry[]);
    setLoading(false);
  }, [supabase]);

  useEffect(() => { fetchList(); }, [fetchList]);

  const toggleStatus = async (q: ListingInquiry) => {
    const next = q.status === 'open' ? 'done' : 'open';
    setBusyId(q.id);
    const { error } = await supabase.from('listing_inquiries').update({ status: next }).eq('id', q.id);
    setBusyId(null);
    if (error) { onToast(`更新に失敗しました: ${error.message}`); return; }
    setInquiries(prev => prev.map(x => (x.id === q.id ? { ...x, status: next } : x)));
  };

  const deleteInquiry = async (q: ListingInquiry) => {
    if (!window.confirm(`「${q.shop_name}」のお問い合わせを削除しますか？\nこの操作は取り消せません。`)) return;
    setBusyId(q.id);
    const { data: deleted, error } = await supabase.from('listing_inquiries').delete().eq('id', q.id).select('id');
    setBusyId(null);
    if (error || !deleted || deleted.length === 0) {
      onToast(error ? `削除に失敗しました: ${error.message}` : '削除できませんでした（権限エラーの可能性があります）');
      return;
    }
    setInquiries(prev => prev.filter(x => x.id !== q.id));
    onToast('お問い合わせを削除しました');
  };

  const openCount = inquiries.filter(q => q.status === 'open').length;
  // 未対応を先頭に（同状態内は新着順のまま＝取得順を保持する安定ソート）。
  const sorted = [...inquiries].sort((a, b) => (a.status === b.status ? 0 : a.status === 'open' ? -1 : 1));

  return (
    <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-6">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <p className="text-[11px] text-slate-400 leading-relaxed">
          /listing（掲載について）のフォームから送られた掲載希望の一覧です。対応したら「対応済み」に切り替えてください。
        </p>
        {openCount > 0 && (
          <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-pink-500 text-white text-[10px] font-black leading-none">
            未対応{openCount}件
          </span>
        )}
      </div>

      {loading ? (
        <p className="text-xs text-slate-400 text-center py-6">読み込み中...</p>
      ) : errorMsg ? (
        <div className="rounded-xl bg-rose-50 border border-rose-100 px-4 py-3 text-xs text-rose-500 leading-relaxed">⚠ {errorMsg}</div>
      ) : sorted.length === 0 ? (
        <div className="rounded-2xl border border-slate-100 bg-slate-50/50 p-8 text-center text-xs text-slate-400">
          掲載のお問い合わせはまだありません。
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
                <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-pink-50 text-pink-600 border border-pink-200">{q.area}</span>
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                担当: {q.contact_name}／メール: <a href={`mailto:${q.email}`} className="text-pink-600 hover:underline">{q.email}</a>
                {q.phone && <>／電話: {q.phone}</>}
              </p>
              {q.website && (
                <p className="text-[11px] text-slate-500 mt-0.5 break-all">
                  HP: <a href={q.website.startsWith('http') ? q.website : `https://${q.website}`} target="_blank" rel="noopener noreferrer" className="text-pink-600 hover:underline">{q.website}</a>
                </p>
              )}
              {q.message && (
                <p className="text-[11px] text-slate-500 whitespace-pre-wrap break-words mt-1">{q.message}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
