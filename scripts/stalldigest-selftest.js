// 全店の「止まっているもの」の一覧（src/lib/stallDigest.ts）の自己点検（第1340便）。
//
// ★ この点検の芯
//   ① 0件のとき、「見ていない」と「止まっていない」を混ぜない（見た数を必ず出す）
//   ② 読めなかった店を、だまって消さない
//   ③ 見るだけの口が、DB に書かない・メールを出さない
//   ④ 新しい基準を作らない（今ある見張りの関数を呼ぶ）
//
//   使い方:  npm run check:stalldigest

const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'stallDigest.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};
const item = (o) => {
  const base = Object.assign({ watch: 'import', salonId: 3, provider: 'ekichika', slot: 1, reason: 'list_stale' }, o);
  return Object.assign({ key: m.stallKey(base), salonName: '作り物の店', siteLabel: '駅ちか（枠1）', elapsedHours: 5.4, message: '取り込みが止まっています' }, base, o);
};
const checked = { salons: 12, credentials: 4, diarySlots: 3, diaryQuiet: 1 };

console.log('── 1. 名前（同じ止まりを、次の回にも同じものと分かる） ──');
eq('key の形', m.stallKey({ watch: 'write', salonId: 3, provider: 'esutama', slot: 2, reason: 'never_sent' }), 'write:3:esutama:2:never_sent');
eq('★ 見張りが違えば別のもの（同じ枠で2つ鳴ることがある）',
  m.stallKey({ watch: 'import', salonId: 3, provider: 'ekichika', slot: 1, reason: 'x' }) !== m.stallKey({ watch: 'write', salonId: 3, provider: 'ekichika', slot: 1, reason: 'x' }), true);

console.log('\n── 2. 0件のとき ──');
{
  const lines = m.formatStallOverview({ items: [], checked, errors: [] });
  eq('★★★ 0件でも、見た数を出す', lines, ['止まっているもの・うまくいっていないもの: 0 件（見た数: 店 12・ログイン情報 4・写メ日記の枠 3〔うち見張っていない枠 1〕）']);
  const none = m.formatStallOverview({ items: [], checked: { salons: 0, credentials: 0, diarySlots: 0, diaryQuiet: 0 }, errors: [] });
  eq('★ 何も見ていないときは、見た数が 0 と読める', none[0], '止まっているもの・うまくいっていないもの: 0 件（見た数: 店 0・ログイン情報 0・写メ日記の枠 0）');
}

console.log('\n── 3. 並べ方 ──');
{
  const lines = m.formatStallOverview({
    items: [
      item({ salonId: 9, salonName: 'うしろの店', watch: 'problem', reason: 'login', message: 'ログインできていません', elapsedHours: null }),
      item({ watch: 'diary', reason: 'listed_stale', message: '巡回が止まっています', elapsedHours: 6 }),
      item({}),
    ],
    checked, errors: [],
  });
  eq('店の番号の小さい順・同じ店の中は見張りの順', lines.slice(1), [
    '',
    '■ 作り物の店（店 3）',
    '  ・駅ちか（枠1）［出勤の取り込み］取り込みが止まっています〔約5時間〕  <list_stale>',
    '  ・駅ちか（枠1）［写メ日記の巡回］巡回が止まっています〔約6時間〕  <listed_stale>',
    '',
    '■ うしろの店（店 9）',
    '  ・駅ちか（枠1）［うまくいっていないこと］ログインできていません  <login>',
  ]);
  eq('★ 時間が分からないものに「0時間」と書かない', lines[lines.length - 1].includes('時間'), false);
  const noName = m.formatStallOverview({ items: [item({ salonName: '' })], checked, errors: [] });
  eq('★ 名前が引けなかった店も、番号で出す', noName[2], '■ （名前なし）（店 3）');
}

console.log('\n── 4. 読めなかったもの ──');
{
  const lines = m.formatStallOverview({ items: [], checked, errors: ['店 5 の取り込み・書き込みを調べられなかった: x'] });
  eq('★★★ 読めなかった店を、だまって消さない', lines.slice(1), ['', '★ 読めなかったもの（止まっていない、とは言えない）: 1 件', '  ・店 5 の取り込み・書き込みを調べられなかった: x']);
}

console.log('\n── 5. つなぎ（作り） ──');
{
  const root = path.join(__dirname, '..');
  const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
  const code = (s) => s.replace(/^\s*\/\/.*$/gm, '');
  const col = code(read('src/app/lib/media/stallOverview.ts'));
  eq('★★ 見るだけ: DB に書かない', /\.(insert|update|upsert|delete)\(/.test(col), false);
  eq('★ 見るだけ: メールを出さない', /notifyAdmin|resend/i.test(col), false);
  eq('★★★ 取り込み・書き込みは、店の画面の赤い帯と同じ関数', /computeMediaLinkAlerts\(svc, salonId\)/.test(col), true);
  eq('★★★ 写メ日記は、前からある見張りと同じ関数', /collectDiaryStall\(svc, now\)/.test(col), true);
  eq('★★★ うまくいっていないことは、ホームと同じ関数', /workProblemOf\(merged\)/.test(col), true);
  eq('★ 記録の引き方は getMediaOverview と同じ（出勤 40・ログイン 8）', /\.limit\(40\)/.test(col) && /\.limit\(8\)/.test(col), true);
  eq('★★ パスワードの中身を出さない（あるかだけ見る）', (col.match(/password_enc/g) || []).length, 3);
  eq('★ 読めなかったら errors に入れる', (col.match(/errors\.push\(/g) || []).length >= 7, true);
  const route = code(read('src/app/api/admin/stall-overview/route.ts'));
  eq('★ 口は鍵つき', /authorization'\) !== `Bearer \$\{secret\}`/.test(route), true);
  eq('★ 口も DB に書かない・メールを出さない', /\.(insert|update|upsert|delete)\(|notifyAdmin/.test(route), false);
  const dr = code(read('src/app/api/admin/diary-stall/route.ts'));
  eq('★ 前からある写メ日記の口も、同じ集め方を呼ぶ（判定を2か所に書かない）', /collectDiaryStall\(/.test(dr) && !/judgeDiaryStall\(/.test(dr), true);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
