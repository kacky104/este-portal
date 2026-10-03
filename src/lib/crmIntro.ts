// フクエスCRM「ご案内」（未契約の店舗様が入口を押したときに出す画面）の中身（第1144便・2026-10-04・カッキーさん）。
// ★ 純粋なデータ。通信もDBも触らない。表示は src/app/mypage/crm/CrmIntro.tsx。
//
// ★★★ 読む人: まだ契約していない【店舗のオーナー様】。「何ができるのか」を短く、絵と箇条で伝える
//   （フクエスリンク・コネックエフの「はじめての方へ」と同じ組み立て: とは → 流れ → できること → 無料との違い → はじめかた）。
// ★★ 値・画面の名前はすべて【いまの実際の動き】から（src/app/lib/crm/guideText.ts と食い違わせない）。★ 願望や予定を書かない。
// ★ 料金はここに書かない（第2条が保留のため）。「運営事務局へ」に留める。

export type CrmIntroFlowBox = { caption: string; name: string };
/** ★ 第1148便: accent … 札をピンクで目立たせる（カッキーさんの指定） */
export type CrmIntroFeature = { name: string; body: string; accent?: boolean };
export type CrmIntroCompareRow = { item: string; free: string; crm: string };
export type CrmIntroStep = { title: string; body: string };

export type CrmIntroContent = {
  intro: { title: string; lead: string; points: readonly string[] };
  flow: readonly CrmIntroFlowBox[];
  features: readonly CrmIntroFeature[];
  compare: { freeLabel: string; crmLabel: string; rows: readonly CrmIntroCompareRow[] };
  steps: readonly CrmIntroStep[];
  /** 契約していなくても、いま起きていること（押しどころ） */
  already: string;
  apply: { title: string; body: string };
};

export const CRM_INTRO: CrmIntroContent = {
  intro: {
    title: 'フクエスCRMとは',
    // ★ 第1146便（カッキーさん）: 「有料の道具」→「システム」。「など」を足した
    lead: '店の予約・お客様・出勤・売上などを、ひとつの画面で管理できるシステムです。',
    points: [
      '電話番号を入れるだけで、同じお客様の利用回数・キャンセル回数・要注意メモが出ます',
      'その日の出勤と予約が、セラピストごとに横一列に並びます',
      'フクエスのネット予約も、同じ画面に自動で入ります',
      'スマホでもパソコンでも使えます。ログインはフクエスのマイページと同じアカウントです',
    ],
  },
  flow: [
    { caption: '電話・ネットで', name: '予約が入る' },
    { caption: '電話番号で自動で', name: 'お客様を記録' },
    { caption: '次に来たとき', name: '回数・メモが一目で分かる' },
  ],
  features: [
    { name: 'スケジュール', body: 'その日の出勤と予約を、セラピストごとに時間の軸で。空いているところを押すだけで受付できます。' },
    { name: '顧客台帳', body: '名前・電話・分類（一般／会員／常連／VIP／NG）・要注意メモ・女子NG・予約の履歴。名前や電話の下4桁で探せます。' },
    { name: '予約一覧', body: '先月のキャンセル、担当ごと、名前や電話で、日付をまたいで予約を探せます。' },
    { name: '日報・レポート', body: '締め作業でその日の売上・報酬・経費を日報に。月ごとの売上・本数・お客様の数も集計します。' },
    { name: '金銭授受', body: 'セラピストとのお金のやりとり（精算・釣銭・前借り）と残高を、通算で持ちます。' },
    { name: '料金設定', body: 'コース・指名・延長・オプション・割引の料金表。項目ごとに料金と女子報酬を入れておけば、受付で選ぶだけです。' },
    { name: '来店時の同意書（QR）', body: '部屋ごとのQRをお客様のスマホで読んでサイン。紙でもらったときも記録できます。', accent: true },
    { name: 'セラピストへの公開', body: 'ONにすると、セラピスト本人のページに自分の出勤と予約だけが出ます。お客様の電話番号は見せません。', accent: true },
  ],
  compare: {
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
  steps: [
    { title: '運営事務局にお申し込み', body: 'お申し込みをいただくと、運営がこの店舗のフクエスCRMをONにします。' },
    { title: '利用規約に同意する', body: 'はじめて開いたときに、利用規約と顧客データの取り扱いをお読みいただき、同意をお願いします。' },
    { title: '料金表を入れる', body: '「料金設定」でコースや指名の料金と女子報酬を入れます。受付のときに選ぶだけになります。' },
    { title: '受付を始める', body: 'スケジュールの空いているところを押して、電話番号と名前を入れるだけ。これまでの予約の記録もすぐに見られます。' },
  ],
  already: '予約ボード・ネット予約に入ったお客様は、今も電話番号で自動で記録されています。お申し込みいただくと、これまでの記録もそのままご覧いただけます。',
  apply: {
    title: 'お申し込み・料金',
    body: 'お申し込み・料金は運営事務局までお問い合わせください。',
  },
};
