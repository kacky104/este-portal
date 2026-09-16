'use client';

import { createContext, useContext, useMemo } from 'react';
import type { GuideLinkKey } from '@/lib/mediaGuide';

// フクエスリンクの部品を【コネックエフでも使う】ための差し替え口（第396便・1b・2026-09-17）。
//
// ★ 既定はフクエスリンク（/mypage/media）。★ Provider で包まなければ、今までと1文字も変わらない。
// ★ コネックエフ（conecf.com）では:
//   ・画面の行き先 … conecf.com の画面へ
//   ・名前         … 画面に出す「フクエス」を「コネックエフ」に（★ text() を通した文字だけ）
// ★★ 同意文（mediaConsent）は text() を【通さない】。★ 文言を変えると同意の取り直しになるため（版を上げないと嘘になる）。

export type MediaLinkKey = GuideLinkKey | 'guide' | 'girls';

export const MEDIA_LINKS_DEFAULT: Record<MediaLinkKey, string> = {
  home: '/mypage/media',
  login: '/mypage/media/login',
  roster: '/mypage/media/therapists',
  work: '/mypage/media/work',
  diary: '/mypage/media/diary',
  news: '/mypage/media/news',
  log: '/mypage/media/log',
  matrix: '/mypage/media/matrix',
  qa: '/mypage/media/qa',
  schedule: '/mypage',
  guide: '/mypage/media/guide',
  // ★ 第398便: セラピストを登録する場所（フクエスリンクではマイページのプロフィールタブ）
  girls: '/mypage?tab=profile',
};

export type MediaBrandValue = {
  /** 画面に出す名前 */
  name: 'フクエス' | 'コネックエフ';
  links: Record<MediaLinkKey, string>;
};

const DEFAULT: MediaBrandValue = { name: 'フクエス', links: MEDIA_LINKS_DEFAULT };

const BrandContext = createContext<MediaBrandValue>(DEFAULT);

export function MediaBrandProvider({ value, children }: { value: MediaBrandValue; children: React.ReactNode }) {
  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}

/** ★ 名前を差し替えた文字。★ フクエスリンクではそのまま返す */
export function brandText(name: MediaBrandValue['name'], s: string): string {
  // ★ 「フクエスリンク」を先に（★ 後だと「コネックエフリンク」になる）
  return name === 'フクエス' ? s : s.split('フクエスリンク').join(name).split('フクエス').join(name);
}

export function useMediaBrand(): {
  name: MediaBrandValue['name'];
  isConecf: boolean;
  link: (k: MediaLinkKey) => string;
  text: (s: string) => string;
} {
  const v = useContext(BrandContext);
  return useMemo(() => ({
    name: v.name,
    isConecf: v.name === 'コネックエフ',
    link: (k: MediaLinkKey) => v.links[k],
    text: (s: string) => brandText(v.name, s),
  }), [v]);
}
