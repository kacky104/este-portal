// フクエスの出勤 → エステラブの形（src/lib/esuloveWork.ts）の自己点検（第74便）。
//
// ★★★ なぜ要るか
//   ここを間違えると【丸1日ずれた枠】や【実際より長い出勤】を、店舗の掲載に送り込む。
//   ★ 実物で確かめた形（追記48 §258〜§259）を、そのまま点検として固定する。
//
//   使い方:  npm run check:esulovework

const w = require(require('path').join(__dirname, '..', '_tmpcheck', 'esuloveWork.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w2 = JSON.stringify(want);
  if (g !== w2) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w2); fail++; }
  else console.log('ok ' + name);
};
const S = (start, end, dateISO) => w.toEsuloveShift({ dateISO: dateISO || '2026-08-31', start, end });

// ── 値の形（実物：600=6:00 … 3000=翌6:00・30分刻み）──
eq('6:00 は 600', w.toEsuloveTimeValue(6 * 60), '600');
eq('20:30 は 2030', w.toEsuloveTimeValue(20 * 60 + 30), '2030');
eq('翌3:30 は 2730', w.toEsuloveTimeValue(27 * 60 + 30), '2730');
eq('翌6:00 は 3000', w.toEsuloveTimeValue(30 * 60), '3000');
// ★ 範囲の外・刻みの外は「送れない」と言い切る。端へ寄せない
eq('5:30 は選べない（6:00 より前）', w.toEsuloveTimeValue(5 * 60 + 30), null);
eq('翌6:30 は選べない', w.toEsuloveTimeValue(30 * 60 + 30), null);
eq('15分は選べない', w.toEsuloveTimeValue(20 * 60 + 15), null);

// ── 日付 ──
eq('YYYY-MM-DD → YYYYMMDD', w.toEsuloveDay('2026-08-31'), '20260831');
eq('形が違えば null', w.toEsuloveDay('2026/08/31'), null);

// ── ふつうの夜勤 ──
eq('20:00〜03:00 → 2000〜2700', [S('20:00', '03:00').start, S('20:00', '03:00').end], ['2000', '2700']);
eq('日はずらさない（営業日そのまま）', S('20:00', '03:00').day, '20260831');
eq('昼の勤務 10:00〜18:00', [S('10:00', '18:00').start, S('10:00', '18:00').end], ['1000', '1800']);

// ── ★★★ 6:00 より前の開始は「翌」（丸1日ずれさせない）──
//   フクエスの営業日は朝6時始まり。schedule_date=8/31 の 03:00 は【翌3:00】の意味
eq('03:00〜05:00 → 2700〜2900', [S('03:00', '05:00').start, S('03:00', '05:00').end], ['2700', '2900']);
eq('その日も 8/31 のまま', S('03:00', '05:00').day, '20260831');
// ★ 6:00 ちょうどはそのまま（境界）
eq('06:00〜12:00 → 600〜1200', [S('06:00', '12:00').start, S('06:00', '12:00').end], ['600', '1200']);
// ★ 5:59 は前日側ではなく「翌5:59」。寄せて 2930
eq('05:00〜05:30 → 2900〜2930', [S('05:00', '05:30').start, S('05:00', '05:30').end], ['2900', '2930']);

// ── 30分刻みへ内側に寄せる（timeSnap 共用）──
eq('20:15〜02:45 → 2030〜2630', [S('20:15', '02:45').start, S('20:15', '02:45').end], ['2030', '2630']);
eq('★ 寄せたことを言葉で残す', S('20:15', '02:45').snappedNote, '20:15〜26:45 → 20:30〜26:30');
eq('寄せていなければ null', S('20:00', '03:00').snappedNote, null);
// ★ 寄せると勤務が無くなるものは送らない（時間を足さない）
eq('20:15〜20:30 は送らない', S('20:15', '20:30').ok, false);

// ── 範囲の外は送らない（★ 端へ寄せない）──
eq('20:00〜翌6:30 は送らない', S('20:00', '06:30').ok, false);
eq('その理由に範囲を書く', /6:00〜翌6:00/.test(S('20:00', '06:30').reason), true);

// ── 壊れた入力 ──
eq('開始と終了が同じなら送らない', S('20:00', '20:00').ok, false);
eq('時刻の形が違えば送らない', S('2000', '03:00').ok, false);
eq('日付の形が違えば送らない', S('20:00', '03:00', '2026/08/31').ok, false);

// ── 送る中身（★ 送る行だけ。全件送りにしない）──
const rows = [
  { castId: '696450', day: '20260831', start: '2000', end: '2700' },
  { castId: '696451', day: '20260831', start: '1800', end: '2400', existingId: '12345' },
];
const body = w.buildEsuloveWorkBody('37865', rows);
eq('1行目の therapist_id', body['TherapistSchedules[0][therapist_id]'], '696450');
eq('1行目の day', body['TherapistSchedules[0][day]'], '20260831');
eq('1行目の start/end', [body['TherapistSchedules[0][start_time]'], body['TherapistSchedules[0][end_time]']], ['2000', '2700']);
eq('shop_id が入る', body['TherapistSchedules[0][shop_id]'], '37865');
// ★ 既存の行IDが無ければ空。★ 番号を推測で作らない
eq('既存IDが無ければ空文字', body['TherapistSchedules[0][id]'], '');
eq('既存IDがあれば入れる', body['TherapistSchedules[1][id]'], '12345');
eq('2人ぶんで12項目', Object.keys(body).length, 12);
// ★★ 0行なら空。呼び出し側は空を送らないこと（全部消す意味になりかねない）
eq('0行なら空', Object.keys(w.buildEsuloveWorkBody('37865', [])).length, 0);

// ── 送る前の1行。★ 0件で「変更なし」と言わない ──
eq('内訳を言う', w.esuloveWorkSummary(rows), '2人 / 1日ぶん（2枠）をエステラブへ送ります');
eq('0件はそう言う', w.esuloveWorkSummary([]), 'エステラブへ送る出勤はありません');

// ── ★★ 出勤ページから shop_id を読む（第81便）──
// ★ 店舗に入力させない。「店舗ID」と呼べる値が2つあって、必ず取り違えるため
const hidden = (i, v) => '<input type="hidden" name="TherapistSchedules[' + i + '][shop_id]" value="' + v + '">';
eq('hidden から読める', w.readEsuloveShopId('<form>' + hidden(0, '37865') + '</form>'), '37865');
eq('複数行あっても同じ値なら読める',
  w.readEsuloveShopId('<form>' + hidden(0, '37865') + hidden(1, '37865') + '</form>'), '37865');
// ★★ 違う値が混ざっていたら決めつけない（間違った店に書き込むため）
eq('★ 値が食い違えば null', w.readEsuloveShopId('<form>' + hidden(0, '37865') + hidden(1, '99999') + '</form>'), null);
eq('無ければ null', w.readEsuloveShopId('<form><input name="other" value="1"></form>'), null);
eq('空は null', w.readEsuloveShopId(''), null);
// ★ 数字でない値は採らない（推測でURLや番号を作らない）
eq('数字でなければ null', w.readEsuloveShopId('<form>' + hidden(0, 'shop837865') + '</form>'), null);
eq('シングル引用符でも読める',
  w.readEsuloveShopId("<input name='TherapistSchedules[0][shop_id]' value='37865'>"), '37865');

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
