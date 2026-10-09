// 公式サイトのトップの title / description（src/lib/hpSeo.ts）の自己点検（第1143便・2026-10-04）。
//   使い方:  npm run check:hpseo

const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'hpSeo.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

console.log('── 1. タイトル ──');
eq('★★★ 型は「店名｜（地域）のメンズエステ【公式】」', m.hpTopTitle('THE LABYRINTH ～ラビリンス～', '博多・住吉'), 'THE LABYRINTH ～ラビリンス～｜博多のメンズエステ【公式】');
eq('★★ 地域は検索で打たれる言葉にする',
   ['博多・住吉', '中洲・天神・薬院', '北九州・小倉', '久留米', '福岡県その他'].map((a) => m.hpAreaWord(a)),
   ['博多', '中洲・天神', '北九州・小倉', '久留米', '福岡']);
// ★ 第1373便: エリアを「博多・天神・中洲」1つにまとめた。公式サイトの言葉は住所から決める（今までと同じ言葉が出ること）
eq('★★★ まとめたエリアは住所から（博多区 → 博多）', m.hpTopTitle('THE LABYRINTH ～ラビリンス～', '博多・天神・中洲', '福岡市博多区博多駅前3-1-1'), 'THE LABYRINTH ～ラビリンス～｜博多のメンズエステ【公式】');
eq('★★ まとめたエリアの言葉（中洲・中央区・天神・薬院 → 中洲・天神／分からない → エリア名そのまま）',
   ['福岡市博多区中洲2-1', '福岡市中央区春吉1-1', '福岡市中央区天神2-1', '福岡県福岡市中央区薬院1-1', '', null, '福岡市南区大橋1-1'].map((ad) => m.hpAreaWord('博多・天神・中洲', ad)),
   ['中洲・天神', '中洲・天神', '中洲・天神', '中洲・天神', '博多・天神・中洲', '博多・天神・中洲', '博多・天神・中洲']);
eq('★ 説明文も住所から', m.hpTopDescription({ salonName: 'テスト店', area: '博多・天神・中洲', address: '福岡市博多区住吉1-1', heroCatch: '一言' }), '博多のメンズエステ「テスト店」の公式サイト。一言。');
eq('★ ほかのエリアは住所を見ない', m.hpAreaWord('久留米', '福岡市博多区'), '久留米');
eq('★ 出張の店は「福岡の出張メンズエステ」', m.hpTopTitle('テスト店', '出張'), 'テスト店｜福岡の出張メンズエステ【公式】');
eq('★ 地域が空・知らない値は「福岡」（嘘にならない言葉へ倒す）', [m.hpTopTitle('テスト店', ''), m.hpTopTitle('テスト店', null), m.hpTopTitle('テスト店', '大阪')],
   ['テスト店｜福岡のメンズエステ【公式】', 'テスト店｜福岡のメンズエステ【公式】', 'テスト店｜福岡のメンズエステ【公式】']);
eq('★ 店名が空でも落ちない', m.hpTopTitle('', '久留米'), '久留米のメンズエステ【公式】');

console.log('── 2. 説明文 ──');
eq('★★★ 地域・業種・店名・アクセス・お店の一言の順',
   m.hpTopDescription({ salonName: 'THE LABYRINTH ～ラビリンス～', area: '博多・住吉', access: '博多駅より徒歩7分', heroCatch: '厳選された博多美人セラピストが多数在籍！' }),
   '博多のメンズエステ「THE LABYRINTH ～ラビリンス～」の公式サイト。博多駅より徒歩7分。厳選された博多美人セラピストが多数在籍！');
eq('★ 一言が無ければコンセプトの頭・アクセスが無ければ入れない',
   m.hpTopDescription({ salonName: 'テスト店', area: '久留米', access: '', heroCatch: '', concept: '落ち着いた個室で\nゆっくりお過ごしください' }),
   '久留米のメンズエステ「テスト店」の公式サイト。落ち着いた個室で ゆっくりお過ごしください。');
eq('★★ 長いアクセス（道順など）は入れない',
   m.hpTopDescription({ salonName: 'テスト店', area: '久留米', access: 'あ'.repeat(m.HP_ACCESS_MAX + 1), heroCatch: '一言' }),
   '久留米のメンズエステ「テスト店」の公式サイト。一言。');
eq('★ 何も無くても店名と地域だけで文になる', m.hpTopDescription({ salonName: 'テスト店', area: '出張' }), '福岡の出張メンズエステ「テスト店」の公式サイト。');
{
  const d = m.hpTopDescription({ salonName: 'テスト店', area: '博多・住吉', access: '博多駅より徒歩7分', concept: 'あ'.repeat(300) });
  eq('★★ 全体は上限で切る（最後は…）', [d.length, d.endsWith('…')], [m.HP_DESC_MAX, true]);
}

console.log(fail === 0 ? '\n全部 ok' : `\n★★★ NG ${fail} 件`);
process.exit(fail === 0 ? 0 : 1);
