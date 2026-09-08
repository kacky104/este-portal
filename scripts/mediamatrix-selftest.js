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
// ★ 第215便: 「駅ちかから反映」の1列目は行き先の「フクエス」。★ ほかの区画は見出しを持たない（4サイトのまま）
eq('★★ 駅ちかから反映: 1列目の見出しは「フクエス」', m.MEDIA_MATRIX[1].headers, ['フクエス', 'エステ魂', 'エステラブ', 'エスラン']);
eq('★ ほかの区画は見出しを差し替えない', [m.MEDIA_MATRIX[0].headers, m.MEDIA_MATRIX[2].headers], [undefined, undefined]);
eq('★★ 駅ちかから反映: 写メ日記は15分以内（diary-import 15分ごと）', m.MEDIA_MATRIX[1].cells['写メ日記'][0], '15分以内');
eq('★★ すべての区画に5行×4列がある',
   m.MEDIA_MATRIX.every((s) => m.MATRIX_ROWS.every((r) => Array.isArray(s.cells[r]) && s.cells[r].length === 4)), true);
eq('★★ 空のマスが無い', m.MEDIA_MATRIX.every((s) => m.MATRIX_ROWS.every((r) => s.cells[r].every((c) => typeof c === 'string' && c.length > 0))), true);
const off = (c) => c === m.NO || c === m.NA;   // ★ ✕（送らない）か ―（機能が無い）。★ ※ は「フクエスから反映」にしか出ない
eq('★★★ 「どのサイトにも反映しない」は全部 ✕ か ―（新着情報も止まる）',
   m.MATRIX_ROWS.every((r) => m.MEDIA_MATRIX[2].cells[r].every(off)), true);
eq('★★★ 「駅ちかから反映」で駅ちか以外は全部 ✕ か ―（ほかへ送らない方針）',
   m.MATRIX_ROWS.every((r) => m.MEDIA_MATRIX[1].cells[r].slice(1).every(off)), true);
eq('★ エスランの写メ日記・即ヒメ・新着情報は ―（機能そのものが無い）',
   m.MEDIA_MATRIX.every((s) => ['写メ日記', '即ヒメ／即セラ', '新着情報'].every((r) => s.cells[r][3] === m.NA)), true);
eq('★ エスランの出勤は ―ではない（準備中 か ✕）', m.MEDIA_MATRIX.every((s) => s.cells['出勤'][3] !== m.NA), true);
// ★ 第215便: 「フクエスから反映」は「◯分以内」（周は◯分に1回。入れてから【最長】◯分）
eq('★★ 出勤（自動）は30分以内（media-auto-push の crontab 5,35）', m.MEDIA_MATRIX[0].cells['出勤'].slice(0, 2), ['30分以内', '30分以内']);
eq('★★ 「フクエスから反映」に「ごと」は無い', m.MATRIX_ROWS.every((r) => m.MEDIA_MATRIX[0].cells[r].every((c) => !c.includes('ごと'))), true);
eq('★★ エステラブへ出勤は送れない（403・第82便）', m.MEDIA_MATRIX[0].cells['出勤'][2], m.NO);
eq('★★ 駅ちかの即ヒメは5分以内（sokuhime-push・第215便）', m.MEDIA_MATRIX[0].cells['即ヒメ／即セラ'][0], '5分以内');
eq('★★ エステ魂の即セラは5分以内（sokusera-push）', m.MEDIA_MATRIX[0].cells['即ヒメ／即セラ'][1], '5分以内');
// ★ 第215便: エステ魂の新着情報は ※（サイト自身に自動更新がある）。★ 表のすぐ下の注で言う
eq('★★ エステ魂の新着情報は ※', m.MEDIA_MATRIX[0].cells['新着情報'][1], m.SEE);
eq('★★ ※ があるなら表の下に注がある', m.MEDIA_MATRIX.every((s) => !m.MATRIX_ROWS.some((r) => s.cells[r].includes(m.SEE)) || (typeof s.remark === 'string' && s.remark.startsWith('※'))), true);
eq('★ 注はエステ魂の自動更新を言う', m.MEDIA_MATRIX[0].remark.includes('エステ魂') && m.MEDIA_MATRIX[0].remark.includes('自動更新'), true);
eq('★ ※ は「フクエスから反映」にしか出ない', m.MEDIA_MATRIX.slice(1).every((s) => m.MATRIX_ROWS.every((r) => !s.cells[r].includes(m.SEE))), true);
// ★ 第215便: 見出しの下の但し書き（note）は消した。★ 「自動にできる」ことは補足で言う
eq('★ 但し書き（note）は持たない', m.MEDIA_MATRIX.every((s) => !('note' in s)), true);
eq('★ 「自動にできる」ことは補足で言う', m.MATRIX_FOOTNOTES.some((f) => f.includes('自動にできます')), true);
eq('★ マスの言葉は短い（8字以内）', m.MEDIA_MATRIX.every((s) => m.MATRIX_ROWS.every((r) => s.cells[r].every((c) => c.length <= 8))), true);
eq('★ 補足は6つまで', m.MATRIX_FOOTNOTES.length <= 6, true);
// ★ 第215便: エステ魂の新着情報の断りは表のすぐ下（remark）へ移した。★ 補足には置かない（二重に言わない）
eq('★ 補足にはエステ魂の新着情報の断りを置かない', m.MATRIX_FOOTNOTES.some((f) => f.includes('エステ魂') && f.includes('新着情報')), false);
// ★★ 第215便: 実測でわかったこと（ベンリーの即姫タイマーが先に枠を埋める）を早見表の下で断る
eq('★★ 補足に「ほかのツールが優先」の断りがある', m.MATRIX_FOOTNOTES.some((f) => f.includes('即ヒメ') && f.includes('優先')), true);
console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
