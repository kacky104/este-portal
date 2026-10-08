// 駅ちかの上位表示（src/lib/ekichikaBump.ts）の自己点検（第1305便・2026-10-08）。
//
// ★★★ ここで見張っているのは:
//   ① 駅ちかの管理画面トップから、残り回数・1日の回数・最終更新日・店舗番号を読めること
//   ② 送る本文が、駅ちかの画面が送るのと一字一句同じこと（shop_id が無いと 204 で何も起きない）
//   ③ 自動の押し方: 区切りごとに1回・手で押した直後は押さない・残り0回は押さない・読めないときは押さない
//   ④ 10:00〜23:00・20分ごと（ラビリンス様）で、1日ちょうど40回になること（5分ごとの周で試す）
//
//   使い方:  npm run check:ekichikabump

const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'ekichikaBump.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
/** 日本時間の年月日時分 → Date */
const jst = (y, mo, d, h, mi, s = 0) => new Date(Date.UTC(y, mo - 1, d, h - 9, mi, s));

console.log('── 1. ★★★ 管理画面トップを読む（2026-10-08 の実物と同じ形）──');
{
  const html = `
    <div class="all_disp clearfix">
      <div class="all_disp_child">
        <div class="all_disp_num">
          <span class="remaining_disp_num">38</span>/<span class="bulk_top_num">40</span>回
        </div>
        <ul class="last_disp_date_area"><li>最終更新日:</li><li class="last_disp_date">2026年10月08日 12:37:21</li></ul>
      </div>
      <div class="all_disp_child2"><div class="all_disp_button"><img src="x/ranking_up.jpg"></div></div>
    </div>
    <input type="hidden" name="shopid" id="hide_shop_id" value="12345">`;
  const t = m.parseEkichikaBumpTop(html);
  eq('残り・1日の回数・最終更新日（日本時間→UTC）・店舗番号', [t.remaining, t.quota, t.lastAt, t.shopId, t.problems], [38, 40, '2026-10-08T03:37:21.000Z', '12345', []]);
  eq('使える', m.bumpTopUsable(t), true);
  const t2 = m.parseEkichikaBumpTop('<input value="777" id="hide_shop_id" type="hidden"><span class="x remaining_disp_num y"> 0 </span><span class="bulk_top_num">40</span><li class="last_disp_date"></li>');
  eq('属性の順が違っても・残り0回・最終更新日が空（一度も押していない）', [t2.remaining, t2.shopId, t2.lastAt, t2.problems], [0, '777', null, []]);
  const t3 = m.parseEkichikaBumpTop('<html><body>ログイン</body></html>');
  eq('★★ 読めないときは使えない（押しに行かない）', [m.bumpTopUsable(t3), t3.problems.length >= 2], [false, true]);
  eq('時刻の読み方', [m.parseEkichikaBumpTime('2026年10月08日 00:05:00'), m.parseEkichikaBumpTime('2026/10/08 12:37'), m.parseEkichikaBumpTime('あ')], ['2026-10-07T15:05:00.000Z', '2026-10-08T03:37:00.000Z', null]);
}

console.log('\n── 2. ★★★ 送る本文と応答 ──');
{
  eq('★★★ 駅ちかの画面が送るのと一字一句同じ（.userid / .unit_type は無いので undefined）', m.buildEkichikaBumpBody('12345'), 'id=undefined&key=undefined&shop_id=12345');
  eq('送り先', [m.EKICHIKA_BUMP_URL, m.EKICHIKA_ADMIN_TOP_URL], ['https://ranking-deli.jp/admin/bulktop/create.json', 'https://ranking-deli.jp/admin']);
  eq('★★ 204（shop_id が無いときの応答）は押せていない', m.parseEkichikaBumpResult(204, '').ok, false);
  eq('通った（残り回数と最終更新日が返る）', m.parseEkichikaBumpResult(200, '{"all_display_num":37,"disp_num_time":"2026年10月08日 12:57:21"}'), { ok: true, remaining: 37, lastAt: '2026-10-08T03:57:21.000Z', message: null });
  eq('数字が文字で返っても読む', m.parseEkichikaBumpResult(200, '{"all_display_num":"36"}').remaining, 36);
  const ng = m.parseEkichikaBumpResult(200, '{"text":"本日の上位表示回数を超えています。https://ranking-deli.jp/x"}');
  eq('★ だめだったとき: 相手の文を短く・宛先（URL）は落として残す', [ng.ok, ng.message], [false, '本日の上位表示回数を超えています。']);
  eq('JSON でない・HTTP エラー', [m.parseEkichikaBumpResult(200, '<html>').ok, m.parseEkichikaBumpResult(500, '{}').message], [false, 'HTTP 500']);
}

