'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import ScrollPopupImage from '@/components/ScrollPopupImage';

// サロン詳細ページ左下のポップアップ画像（スマホのみ表示）。
//
// 設定（画像URL・リンク・表示ON/OFF）をサーバーの ISR キャッシュに焼き込まず、
// クライアント側でマウント時に Supabase から直接読む。これにより「今すぐ」バッジ
// （ImasuguCountBadge）と同様、オーナーが /mypage で保存した内容がキャッシュ待ちなしで即反映される。
// ※ salons の公開 SELECT ポリシーで anon から読めるため、ログイン不要で取得できる。
export default function SalonScrollPopup({ salonId }: { salonId: number }) {
  const [cfg, setCfg] = useState<{ url: string | null; link: string | null; enabled: boolean } | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('salons')
          .select('popup_image_url, popup_link, popup_enabled')
          .eq('id', salonId)
          .single();
        if (!active || !data) return;
        setCfg({
          url:     (data.popup_image_url as string | null) ?? null,
          link:    (data.popup_link as string | null) ?? null,
          enabled: Boolean(data.popup_enabled),
        });
      } catch {
        // 取得失敗時は何も出さない（ページ操作は妨げない）。
      }
    })();
    return () => { active = false; };
  }, [salonId]);

  if (!cfg) return null;

  return (
    <ScrollPopupImage
      src={cfg.enabled && cfg.url ? cfg.url : ''}
      href={cfg.link ?? ''}
      alt="お知らせ"
    />
  );
}
