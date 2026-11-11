'use server';

import { createClient } from '@/app/lib/supabase/server';
import { createServiceClient } from '@/app/lib/supabase/service';
import { operatorActingSalonId, scopeConecfSalon } from '@/app/lib/conecf/actingSalon';

// コネックエフ「サイト自動更新一覧」で、いま自動が動いている項目に印を付けるための読み取り（第1920便・2026-11-10・カッキーさん）。
// ★ 読むだけ。★ 表が無い・読めないものは「動いていない」扱い（画面を止めない）

export async function getConecfAutoActive(): Promise<Record<string, boolean>> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return {};
  const svc = createServiceClient();
  const actingId = await operatorActingSalonId(user.id);
  const { data: salon } = await scopeConecfSalon(svc.from('salons').select('id'), user.id, actingId).limit(1).maybeSingle();
  if (!salon) return {};
  const sid = Number(salon.id);
  const any = async (q: PromiseLike<{ data: unknown[] | null; error: unknown }>) => {
    try { const { data, error } = await q; return !error && (data ?? []).length > 0; } catch { return false; }
  };
  // ★ 第1962便: フクエス（お知らせ・フクエスワーク新着情報）。「自動投稿」の印が付いた公開中のものが1本でもあれば動いている。
  //   'has:/work-news' は求人があるか（フクエスワーク新着情報を一覧に出すかどうか）
  const [announce, workNews, hasJob] = await Promise.all([
    any(svc.from('announcements').select('id').eq('salon_id', sid).eq('auto_rotate', true).eq('is_published', true).limit(1)),
    any(svc.from('work_news').select('id').eq('salon_id', sid).eq('auto_rotate', true).eq('is_published', true).limit(1)),
    any(svc.from('salon_jobs').select('salon_id').eq('salon_id', sid).limit(1)),
  ]);
  const [news, rank, movie, mag, cocoaBlog, cocoaMovie, esuOpt, esuPost, zenkoku, vanilla] = await Promise.all([
    any(svc.from('salon_article_templates').select('id').eq('salon_id', sid).eq('is_active', true).limit(1)),
    any(svc.from('conecf_ekichika_rankimgs').select('slot').eq('salon_id', sid).eq('admin_enabled', true).eq('auto', true).limit(1)),
    any(svc.from('conecf_ekichika_movies').select('slot').eq('salon_id', sid).eq('admin_enabled', true).eq('auto', true).limit(1)),
    any(svc.from('conecf_ekichika_magazines').select('slot').eq('salon_id', sid).eq('admin_enabled', true).eq('auto', true).limit(1)),
    any(svc.from('conecf_cocoa_accounts').select('slot').eq('salon_id', sid).eq('enabled', true).limit(1)),
    any(svc.from('conecf_cocoa_accounts').select('slot').eq('salon_id', sid).eq('movie_enabled', true).limit(1)),
    any(svc.from('conecf_esutama_options').select('option_key').eq('salon_id', sid).eq('admin_enabled', true).eq('auto', true).limit(1)),
    any(svc.from('conecf_esutama_posts').select('post_key').eq('salon_id', sid).eq('admin_enabled', true).eq('auto', true).limit(1)),
    any(svc.from('conecf_zenkoku_options').select('option_key').eq('salon_id', sid).eq('admin_enabled', true).eq('auto', true).limit(1)),
    any(svc.from('conecf_vanilla_blog').select('salon_id').eq('salon_id', sid).eq('admin_enabled', true).eq('auto', true).limit(1)),
  ]);
  return {
    '/announce': announce, '/work-news': workNews && hasJob, 'has:/work-news': hasJob,
    '/news': news, '/ekichika-rankimgs': rank, '/ekichika-movies': movie, '/ekichika-magazines': mag,
    '/cocoa': cocoaBlog || cocoaMovie, '/esutama-options': esuOpt || esuPost, '/zenkoku-options': zenkoku, '/vanilla-blog': vanilla,
  };
}
