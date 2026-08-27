// src/lib/ekichikaWorkParse.ts のテスト（第38便）。
//
//   node --test tools-test-ekichika-work.mjs
//   （型注釈は Node が剥がす。古い Node なら --experimental-strip-types を付ける）
//
// ★ .mjs にしてあるのは tsconfig の対象から外して `next build` に混ぜないため。
// ★ 依存を足していない（node:test / node:assert だけ）。

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WORK_DAYS,
  parseWorkPage,
  checkWorkPage,
  assertWorkPage,
  assertTodayIsIndex0,
  applyChanges,
  buildPayload,
  encodePayload,
  assertWithinInputVars,
  countWorkingByDay,
  verifyAfterWrite,
  ekichikaTimeToMinutes,
  minutesToEkichikaTime,
} from './src/lib/ekichikaWorkParse.ts';

// ── 実物の並びに合わせた fixture（2026-08-27 に /admin/girlswork/ から採取した形）──

const DATES = ['08/27(木)', '08/28(金)', '08/29(土)', '08/30(日)', '08/31(月)', '09/01(火)', '09/02(水)'];

function header(counts) {
  const dls = DATES.map(
    (d, i) => `<dl><dt class="x"> <span>${d}</span> </dt><dd><span class="y">${counts[i]}</span></dd></dl>`,
  );
  return `<div><dl><dt><span>日付</span></dt><dd><span>出勤人数</span></dd></dl>${dls.join('')}</div>`;
}

// cells: 7件の {start,end,work}
function girlBlock(girlId, name, cells) {
  const days = cells.map((c, d) => {
    const gid = d === 0 ? `<input name="girl_work[${girlId}][0][girl_id]" value="${girlId}" type="hidden">` : '';
    const flg = `<input name="girl_work[${girlId}][${d}][work_flg]" value="1"${c.work ? ' checked="checked"' : ''} type="checkbox"><label>出勤</label>`;
    return `<li><div>${gid}
      <select class="s" name="girl_work[${girlId}][${d}][start_time]">
        <optgroup><option value="00:00">0:00</option>
        <option value="${c.start}" selected="selected">${c.start}</option></optgroup>
      </select> ～
      <select class="s" name="girl_work[${girlId}][${d}][end_time]">
        <optgroup><option value="${c.end}" selected="selected">disp</option>
        <option value="47:30">23:30</option></optgroup>
      </select>
      <div>${flg}</div>
    </div></li>`;
  });
  return `<ul><li><p></p><span class="name">${name}</span></li>${days.join('')}</ul>`;
}

function pageHtml(girls, counts) {
  return `<!DOCTYPE html><html><body>
    <form action="https://cocoa-job.jp/entry/login/" method="post"><input name="email" type="hidden" value="x"></form>
    <form action="https://ranking-deli.jp/admin/girlswork" method="post" id="frmSearch"><input type="hidden" name="search" value="1"></form>
    <form id="frmfix" action="https://ranking-deli.jp/admin/girlswork/1/" accept-charset="utf-8" method="post">
      <input type="hidden" name="fuel_csrf_token" value="${'a'.repeat(128)}">
      ${header(counts)}
      ${girls.map((g) => girlBlock(g.girlId, g.name, g.cells)).join('')}
      <input name="work_btn" value="" type="submit">
    </form></body></html>`;
}

const OFF = { start: '00:00', end: '00:00', work: false };
const NIGHT = { start: '20:00', end: '27:00', work: true }; // ★ 27:00 = 翌3時
const DAY = { start: '10:00', end: '19:00', work: true };

function sampleGirls() {
  return [
    { girlId: '5232208', name: 'さら', cells: [OFF, NIGHT, NIGHT, OFF, OFF, OFF, OFF] },
    { girlId: '5232190', name: 'るい', cells: [DAY, OFF, DAY, OFF, OFF, OFF, OFF] },
  ];
}

const SAMPLE_COUNTS = [1, 1, 2, 0, 0, 0, 0];
const SAMPLE_HTML = pageHtml(sampleGirls(), SAMPLE_COUNTS);

// ────────────────────────────── 時刻 ──────────────────────────────

test('24時超えの時刻を潰さない', () => {
  assert.equal(ekichikaTimeToMinutes('27:00'), 27 * 60);
  assert.equal(minutesToEkichikaTime(27 * 60), '27:00');
  assert.notEqual(ekichikaTimeToMinutes('27:00'), ekichikaTimeToMinutes('03:00'));
  assert.throws(() => ekichikaTimeToMinutes('3時'), /時刻表記ではない/);
  assert.throws(() => ekichikaTimeToMinutes('48:00'), /範囲外/);
});

