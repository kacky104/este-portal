import { CastOwnerView } from '@/app/cast/CastOwnerView';

// ★ 第1777便（カッキーさん）: フクエスのマイページから、セラピストページを見るだけで開く（/mypage/cast-view/ID）。
//   ★ 戻る＝そのセラピストの編集ページ。★ 確かめ方・中身は src/app/cast/CastOwnerView.tsx。

export const metadata = { title: 'セラピストページ（見るだけ）', robots: { index: false, follow: false } };

export default async function MypageCastViewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CastOwnerView therapistId={id} backHref={`/mypage/therapist/${encodeURIComponent(id)}`} />;
}
