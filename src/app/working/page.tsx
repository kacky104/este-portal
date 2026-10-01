import type { Metadata } from 'next';
import { WorkingPageBody } from './WorkingPageBody';

// 自己参照 canonical＋固有 title（root の canonical '/' 継承による重複扱いを防ぐ）。
// 文言は「現在出勤中」で統一（2026-08-06）。パンくず・見出し・title・description・
// 一覧が空のときの文言（WorkingTherapists）まで同じ言い方に揃える。
// このページは「今この瞬間に出勤中の人」を出す一覧で、「本日出勤予定」ではないため。
// ★ 第1081便: エリア別は /working/[area]（旧 ?area= は next.config の redirects で転送）。
const WORKING_TITLE = '現在出勤中のセラピスト一覧｜福岡メンズエステ【フクエス】';
const WORKING_DESCRIPTION =
  '福岡のメンズエステで現在出勤中のセラピスト一覧。博多・天神・北九州・久留米など福岡全域の出勤情報をフクエスでまとめてチェックできます。';

export const metadata: Metadata = {
  title: WORKING_TITLE,
  description: WORKING_DESCRIPTION,
  alternates: { canonical: '/working' },
  openGraph: {
    title: WORKING_TITLE,
    description: WORKING_DESCRIPTION,
    url: '/working',
    siteName: 'フクエス',
    type: 'website',
    images: [{ url: '/ogp.png', width: 1200, height: 630 }],
  },
  twitter: {
    card: 'summary_large_image',
    title: WORKING_TITLE,
    description: WORKING_DESCRIPTION,
    images: ['/ogp.png'],
  },
};

// ★ 第1081便: ISR 60 秒（出勤の鮮度は WorkingTherapists 側の判定で担保・/diary と同じ 60 秒）。
export const revalidate = 60;

export default function WorkingPage() {
  return <WorkingPageBody />;
}
