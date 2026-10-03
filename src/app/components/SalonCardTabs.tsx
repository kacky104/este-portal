'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { createClient } from '@/app/lib/supabase/client';
import { NewBadge } from '@/components/NewBadge';
import { isNewFaceActive } from '@/lib/newFace';
import { formatDiaryAge, formatDiaryDate } from '@/lib/diaryDate';
import { DIARY_NEW_WINDOW_MS } from '@/lib/diaryNew';
import {
  CARD_TABS, CARD_TAB_ROWS, badgeText, diaryLine, isCouponValid, oneLine, overallRating, todayJstOf,
  type CardTabKey, type SalonCardTabCount,
} from '@/lib/salonCardTabs';
import type { TherapistThumb } from './useSalonTherapists';

// 店舗カードのタブ（第1126便・2026-10-03・カッキーさんの決定「C案」）。決めごとは src/lib/salonCardTabs.ts。
//   見出しだけ出しておき（閉じたまま）、押すと開く。もう一度押すと閉じる。0件は薄く出す（押せない）。
//   ★ 数は親から受け取る（写メ日記・クーポン＝TOP の作り直しのときに読んだ数／口コミ＝salon.reviewCount／新人＝therapists から）。
//   ★ 中身は【押したとき】に、その店のぶんだけ読む（一度読んだタブは持っておく＝開け閉めで読み直さない）。
//     新人は親が読んでいるセラピストから出すので、読まない。
//   ★ カード全体が店舗ページへのリンク（onClick）なので、ここの中の操作は親へ伝えない（stopPropagation）。

type Row = { key: string; href: string; lead: ReactNode; text: string; tail: string };
type Loaded = { status: 'loading' } | { status: 'ready'; rows: Row[] } | { status: 'error' };

/** 'YYYY-MM-DD' → 'MM/DD' */
const mmdd = (ymd: string) => (/^\d{4}-\d{2}-\d{2}/.test(ymd) ? `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}` : '');

const namePill = (name: string) => (
  <span className="flex-shrink-0 max-w-[84px] truncate rounded-full border border-pink-200 bg-pink-50 px-2 text-[11px] font-bold leading-4 text-pink-700">
    {name}
  </span>
);

/**
 * 押したタブの中身（2件）を読む。★ 部品の外に置く（今の時刻を読むので、描画の中の関数にしない）。
 * @returns 行。null は「まだ読めない」（持っておかず、次に押したときにもう一度読む）
 */
