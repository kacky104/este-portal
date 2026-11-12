// ★ 第1995便: 公式HP（独自ドメイン）のトップに出す Search Console の「持ち主の確認」の文字。
//   ★ 表 hp_gsc_sites は service_role だけ（RLS 全閉じ）。ここはサーバーで描くときだけ使う（page.tsx の generateMetadata）。
//   ★ 読めない（表がまだ・通信の失敗）ときは null（ページはいつもどおり出す。確認だけが通らない）。
import { createServiceClient } from '@/app/lib/supabase/service';
import { isHpDomainKey, normalizeHpSiteKey } from '@/app/lib/hpSite';

export async function hpGscToken(key: string): Promise<string | null> {
  if (!isHpDomainKey(key)) return null;
  try {
    const { data, error } = await createServiceClient().from('hp_gsc_sites').select('token').eq('domain', normalizeHpSiteKey(key)).maybeSingle();
    if (error || !data) return null;
    const t = String(data.token ?? '').trim();
    return /^[\w-]{10,120}$/.test(t) ? t : null;
  } catch {
    return null;
  }
}
