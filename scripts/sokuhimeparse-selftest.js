// 駅ちかの即ヒメ設定画面の読み取り（src/lib/ekichikaSokuhimeParse.ts）の自己点検（第213便）。
//   使い方: npm run check:sokuhimeparse
// ★ 生の HTML はまだ無い（トークンを含むため保存していない）。★ 2026-09-07 23:5x に DOM で確かめた形から組んだ見本。
// ★ _fixtures/ekichika_sokuhime.html を置いたら、末尾の突き合わせが自動で走る。

const path = require('path');
const fs = require('fs');
const v = require(path.join(__dirname, '..', '_tmpcheck', 'ekichikaSokuhimeParse.js'));
let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + name);
};

const box = (i, o) => o
  ? `<div id="setbox4" class="image-set-box droparea sokuiku_set_box sokuikuSetBoxList-item" data-girlid="${o.girl}" data-sokuikuid="${o.sid}">
      <div id="sokuiku_set0${i + 1}" class="sokuiku_image_set">
      <p class="setboxTitle1">即ヒメ-設定中</p>
      <p class="time_info sokuikuSetBoxList-item-timeInfo">[～ ${o.until} 迄]</p>
      <p class="timer on sokuikuSetBoxList-item-timer is-countdown" data-expired-at="${o.exp}">残り28分26秒</p>
      <div class="sokuikuSetBoxList-item-imgWrap"><img class="girlimage" src="x.jpg"></div>
      <p id="imgdel_toppriority" class="sokuikuDelBtn"><img alt="削除"></p>
      <input id="form_toppriority_girl_id" class="girl_id" type="hidden" value="${o.girl}" name="toppriority_girl_id">
      </div></div>`
  : `<div id="setbox4" class="image-set-box droparea sokuiku_set_box sokuikuSetBoxList-item" data-sokuikuid="">
      <div id="sokuiku_set0${i + 1}" class="sokuiku_image_set"><p class="setboxTitle1">即ヒメ-未設定</p><p class="time_info">&nbsp;</p></div></div>`;
const cell = (id, name, state) =>
  `<li id="${id}" class="girls-cell state-${state}"><p class="girl-name" data-sort="name">${name}</p><div class="girl-image"><img src="i.jpg"></div>
   <div class="girl-btn"><a href="/admin/girls/edit/${id}"><img alt="編集"></a><a href="/admin/girls/delete/${id}"><img alt="削除"></a></div></li>`;
const page = (o) => `<html><body><h1>即ヒメ設定画面</h1>
  <input type="hidden" id="hide_shop_id" value="37168"><input type="hidden" id="girl_pic_num" value="8">${o.count !== undefined ? `<input type="hidden" id="all_sokuiku_num" value="${o.count}">` : ''}
  <div id="girlControl" class="clearfix"></div>
  <p class="text"><span class="attend_fast">赤：即ヒメ!!設定中</span><span class="attend_now">ピンク：現在出勤中</span></p>
  <h2>出勤中女の子一覧</h2>
  <div id="girls-list"><ul id="girls-list-box" class="list">${(o.cells || []).join('')}</ul></div>
  <div id="girls-images-set" class="sokuiku sokuikuSetBoxList">${(o.boxes || []).map((b, i) => box(i, b)).join('')}</div>
  </body></html>`;

console.log('── 1. 実物の形（かな1名・枠5つ・1つ設定中）──');
const real = page({
  cells: [cell('5257770', 'かな', 'fast')],
  boxes: [{ girl: '5257770', sid: '851371885', until: '00:12', exp: '1788793939' }, null, null, null, null],
});
const p = v.parseEkichikaSokuhime(real);
eq('problems 無し', p.problems, []);
eq('使える', v.sokuhimePageUsable(p), true);
eq('枠は5つ', p.boxes.length, 5);
eq('枠1: castId・sokuikuId・切れる時刻・迄', p.boxes[0], { index: 0, girlId: '5257770', sokuikuId: '851371885', expiresAtUnix: 1788793939, untilLabel: '00:12' });
eq('枠2〜5は未設定', p.boxes.slice(1).every((b) => b.girlId === null && b.sokuikuId === null && b.expiresAtUnix === null), true);
eq('出勤中は1名・即ヒメ中', p.working, [{ castId: '5257770', name: 'かな', isSokuhime: true, raw: 'fast' }]);
eq('回数制ではない（#all_sokuiku_num が無い）', [p.countedPlan, p.remainingCount], [false, null]);
eq('使っている枠', v.sokuhimeUsed(p), 1);
eq('空いている枠の番号', v.sokuhimeFreeSlots(p), [1, 2, 3, 4]);
eq('1行', v.sokuhimeSummaryLabel(p), '即ヒメ枠 1/5（空き4）');
eq('切れている枠（今が 00:11）は無い', v.sokuhimeExpired(p, 1788793900).length, 0);
eq('切れている枠（今が 00:13）は1つ', v.sokuhimeExpired(p, 1788794000).map((b) => b.girlId), ['5257770']);