// ────────────────────────────── パース ──────────────────────────────

test('出勤管理ページを読める', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  assert.equal(page.csrfToken.length, 128);
  assert.equal(page.action, 'https://ranking-deli.jp/admin/girlswork/1/');
  assert.deepEqual(page.dateLabels, DATES);
  assert.deepEqual(page.headerCounts, SAMPLE_COUNTS);
  assert.equal(page.girls.length, 2);
  assert.deepEqual(page.girls.map((g) => g.girlId), ['5232208', '5232190']); // 並び順を保つ
  assert.equal(page.girls[0].name, 'さら');
  assert.deepEqual(page.girls[0].days[1], { start: '20:00', end: '27:00', work: true });
  assert.equal(page.girls[0].days[0].work, false);
  assert.equal(checkWorkPage(page).length, 0);
});

test('★ 検索フォーム(frmSearch)を送信先と取り違えない', () => {
  // 実物では girlswork を含む form が2本あり、検索の方が先に出てくる。
  // そこへ投げても【何も起きない】ので、静かに外れる形の事故になる。
  const page = parseWorkPage(SAMPLE_HTML);
  assert.equal(page.action, 'https://ranking-deli.jp/admin/girlswork/1/');
  assert.equal(checkWorkPage(page).length, 0);

  // id が取れなくても、番号付きの action で拾える
  const noId = SAMPLE_HTML.replace('id="frmfix"', 'id="renamed"');
  assert.equal(parseWorkPage(noId).action, 'https://ranking-deli.jp/admin/girlswork/1/');

  // 検索フォームしか無ければ「送信先が更新用に見えない」と言う
  const searchOnly = SAMPLE_HTML.replace('https://ranking-deli.jp/admin/girlswork/1/', 'https://ranking-deli.jp/admin/girlswork');
  assert.ok(checkWorkPage(parseWorkPage(searchOnly)).some((p) => /送信先が更新用に見えない/.test(p)));
});

test('読めていないページは checkWorkPage が言う', () => {
  const broken = SAMPLE_HTML.replace('name="fuel_csrf_token"', 'name="dummy"');
  const problems = checkWorkPage(parseWorkPage(broken));
  assert.ok(problems.some((p) => /fuel_csrf_token/.test(p)));
  assert.throws(() => assertWorkPage(parseWorkPage(broken)), /読めていない/);

  const noGirls = pageHtml([], SAMPLE_COUNTS);
  assert.ok(checkWorkPage(parseWorkPage(noGirls)).some((p) => /1人も取れていない/.test(p)));
});

// ───────────────── ★ 深夜またぎ（POSTに日付が入らない件） ─────────────────

test('日付がずれていたら送らせない', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  assert.doesNotThrow(() => assertTodayIsIndex0(page, '2026-08-27'));
  assert.throws(() => assertTodayIsIndex0(page, '2026-08-28'), /日付がずれている/);
});

// ────────────────────── 差し替え（read-modify-write） ──────────────────────

test('知らない girlId への変更は例外にする', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  assert.throws(
    () => applyChanges(page, [{ girlId: '4624191', dayIndex: 0, cell: DAY }]),
    /掲載枠ごとに別/,
  );
});

test('変更しない行はそのまま持ち回る（消さない）', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  const girls = applyChanges(page, [{ girlId: '5232208', dayIndex: 0, cell: DAY }]);
  assert.equal(girls.length, 2);
  assert.deepEqual(girls[0].days[0], DAY);
  assert.deepEqual(girls[1].days, page.girls[1].days); // 触っていない子は元のまま
  assert.equal(page.girls[0].days[0].work, false); // 元のページは書き換わらない
});

test('日の添え字と時刻を検算する', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  assert.throws(() => applyChanges(page, [{ girlId: '5232208', dayIndex: 7, cell: DAY }]), /範囲外/);
  assert.throws(
    () => applyChanges(page, [{ girlId: '5232208', dayIndex: 0, cell: { start: '朝', end: '19:00', work: true } }]),
    /時刻表記ではない/,
  );
});

// ────────────────────────── 送信内容 ──────────────────────────

