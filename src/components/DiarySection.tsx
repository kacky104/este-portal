'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { formatDiaryDate } from '@/lib/diaryDate';
import { DiaryNewBadge } from '@/components/DiaryNewBadge';

const supabase = createClient();

// ── types ─────────────────────────────────────────────────────

type DiaryView = {
  id:            number;
  image:         string | null;   // 1枚目のサムネイル
  title:         string | null;
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

// diary_posts ＋ therapists（名前・サロン）を結合して取得
async function fetchDiaries(opts: { salonId?: string; limit?: number }): Promise<DiaryView[]> {
  let query = supabase
    .from('diary_posts')
    .select('id, images, title, created_at, therapists!inner(id, name, salon_id, salons(name))')
    .order('created_at', { ascending: false })
    .limit(opts.limit ?? 30);

  if (opts.salonId) query = query.eq('therapists.salon_id', Number(opts.salonId));

  const { data } = await query;

  return (data ?? []).map((row) => {
    const r = row as unknown as {
      id: number; images: string[] | null; title: string | null; created_at: string;
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
      title:         r.title ?? null,
      createdAt:     r.created_at,
      therapistId:   String(t?.id ?? ''),
      therapistName: t?.name ?? '',
      salonName:     s?.name ?? '',
    };
  });
}

// ── Diary card（画像全面・テキストオーバーレイ。セラピストページへリンク） ──

// 写メ日記カード（クリックで /diary/[id] へ遷移）
function DiaryCard({ diary, emphasized = false }: { diary: DiaryView; emphasized?: boolean }) {
  // emphasized（サロンページ用）：オーバーレイを薄く。
  // カードはスマホで2枚半・PCで3枚半見えるよう小さめサイズに。
  const overlayCls = emphasized
    ? 'bg-gradient-to-b from-black/32 via-black/5 to-black/35'
    : 'bg-gradient-to-b from-black/65 via-black/10 to-black/70';
  // emphasized（サロンページ用）：スマホでは「本日の出勤セラピスト」ミニカードと同サイズ（105×153）。PCは従来どおり。
  const sizeCls = emphasized ? 'w-[105px] h-[153px] md:w-[150px] md:h-56' : 'w-52 h-72';

  return (
    <Link
      href={`/diary/${diary.id}`}
      className={`relative text-left group flex-shrink-0 ${sizeCls} overflow-hidden shadow-sm hover:-translate-y-1 hover:shadow-lg transition-all duration-300 bg-gradient-to-br from-pink-300 to-rose-400`}
    >
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

      {/* Top: 日付 + タイトル */}
      <div className="absolute top-0 left-0 right-0 p-3">
        <p className="text-white/70 mb-1" style={{ fontSize: emphasized ? '11px' : '9px' }}>
          {emphasized ? formatDiaryDate(diary.createdAt) : formatDateTime(diary.createdAt)}
          <DiaryNewBadge iso={diary.createdAt} />
        </p>
        {diary.title && (
          <p
            className="text-white/90 leading-relaxed line-clamp-3"
            style={{ fontSize: emphasized ? '13px' : '10px' }}
          >
            {diary.title}
          </p>
        )}
      </div>

      {/* Bottom: セラピスト名 + CTA。emphasized（サロンページ・小カード）は縦並びで名前を上に。 */}
      {emphasized ? (
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <p className="font-bold text-white drop-shadow truncate" style={{ fontSize: '11px' }}>
            {diary.therapistName}
          </p>
          <span className="block text-[10px] text-pink-300 font-bold">日記を見る →</span>
        </div>
      ) : (
        <div className="absolute bottom-0 left-0 right-0 p-3 flex items-end justify-between gap-2">
          <span className="font-bold text-white drop-shadow truncate min-w-0" style={{ fontSize: '10px' }}>
            {diary.therapistName}
          </span>
          <span className="flex-shrink-0 text-[10px] text-pink-300 font-bold">日記を見る →</span>
        </div>
      )}
    </Link>
  );
}

// ── DiaryViewAllCard（横スクロール末尾の「全部見る」カード。クリックで遷移） ──

function DiaryViewAllCard({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="relative flex-shrink-0 w-[105px] h-[153px] md:w-[150px] md:h-56 rounded-2xl overflow-hidden border border-pink-200 bg-gradient-to-b from-pink-50 to-fuchsia-100 flex flex-col items-center justify-center gap-2 hover:from-pink-100 hover:to-fuchsia-200 transition-colors shadow-sm"
    >
      <div className="w-10 h-10 rounded-full bg-white/70 flex items-center justify-center shadow-sm">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-pink-500">
          <path d="M5 12h14M12 5l7 7-7 7" />
        </svg>
      </div>
      <p className="text-[12px] font-bold text-pink-600 text-center leading-snug">全部見る</p>
    </Link>
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

  // 新着7件のみサムネ横スクロール表示（8枚目は「全部見る」カード）
  useEffect(() => {
    fetchDiaries({ salonId, limit: 7 }).then(setList);
  }, [salonId]);

  if (list && list.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-slate-400 border border-dashed border-pink-100 rounded-2xl bg-pink-50/10">
        只今、こちらのサロンの写メ日記は準備中です ✿
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-hidden min-w-0">
      <div className="flex gap-[3px] overflow-x-auto pb-4 scrollbar-pink w-full max-w-full min-w-0">
        {(list ?? []).map((diary) => (
          <DiaryCard key={diary.id} diary={diary} emphasized />
        ))}
        {list && list.length > 0 && <DiaryViewAllCard href={`/salon/${salonId}/diary`} />}
      </div>
    </div>
  );
}
