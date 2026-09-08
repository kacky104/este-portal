// サイト共通の「1枚だけ置く画像」を page_heroes から読む（第218便・2026-09-08）。
//   'therapist_placeholder' … 写真が無い子に出す既定画像（第217便・読むのは therapistPlaceholder.ts）
//   'list_more_card'        … 出勤中・新人の横スクロールの末尾「一覧を見る」カードの画像（第218便）
// ★ 書くのは /admin の TherapistPlaceholderManager（それぞれ専用の RPC）。
// ★ 失敗しても null（★ 今までどおりの見た目に倒れる）。
import type { SupabaseClient } from '@supabase/supabase-js';

export const LIST_MORE_CARD_KEY = 'list_more_card';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export async function fetchSiteImage(supabase: AnyClient, key: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.from('page_heroes').select('image_url').eq('page_key', key).maybeSingle();
    if (error) return null;
    const url = ((data as { image_url?: string | null } | null)?.image_url ?? '').trim();
    return url === '' ? null : url;
  } catch {
    return null;
  }
}
