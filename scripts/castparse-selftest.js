// 駅ちか個人ページのパーサー（src/lib/ekichikaParse.ts）の自己点検（第153便・2026-09-05）。
//
// ★★★ なぜ要るか
//   このファイルは出勤表の1行目を「渡された日付」と決め打ちしていた。
//   ★ 2026-08-29 の import.sh に「読み取り側は塞いでいない」と**予告が書き残されていた**が、
//     ★★ 確かめていなかった。★ 2026-09-05 深夜に実害を確認:
//       深夜0〜6時の周が、駅ちかの「今日」をフクエスの「明日」として取り込んでいた。
//   → ★ 渡された日付を信じない形にしたので、その形を機械で縛る。
//
//   使い方:  npm run check:castparse

const P = require(require('path').join(__dirname, '..', '_tmpcheck', 'ekichikaParse.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ── 実物の形（ファイル冒頭の実測コメントより）──
const workRow = (label) =>
  '<tr class="date_sun"><th>' + label + '</th><td>' +
  '<li class="start">14:00</li><li class="arrow">▼</li><li class="end">翌2:00</li></td></tr>';
const offRow = (label) =>
  '<tr class="date_mon"><th>' + label + '</th><td><li class="none">ー</li></td></tr>';
const naRow = (label) =>
  '<tr class="date_tue"><th>' + label + '</th><td><li class="commuting_no_data">お店にお問い合わせください</li></td></tr>';
const page = (rows) =>
  '<h2 class="profile-name">さあや</h2><p class="bust-size">D</p>' +
  '<p class="data-size"> 25歳/ 164cm B:87 W:54 H:85 </p>' +
  '<h3>1週間の出勤予定</h3><div class="inner"><table>' + rows.join('') + '</table></div>';

console.log('── 1. ★ これまでどおり読めること ──');
{
  const c = P.parseEkichikaCast(page([workRow('09/05(金)'), offRow('09/06(土)'), naRow('09/07(日)')]), '2026-09-05');
  eq('名前', c.name, 'さあや');
  eq('体型', c.bodyType, 'T164 B87(D) W54 H85');
  eq('3日ぶん取れる', c.schedule.length, 3);
  eq('1日目は出勤', [c.schedule[0].date, c.schedule[0].status, c.schedule[0].start, c.schedule[0].end], ['2026-09-05', 'work', '14:00', '02:00']);
  eq('2日目は休み', [c.schedule[1].date, c.schedule[1].status], ['2026-09-06', 'off']);
  eq('★ 未入力も休みに倒す（第30便）', [c.schedule[2].date, c.schedule[2].status], ['2026-09-07', 'off']);
  eq('★★★ ずれていなければ何も言わない', c.scheduleWarnings, []);
}

console.log('\n── 2. ★★★ 深夜のずれ（2026-09-05 に実際に起きた形）──');
// ★ 00:20 の周は暦日で 09/05 を渡していた。★ 駅ちかの表の1日目は営業日の 09/04。
{
  const c = P.parseEkichikaCast(page([workRow('09/04(木)'), offRow('09/05(金)')]), '2026-09-05');
  eq('★★★ 駅ちかの日付で入る（1日ずれない）', c.schedule.map((d) => d.date), ['2026-09-04', '2026-09-05']);
  eq('★★★ 直したことを黙らせない', c.scheduleWarnings.length, 2);
  eq('★★ ずれた日付が両方とも文に入る',
     /2026-09-04/.test(c.scheduleWarnings[0]) && /2026-09-05/.test(c.scheduleWarnings[0]), true);
  eq('★ 出勤の中身は壊れていない', [c.schedule[0].status, c.schedule[0].start], ['work', '14:00']);
}

console.log('\n── 3. ★ 日付ラベル ──');
eq('ラベルを読む', P.readDateLabel('<tr><th>08/23(日)</th><td>'), '08/23');
eq('★ 1桁でも0埋めする', P.readDateLabel('<tr><th>8/3(日)</th><td>'), '08/03');
eq('★ th に class があっても読む', P.readDateLabel('<tr><th class="x">12/31(水)</th>'), '12/31');
eq('★★ th が無ければ null', P.readDateLabel('<tr><td>09/05</td></tr>'), null);
eq('★★ 月が13なら null（勝手に丸めない）', P.readDateLabel('<tr><th>13/01(日)</th>'), null);
eq('★ 0月も null', P.readDateLabel('<tr><th>00/05(日)</th>'), null);
eq('★ 空でも落ちない', P.readDateLabel(''), null);

console.log('\n── 4. ★★★ 年またぎ（★ 駅ちかは年を書かない）──');
eq('★★★ 12/31 の翌日 01/01 は翌年', P.labelToISO('01/01', '2026-12-31'), '2027-01-01');
eq('★★★ 01/01 の前日 12/31 は前年', P.labelToISO('12/31', '2027-01-01'), '2026-12-31');
eq('★ 同じ年の近い日はその年', P.labelToISO('09/06', '2026-09-05'), '2026-09-06');
eq('★★ うるう日は実在する年を選ぶ', P.labelToISO('02/29', '2028-03-01'), '2028-02-29');
eq('★★★ 実在しない日は null（3/1 へ丸めない）', P.labelToISO('02/30', '2026-09-05'), null);
// ★★★ 近くに実在しない日は null。★ 1年先の閏日に飛ばさない（★ 飛ばすとその日に出勤を書く）
eq('★★★ 平年の 3/1 から見た 2/29 は null', P.labelToISO('02/29', '2027-03-01'), null);
// ★★★ ±180日は【年を1つに決めるための境目】。★ どの MM/DD も必ず1つの年に決まる。
//   ★ 「遠すぎる日を弾く」役目はここではない（★ 行ごとの ±7日が持つ・下の 5-2）。
eq('★ 半年ぶん先は翌年になる', P.labelToISO('03/01', '2026-09-05'), '2027-03-01');
eq('★ 半年ぶん前は同じ年', P.labelToISO('03/01', '2026-06-05'), '2026-03-01');
eq('★ 近い日はその年', P.labelToISO('12/01', '2026-09-05'), '2026-12-01');
eq('★ 基準日が壊れていれば null', P.labelToISO('09/05', 'こわれてる'), null);

console.log('\n── 5. ★★★ 読めない行は触らない（決め打ちに戻さない）──');
{
  const 壊れた = '<tr class="date_sun"><td>09/05</td><td><li class="start">14:00</li><li class="end">20:00</li></td></tr>';
  const c = P.parseEkichikaCast(page([workRow('09/05(金)'), 壊れた, offRow('09/07(日)')]), '2026-09-05');
  eq('★★★ 読めた行だけ入る', c.schedule.map((d) => d.date), ['2026-09-05', '2026-09-07']);
  eq('★★★ 触らなかったことを残す', c.scheduleWarnings.length, 1);
  eq('★★ 「触っていません」と書く', /触っていません/.test(c.scheduleWarnings[0]), true);
}

console.log('\n── 5-2. ★★★ 見込みから離れすぎた日は触らない ──');
{
  // ★ 表は7日ぶん。★ 3か月先の日付が出てきたら、読み違え以外にありえない
  const c = P.parseEkichikaCast(page([workRow('09/05(金)'), workRow('12/06(日)')]), '2026-09-05');
  eq('★★★ 離れすぎた行は書かない', c.schedule.map((d) => d.date), ['2026-09-05']);
  eq('★★ 理由が残る', /離れすぎている/.test(c.scheduleWarnings[0]), true);
}
{
  // ★★ 深夜のずれ（1日）は【通す】。★ 守りが本物のずれまで弾いたら意味がない
  const c = P.parseEkichikaCast(page([workRow('09/04(木)')]), '2026-09-05');
  eq('★★★ 1日のずれは通す', c.schedule[0].date, '2026-09-04');
}

console.log('\n── 6. ★★★ 全員の出勤を一斉に消さない（禁則207・第153便で狭めた）──');
{
  // ★ 駅ちかが th の作りを変えた形。★ 行はあるのに1つも取れない。
  //   ★★ 「お店にお問い合わせください」は commuting_no_data の行の中にも書いてある文言なので、
  //     受け皿が効いてしまうと **7日ぶんを休みにして全員の出勤を消す**。
  const 変わった = ['<tr><td>09/05</td><td><li class="commuting_no_data">お店にお問い合わせください</li></td></tr>',
                   '<tr><td>09/06</td><td><li class="none">ー</li></td></tr>'];
  const c = P.parseEkichikaCast(page(変わった), '2026-09-05');
  eq('★★★ 1件も書かない（消さない）', c.schedule.length, 0);
  eq('★★★ 理由が残る', c.scheduleWarnings.length, 2);
}
{
  // ★ 予定を公開していない人（第32便）。★ 出勤表そのものが無い＝行が0
  const 表なし = '<h2 class="profile-name">さあや</h2><h3>1週間の出勤予定</h3>' +
                 '<div class="inner"><p>お店にお問い合わせください 092-000-0000</p></div>';
  const c = P.parseEkichikaCast(表なし, '2026-09-05');
  eq('★★ 表が無いときは従来どおり7日ぶん休み（第32便）', c.schedule.length, 7);
  eq('★ 起点は渡された日付', c.schedule[0].date, '2026-09-05');
  eq('★ 最後は6日後', c.schedule[6].date, '2026-09-11');
  eq('★ ここでは何も言わない', c.scheduleWarnings, []);
}

console.log('\n── 7. ★ 月またぎの並び ──');
{
  const c = P.parseEkichikaCast(page([workRow('09/30(水)'), offRow('10/01(木)')]), '2026-09-30');
  eq('★ 月をまたいでも並ぶ', c.schedule.map((d) => d.date), ['2026-09-30', '2026-10-01']);
  eq('★ ずれていないので何も言わない', c.scheduleWarnings, []);
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