console.log('\n── 2. ★★★ 数を返して黙らない ──');
eq('ログイン画面は使えない', v.sokuhimePageUsable(v.parseEkichikaSokuhime('<html><form action="/admin/login">…</form></html>')), false);
eq('見出しが無ければ理由を言う', v.parseEkichikaSokuhime('<html></html>').problems.length > 0, true);
eq('枠が1つも無ければ使えない', v.sokuhimePageUsable(v.parseEkichikaSokuhime(page({ cells: [], boxes: [] }))), false);
eq('★ 出勤中0人は普通（problem にしない）', v.parseEkichikaSokuhime(page({ cells: [], boxes: [null, null, null] })).problems, []);
eq('★ 出勤中0人でも枠は読める', v.sokuhimeSummaryLabel(v.parseEkichikaSokuhime(page({ cells: [], boxes: [null, null, null] }))), '即ヒメ枠 0/3（空き3）');

console.log('\n── 3. ★★★ 番号の食い違いは使わない（削除で別人を外さない）──');
const bad = page({ cells: [cell('1', 'あ', 'fast')], boxes: [{ girl: '1', sid: '9', until: '01:00', exp: '1' }] })
  .replace('name="toppriority_girl_id"', 'name="toppriority_girl_id"').replace('type="hidden" value="1"', 'type="hidden" value="2"');
eq('data-girlid と hidden が違う枠は problem', v.parseEkichikaSokuhime(bad).problems.some((x) => x.includes('食い違う')), true);
eq('そのとき使えない', v.sokuhimePageUsable(v.parseEkichikaSokuhime(bad)), false);
const inconsistent = page({ cells: [cell('5', 'い', 'now')], boxes: [{ girl: '5', sid: '9', until: '01:00', exp: '1' }] });
eq('枠に居るのに一覧で即ヒメ中でない → problem', v.parseEkichikaSokuhime(inconsistent).problems.some((x) => x.includes('即ヒメ中になっていない')), true);

console.log('\n── 4. 回数制のプラン ──');
const counted = v.parseEkichikaSokuhime(page({ cells: [], boxes: [null, null], count: 3 }));
eq('回数制で残り3回', [counted.countedPlan, counted.remainingCount], [true, 3]);

console.log('\n── 5. 出勤中の一覧（複数・状態）──');
const multi = v.parseEkichikaSokuhime(page({ cells: [cell('10', 'あ', 'fast'), cell('11', 'い', 'now'), cell('12', 'う', 'now')], boxes: [{ girl: '10', sid: '1', until: '02:00', exp: '5' }, null] }));
eq('3名', multi.working.map((w) => w.name), ['あ', 'い', 'う']);
eq('即ヒメ中は1名', multi.working.filter((w) => w.isSokuhime).map((w) => w.castId), ['10']);
eq('知らない state は raw に残す', v.parseEkichikaSokuhime(page({ cells: [cell('13', 'え', 'later')], boxes: [null] })).working[0].raw, 'later');
eq('同じ castId が2回出たら problem', v.parseEkichikaSokuhime(page({ cells: [cell('13', 'え', 'now'), cell('13', 'え', 'now')], boxes: [null] })).problems.length > 0, true);

// ── 6. ★★ 実物との突き合わせ（置いてあれば）──
const fx = path.join(__dirname, '..', '_fixtures', 'ekichika_sokuhime.html');
if (fs.existsSync(fx)) {
  console.log('\n── 6. ★★ 実物 _fixtures/ekichika_sokuhime.html ──');
  const r = v.parseEkichikaSokuhime(fs.readFileSync(fx, 'utf8'));
  eq('実物: problems 無し', r.problems, []);
  eq('実物: 枠が読めた', r.boxes.length > 0, true);
  console.log('   実物: ' + v.sokuhimeSummaryLabel(r) + ' 出勤中 ' + r.working.length + '名 回数制=' + r.countedPlan);
} else {
  console.log('\n（実物の _fixtures/ekichika_sokuhime.html は無いので突き合わせは飛ばした）');
}

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
