// 写メ日記の入口の判定（src/lib/diarySource.ts）の自己点検（第99便）。
//
// ★★★ なぜ要るか
//   ここは「同じ日記が2件並ぶかどうか」を決める。★ 間違えると
//     ・入口が2つ開く → 同じ日記が2件並ぶ（★ 削除も編集も片方にしか効かない）
//     ・入口が0になる → 日記が1件も入らない（★★ 女の子は投稿したのに載らない。誰も気づかない）
//   どちらも静かに起きる。★ だから【数】で固定する。
//
//   使い方:  npm run check:diarysource

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'diarySource.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

// ── 値そのもの ──
eq('入口は3つ', m.DIARY_SOURCES, ['benry', 'ekichika', 'fukues']);
eq('既定は benry（列の default と同じ）', m.DIARY_SOURCE_DEFAULT, 'benry');
eq('benry は入口', m.isDiarySource('benry'), true);
eq('ekichika は入口', m.isDiarySource('ekichika'), true);
eq('fukues は入口', m.isDiarySource('fukues'), true);
eq('4つ目は入口ではない', m.isDiarySource('esulove'), false);
eq('空文字は入口ではない', m.isDiarySource(''), false);
eq('null は入口ではない', m.isDiarySource(null), false);

// ── 保存されている値の読み方 ──
eq('null は既定へ', m.readDiarySource(null), 'benry');
eq('undefined は既定へ', m.readDiarySource(undefined), 'benry');
eq('空文字は既定へ', m.readDiarySource(''), 'benry');
// ★★★ 知らない値を【勝手に読み替えない】。読み替えると壊れた店で静かに受け取る
eq('知らない値は unknown のまま', m.readDiarySource('ekichika2'), 'unknown');
eq('数字も unknown', m.readDiarySource(6), 'unknown');

// ── メールの入口（/api/webhooks/resend-inbound）──
eq('benry はメールを受け取る', m.acceptsDiaryMail('benry'), true);
// ★★★★ ここが第99便の芯。★ 以前は「'fukues' 以外なら受ける」で、ここが true だった
eq('★ ekichika はメールを受け取らない', m.acceptsDiaryMail('ekichika'), false);
eq('fukues はメールを受け取らない', m.acceptsDiaryMail('fukues'), false);
eq('知らない値では受け取らない', m.acceptsDiaryMail('ekichika2'), false);
eq('空なら受け取る（既定 benry）', m.acceptsDiaryMail(null), true);

// ── 駅ちかの入口（/api/admin/diary-import）──
eq('ekichika は取り込む', m.importsDiaryFromEkichika('ekichika'), true);
// ★★★★ ここも芯。★ 鍵があっても benry の店では回さない
eq('★ benry では取り込まない', m.importsDiaryFromEkichika('benry'), false);
eq('fukues では取り込まない', m.importsDiaryFromEkichika('fukues'), false);
eq('知らない値では取り込まない', m.importsDiaryFromEkichika('ekichika2'), false);
eq('空では取り込まない（既定は benry）', m.importsDiaryFromEkichika(null), false);

// ── 送る側（forwardDiary.ts）──
eq('fukues は送る', m.forwardsDiaryFromFukues('fukues'), true);
eq('benry は送らない', m.forwardsDiaryFromFukues('benry'), false);
eq('ekichika は送らない', m.forwardsDiaryFromFukues('ekichika'), false);

// ── ★★★★ 入口の数。ここが「二重に載らない」の本体 ──
//   ★ 「在ること」ではなく【2つ以上開いていないこと】を見る（第96便の反省）。
eq('benry で開くのは1つ', m.openDiaryEntrances('benry'), 1);
eq('ekichika で開くのは1つ', m.openDiaryEntrances('ekichika'), 1);
eq('fukues で開くのは1つ', m.openDiaryEntrances('fukues'), 1);
eq('知らない値ではどこも開かない', m.openDiaryEntrances('ekichika2'), 0);

// ★★★ どの値でも【2つ同時には開かない】。★ 入口を足したらここが落ちる
const anyValue = m.DIARY_SOURCES.concat(['', 'unknown', 'ekichika2', 'BENRY', ' benry']);
eq('★★★ 2つ以上開く値が1つも無い',
  anyValue.filter((v) => m.openDiaryEntrances(v) > 1), []);
// ★ 大文字・前後の空白は【別の値】。勝手に直さない（保存側の CHECK 制約で弾く）
eq('大文字は入口を開かない', m.openDiaryEntrances('BENRY'), 0);
eq('前に空白が入ると入口を開かない', m.openDiaryEntrances(' benry'), 0);

// ★★ 3つの値それぞれで、開く入口が【1つずつ違う】こと（誰も重ならない）
eq('メールが開くのは benry だけ',
  m.DIARY_SOURCES.filter((v) => m.acceptsDiaryMail(v)), ['benry']);
eq('取り込みが開くのは ekichika だけ',
  m.DIARY_SOURCES.filter((v) => m.importsDiaryFromEkichika(v)), ['ekichika']);
eq('送信が開くのは fukues だけ',
  m.DIARY_SOURCES.filter((v) => m.forwardsDiaryFromFukues(v)), ['fukues']);

// ── 記録に残す理由（§372: 一緒くたにしない）──
eq('ekichika の店を断った理由', m.diaryMailRejectReason('ekichika'), 'rejected:source_is_ekichika');
eq('fukues の店を断った理由', m.diaryMailRejectReason('fukues'), 'rejected:source_is_fukues');
eq('壊れた値を断った理由', m.diaryMailRejectReason('ekichika2'), 'rejected:source_is_unknown');
// ★ 理由が全部同じ文字列になっていないこと（＝一緒くたにしていない）
eq('理由は値ごとに違う',
  new Set(['benry', 'ekichika', 'fukues', 'xxx'].map(m.diaryMailRejectReason)).size, 4);

// ── 画面の名前 ──
eq('知らない値は未設定', m.diarySourceTitle('ekichika2'), '未設定');
// ★ 3つの名前が重ならない（店舗様がどれを選んでいるか読み分けられる）
eq('名前が重なっていない',
  new Set(m.DIARY_SOURCES.map(m.diarySourceTitle)).size, 3);
// ★★ 「中」を付けない（§377 と同じ。済んだ話であって、動いている状態ではない）
eq('名前に「中」が入っていない',
  m.DIARY_SOURCES.filter((v) => /中/.test(m.diarySourceTitle(v))), []);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
