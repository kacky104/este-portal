'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/app/lib/supabase/client';
import ScrollPopupImage from '@/components/ScrollPopupImage';

type Candidate = { url: string; link: string | null };

// サロン詳細ページ左下のポップアップ画像（スマホのみ表示）。
//
// - 設定（画像最大3枚・各画像の個別リンク・表示ON/OFF）を ISR に焼き込まず、
//   クライアント側でマウント時に Supabase から直接読む（「今すぐ」バッジと同方式＝保存が即反映）。
// - 登録画像が複数あるときは、ページを開く（＝この部品がマウントされる）たびに1枚をランダムに選ぶ。
//   リロードのたびに選び直されるため、毎回違う画像が出る。
export default function SalonScrollPopup({ salonId }: { salonId: number }) {
  const [chosen, setChosen] = useState<Candidate | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase
          .from('salons')
          .select('popup_enabled, popup_image_url, popup_link, popup_image_url2, popup_link2, popup_image_url3, popup_link3')
          .eq('id', salonId)
          .single();
        if (!active || !data || !data.popup_enabled) return;

        // 3スロットのうち画像が設定されているものだけを候補にする。
        const candidates = ([
          { url: data.popup_image_url  as string | null, link: (data.popup_link  as string | null) ?? null },
          { url: data.popup_image_url2 as string | null, link: (data.popup_link2 as string | null) ?? null },
          { url: data.popup_image_url3 as string | null, link: (data.popup_link3 as string | null) ?? null },
        ].filter((c) => Boolean(c.url)) as Candidate[]);

        if (candidates.length === 0) return;

        // マウント（＝リロード）ごとに1枚ランダム選択。
        const pick = candidates[Math.floor(Math.random() * candidates.length)];
        setChosen(pick);
      } catch {
        // 取得失敗時は何も出さない（ページ操作は妨げない）。
      }
    })();
    return () => { active = false; };
  }, [salonId]);

  if (!chosen) return null;

  return <ScrollPopupImage src={chosen.url} href={chosen.link ?? ''} alt="お知らせ" />;
}
