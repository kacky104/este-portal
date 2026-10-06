// フクエスCRM「ご案内」（未契約の店舗様が入口を押したときに出す画面）の中身（第1144便・2026-10-04・カッキーさん）。
// ★ 純粋なデータ。通信もDBも触らない。表示は src/app/mypage/crm/CrmIntro.tsx。
//
// ★★★ 読む人: まだ契約していない【店舗のオーナー様】。「何ができるのか」を短く、絵と箇条で伝える。
// ★★ 第1165便（カッキーさん）: コネックエフのご案内（第1164便）と同じ要領で、大事なところだけの1ページに簡素化した
//   （いちばん言いたいこと＋流れ → できること → 無料との違い → はじめかた → お申し込み）。
//   ★ 落としたもの: 「とは」の箇条4つ（→ 見出しの下の一文と札2つに集約）・違いの表のかっこ書き（○（時間の軸の画面で）など）。
// ★★ 値・画面の名前はすべて【いまの実際の動き】から（src/app/lib/crm/guideText.ts と食い違わせない）。★ 願望や予定を書かない。
// ★ 第1241便（2026-10-06）: 料金が決まった＝コネックエフとのセットで月額22,000円（税込）。値は lib/setPlan.ts。

import { SET_PLAN_LINE, SET_PLAN_APPLY_LINE } from './setPlan';

export type CrmIntroFlowBox = { caption: string; name: string };
export type CrmIntroIcon = 'calendar' | 'users' | 'list' | 'chart' | 'yen' | 'tag';
/** ★ 第1148便: accent … 札をピンクで目立たせる（カッキーさんの指定）。★ 第1165便: icon … 見出しだけの札に付ける絵 */
// ★ 第1160便（カッキーさん）: スケジュール〜料金設定の6枚は説明の文を出さない（見出しだけ）。ピンクの2枚だけ文を残す
export type CrmIntroFeature = { name: string; body?: string; accent?: boolean; icon?: CrmIntroIcon };
/** free が '○' の行だけ、無料の予約ボードの側にも出す。crm のかっこ書きは画面には出さない（第1165便） */
export type CrmIntroCompareRow = { item: string; free: string; crm: string };
/** ★ 第1149便（カッキーさん）: 説明の文は出さない（見出しだけ） */
export type CrmIntroStep = { title: string; body?: string };

export type CrmIntroContent = {
  /** ★ 第1165便: いちばん上の大きな見出し（2行）・その下の一文・丸い札 */
  hero: { line1: string; line2: string; sub: string; pills: readonly string[]; audience: string };
  flow: readonly CrmIntroFlowBox[];
  features: readonly CrmIntroFeature[];
  compare: { title: string; note: string; freeLabel: string; crmLabel: string; rows: readonly CrmIntroCompareRow[] };
  steps: readonly CrmIntroStep[];
  apply: { title: string; body: string };
};

export const CRM_INTRO: CrmIntroContent = {
  hero: {
    // ★ 元の一言（第1146便）: 「店の予約・お客様・出勤・売上などを、ひとつの画面で管理できるシステムです。」を2行＋一文に分けた
    line1: '予約もお客様も、',
    line2: 'ひとつの画面で。',
    sub: '出勤・売上・日報まで、\nまとめて管理できます。',
    pills: ['スマホでもパソコンでも', 'ログインはフクエスと同じ'],
    audience: 'フクエス掲載店さまへ',
  },
  flow: [
    { caption: '電話・ネットで', name: '予約が入る' },
    { caption: '電話番号で自動で', name: 'お客様を記録' },
    { caption: '次に来たとき', name: '回数・メモが一目で' },
  ],
  features: [
    { name: 'スケジュール', icon: 'calendar' },
    { name: '顧客台帳', icon: 'users' },
    { name: '予約一覧', icon: 'list' },
    { name: '日報・レポート', icon: 'chart' },
    { name: '金銭授受', icon: 'yen' },
    { name: '料金設定', icon: 'tag' },
    // ★ 第1161便（カッキーさん）: ピンクの2枚の見出しと文を書き換え。body の改行（\n）は画面でもそのまま改行になる
    { name: '来店時の同意書をペーパーレス化', body: '部屋に設置したQRをお客様のスマホで読んでサイン。データがCRMに記録されます。紙でもらったときも記録できます。', accent: true },
    { name: 'セラピストページへの公開', body: 'フクエスセラピストページにその子のスケジュールラインを表示。出勤する部屋番号やお客様の名前、時間などが表示されます。\n※お客様の個人情報（電話番号など）や店舗側のメモなどは表示されません。', accent: true },
  ],
  compare: {
    title: '無料の予約ボードとの違い',
    note: '予約ボードは、今までどおり無料でお使いいただけます。',
    freeLabel: '予約ボード（無料）',
    crmLabel: 'フクエスCRM（有料）',
    rows: [
      { item: '予約の受付・変更', free: '○', crm: '○（時間の軸の画面で）' },
      { item: 'お客様の利用回数・キャンセル回数', free: '—', crm: '○（電話番号で自動）' },
      { item: '分類・要注意メモ・女子NG', free: '—', crm: '○' },
      { item: '悪質キャンセルの記録', free: '—', crm: '○' },
      { item: '売上・報酬・日報・月の集計', free: '—', crm: '○' },
      { item: '料金表・金銭授受', free: '—', crm: '○' },
      { item: '来店時の同意書（QR）', free: '—', crm: '○' },
    ],
  },
  // ★ 第1149便（カッキーさん）: 各段の説明の文と、その下の「今も自動で記録されています」の枠を消した（見出しだけ）
  steps: [
    { title: '運営事務局にお申し込み' },
    { title: '利用規約に同意する' },
    { title: '料金表を入れる' },
    { title: '受付を始める' },
  ],
  apply: {
    title: 'お申し込み・料金',
    body: `${SET_PLAN_LINE}${SET_PLAN_APPLY_LINE}`,
  },
};
