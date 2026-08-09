import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { fetchHpPageData } from '@/app/hp/_lib/data';
import { HpTemplate } from '@/app/hp/_templates/HpTemplate';
import { isHpTemplateKey, isValidHpColor, normalizeHpSiteKey } from '@/app/lib/hpSite';
import { getHpAdminContext } from '@/app/actions/hpAdmin';

// ひな形ギャラリーの【実物プレビュー】（2026-08-09）。
//
// /hp/{key}/preview/{template}/{color} で、その店の実データ（セラピスト・出勤・料金 …）が
// 入った公開ページを、指定のひな形×カラーでそのまま描画する。DBには何も書かない。
// ギャラリーの簡易サムネだけで「変更不可の確定」をさせるのは無理がある、という指摘（2026-08-09）
// への対応。掲載データから中身が自動で埋まるうちの方式だからできる芸当で、ここが vootec との差。
//
// - 認可必須: 管理画面と同じ判定（運営/オーナー/HP管理者）。第三者には 404。
//   draft の店でも本人はプレビューできる（公開ページの status ゲートは通らない）。
// - force-dynamic: ログイン判定に cookie を読むため。ISR には乗せない（公開ページ側は従来どおり）。
// - 店舗ドメイン経由でも proxy.ts の rewrite でそのまま届く（/preview/... → /hp/{ドメイン}/preview/...）。

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'デザインプレビュー',
  robots: { index: false, follow: false },
};

export default async function HpPreviewPage({
  params,
}: {
  params: Promise<{ slug: string; template: string; color: string }>;
}) {
  const { slug, template, color } = await params;
  if (!isHpTemplateKey(template) || !isValidHpColor(template, color)) notFound();

  // 管理画面に入れる人だけ（未ログイン・部外者は 404。存在も知らせない）
  const access = await getHpAdminContext(slug);
  if (!access.ok) notFound();

  const data = await fetchHpPageData(slug, { template_key: template, theme_key: color });
  if (!data) notFound();

  // 「選択画面に戻る」の行き先。店舗ドメイン経由なら /admin（/hp/… を書くと二重 rewrite で 404）、
  // fukues.com 経由なら /hp/{key}/admin。admin/page.tsx の previewHref と同じ判定。
  const h = await headers();
  const host = normalizeHpSiteKey((h.get('x-forwarded-host') ?? h.get('host') ?? '').split(':')[0]);
  const adminHref = host !== '' && host === normalizeHpSiteKey(slug) ? '/admin' : `/hp/${slug}/admin`;

  return (
    <div>
      {/* プレビュー中バナー（固定・最前面）。公開ページのCTA（下部固定）と被らないよう上に置く */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
          padding: '9px 12px',
          background: '#be185d',
          color: '#fff',
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '.05em',
        }}
      >
        <span>プレビュー表示です（まだ確定されていません）</span>
        <Link
          href={adminHref}
          style={{
            color: '#fff',
            background: 'rgba(255,255,255,.18)',
            border: '1px solid rgba(255,255,255,.5)',
            borderRadius: 999,
            padding: '4px 14px',
            textDecoration: 'none',
            fontSize: 11,
            whiteSpace: 'nowrap',
          }}
        >
          選択画面に戻る
        </Link>
      </div>
      {/* バナーの高さぶん下げる */}
      <div style={{ height: 42 }} />
      <HpTemplate data={data} />
    </div>
  );
}
