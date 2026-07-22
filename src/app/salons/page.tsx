import type { Metadata } from 'next';
import Link from 'next/link';
import { Logo } from '@/app/components/Logo';
import { createClient } from '@/app/lib/supabase/server';
import { SavedSalonsMenu } from '@/app/components/SavedSalonsMenu';
import { AccountMenu } from '@/app/components/AccountMenu';
import { HamburgerMenu } from '@/app/components/HamburgerMenu';
import { NotificationBell } from '@/app/components/NotificationBell';
import { VipLetterIcon } from '@/app/components/VipLetterIcon';
import { Breadcrumb } from '@/app/components/Breadcrumb';
import { SiteNoticeBanner } from '@/app/components/SiteNoticeBanner';
import { AREA_ORDER } from '@/app/lib/areas';
import { areaLabel } from '@/app/lib/areaLabel';

// /salons は無料掲載枠も兼ねるため、店名・地域・電話番号のみのテキスト一覧にしている（カード表示は廃止）。
// 行は「掲載中サロン（salons テーブル・自動）＋無料掲載枠（free_salon_listings・/admin から手入力）」の統合。
// 掲載中サロンは店名→詳細ページ・電話→tel: リンク、無料掲載枠は純テキストのみ。

const PAGE_TITLE = '福岡のメンズエステ 店舗一覧【フクエス】';
const PAGE_DESC =
  '福岡のメンズエステを一覧掲載。博多・天神・北九州・久留米など全エリアの店舗を店名・地域・電話番号でシンプルにまとめています。';

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: PAGE_DESC,
  alternates: { canonical: '/salons' },
  openGraph: { title: PAGE_TITLE, description: PAGE_DESC, url: '/salons' },
  twitter: { title: PAGE_TITLE, description: PAGE_DESC },
};

type ListRow = {
  key: string;
  name: string;
  area: string;
  phone: string;
  website: string;       // 公式ホームページURL（掲載中= salons.official_url／無料枠= website_url）。空は非表示。
  href: string | null;   // 掲載中サロンは /salon/<id>、無料掲載枠は null（テキストのみ）
  displayOrder: number;  // 無料掲載枠のみ使用（/admin の並び順）
};

// 地域の表示順（AREA_ORDER）。未知の値は末尾へ。
const areaIndex = (a: string) => {
  const i = (AREA_ORDER as readonly string[]).indexOf(a);
  return i < 0 ? AREA_ORDER.length : i;
};

export default async function SalonsPage() {
  const supabase = await createClient();

  // 掲載中サロンと無料掲載枠を並列取得。
  // free_salon_listings はマイグレーション未適用でもページを壊さない（エラー時は空扱い）。
  const [salonsRes, freeRes] = await Promise.all([
    supabase.from('salons').select('id, name, area, phone, official_url').eq('is_hidden', false),
    supabase.from('free_salon_listings').select('id, name, area, phone, website_url, display_order').eq('is_active', true),
  ]);

  const listed: ListRow[] = (salonsRes.data ?? []).map((r) => ({
    key: `s-${r.id}`,
    name: (r.name as string) ?? '',
    area: (r.area as string) ?? '',
    phone: (r.phone as string) ?? '',
    website: (r.official_url as string) ?? '',
    href: `/salon/${r.id}`,
    displayOrder: 0,
  }));
  const free: ListRow[] = (freeRes.data ?? []).map((r) => ({
    key: `f-${r.id}`,
    name: (r.name as string) ?? '',
    area: (r.area as string) ?? '',
    phone: (r.phone as string) ?? '',
    website: (r.website_url as string) ?? '',
    href: null,
    displayOrder: (r.display_order as number) ?? 0,
  }));

  // 並び：地域（AREA_ORDER）→ 掲載中サロン（名前順）→ 無料掲載枠（/admin の並び順）のフラット1列。
  const rows = [...listed, ...free].sort((a, b) => {
    const ai = areaIndex(a.area);
    const bi = areaIndex(b.area);
    if (ai !== bi) return ai - bi;
    const ak = a.href ? 0 : 1;
    const bk = b.href ? 0 : 1;
    if (ak !== bk) return ak - bk;
    if (ak === 0) return a.name.localeCompare(b.name, 'ja');
    return a.displayOrder - b.displayOrder;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">

      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/90 backdrop-blur-md border-b border-slate-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-2 h-14 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-2">
            <SavedSalonsMenu />
            <VipLetterIcon /><NotificationBell /><AccountMenu /><HamburgerMenu />
          </div>
        </div>
      </header>
      <SiteNoticeBanner />

      <main className="max-w-3xl mx-auto px-4 py-10">

        {/* Back link */}
        <Breadcrumb current="掲載店舗一覧" />

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900 mb-1">掲載店舗一覧</h1>
          <p className="text-xs text-slate-400">全{rows.length}件</p>
        </div>

        {rows.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-16">掲載店舗はまだありません</p>
        ) : (
          <ul className="bg-white border border-slate-200 rounded-2xl px-4 sm:px-6 divide-y divide-slate-100">
            {rows.map((r) => (
              <li key={r.key} className="py-2.5 text-sm">
                {/* 1行目：店名（掲載中サロンは詳細ページへリンク） */}
                {r.href ? (
                  <Link href={r.href} className="font-bold text-pink-600 hover:underline">
                    {r.name}
                  </Link>
                ) : (
                  <span className="font-bold text-slate-800">{r.name}</span>
                )}
                {/* 2行目：3分割（左=地域／中=電話（tel:発信）／右=公式ホームページ） */}
                <div className="mt-1 grid grid-cols-3 gap-2 items-center text-xs">
                  <span className="text-slate-500 truncate">{areaLabel(r.area)}</span>
                  <span className="text-center truncate">
                    {r.phone && (
                      <a href={`tel:${r.phone.replace(/[^0-9+]/g, '')}`} className="text-slate-600 hover:underline">
                        {r.phone}
                      </a>
                    )}
                  </span>
                  <span className="text-right truncate">
                    {r.website && (
                      <a href={r.website} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        公式ホームページ
                      </a>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      {/* ─── Footer ──────────────────────────────────────── */}
      <footer className="border-t border-slate-200 bg-white py-6 mt-12">
        <div className="max-w-5xl mx-auto px-4 text-center text-xs text-slate-400">
          © 2026 フクエス. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