async function fetchTabRows(key: Exclude<CardTabKey, 'newface'>, salonId: number, therapists: TherapistThumb[]): Promise<Row[] | null> {
  const supabase = createClient();
  let rows: Row[] = [];

  if (key === 'diary') {
    const now = Date.now();
    const { data: got, error } = await supabase
      .from('diary_posts')
      .select('id, title, content, created_at, therapists(name)')
      .eq('salon_id', salonId)
      .gte('created_at', new Date(now - DIARY_NEW_WINDOW_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(CARD_TAB_ROWS);
    if (error) throw error;
    rows = (got ?? []).map((r) => {
      const th = r.therapists as unknown as { name?: string | null } | { name?: string | null }[] | null;
      const name = (Array.isArray(th) ? th[0]?.name : th?.name) ?? '';
      const at = String(r.created_at ?? '');
      return {
        key: String(r.id),
        href: `/diary/${r.id}`,
        lead: name ? namePill(name) : null,
        text: diaryLine(r.title, r.content),
        tail: formatDiaryAge(at, now) ?? formatDiaryDate(at),
      };
    });
  } else if (key === 'review') {
    // ★ その店の在籍セラピストあての承認済み口コミ（/salon/{id}/reviews と同じ見方）。セラピストは親が読んだものを使う。
    const ids = therapists.map((t) => Number(t.id)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) {
      // ★ セラピストがまだ読めていない。null を返す＝持っておかない（次に押したときにもう一度読む）
      return null;
    }
    const nameOf = new Map(therapists.map((t) => [Number(t.id), t.name]));
    const { data: got, error } = await supabase
      .from('therapist_reviews')
      .select('id, therapist_id, rating_service, rating_technique, rating_reception, body, created_at')
      .in('therapist_id', ids)
      .eq('status', 'approved')
      .order('created_at', { ascending: false })
      .limit(CARD_TAB_ROWS);
    if (error) throw error;
    rows = (got ?? []).map((r) => {
      const name = nameOf.get(Number(r.therapist_id)) ?? '';
      return {
        key: String(r.id),
        href: `/salon/${salonId}/reviews`,
        lead: (
          <span className="flex-shrink-0 text-[11px] font-bold text-amber-700">
            ★{overallRating(r.rating_service, r.rating_technique, r.rating_reception).toFixed(1)}
          </span>
        ),
        text: oneLine(r.body) || '口コミが届いています',
        tail: name ? `${name}さん` : '',
      };
    });
  } else {
    const today = todayJstOf(Date.now());
    const { data: got, error } = await supabase
      .from('coupons')
      .select('id, title, discount, valid_until, sort_order')
      .eq('salon_id', salonId)
      .eq('is_published', true)
      .order('sort_order', { ascending: true })
      .limit(20);
    if (error) throw error;
    rows = (got ?? [])
      .filter((r) => isCouponValid((r.valid_until as string | null) ?? null, today))
      .slice(0, CARD_TAB_ROWS)
      .map((r) => {
        const discount = oneLine(r.discount, 16);
        const until = mmdd(String(r.valid_until ?? ''));
        return {
          key: String(r.id),
          href: `/salon/${salonId}/coupon`,
          lead: discount ? (
            <span className="flex-shrink-0 max-w-[110px] truncate rounded bg-amber-100 px-1.5 text-[11px] font-bold leading-4 text-amber-800">
              {discount}
            </span>
          ) : null,
          text: oneLine(r.title) || 'クーポン',
          tail: until ? `${until}まで` : '',
        };
      });
  }
  return rows;
}

export function SalonCardTabs({ salonId, reviewCount, counts, therapists }: {
  salonId: number;
  reviewCount: number;
  counts: SalonCardTabCount;
  therapists: TherapistThumb[];
}) {
  const [open, setOpen] = useState<CardTabKey | null>(null);
  const [data, setData] = useState<Partial<Record<CardTabKey, Loaded>>>({});

  // 新人: 入店が新しい順（/salon/{id}/newface と同じ判定・並び）
  const newFaces = therapists
    .filter((t) => isNewFaceActive(t.isNewFace, t.newFaceSince))
    .sort((a, b) => String(b.newFaceSince ?? '').localeCompare(String(a.newFaceSince ?? '')));

  const countOf: Record<CardTabKey, number> = {
    diary: counts.diary,
    review: reviewCount,
    newface: newFaces.length,
    coupon: counts.coupon,
  };

  const load = async (key: Exclude<CardTabKey, 'newface'>) => {
    setData((d) => ({ ...d, [key]: { status: 'loading' } }));
    try {
      const rows = await fetchTabRows(key, salonId, therapists);
      // ★ null（まだ読めない）は「読めなかった」として出す。ready ではないので、もう一度押したときに読み直す
      setData((d) => ({ ...d, [key]: rows !== null ? { status: 'ready', rows } : { status: 'error' } }));
    } catch (e) {
      console.error('[card-tabs] 読めなかった', key, salonId, e instanceof Error ? e.message : e);
      setData((d) => ({ ...d, [key]: { status: 'error' } }));
    }
  };

  const pick = (key: CardTabKey) => {
    if (countOf[key] <= 0) return;
    if (open === key) { setOpen(null); return; }
    setOpen(key);
    if (key !== 'newface' && data[key]?.status !== 'ready' && data[key]?.status !== 'loading') void load(key);
  };

  // いま開いているタブの中身
  let loaded: Loaded | null = null;
  if (open === 'newface') {
    loaded = {
      status: 'ready',
      rows: newFaces.slice(0, CARD_TAB_ROWS).map((t) => {
        const since = t.newFaceSince ? formatDiaryDate(t.newFaceSince) : '';
        return {
          key: t.id,
          href: `/therapist/${t.id}`,
          lead: <NewBadge />,
          text: t.age ? `${t.name}（${t.age}）` : t.name,
          tail: since ? `${since} 入店` : '',
        };
      }),
    };
  } else if (open) {
    loaded = data[open] ?? { status: 'loading' };
  }
  const tab = open ? CARD_TABS.find((t) => t.key === open) ?? null : null;
  const panelId = `salon-card-tab-${salonId}`;

  return (
    <div className="-mx-2 border-t border-slate-200" onClick={(e) => e.stopPropagation()}>
      <div className="flex h-9">
        {CARD_TABS.map((t) => {
          const n = countOf[t.key];
          const active = open === t.key;
          const badge = badgeText(n);
          return (
            <button
              key={t.key}
              type="button"
              disabled={n <= 0}
              aria-expanded={active}
              aria-controls={panelId}
              aria-label={`${t.label} ${n}${t.unit}`}
              onClick={() => pick(t.key)}
              className={`flex-1 min-w-0 h-9 flex items-center justify-center gap-1 border-b-2 text-xs font-bold transition-colors ${
                n <= 0
                  ? 'border-transparent text-slate-300 cursor-default'
                  : active
                    ? 'border-pink-600 bg-pink-50 text-pink-700'
                    : 'border-transparent text-slate-600 hover:text-pink-700'
              }`}
            >
              <span className="truncate">{t.label}</span>
              {badge && (
                <span className="flex-shrink-0 min-w-[16px] h-4 rounded-full bg-pink-600 px-1 text-center text-[10px] font-bold leading-4 text-white">
                  {badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {tab && loaded && (
        <div id={panelId} className="px-2 pb-1">
          <div className="min-h-[56px]">
            {loaded.status === 'loading' && <p className="h-14 flex items-center text-xs text-slate-500">読み込み中…</p>}
            {loaded.status === 'error' && <p className="h-14 flex items-center text-xs text-slate-500">読み込めませんでした。下のリンクからご覧ください。</p>}
            {loaded.status === 'ready' && loaded.rows.length === 0 && <p className="h-14 flex items-center text-xs text-slate-500">下のリンクからご覧ください。</p>}
            {loaded.status === 'ready' && loaded.rows.map((r) => (
              <Link
                key={r.key}
                href={r.href}
                onClick={(e) => e.stopPropagation()}
                className="flex h-7 min-w-0 items-center gap-1.5 border-b border-slate-100 last:border-b-0"
              >
                {r.lead}
                <span className="min-w-0 flex-1 truncate text-xs text-slate-700">{r.text}</span>
                {r.tail && <span className="flex-shrink-0 text-[11px] text-slate-500">{r.tail}</span>}
              </Link>
            ))}
          </div>
          <div className="flex h-7 items-center justify-end">
            <Link
              href={`/salon/${salonId}/${tab.path}`}
              onClick={(e) => e.stopPropagation()}
              className="text-xs font-bold text-pink-700 hover:text-pink-600"
            >
              {tab.more} ›
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
