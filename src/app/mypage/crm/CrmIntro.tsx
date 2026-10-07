'use client';

import { useCrmLinks } from './CrmBase';
import { CRM_INTRO } from '@/lib/crmIntro';

// フクエスCRM「ご案内」（第1144便・2026-10-04・カッキーさん）。★ 未契約の店舗様が入口を押したときに出る。
//   ★ ログイン不要のご案内ページ（fukuescrm.com/about・第1145便）と、マイページの中（CrmShell の未契約）の両方で使う。
//   ★ 契約の判定はサーバー（actions/crm.ts）のまま。ここは見せるだけ。読み取りは無い。
// ★★ 第1167便（カッキーさん）: 第1165便で文字で組んだ1ページを、カッキーさん作成の画像1枚に差し替えた（写真入り・紺）。
//   コネックエフ（/mypage/conecf・第1166便）・fukuX（/mypage/fukux）のご案内と同じ作り＝画像1枚＋下にボタン。
//   ★ 画像は public/mypage/crm/crm-intro.webp（1600×2262）。差し替えるときはこのファイルを置き換えるだけ。
//     （.webp は proxy.ts の matcher から外れているので、fukuescrm.com でもそのまま出る）
//   ★ 画像の中の文章は alt に要点を書く（画面読み上げのため）。★ 画像の中身を変えたら alt も直すこと（食い違わせない）。
//   ★ 第1168便（カッキーさん）: 「無料の予約ボードとの違い」の画像を2枚目に足した（public/mypage/crm/crm-compare.webp）。
//   ★ 第1169便（カッキーさん）: 2枚目の上の見出し（フクエスCRM ご案内／フクエス掲載店さまへ）は1枚目と重なるので切り取った（1600×1132）。
//   ★ お申し込みの一文は画像の下に文字で置く。
//   ★ lib/crmIntro.ts はお申し込みの一文だけ使っている（ほかの項目は第1165便の文字組みのもの。画像に戻すときのために残してある）。
//   ★ ボタンは画像にしない。3つ（運営に申し込む＝第1163便の行き先のまま／使い方／マイページへ戻る）。

const NAVY = '#1e2a5a'; // /about の帯と同じ紺
const BLUE = '#2c4a84'; // 画像の紺に合わせた明るいほう

const INTRO_ALT =
  'フクエスCRM ご案内（フクエス掲載店さまへ）。予約もお客様も、ひとつの画面で。出勤・売上・日報まで、まとめて管理できます。スマホでもパソコンでも。ログインはフクエスと同じ。' +
  '予約が入る（電話・ネットで）→ お客様を記録（電話番号で自動で）→ 回数・メモが一目で（次に来たとき）。' +
  '01 できること：1 スケジュール、2 顧客台帳、3 予約一覧、4 日報・レポート、5 金銭授受、6 料金設定。' +
  '来店時の同意書をペーパーレス化：部屋に設置したQRを、お客様のスマホで読んでサイン。データがCRMに記録されます。紙でもらったときも記録できます。' +
  'セラピストページへの公開：フクエスのセラピストページに、その子のスケジュールラインを表示します。出勤する部屋番号やお客様の名前、時間などが表示されます。お客様の個人情報（電話番号など）や店舗側のメモなどは表示されません。' +
  '02 はじめかた（4つのステップ）：1 運営事務局にお申し込み、2 利用規約に同意する、3 料金表を入れる、4 受付を始める。';

// ★★ 第1298便（2026-10-08・カッキーさん）: 2枚目（「無料の予約ボードとの違い」の画像）は出さない。
//   マイページの予約ボードをいったん出さなくなったので（第1297便）、「予約ボードは無料で使えます」と案内しない。
//   ★ 画像のファイル（public/mypage/crm/crm-compare.webp）と lib/crmIntro.ts の compare は残してある（どこにも出していない）。
//     戻すときは、この便の差分を戻す（img と COMPARE_ALT）。

export function CrmIntro({ salonName }: { salonName?: string; publicPage?: boolean }) {
  const links = useCrmLinks();
  return (
    <div className="mx-auto max-w-3xl px-3 py-6 sm:px-4 sm:py-8">
      {salonName && <p className="mb-2 text-[12px] font-bold" style={{ color: BLUE }}>{salonName}</p>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mypage/crm/crm-intro.webp"
        alt={INTRO_ALT}
        width={1600}
        height={2262}
        className="block w-full h-auto border border-slate-200"
      />
      <p className="mt-5 text-center text-[14px] font-bold text-slate-600">{CRM_INTRO.apply.body}</p>

      {/* ★ 第1163便: 「運営に申し込む」の行き先はマイページの「運営事務局」→ お問い合わせ
          （件名と本文を入れた状態で開く。送信は店舗様が押す）。★ PC は横並び・スマホは縦並び */}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <a href={links.fukues('/mypage?tab=support&apply=crm')} className="flex-1 py-4 text-center text-[17px] font-black text-white shadow-md hover:opacity-95" style={{ background: `linear-gradient(to right, ${NAVY}, ${BLUE})` }}>
          運営に申し込む
        </a>
        <a href={links.special('guide')} target="_blank" rel="noopener" className="flex items-center justify-center border-2 bg-white px-5 py-3.5 text-[14.5px] font-bold hover:bg-slate-50" style={{ borderColor: BLUE, color: BLUE }}>
          使い方・よくある質問
        </a>
        <a href={links.fukues('/mypage')} className="flex items-center justify-center bg-slate-800 px-5 py-3.5 text-[14.5px] font-bold text-white hover:opacity-90">
          マイページへ戻る
        </a>
      </div>
    </div>
  );
}
