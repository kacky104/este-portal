'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';

const supabase = createClient();

// ── types ─────────────────────────────────────────────────────

type DiaryView = {
  id:            number;
  image:         string | null;   // 1枚目のサムネイル
  comment:       string | null;
  createdAt:     string;
  therapistId:   string;
  therapistName: string;
  salonName:     string;
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(d);
}

// 日付のみ（例「2026/06/18」）
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}

// diary_posts ＋ therapists（名前・サロン）を結合して取得
async function fetchDiaries(opts: { salonId?: string; limit?: number }): Promise<DiaryView[]> {
  let query = supabase
    .from('diary_posts')
    .select('id, images, content, created_at, therapists!inner(id, name, salon_id, salons(name))')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 30);

  if (opts.salonId) query = query.eq('therapists.salon_id', Number(opts.salonId));

  const { data } = await query;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: number; images: string[] | null; content: string | null; created_at: string;
      therapists: { id: number; name: string | null; salons: { name: string | null } | { name: string | null }[] | null }
                | { id: number; name: string | null; salons: { name: string | null } | { name: string | null }[] | null }[]
                | null;
    };
    const t = Array.isArray(r.therapists) ? r.therapists[0] : r.therapists;
    const s = t ? (Array.isArray(t.salons) ? t.salons[0] : t.salons) : null;
    const imgs = r.images ?? [];
    return {
      id:            r.id,
      image:         imgs[0] ?? null,
      comment:       r.content ?? null,
      createdAt:     r.created_at,
      therapistId:   String(t?.id ?? ''),
      therapistName: t?.name ?? '',
      salonName:     s?.name ?? '',
    };
  });
}

// ── Diary card（画像全面・テキストオーバーレイ。セラピストページへリンク） ──

// onSelect を渡すとクリックでモーダルを開く（リンク遷移しない）。未指定ならセラピストページへリンク。
function DiaryCard({ diary, emphasized = false, onSelect }: { diary: DiaryView; emphasized?: boolean; onSelect?: () => void }) {
  // emphasized（サロンページ用）：日付・題名を2倍、オーバーレイを半分の濃さに
  const overlayCls = emphasized
    ? 'bg-gradient-to-b from-black/32 via-black/5 to-black/35'
    : 'bg-gradient-to-b from-black/65 via-black/10 to-black/70';

  const cardCls =
    'relative text-left group flex-shrink-0 w-52 h-72 rounded-2xl overflow-hidden shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-pink-300 to-rose-400';

  const inner = (
    <>
      {diary.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={diary.image}
          alt={diary.therapistName}
          className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-white/70 text-3xl font-bold">
          {diary.therapistName.charAt(0)}
        </div>
      )}

      <div className={`absolute inset-0 ${overlayCls}`} />

      {/* Top: date + comment */}
      <div className="absolute top-0 left-0 right-0 p-3">
        <p className="text-white/70 mb-1" style={{ fontSize: emphasized ? '18px' : '9px' }}>
          {emphasized ? `${formatDate(diary.createdAt)} 更新` : formatDateTime(diary.createdAt)}
        </p>
        {diary.comment && (
          <p
            className="text-white/90 leading-relaxed line-clamp-3"
            style={{ fontSize: emphasized ? '20px' : '10px' }}
          >
            {diary.comment}
          </p>
        )}
      </div>

      {/* Bottom: therapist + salon */}
      <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold text-white drop-shadow">{diary.therapistName}</p>
          {diary.salonName && <p className="text-[10px] text-white/60 truncate">📍 {diary.salonName}</p>}
        </div>
        <span className="flex-shrink-0 text-[10px] text-pink-300 font-bold ml-2">
          {onSelect ? '日記を見る' : '日記を見る →'}
        </span>
      </div>
    </>
  );

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={cardCls}>
        {inner}
      </button>
    );
  }
  return (
    <Link href={`/therapist/${diary.therapistId}`} className={cardCls}>
      {inner}
    </Link>
  );
}

// 写メ日記モーダル（日付 → 画像 → コメント全文）
function DiaryModal({ diary, onClose }: { diary: DiaryView; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.8)' }}
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl overflow-hidden max-w-md w-full max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="閉じる"
          className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70"
        >
          ✕
        </button>
        <div className="p-4 overflow-y-auto space-y-3">
          {/* 日付 */}
          <p style={{ fontSize: '13px', color: '#999' }}>📅 {formatDate(diary.createdAt)} 更新</p>
          {/* 画像（大きく表示） */}
          {diary.image && (
            <div className="bg-slate-100 rounded-xl overflow-hidden flex items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={diary.image} alt={diary.therapistName} className="w-full max-h-[55vh] object-contain" />
            </div>
          )}
          {/* コメント全文 */}
          {diary.comment && (
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap break-all">
              {diary.comment}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ── DiarySection（トップページ：全サロンの最新投稿） ───────────

export function DiarySection() {
  const [list, setList] = useState<DiaryView[] | null>(null);

  useEffect(() => {
    fetchDiaries({ limit: 30 }).then(setList);
  }, []);

  if (list && list.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">
        只今、写メ日記は準備中です ✿
      </div>
    );
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
      {(list ?? []).map((diary) => (
        <DiaryCard key={diary.id} diary={diary} />
      ))}
    </div>
  );
}

// ── SalonDiarySection（サロン詳細ページ：そのサロンの投稿） ────

export function SalonDiarySection({ salonId }: { salonId: string }) {
  const [list, setList] = useState<DiaryView[] | null>(null);
  const [selected, setSelected] = useState<DiaryView | null>(null);

  useEffect(() => {
    fetchDiaries({ salonId, limit: 30 }).then(setList);
  }, [salonId]);

  if (list && list.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">
        只今、こちらのサロンの写メ日記は準備中です ✿
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-hidden">
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-pink w-full">
        {(list ?? []).map((diary) => (
          <DiaryCard key={diary.id} diary={diary} emphasized onSelect={() => setSelected(diary)} />
        ))}
      </div>
      {selected && <DiaryModal diary={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}