console.log('\n── 3. ★★★ 自動の押し方（10:00〜23:00・20分ごと）──');
{
  const setting = { enabled: true, startMin: 600, endMin: 1380, intervalMin: 20 };
  const st = (o = {}) => ({ lastAt: null, remaining: 30, readAt: null, autoAt: null, ...o });
  const at = (h, mi, o, read) => m.shouldBumpNow({ now: jst(2026, 10, 8, h, mi), setting, state: st(o), atRead: read === true }).reason;
  eq('1日の区切りの数 ＝ 40（ちょうど駅ちかの回数）', m.bumpSlotsPerDay(setting), 40);
  eq('いまの区切り（10:24 → 10:20）', m.currentBumpSlotAt(jst(2026, 10, 8, 10, 24, 30), setting), jst(2026, 10, 8, 10, 20).toISOString());
  eq('時間帯の外は押さない（9:59・23:10）／23:00 ちょうど・おわりの区切りを23:04 に押すのはよい', [at(9, 59), at(23, 10), at(23, 0), at(23, 4)], ['out_of_window', 'out_of_window', 'ok', 'ok']);
  eq('★ おわりのあとに新しい区切りは作らない（23:00 で押したあと 23:05 は押さない）', at(23, 5, { lastAt: jst(2026, 10, 8, 23, 1).toISOString() }), 'already_this_slot');
  eq('昨日押したきり → 10:04 に押す', at(10, 4, { lastAt: jst(2026, 10, 7, 22, 40).toISOString() }), 'ok');
  eq('★★ この区切りでもう押した（10:01）→ 10:04 は押さない', at(10, 4, { lastAt: jst(2026, 10, 8, 10, 1).toISOString() }), 'already_this_slot');
  eq('次の区切り（10:20）→ 10:24 に押す', at(10, 24, { lastAt: jst(2026, 10, 8, 10, 5).toISOString() }), 'ok');
  eq('★★★ 店舗様が駅ちかで 10:15 に手で押した → 10:24 は押さない（9分しか経っていない＝回数を2つ使うのを防ぐ）', at(10, 24, { lastAt: jst(2026, 10, 8, 10, 15).toISOString() }), 'too_soon');
  eq('　→ 次の区切り 10:44 には押す', at(10, 44, { lastAt: jst(2026, 10, 8, 10, 15).toISOString() }), 'ok');
  // ★★★ 第1311便: 0回を読んだら、次の時間帯のはじめ（10:00）まで見に行かない（前は60分ごとに見に行っていた）
  eq('★★★ 21:20 に0回を読んだ → 22:24・23:04 は見に行かない', [at(22, 24, { remaining: 0, readAt: jst(2026, 10, 8, 21, 20).toISOString() }), at(23, 4, { remaining: 0, readAt: jst(2026, 10, 8, 21, 20).toISOString() })], ['no_quota', 'no_quota']);
  eq('★★★ 11:03 に0回を読んだ → 12:04 も見に行かない（前は61分で見に行っていた）', at(12, 4, { remaining: 0, readAt: jst(2026, 10, 8, 11, 3).toISOString() }), 'no_quota');
  eq('★★★ 前の日の 21:20 に0回 → 翌朝 10:04 には見に行く', m.shouldBumpNow({ now: jst(2026, 10, 9, 10, 4), setting, state: st({ remaining: 0, readAt: jst(2026, 10, 8, 21, 20).toISOString(), lastAt: jst(2026, 10, 8, 21, 20).toISOString() }) }).reason, 'ok');
  eq('戻る時刻: 21:20 → 翌10:00／9:00 → 同じ日の10:00／ちょうど10:00 → 翌10:00／読めない → null', [
    m.bumpZeroResumeAt(jst(2026, 10, 8, 21, 20, 30).toISOString(), 600),
    m.bumpZeroResumeAt(jst(2026, 10, 8, 9, 0).toISOString(), 600),
    m.bumpZeroResumeAt(jst(2026, 10, 8, 10, 0, 5).toISOString(), 600),
    m.bumpZeroResumeAt(null, 600),
  ], [jst(2026, 10, 9, 10, 0).toISOString(), jst(2026, 10, 8, 10, 0).toISOString(), jst(2026, 10, 9, 10, 0).toISOString(), null]);
  eq('★ 0回でも、読んだ時刻が無ければ待たせない（「読めていない」と混ぜない）', at(12, 4, { remaining: 0, readAt: null }), 'ok');
  eq('★★ 読んだ直後の残り0回は押さない', at(12, 4, { remaining: 0, readAt: jst(2026, 10, 8, 12, 4).toISOString() }, true), 'no_quota');
  eq('周が流れを始めて2分 → 始めない／読んだあとは見ない', [at(12, 4, { autoAt: jst(2026, 10, 8, 12, 2).toISOString() }), at(12, 4, { autoAt: jst(2026, 10, 8, 12, 2).toISOString() }, true)], ['running', 'ok']);
  eq('★ 時刻が読めないときは押さない', at(12, 4, { lastAt: 'x' }), 'unknown');
  eq('止めている・設定が壊れている', [m.shouldBumpNow({ now: jst(2026, 10, 8, 12, 4), setting: { ...setting, enabled: false }, state: st() }).reason, m.shouldBumpNow({ now: jst(2026, 10, 8, 12, 4), setting: { ...setting, intervalMin: 7 }, state: st() }).reason], ['off', 'bad_setting']);
  const night = { enabled: true, startMin: 22 * 60, endMin: 2 * 60, intervalMin: 30 };
  eq('日をまたぐ時間帯（22:00〜翌2:00・30分）: 1:10 の区切りは 1:00', m.currentBumpSlotAt(jst(2026, 10, 9, 1, 10), night), jst(2026, 10, 9, 1, 0).toISOString());
}

