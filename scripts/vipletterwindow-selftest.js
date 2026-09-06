// VIPレターの表示期間（src/lib/vipLetterWindow.ts）の自己点検（第178便）。
//
// ★★★ なぜ要るか
//   ここは【画面から消す】判断。★ 間違えると、生きているレターが黙って消える。
//   ★★ 会員の受信箱と店舗の送信済み一覧が【同じ日数】であることが要件（カッキーさん・2026-09-06）。
//     ★ 数字を1か所にまとめたので、ここが通れば両方の画面が揃う。
//
//   使い方:  npm run check:vipletterwindow

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'vipLetterWindow.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

const now = new Date('2026-09-06T12:00:00+09:00');
const daysAgo = (n) => new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();

eq('日数は30日', m.VIP_LETTER_WINDOW_DAYS, 30);

eq('今日のものは出す', m.isVipLetterVisible(daysAgo(0), now), true);
eq('29日前は出す', m.isVipLetterVisible(daysAgo(29), now), true);
// ★ ちょうど30日は【出す】（境目で消さない）
eq('★ ちょうど30日は出す', m.isVipLetterVisible(daysAgo(30), now), true);
eq('30日と1分前は出さない', m.isVipLetterVisible(new Date(now.getTime() - (30 * 24 * 60 + 1) * 60 * 1000).toISOString(), now), false);
eq('31日前は出さない', m.isVipLetterVisible(daysAgo(31), now), false);
eq('半年前は出さない', m.isVipLetterVisible(daysAgo(180), now), false);

// ★★ 読めない日時を「期限切れ」に倒さない（作法3-3）
eq('★★ 空は出す（読めなかった＝期限切れではない）', m.isVipLetterVisible('', now), true);
eq('★★ null は出す', m.isVipLetterVisible(null, now), true);
eq('★★ 壊れた日時は出す', m.isVipLetterVisible('こわれた日時', now), true);

// ★ 未来の日時（時計のずれ）でも消さない
eq('★ 未来の日時は出す', m.isVipLetterVisible(daysAgo(-1), now), true);

// ★ DBに渡す境目
eq('境目は30日前', m.vipLetterWindowStartISO(now), daysAgo(30));

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
