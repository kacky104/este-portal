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

// ── SalonDiaryCircles（サロン詳細ページ上部：円形サムネ横スクロール） ────
// 写メ日記を円（〇）で表示。円の中は写真のみ・円の下にセラピスト名だけ。
// スマホで約3.5枚見える幅、最大10枚、末尾に「一覧を見る」。空のときは何も出さない。
export function SalonDiaryCircles({
  salonId,
  heading,
}: {
  salonId: string;
  heading?: string;
}) {
  const [list, setList] = useState<DiaryView[] | null>(null);

  useEffect(() => {
    fetchDiaries({ salonId, limit: 10 }).then(setList);
  }, [salonId]);

  // 読み込み中・0件のときはセクションごと非表示（上部に空の帯を出さない）。
  if (!list || list.length === 0) return null;

  // 円1つ分の寸法。スマホ幅で約3.5枚見えるよう item=82px / gap=8px（pitch=90px）。
  const CIRCLE = 72; // 円の直径(px)
  const ITEM = 82;   // 名前を含む1列の幅(px)

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-3">
        <span className="w-1 h-5 rounded-full bg-gradient-to-b from-pink-500 to-pink-700 flex-shrink-0" />
        <h2 className="text-base font-bold" style={{ color: heading }}>写メ日記</h2>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-pink w-full">
        {list.map((d) => (
          <Link
            key={d.id}
            href={`/diary/${d.id}`}
            className="flex-shrink-0 flex flex-col items-center gap-1.5 group"
            style={{ width: ITEM }}
          >
            {/* 円（写真のみ・文字なし）。リング付き。 */}
            <span className="block rounded-full p-[2px] bg-gradient-to-tr from-pink-400 to-rose-400">
              <span
                className="block rounded-full overflow-hidden bg-white"
                style={{ width: CIRCLE, height: CIRCLE }}
              >
                {d.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={d.image}
                    alt={d.therapistName}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                ) : (
                  <span className="block w-full h-full bg-gradient-to-br from-pink-200 to-rose-300" />
                )}
              </span>
            </span>
            {/* 円の下：セラピスト名だけ */}
            <span className="text-[10px] leading-tight text-center truncate w-full" style={{ color: heading }}>
              {d.therapistName}
            </span>
          </Link>
        ))}

        {/* 末尾：一覧を見る */}
        <Link
          href={`/salon/${salonId}/diary`}
          className="flex-shrink-0 flex flex-col items-center gap-1.5"
          style={{ width: ITEM }}
        >
          <span
            className="rounded-full flex items-center justify-center border-2 border-pink-300 bg-pink-50"
            style={{ width: CIRCLE, height: CIRCLE }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-pink-500">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </span>
          <span className="text-[10px] leading-tight text-center font-bold text-pink-600">一覧を見る</span>
        </Link>
      </div>
    </div>
  );
}
