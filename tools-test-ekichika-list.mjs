// src/lib/ekichikaListParse.ts のテスト（第39便）。
//
//   node --test tools-test-ekichika-list.mjs
//
// ★★★ このテストは【本物の代わりにはならない】（第38便 §8-2 の禁則候補）。
//   fixture は自分が理解した形しか再現しない。理解が間違っている部分は fixture にも入らない。
//   実物での確認は tools-check-ekichika-list-html.mjs で行うこと。
//   ★ ここに置いてあるのは「一度実物で分かった落とし穴を、二度と踏まないための止め具」。

import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

register('./tools-ts-resolve.mjs', import.meta.url);

const { parseEkichikaList } = await import('./src/lib/ekichikaListParse.ts');

const EXT = '46440';

// 実物（2026-08-27 20:41 ラビリンス掲載A）から写した形。
//   ★ 外側 <div class="waiting sokuiku ..."> は【全員に付いている】。
//     休みの子にも付くので、ここを見て即ヒメを判定してはいけない。
function box(castId, name, waitingOuter, contClass, contInner, attendIco) {
  return `<li class="girl-box">
  <figure><div class="figure-inner clearfix">
    <a href="/fukuoka/area175/style8/${EXT}/${castId}/">
      <div class="figure-front">
        <div class="image p-imgWrap"><img src="x.jpg">${attendIco ?? ''}</div>
        <div class="detail">
          <p class="bust-size">D</p>
          <p class="data-name ellipsis">${name}<span class="age">(23)</span></p>
          <p class="data-size ellipsis">T:150 B:84 W:55 H:88</p>
        </div>
        <div class="${waitingOuter}">
          <ul>
            <li class="waiting-icon"><img src="y.svg"></li>
            <li class="waiting-cont ${contClass}">${contInner}</li>
          </ul>
        </div>
      </div>
    </a>
  </div></figure>
</li>`;
}

const HTML = [
  // 即ヒメ（実物: るい）
  box('5232190', 'るい', 'waiting sokuiku ', 'sokuiku', '17:00<span> ▶︎ </span>00:00',
      '<p class="attend-ico sokuiku"><span>即ヒメ!!</span></p>'),
  // 本日出勤（実物: 愛）
  box('5277339', 'あい', 'waiting sokuiku ', 'today', '12:00<span> ▶︎ </span>19:00',
      '<p class="attend-ico today"><span>本日出勤</span></p>'),
  // 休み・要TEL（実物: 22人がこの形）★ 外側に sokuiku が付いていることに注目
  box('5232196', 'えま', 'waiting sokuiku  normal ', 'normal', '要TEL', null),
  // 休み・空
  box('5551020', 'もえ', 'waiting sokuiku  normal ', 'normal', '', null),
  // 始発姫（出勤開始から1時間以内に即ヒメ設定した子＝即ヒメの一種）
  box('5733955', 'ゆい', 'waiting sokuiku ', 'shihatu', '20:00<span> ▶︎ </span>02:00', null),
].join('\n');

const casts = parseEkichikaList(HTML, EXT);
const by = (id) => casts.find((c) => c.castId === id);

test('5人ぶん読める', () => {
  assert.equal(casts.length, 5);
});

test('★★★ 外側の <div class="waiting sokuiku"> で即ヒメを判定しない（休みの子にも付いている）', () => {
  // ここが壊れると在籍全員が即ヒメになる。第39便で実物を通して分かった落とし穴。
  assert.equal(by('5232196').sokuhime, false, '要TELの休みが即ヒメになっている');
  assert.equal(by('5551020').sokuhime, false, '空の休みが即ヒメになっている');
  assert.equal(casts.filter((c) => c.sokuhime).length, 2, '即ヒメは るい と ゆい の2人だけ');
});

test('waiting-cont sokuiku は即ヒメ', () => {
  assert.equal(by('5232190').sokuhime, true);
  assert.equal(by('5232190').status, 'work');
  assert.equal(by('5232190').start, '17:00');
  assert.equal(by('5232190').end, '00:00');
});

test('始発姫（shihatu）も即ヒメとして扱う', () => {
  // 管理画面の説明: 出勤開始から1時間の間に即ヒメ設定をすると「始発姫」と表示される
  assert.equal(by('5733955').sokuhime, true);
  assert.equal(by('5733955').status, 'work');
});

test('本日出勤（today）は即ヒメではない', () => {
  assert.equal(by('5277339').sokuhime, false);
  assert.equal(by('5277339').status, 'work');
});

test('★ 要TEL は休み（2026-08-27 オーナー様に確認済み）', () => {
  assert.equal(by('5232196').status, 'off');
  assert.equal(by('5232196').start, null);
  assert.equal(by('5232196').end, null);
});

test('即ヒメの子は必ず出勤（駅ちかの仕様：即ヒメ設定できるのは出勤中の子のみ）', () => {
  for (const c of casts.filter((x) => x.sokuhime)) {
    assert.equal(c.status, 'work', `${c.name} が即ヒメなのに出勤ではない`);
  }
});

test('waiting-cont が無ければ触らない（unknown）', () => {
  const broken = `<li class="girl-box"><figure><div class="figure-inner">
    <a href="/fukuoka/area175/style8/${EXT}/9999999/">
      <p class="data-name ellipsis">なぞ<span class="age">(20)</span></p>
      <div class="waiting sokuiku "><ul><li class="dokoka-chigau">12:00 ▶︎ 19:00</li></ul></div>
    </a></div></figure></li>`;
  const [c] = parseEkichikaList(broken, EXT);
  assert.equal(c.status, 'unknown');
  assert.equal(c.sokuhime, false, '読めないものを即ヒメにしない');
});
