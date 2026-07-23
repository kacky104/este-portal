'use server';

import { createClient } from '@/app/lib/supabase/server';
import { ADMIN_UUID } from '@/app/lib/admin';

// クライアントに返す投稿の型（XAdmin.tsx の ModPost と一致させる）
export type ModPostResult = {
  id: string;
  body: string | null;
  images: string[];
  createdAt: string;
  authorHandle: string;
  authorName: string;
};

/**
 * 投稿を日時範囲で検索（運営専用）。
 * fromLocal / toLocal は datetime-local の値（例: "2026-06-01T00:00"）で、
 * **JSTの壁掛け時計時刻**として解釈する。UTCに変換してクエリする。
 * どちらも空なら空配列を返す（呼び出し側で弾く想定だが二重防御）。
 */
export async function searchXPostsByDate(
  fromLocal: string | null,
  toLocal: string | null,
): Promise<{ ok: boolean; posts: ModPostResult[]; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_UUID) {
    return { ok: false, posts: [], error: 'forbidden' };
  }

  if (!fromLocal && !toLocal) {
    return { ok: true, posts: [] };
  }

  // JST(壁掛け時計) → UTC ISO へ変換。
  // datetime-local は "YYYY-MM-DDTHH:mm"（TZなし）。これを JST とみなし +09:00 を付けて Date 化する。
  // 終了は「その分まで含める」ため 59.999 秒を足す（＝toの分を含む）。
  const toUtcIso = (local: string, isEnd: boolean): string => {
    // "2026-06-01T00:00" + ":00+09:00" → JST として厳密にパース
    const jst = new Date(`${local}:00+09:00`);
    if (isEnd) jst.setSeconds(59, 999);
    return jst.toISOString();
  };

  let q = supabase
    .from('x_posts')
    .select('id, author_profile_id, body, images, created_at')
    .order('created_at', { ascending: false })
    .limit(100); // TODO: 100件超が必要になったら range() でページング

  if (fromLocal) q = q.gte('created_at', toUtcIso(fromLocal, false));
  if (toLocal) q = q.lte('created_at', toUtcIso(toLocal, true));

  const { data, error } = await q;
  if (error) {
    return { ok: false, posts: [], error: error.message };
  }

  type PostRow = {
    id: string | number;
    author_profile_id: string;
    body: string | null;
    images: string[] | null;
    created_at: string;
  };
  const rows = (data ?? []) as PostRow[];

  // 投稿主名を辞書引き（N+1回避）。page.tsx と同じ作法。
  const authorIds = [...new Set(rows.map((r) => r.author_profile_id).filter(Boolean))];
  const dict = new Map<string, { handle: string; display_name: string }>();
  if (authorIds.length > 0) {
    const { data: authors } = await supabase
      .from('x_profiles')
      .select('id, handle, display_name')
      .in('id', authorIds);
    (authors ?? []).forEach((a) =>
      dict.set(a.id as string, {
        handle: (a.handle as string) ?? '',
        display_name: (a.display_name as string) ?? '',
      }),
    );
  }

  const posts: ModPostResult[] = rows.map((r) => ({
    id: String(r.id),
    body: r.body ?? null,
    images: r.images ?? [],
    createdAt: r.created_at,
    authorHandle: dict.get(r.author_profile_id)?.handle ?? '',
    authorName: dict.get(r.author_profile_id)?.display_name ?? '(不明)',
  }));

  return { ok: true, posts };
}
