import { headers } from 'next/headers';
import { conecfBaseFor, conecfHref } from '@/lib/conecfHost';
import { CastOwnerView } from '@/app/cast/CastOwnerView';

// ★ 第1777便（カッキーさん）: コネックエフから、セラピストページを見るだけで開く（conecf.com/cast-view/ID）。
//   ★ 戻る＝コネックエフのホーム。★ 確かめ方・中身は src/app/cast/CastOwnerView.tsx。

export const metadata = { title: 'セラピストページ（見るだけ）', robots: { index: false, follow: false } };

export default async function ConecfCastViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const h = await headers();
  const base = conecfBaseFor(h.get('x-forwarded-host') ?? h.get('host'));
  return <CastOwnerView therapistId={id} backHref={conecfHref(base, '/')} />;
}
