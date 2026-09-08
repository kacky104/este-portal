// セラピストの既定画像（src/lib/therapistPlaceholder.ts）の自己点検（第217便）。
//
// ★★★ なぜ要るか
//   「本人 → 店舗 → 運営 → 無し」の順番を守る式が1か所にある。★ 順番が入れ替わると、
//   店舗様が入れた画像より運営の画像が勝つ、写真がある子に既定画像が被る、が【静かに】起きる。
//
//   使い方:  npm run check:therapistplaceholder

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'therapistPlaceholder.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

const P = 'https://x/photo.jpg', S = 'https://x/salon.jpg', A = 'https://x/admin.jpg';

// ── 順番 ──
eq('本人があれば本人', m.pickTherapistImage(P, S, A), P);
eq('本人が無ければ店舗', m.pickTherapistImage(null, S, A), S);
eq('本人も店舗も無ければ運営', m.pickTherapistImage(null, null, A), A);
eq('全部無ければ null', m.pickTherapistImage(null, null, null), null);
eq('undefined も無いとみなす', m.pickTherapistImage(undefined, undefined, undefined), null);

// ── 空文字・空白は「無い」 ──
eq('本人が空文字なら店舗', m.pickTherapistImage('', S, A), S);
eq('本人が空白だけなら店舗', m.pickTherapistImage('   ', S, A), S);
eq('店舗が空文字なら運営', m.pickTherapistImage(null, '', A), A);
eq('運営が空文字なら null', m.pickTherapistImage(null, null, ''), null);

// ── ★ 店舗の既定が運営に負けない ──
eq('★ 店舗と運営の両方あるとき店舗が勝つ', m.pickTherapistImage(null, S, A), S);

// ── 表を引く ──
const table = { admin: A, bySalon: new Map([[6, S], [7, null]]) };
eq('表: 店舗6 は店舗の既定', m.pickWithTable(null, 6, table), S);
eq('表: 店舗7 は列が null → 運営', m.pickWithTable(null, 7, table), A);
eq('表: 表に無い店舗8 → 運営', m.pickWithTable(null, 8, table), A);
eq('表: salonId が null → 店舗を飛ばして運営', m.pickWithTable(null, null, table), A);
eq('表: 本人があれば表を見ない', m.pickWithTable(P, 6, table), P);
eq('表: 文字の salonId でも引ける', m.pickWithTable(null, '6', table), S);
eq('表: 運営も無ければ null', m.pickWithTable(null, 8, { admin: null, bySalon: new Map() }), null);

// ── 定数 ──
eq('page_key は therapist_placeholder', m.THERAPIST_PLACEHOLDER_KEY, 'therapist_placeholder');

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\n★ すべて通った（' + 18 + ' 本）');
