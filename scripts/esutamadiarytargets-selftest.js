// 「誰に送るか」の判定（src/lib/esutamaDiaryTargets.ts）の自己点検（第132便・2026-09-04）。
//
// ★★★ ここで守りたいのは3つ。
//   ① 既定は送らない（迷ったら断る側へ）
//   ② 送れない理由を【混ぜない】。★ 理由ごとに店舗様の次の行動が違う
//   ③ 二度送らない（already_sent を最優先で見る）
//
//   使い方:  npm run check:esutamadiarytargets

const path = require('path');
const T = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaDiaryTargets.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const OK = { consent: 'agreed', account: 'started', castId: '757481', alreadySent: false };
const r = (o) => T.decideDiaryTarget({ ...OK, ...o });

console.log('── 1. ★★★ 送ってよいのは全部そろったときだけ ──');
eq('★ 全部そろえば送れる', r({}), { ok: true });
// ★★★ 既定は送らない。★ 1つでも欠けたら断る
eq('★★★ 了承が無ければ送らない', r({ consent: 'unknown' }).reason, 'not_agreed');
eq('★★★ 断られていたら送らない', r({ consent: 'declined' }).reason, 'not_agreed');
eq('★★★ 魂セラピスト未開始なら送らない', r({ account: 'not_started' }).reason, 'not_started');
eq('★★★ 利用状況が読めていなければ送らない', r({ account: 'unknown' }).reason, 'account_unknown');
eq('★★★ 名簿が結びついていなければ送らない', r({ castId: null }).reason, 'no_cast_id');
eq('★★ 番号の形が違えば送らない', r({ castId: 'abc' }).reason, 'no_cast_id');
eq('★ 空白だけの番号も送らない', r({ castId: '  ' }).reason, 'no_cast_id');

console.log('\n── 2. ★★★ 二度送らない ──');
// ★★★ 日記は投稿。★ 二度送ると記事が2本載り、エステ魂では店舗側から消せない
eq('★★★ もう送ってあれば送らない', r({ alreadySent: true }).reason, 'already_sent');
// ★★ already_sent が最優先。★ 他の理由を並べても店舗様は何もしなくてよい
eq('★★★ 送信済みは他の理由より先に出る',
   r({ alreadySent: true, consent: 'unknown', castId: null }).reason, 'already_sent');
eq('★★ 送信済みの文面は「もうお送りしています」',
   r({ alreadySent: true }).message, 'この日記はもうお送りしています');

console.log('\n── 3. ★★★ 理由を混ぜない（次の行動が違う）──');
// ★ 了承していない人に「名簿を結んでください」と言わない（要らない作業を増やさない）
eq('★★★ 了承が無い人には名簿の話をしない',
   r({ consent: 'unknown', castId: null }).reason, 'not_agreed');
// ★ 「まだ聞いていない」と「断られた」で文面が違う
eq('★★ 未確認と辞退で文面が違う',
   r({ consent: 'unknown' }).message !== r({ consent: 'declined' }).message, true);
eq('★ 辞退の文面はご本人の意思を尊重する',
   r({ consent: 'declined' }).message, 'ご本人が希望されていないため送りません');

// ★★★ 第133便で順番を入れ替えた（名簿の結び → 利用状況）。
//   ★ 利用状況は「魂セラピスト一覧に cast_id があるか」で決まる。
//   ★★ つまり **結びが無いと利用状況はそもそも決められない。**
//   ★ ここを逆にすると「まだ始めていません」という【嘘の理由】が画面に出る。
eq('★★★ 結びが無いときは利用状況より先に「結びがありません」',
   r({ account: 'not_started', castId: null }).reason, 'no_cast_id');
eq('★★★ 利用状況が不明でも、結びが無ければそちらを先に言う',
   r({ account: 'unknown', castId: null }).reason, 'no_cast_id');
// ★ ただし了承はさらに前。★ 了承していない人に「結んでください」と言わない
eq('★★ 了承が無ければ、結びが無くても了承の話が先',
   r({ consent: 'declined', account: 'unknown', castId: null }).reason, 'not_agreed');

console.log('\n── 4. ★★ 数える ──');
const rows = [
  { ...OK },                                   // 送れる
  { ...OK },                                   // 送れる
  { ...OK, alreadySent: true },                // 送信済み
  { ...OK, consent: 'unknown' },               // 了承なし
  { ...OK, consent: 'declined' },              // 了承なし
  { ...OK, account: 'not_started' },           // 未開始
  { ...OK, account: 'unknown' },               // 利用状況が不明
  { ...OK, castId: null },                     // 名簿未結び
];
eq('★ 理由ごとに数える', T.tallyDiaryTargets(rows),
   { 母数: 8, 送れる: 2, 送信済み: 1, 了承なし: 2, 未開始: 1, 利用状況が不明: 1, 名簿未結び: 1 });
eq('★ 空でも落ちない', T.tallyDiaryTargets([]).母数, 0);

console.log('\n── 5. ★★ 0件のときこそ理由が読める ──');
// ★★★ 「送れる」は0でも必ず出す（第35便の反省6）
eq('★★★ 送れる0でも数を出す',
   T.diaryTargetSummary(T.tallyDiaryTargets([{ ...OK, consent: 'unknown' }])).startsWith('送れる 0名'), true);
eq('★★ 0件の理由が同じ行に出る',
   T.diaryTargetSummary(T.tallyDiaryTargets([{ ...OK, consent: 'unknown' }])).includes('ご了承がまだ 1名'), true);
// ★ 0のものは出さない（読む量を増やさない）
eq('★ 0のものは並べない',
   T.diaryTargetSummary(T.tallyDiaryTargets([{ ...OK }])).includes('名簿'), false);
eq('★ 在籍の数は必ず出る',
   T.diaryTargetSummary(T.tallyDiaryTargets(rows)).includes('在籍 8名'), true);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
