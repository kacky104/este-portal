// 反映の早見表（第212便・2026-09-07・カッキーさん）。★ 純粋なデータ。通信もDBも触らない。
//
// ★★★ 「設定を変えると、何が・どこへ・どれくらいで反映されるか」を1枚で見せる。
//   ★ 値はすべて【実際の動き】から（cron の間隔・受け口の条件）。★ 願望や予定を書かない。
//   ★ 「フクエスから反映」は【自動にした場合】の値（★ 自動にする前は毎回承認・第208便）。
//
// ★ 出どころ:
//   出勤（自動）      … media-auto-push  30分ごと（crontab 5,35）
//   写メ日記 駅ちか   … forwardDiary（メール・即時）
//   写メ日記 エステ魂 … diary-auto-push  5分ごと（了承ありの方のみ）
//   写メ日記 エステラブ … メール・即時（投稿先は手で登録・第84便）
//   即セラ エステ魂   … sokusera-push    5分ごと（「今すぐ」ON→即セラON）
//   即ヒメ 駅ちか     … sokuhime-push 5分ごと（第215便・「今すぐ」ON→即ヒメON／OFFで枠を外す）
//                       ★ 自動にした店だけ（sokuhime_auto）。★ 取り込みは別（ingest-list・第39便）
//   新着情報 駅ちか   … article-auto    店舗の設定の時刻（read でも write でも出る・none では止まる）
//   駅ちか→フクエス 出勤 … import_interval_min（店舗ごと・既定60分・cron は15分ごと）
//   駅ちか→フクエス 週間出勤 … import/targets mode=full（1日1回・03:20）
//   フクエス→各サイト 週間出勤 … 出勤の送信は常に7日ぶん（同じ周）
//   駅ちか→フクエス 写メ日記 … diary-import 15分ごと（ログイン情報が要る）
//   エスラン         … 準備中（accepting: false・notYetKind 'preparing'）

export const MATRIX_SITES = ['駅ちか', 'エステ魂', 'エステラブ', 'エスラン'] as const;
export const MATRIX_ROWS = ['出勤', '週間出勤（7日分）', '写メ日記', '即ヒメ／即セラ', '新着情報'] as const;

export type MatrixSection = {
  key: 'write' | 'read' | 'none';
  title: string;
  note: string;
  /** 行 → 4サイトぶんの短い言葉 */
  cells: Record<(typeof MATRIX_ROWS)[number], readonly [string, string, string, string]>;
};

export const NO = '✕';
/** ★ そのサイトにその機能そのものが無い（送れない、ではない）。★ ✕ と見分ける（カッキーさん・2026-09-07） */
export const NA = '―';

export const MEDIA_MATRIX: readonly MatrixSection[] = [
  {
    key: 'write',
    title: 'フクエスから反映',
    note: '※ 各サイトを自動にした場合。フクエスに入れたものが各サイトへ',
    cells: {
      '出勤':          ['30分ごと', '30分ごと', NO, '準備中'],
      // ★ 出勤の送信は常に7日ぶん（workPlan WORK_DAYS・esutamaPlan days）。★ 当日と同じ周で送る
      '週間出勤（7日分）': ['30分ごと', '30分ごと', NO, '準備中'],
      '写メ日記':      ['即時', '数分後', '即時', NA],
      '即ヒメ／即セラ': ['5分ごと', '5分ごと', NO, NA],
      '新着情報':      ['設定の時刻', NO, NO, NA],
    },
  },
  {
    key: 'read',
    title: '駅ちかから反映',
    note: '※ 駅ちかに入れたものがフクエスへ。ほかのサイトへは送らない',
    cells: {
      '出勤':          ['15〜60分ごと', NO, NO, NO],
      // ★ 週間の予定は1日1回の周（import/targets mode=full・03:20）で維持する
      '週間出勤（7日分）': ['1日1回', NO, NO, NO],
      '写メ日記':      ['15分ごと', NO, NO, NA],
      '即ヒメ／即セラ': ['出勤と一緒', NO, NO, NA],
      '新着情報':      ['設定の時刻', NO, NO, NA],
    },
  },
  {
    key: 'none',
    title: 'どのサイトにも反映しない',
    note: '※ フクエスのみ。どこへも送らず、どこからも取り込まない',
    cells: {
      '出勤':          [NO, NO, NO, NO],
      '週間出勤（7日分）': [NO, NO, NO, NO],
      '写メ日記':      [NO, NO, NO, NA],
      '即ヒメ／即セラ': [NO, NO, NO, NA],
      '新着情報':      [NO, NO, NO, NA],
    },
  },
];

/** ★ 早見表の下に置く1行ずつの補足（短く） */
export const MATRIX_FOOTNOTES: readonly string[] = [
  '出勤は、最初の1回を「出勤を送る」で確かめて送ったあと、自動にできます',
  'エステ魂の写メ日記・即セラは、ご本人の了承がある方だけ',
  '新着情報は駅ちか専用。「駅ちかの新着情報」で回数と文章を決めます',
  'エステ魂はサイトに新着情報の自動更新機能あり。直接設定できるのでこちらでは付けていません',
  '即ヒメは、ほかのツールで自動にしているとそちらが優先されます',
  '― はそのサイトにその機能が無いもの',
];
