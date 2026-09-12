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

// ── ★★★ セラピストの登録と名簿（第297便・2026-09-12）─────────────────
// ★ 上の3表とは別の表。★ あちらは【自動で流れるもの】、こちらは【押したときだけ動くもの】。
console.log('\n── ★ セラピストの登録と名簿（第297便）──');
eq('★ 4行', m.THERAPIST_MATRIX_ROWS.length, 4);
eq('★ 見出しは「セラピストの登録と名簿」', m.THERAPIST_MATRIX.title, 'セラピストの登録と名簿');
eq('★★ 4行 × 4列がある',
   m.THERAPIST_MATRIX_ROWS.every((r) => Array.isArray(m.THERAPIST_MATRIX.cells[r]) && m.THERAPIST_MATRIX.cells[r].length === 4), true);
eq('★★ 空のマスが無い',
   m.THERAPIST_MATRIX_ROWS.every((r) => m.THERAPIST_MATRIX.cells[r].every((c) => typeof c === 'string' && c.length > 0)), true);
eq('★ マスの言葉は短い（8字以内）',
   m.THERAPIST_MATRIX_ROWS.every((r) => m.THERAPIST_MATRIX.cells[r].every((c) => c.length <= 8)), true);
// ★★★ ここがこの表の理由。★ 「◯分以内」「◯分ごと」と書かない＝自動で回ると読ませない
eq('★★★ 時間の言葉を書かない（押したときだけ動く）',
   m.THERAPIST_MATRIX_ROWS.every((r) => m.THERAPIST_MATRIX.cells[r].every((c) => !c.includes('分') && !c.includes('ごと'))), true);
eq('★★ 登録できるのは駅ちかとエステ魂だけ（THERAPIST_CREATE_PROVIDERS と同じ組）',
   m.THERAPIST_MATRIX.cells['新しい方を登録'], ['登録を押す', '登録を押す', m.NO, m.NA]);
// ★★★ 第297便（カッキーさんの問い）: 「押したとき」では何を押すのか分からなかった。
//   ★ マスは動作の名前、注はボタンの名前（画面に出ている文字のまま）。
eq('★★★ マスに「押したとき」と書かない（どのボタンか分からない）',
   m.THERAPIST_MATRIX_ROWS.every((r) => m.THERAPIST_MATRIX.cells[r].every((c) => c !== '押したとき')), true);
eq('★★★ 注はボタンの名前を画面の文字のまま書く',
   ['セラピスト一覧', '駅ちかへ登録', '登録する', '名簿を読み直す'].every((w) => m.THERAPIST_MATRIX.remark.includes(w)), true);
eq('★★ 写真は登録と一緒（第267〜269便で駅ちかとエステ魂が揃った）',
   m.THERAPIST_MATRIX.cells['登録と一緒に写真'].slice(0, 2), ['1枚', '1枚']);
eq('★★ 登録のあとは自動で名簿を読み直す（第270・271便）',
   m.THERAPIST_MATRIX.cells['登録のあとの名簿'].slice(0, 2), ['自動で読む', '自動で読む']);
// ★ エステラブは接続できません（accepting:false/blocked）。★ エスランはセラピストを扱わない（can は work だけ）
eq('★★ エステラブは ✕（送れない・読めない）',
   m.THERAPIST_MATRIX_ROWS.filter((r) => r !== '登録のあとの名簿').every((r) => m.THERAPIST_MATRIX.cells[r][2] === m.NO), true);
eq('★★ エスランは全部 ―（セラピストを扱わない）',
   m.THERAPIST_MATRIX_ROWS.every((r) => m.THERAPIST_MATRIX.cells[r][3] === m.NA), true);
eq('★ 表の下の注は「フクエスから反映」の条件を言う',
   m.THERAPIST_MATRIX.remark.startsWith('※') && m.THERAPIST_MATRIX.remark.includes('フクエスから反映'), true);
eq('★ 補足は4つまで', m.THERAPIST_FOOTNOTES.length <= 4, true);
// ★★★ 第297便（カッキーさんの確認）: 取り込みは駅ちかだけ、という方針をこの表でも言う。
//   ★ エステ魂の「押したとき」が取り込みに読めるのを、1行目で先に断つ。
eq('★★★ 1行目で「名簿の読み取り ≠ 取り込み」を言う',
   m.THERAPIST_FOOTNOTES[0].includes('取り込み') && m.THERAPIST_FOOTNOTES[0].includes('駅ちかだけ'), true);
eq('★★ 補足に「押したときだけ」がある（自動と読み違えさせない）',
   m.THERAPIST_FOOTNOTES.some((f) => f.includes('押したときだけ')), true);
// ★★ 上の早見表は触っていない（★ 行を足していない）
eq('★★★ 上の早見表は5行のまま', m.MATRIX_ROWS.length, 5);
eq('★★★ 上の早見表にセラピストの行を足していない', m.MATRIX_ROWS.includes('新しい方を登録'), false);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
