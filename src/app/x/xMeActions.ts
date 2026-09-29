'use server';

import { createClient } from '@/app/lib/supabase/server';
import { getXContext } from './xProfile';
import { fetchShopMini } from './xAffiliation';
import type { MeSeed } from './XMeProvider';

// ★★ 第986便（2026-09-29・カッキーさん）: fukuX の「自分（me）」の取り直しを【サーバー側】で行う。
// ★ /x レイアウトの seed と同じ中身。ブラウザの getSession / x_profiles 読み込みは、
//   アプリ内ブラウザで止まったり「ログインしていない」と誤って返ったりするため使わない。
export async function loadMyXMe(): Promise<MeSeed> {
  const { userId, email, profile } = await getXContext();
  let affiliatedShop: MeSeed['affiliatedShop'] = null;
  if (profile?.kind === 'therapist' && profile.affiliated_shop_id) {
    const supabase = await createClient();
    const shop = await fetchShopMini(supabase, profile.affiliated_shop_id);
    affiliatedShop = shop ? { handle: shop.handle, displayName: shop.displayName } : null;
  }
  return { me: profile, userId, email, affiliatedShop };
}
