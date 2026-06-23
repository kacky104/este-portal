import type { SupabaseClient } from '@supabase/supabase-js';

// 写メ日記フィードの取得・整形を server/client で共有する（表示内容を完全に一致させるため唯一のソース）。

export const DIARY_SELECT =
  'id, images, title, content, created_at, salon_id, therapist_id, therapists(name, profile_image_url), salons(name, theme)';

export type DiaryEntry = {
  id: string;
  image: string | null;
  title: string | null;
  content: string | null;
  createdAt: string;
  salonId: string;
  therapistId: string;
  therapistName: string;
  therapistImage: string | null;
  salonName: string;
  themeKey: string | null;
};

type TRel = { name: string | null; profile_image_url: string | null };
type SRel = { name: string | null; theme: string | null };
type Row = {
  id: number | string; images: string[] | null; title: string | null; content: string | null;
  created_at: string; salon_id: number | string; therapist_id: number | string;
  therapists: TRel | TRel[] | null;
  salons: SRel | SRel[] | null;
};

export function mapDiaryRows(rows: unknown): DiaryEntry[] {
  return ((rows ?? []) as Row[]).map((r) => {
    const t = Array.isArray(r.therapists) ? r.therapists[0] : r.therapists;
    const s = Array.isArray(r.salons) ? r.salons[0] : r.salons;
    return {
      id: String(r.id),
      image: (r.images ?? [])[0] ?? null,
      title: r.title ?? null,
      content: r.content ?? null,
      createdAt: r.created_at,
      salonId: String(r.salon_id),
      therapistId: String(r.therapist_id),
      therapistName: t?.name ?? '',
      therapistImage: t?.profile_image_url ?? null,
      salonName: s?.name ?? '',
      themeKey: s?.theme ?? null,
    };
  });
}

// フィード取得（新しい順）。from=salon は同じサロンの全セラピスト、それ以外は同じセラピスト。
export async function fetchDiaryFeed(
  supabase: SupabaseClient,
  opts: { fromSalon: boolean; salonId: number | string; therapistId: number | string }
): Promise<DiaryEntry[]> {
  const query = supabase.from('diary_posts').select(DIARY_SELECT).order('created_at', { ascending: false });
  const { data } = opts.fromSalon
    ? await query.eq('salon_id', opts.salonId)
    : await query.eq('therapist_id', opts.therapistId);
  return mapDiaryRows(data);
}

export function formatDiaryDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