test('休みは work_flg のキーごと出さない', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  const fields = buildPayload(page, page.girls);
  const names = fields.map(([k]) => k);
  assert.ok(names.includes('girl_work[5232208][1][work_flg]')); // 出勤の日
  assert.ok(!names.includes('girl_work[5232208][0][work_flg]')); // 休みの日
  assert.equal(names.filter((n) => /\[girl_id\]$/.test(n)).length, 2); // 日0だけ
  assert.equal(names[0], 'fuel_csrf_token');
  assert.equal(names[names.length - 1], 'work_btn');
  assert.match(encodePayload(fields), /girl_work%5B5232208%5D%5B1%5D%5Bstart_time%5D=20%3A00/);
});

test('★ max_input_vars を超える規模なら送らせない', () => {
  // 37人 → 実測の 818 フィールドと同じ規模。全員全日出勤なら N*22+2
  const many = Array.from({ length: 37 }, (_, i) => ({
    girlId: String(6000000 + i),
    name: 'g' + i,
    cells: Array.from({ length: WORK_DAYS }, () => NIGHT),
  }));
  const page37 = parseWorkPage(pageHtml(many, [37, 37, 37, 37, 37, 37, 37]));
  const f37 = buildPayload(page37, page37.girls);
  assert.equal(f37.length, 37 * 22 + 2);
  assert.doesNotThrow(() => assertWithinInputVars(f37));

  const hundred = Array.from({ length: 100 }, (_, i) => ({
    girlId: String(7000000 + i),
    name: 'g' + i,
    cells: Array.from({ length: WORK_DAYS }, () => NIGHT),
  }));
  const page100 = parseWorkPage(pageHtml(hundred, [100, 100, 100, 100, 100, 100, 100]));
  const f100 = buildPayload(page100, page100.girls);
  assert.ok(f100.length > 1000);
  assert.throws(() => assertWithinInputVars(f100), /黙って捨てられ/);
});

// ────────────────────── ★ write-then-verify ──────────────────────

test('そのまま入っていれば ok', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  const girls = applyChanges(page, []);
  const after = parseWorkPage(pageHtml(sampleGirls(), countWorkingByDay(girls)));
  const r = verifyAfterWrite(girls, after, { expectedDateLabels: page.dateLabels });
  assert.deepEqual(r.problems, []);
  assert.equal(r.ok, true);
});

test('★ 切り捨てられたら人数で気づく', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  const girls = applyChanges(page, []);
  // 後ろの1人が捨てられた（max_input_vars の症状）
  const truncated = parseWorkPage(pageHtml(sampleGirls().slice(0, 1), [1, 1, 1, 0, 0, 0, 0]));
  const r = verifyAfterWrite(girls, truncated);
  assert.equal(r.ok, false);
  assert.ok(r.problems.some((p) => p.kind === 'girl_count_mismatch'));
  assert.ok(r.problems.some((p) => p.kind === 'girl_missing' && /5232190/.test(p.detail)));
});

test('中身が違えばセル単位で言う', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  const girls = applyChanges(page, [{ girlId: '5232208', dayIndex: 0, cell: DAY }]);
  const after = parseWorkPage(pageHtml(sampleGirls(), [2, 1, 2, 0, 0, 0, 0])); // 反映されなかった
  const r = verifyAfterWrite(girls, after);
  assert.ok(r.problems.some((p) => p.kind === 'cell_mismatch' && /さら/.test(p.detail)));
});

test('★ 画面の日別人数は独立した第2の目', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  const girls = applyChanges(page, []);
  // セルは全部合っているのに、画面の集計だけ食い違う
  const after = parseWorkPage(pageHtml(sampleGirls(), [1, 1, 9, 0, 0, 0, 0]));
  const r = verifyAfterWrite(girls, after);
  assert.equal(r.ok, false);
  assert.ok(r.problems.every((p) => p.kind === 'header_count_mismatch'));
  assert.match(r.problems[0].detail, /08\/29\(土\)/);
});

test('送信をまたいで日付が変わっていたら言う', () => {
  const page = parseWorkPage(SAMPLE_HTML);
  const girls = applyChanges(page, []);
  const shifted = pageHtml(sampleGirls(), countWorkingByDay(girls)).replace('08/27(木)', '08/28(金)');
  const r = verifyAfterWrite(girls, parseWorkPage(shifted), { expectedDateLabels: page.dateLabels });
  assert.ok(r.problems.some((p) => p.kind === 'date_shifted'));
});