console.log('\n── 4. ★★★ 1日まわしてみる（5分ごとの周・区切りの4分後・押せたら最終更新日がその時刻になる）──');
{
  const setting = { enabled: true, startMin: 600, endMin: 1380, intervalMin: 20 };
  let state = { lastAt: null, remaining: 40, readAt: null, autoAt: null };
  let pressed = 0;
  for (let t = jst(2026, 10, 8, 6, 4).getTime(); t < jst(2026, 10, 9, 6, 0).getTime(); t += 5 * 60000) {
    const now = new Date(t);
    const j = m.shouldBumpNow({ now, setting, state });
    if (!j.bump) continue;
    // 流れの中で読み直して決め直す（1分後）
    const later = new Date(t + 60000);
    const j2 = m.shouldBumpNow({ now: later, setting, state: { ...state, autoAt: null }, atRead: true });
    state = { ...state, autoAt: now.toISOString() };
    if (!j2.bump) continue;
    pressed++;
    state = { ...state, lastAt: later.toISOString(), remaining: state.remaining - 1, readAt: later.toISOString() };
  }
  eq('★★★ 10:00〜23:00・20分ごと → ちょうど40回押して、残り0回', [pressed, state.remaining], [40, 0]);
}

console.log('\n── 5. ★★ ソースの見張り ──');
{
  const retry = read('src', 'lib', 'relayRetry.ts');
  const noRetry = retry.slice(retry.indexOf('export const NO_RETRY_PURPOSES'), retry.indexOf('export function isRetrySafePurpose'));
  const safe = retry.slice(retry.indexOf('export const RETRY_SAFE_PURPOSES'), retry.indexOf('export const NO_RETRY_PURPOSES'));
  eq('★★★ 押す段（bump_set）は送り直さない側・読む段（read_bump）は送り直してよい側', [noRetry.includes("'bump_set'"), safe.includes("'read_bump'")], [true, true]);
  const consent = read('src', 'lib', 'mediaConsent.ts');
  const writes = consent.slice(consent.indexOf('export const RELAY_WRITE_INTENTS'), consent.indexOf('export function relayIntentNeedsWriteConsent'));
  eq('★★ 上位表示の流れは「書き換える流れ」（コネックエフの文への同意・切り替え済みが要る）', ["'bump_auto'", "'bump_push'"].every((x) => writes.includes(x)), true);
  const route = read('src', 'app', 'api', 'admin', 'ekichika-bump', 'route.ts');
  eq('周は apply が無ければ何も積まない・判断は shouldBumpNow', [route.includes('const apply = body.apply === true;'), route.includes('shouldBumpNow(')], [true, true]);
  const wait = read('src', 'lib', 'relayWait.ts');
  eq('★ 上位表示は順番待ちにしない（遅れて押しても意味が薄い）', /'bump_(auto|push)'/.test(wait), false);
  const sql = read('追加SQL_第1305便_駅ちかの上位表示の自動_2026-10-08.sql');
  eq('★ SQL の間隔の選択肢が lib と同じ', sql.includes('bump_interval_min in (' + [...m.EKICHIKA_BUMP_INTERVALS].join(', ') + ')'), true);
}

console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
