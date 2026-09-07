// 反映の早見表（src/lib/mediaMatrix.ts）の自己点検（第212便）。
//   使い方: npm run check:mediamatrix
const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'mediaMatrix.js'));
let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + name);
};
eq('★ 3つの設定', m.MEDIA_MATRIX.map((s) => s.key), ['write', 'read', 'none']);
eq('★ 見出しはホームのボタンと同じ言葉', m.MEDIA_MATRIX.map((s) => s.title), ['フクエスから反映', '駅ちかから反映', 'どのサイトにも反映しない']);
eq('★ 4サイト・5行', [m.MATRIX_SITES.length, m.MATRIX_ROWS.length], [4, 5]);
eq('★ 週間出勤（7日分）の行がある', m.MATRIX_ROWS.includes('週間出勤（7日分）'), true);
eq('★★ フクエスから反映: 週間出勤は出勤と同じ周（7日ぶんを一緒に送る）', m.MEDIA_MATRIX[0].cells['週間出勤（7日分）'], m.MEDIA_MATRIX[0].cells['出勤']);
eq('★★ 駅ちかから反映: 週間出勤は1日1回（mode=full）', m.MEDIA_MATRIX[1].cells['週間出勤（7日分）'][0], '1日1回');
eq('★★ すべての区画に5行×4列がある',
   m.MEDIA_MATRIX.every((s) => m.MATRIX_ROWS.every((r) => Array.isArray(s.cells[r]) && s.cells[r].length === 4)), true);
eq('★★ 空のマスが無い', m.MEDIA_MATRIX.every((s) => m.MATRIX_ROWS.every((r) => s.cells[r].every((c) => typeof c === 'string' && c.length > 0))), true);
const off = (c) => c === m.NO || c === m.NA;   // ★ ✕（送らない）か ―（機能が無い）
eq('★★★ 「どのサイトにも反映しない」は全部 ✕ か ―（新着情報も止まる）',
   m.MATRIX_ROWS.every((r) => m.MEDIA_MATRIX[2].cells[r].every(off)), true);
eq('★★★ 「駅ちかから反映」で駅ちか以外は全部 ✕ か ―（ほかへ送らない方針）',
   m.MATRIX_ROWS.every((r) => m.MEDIA_MATRIX[1].cells[r].slice(1).every(off)), true);
eq('★ エスランの写メ日記・即ヒメ・新着情報は ―（機能そのものが無い）',
   m.MEDIA_MATRIX.every((s) => ['写メ日記', '即ヒメ／即セラ', '新着情報'].every((r) => s.cells[r][3] === m.NA)), true);
eq('★ エスランの出勤は ―ではない（準備中 か ✕）', m.MEDIA_MATRIX.every((s) => s.cells['出勤'][3] !== m.NA), true);
eq('★★ 出勤（自動）は30分ごと（media-auto-push の crontab と同じ）', m.MEDIA_MATRIX[0].cells['出勤'].slice(0, 2), ['30分ごと', '30分ごと']);
eq('★★ エステラブへ出勤は送れない（403・第82便）', m.MEDIA_MATRIX[0].cells['出勤'][2], m.NO);
eq('★★ 駅ちかの即ヒメは5分ごと（sokuhime-push・第215便）', m.MEDIA_MATRIX[0].cells['即ヒメ／即セラ'][0], '5分ごと');
eq('★★ エステ魂の即セラは5分ごと（sokusera-push）', m.MEDIA_MATRIX[0].cells['即ヒメ／即セラ'][1], '5分ごと');
eq('★ 「フクエスから反映」の但し書きは「自動にした場合」と言う', m.MEDIA_MATRIX[0].note.includes('自動にした場合'), true);
eq('★ マスの言葉は短い（8字以内）', m.MEDIA_MATRIX.every((s) => m.MATRIX_ROWS.every((r) => s.cells[r].every((c) => c.length <= 8))), true);
eq('★ 補足は6つまで', m.MATRIX_FOOTNOTES.length <= 6, true);
eq('★ 補足にエステ魂の新着情報の断りがある', m.MATRIX_FOOTNOTES.some((f) => f.includes('エステ魂') && f.includes('新着情報')), true);
// ★★ 第215便: 実測でわかったこと（ベンリーの即姫タイマーが先に枠を埋める）を早見表の下で断る
eq('★★ 補足に「ほかのツールが優先」の断りがある', m.MATRIX_FOOTNOTES.some((f) => f.includes('即ヒメ') && f.includes('優先')), true);
console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
