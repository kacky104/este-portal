// 「誰のどの日記を送るか」（src/lib/esutamaDiaryPlan.ts）の自己点検（第133便・2026-09-04）。
//
// ★★★ ここで守りたいのは4つ。
//   ① 送るのは【未送信のうち1件だけ】。★ まとめて送らない
//   ② 利用状況は cast_id で決める。★ 名前では突き合わせない（さら／さくら事件）
//   ③ 一覧を読めていないなら「始めていない」と言わない
//   ④ 実弾は指定された1人だけ。★ 見つからない・送れないなら黙って別の人にしない
//
//   使い方:  npm run check:esutamadiaryplan

const path = require('path');
const P = require(path.join(__dirname, '..', '_tmpcheck', 'esutamaDiaryPlan.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const ACTIVE = ['757481', '900001'];
const OK = {
  therapistId: 1, name: 'さら', consent: 'agreed', castId: '757481',
  unsentDiaryIds: ['d1', 'd2'], hasOlderUnsent: false, hasAnyDiary: true,
};
const one = (o) => P.planEsutamaDiaries({ candidates: [{ ...OK, ...o }], activeCastIds: ACTIVE, listRead: true })[0];

console.log('── 1. ★★★ 利用状況は cast_id で決める（名前では決めない）──');
const set = new Set(ACTIVE);
eq('★ 一覧に居れば started', P.esutamaAccountState('757481', set, true), 'started');
eq('★★ 一覧に居なければ not_started', P.esutamaAccountState('123456', set, true), 'not_started');
// ★★★ 一覧を読めていないのに「始めていない」と言わない（引き継ぎメモ 3-5）
eq('★★★ 一覧を読めていなければ unknown', P.esutamaAccountState('757481', set, false), 'unknown');
// ★★★ 結びが無いと、その人が一覧に居るかを言えない
eq('★★★ 結びが無ければ unknown（not_started にしない）', P.esutamaAccountState(null, set, true), 'unknown');
eq('★ 番号の形が違えば unknown', P.esutamaAccountState('abc', set, true), 'unknown');

console.log('\n── 2. ★★★ 送るのは未送信のうち1件だけ ──');
eq('★ 送れるときは一番新しい未送信1件', one({}).diaryId, 'd1');
eq('★ 送れる', one({}).ok, true);
// ★★★ 未送信が無い＝全部送ってある。★ 「日記がまだ」と混ぜない
eq('★★★ 未送信が無ければ already_sent', one({ unsentDiaryIds: [] }).reason, 'already_sent');
// ★★★ 2026-09-04・1通目の下見で実際に出た嘘。★ 1通も送っていないのに「送信済み」
eq('★★★ 古い日記しか無いのを「送信済み」と言わない',
   one({ unsentDiaryIds: [], hasOlderUnsent: true }).reason, 'too_old');
eq('★★ 古いだけなら「まだお送りしていない」と書く',
   one({ unsentDiaryIds: [], hasOlderUnsent: true }).message.includes('まだお送りしていない'), true);
// ★ 日記が1件も無い人は、古いも新しいもない
eq('★ 日記ゼロは no_diary のまま',
   one({ unsentDiaryIds: [], hasOlderUnsent: true, hasAnyDiary: false }).reason, 'no_diary');
// ★★ 1件も書いていないのは故障ではない。★ already_sent とも混ぜない
eq('★★★ 日記が1件も無ければ no_diary',
   one({ unsentDiaryIds: [], hasAnyDiary: false }).reason, 'no_diary');
eq('★ no_diary のときは日記を選ばない', one({ hasAnyDiary: false }).diaryId, null);
eq('★ 送らないときは必ず diaryId が null', one({ consent: 'unknown' }).diaryId, null);

console.log('\n── 3. ★★★ 送れない理由を混ぜない ──');
eq('★ 了承なし', one({ consent: 'unknown' }).reason, 'not_agreed');
eq('★ 断られた', one({ consent: 'declined' }).reason, 'not_agreed');
eq('★★★ 結びが無い', one({ castId: null }).reason, 'no_cast_id');
eq('★★ 一覧に居ない（未開始）', one({ castId: '123456' }).reason, 'not_started');
// ★★★ 一覧を読めていないなら、始めていないと言わない
const unread = P.planEsutamaDiaries({ candidates: [{ ...OK }], activeCastIds: [], listRead: false })[0];
eq('★★★ 一覧を読めていなければ account_unknown', unread.reason, 'account_unknown');
eq('★ 読めていないときは送らない', unread.ok, false);

console.log('\n── 4. ★★ 数える・0件の理由が読める ──');
const rows = P.planEsutamaDiaries({
  candidates: [
    { ...OK, therapistId: 1 },
    { ...OK, therapistId: 2 },
    { ...OK, therapistId: 3, unsentDiaryIds: [] },                    // 送信済み
    { ...OK, therapistId: 8, unsentDiaryIds: [], hasOlderUnsent: true },// ★ 古い日記のみ
    { ...OK, therapistId: 4, unsentDiaryIds: [], hasAnyDiary: false },// 日記がまだ
    { ...OK, therapistId: 5, consent: 'unknown' },                    // 了承なし
    { ...OK, therapistId: 6, castId: '123456' },                      // 未開始
    { ...OK, therapistId: 7, castId: null },                          // 名簿未結び
  ],
  activeCastIds: ACTIVE, listRead: true,
});
eq('★ 理由ごとに数える', P.tallyDiaryPlan(rows), {
  母数: 8, 送れる: 2, 送信済み: 1, 日記がまだ: 1, 古い日記のみ: 1,
  了承なし: 1, 未開始: 1, 利用状況が不明: 0, 名簿未結び: 1,
});
eq('★ 空でも落ちない', P.tallyDiaryPlan([]).母数, 0);
// ★★★ 「送れる」は0でも必ず出す（第35便の反省6）
const zero = P.tallyDiaryPlan(P.planEsutamaDiaries({
  candidates: [{ ...OK, consent: 'unknown' }], activeCastIds: ACTIVE, listRead: true,
}));
eq('★★★ 送れる0でも数を出す', P.diaryPlanSummary(zero).startsWith('送れる 0名'), true);
eq('★★ 0件の理由が同じ行に出る', P.diaryPlanSummary(zero).includes('ご了承がまだ 1名'), true);
eq('★ 0のものは並べない', P.diaryPlanSummary(zero).includes('未開始'), false);
eq('★ 在籍の数は必ず出る', P.diaryPlanSummary(P.tallyDiaryPlan(rows)).includes('在籍 8名'), true);
eq('★★ 古い日記のみも1行に出る',
   P.diaryPlanSummary(P.tallyDiaryPlan(rows)).includes('古い日記のみ 1名'), true);

console.log('\n── 5. ★★★ 実弾は指定された1人だけ ──');
eq('★ 指定した人を取り出す', P.pickOneToSend(rows, 2).ok, true);
eq('★ その人の日記を送る', P.pickOneToSend(rows, 2).row.diaryId, 'd1');
// ★★★ 居ない人を指定されたら、黙って別の人にしない
eq('★★★ 居ない人なら断る', P.pickOneToSend(rows, 999).ok, false);
eq('★★ 断る理由が読める', P.pickOneToSend(rows, 999).message.includes('999'), true);
// ★★★ 送れない人を指定されたら、その理由を返す
eq('★★★ 送れない人なら断る', P.pickOneToSend(rows, 5).ok, false);
eq('★★ 誰のどの理由かが分かる', P.pickOneToSend(rows, 5).message.includes('さら'), true);
eq('★★ 送信済みの人も断る', P.pickOneToSend(rows, 3).ok, false);

console.log('\n── 6. ★★★ 正本がフクエスの店舗にしか送らない（第133-3便）──');
// ★★★ 2026-09-04・ラビリンス様で【実測して】分かった。★ 駅ちかを正本にしている店舗の
//   diary_posts は【駅ちかから取り込んだもの】（salon_diary_imports に11件とも行があった）。
//   ★★ 送ると「別の媒体に書いたものを本人の名前で転載する」ことになる。
//   ★ 「ベンリー経由で二重になる」は私の推測で、間違いだった（同じ日の日記が両媒体で別内容）。
eq('★★★ フクエスが正本なら送れる', P.checkSalonDiarySource('fukues'), { ok: true });
eq('★★★ 駅ちかが正本なら送らない', P.checkSalonDiarySource('ekichika').ok, false);
eq('★★ 理由が読める（転載になる。★ 「二重になる」とは書かない）',
   P.checkSalonDiarySource('ekichika').message.includes('転載'), true);
// ★★★ 反証された言い方を二度と書かないための見張り
eq('★★★ 「ベンリー」を理由にしない（2026-09-04 に反証済み）',
   P.checkSalonDiarySource('ekichika').message.includes('ベンリー'), false);
eq('★★★ ベンリー受け取りなら送らない', P.checkSalonDiarySource('benry').ok, false);
// ★★★ 知らない値・空は【送らない側】へ倒す。★ 「たぶんフクエス」で送らない
eq('★★★ 知らない値なら送らない', P.checkSalonDiarySource('something').ok, false);
eq('★★★ 空なら送らない', P.checkSalonDiarySource('').ok, false);
eq('★★★ null でも落ちず、送らない', P.checkSalonDiarySource(null).ok, false);
eq('★ 前後の空白は落として見る', P.checkSalonDiarySource(' fukues ').ok, true);

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
