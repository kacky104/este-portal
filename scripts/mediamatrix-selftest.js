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
// ★ 第215便: 見出しの下の但し書き（note）は消した
eq('★ 但し書き（note）は持たない', m.MEDIA_MATRIX.every((s) => !('note' in s)), true);
// ★★ 第298便（カッキーさんの添削）: 早見表の下の補足5行は画面から外した
eq('★★ 早見表の下の補足は持たない', m.MATRIX_FOOTNOTES, []);
eq('★ マスの言葉は短い（8字以内）', m.MEDIA_MATRIX.every((s) => m.MATRIX_ROWS.every((r) => s.cells[r].every((c) => c.length <= 8))), true);

// ── ★★★ セラピストの反映（第298便・2026-09-12・作り直し）─────────────────
// ★ 上の3表とは別の表。★ 向きごとに1枚（駅ちかから反映 → フクエス／フクエスから反映 → 各サイト）。
// ★ 第三者が読む前提なので、マスは【文】でよい。★ 代わりに「何が流れるか」の項目が揃っていることを見張る。
console.log('\n── ★ セラピストの反映（第298便）──');
const T = m.THERAPIST_TABLES;
eq('★ 2枚（write → read の順・カッキーさんの添削）', T.map((t) => t.key), ['write', 'read']);
eq('★ 見出し', T.map((t) => t.title), ['フクエスから反映 ーセラピストー', '駅ちかから反映 ーセラピストー']);
// ★★ 1行目はごく短く（カッキーさんの添削）。★ 取り込みは「自動反映」、送る側は「設定が必要」
eq('★★★ 1行目（lead）', [T[0].lead, T[1].lead], ['※フクエスリンクのセラピスト設定が必要です', '自動反映（15〜60分以内）　※フクエスリンクのセラピスト設定が必要です']);
eq('★★ 全部の行が列の数と合っている', T.every((t) => t.rows.every((r) => r.cells.length === t.headers.length)), true);
eq('★★ 空のマス・空の行名が無い', T.every((t) => t.rows.every((r) => r.label.length > 0 && r.cells.every((c) => typeof c === 'string' && c.length > 0))), true);
const rc = (t, l) => { const r = t.rows.find((x) => x.label === l); return r.cells[r.cells.length - 1]; };
eq('★ 行名がだぶらない', T.every((t) => new Set(t.rows.map((r) => r.label)).size === t.rows.length), true);
const label = (t, l) => t.rows.find((r) => r.label === l);
// ── 駅ちかから反映（→ フクエス）
const R = T[1];
eq('★★ 列は 〇 の列とフクエス（「へ」は付けない・カッキーさんの添削）', R.headers, ['', 'フクエス']);
// ★★★ 1列目は 〇 か ✕ だけ（できる／できないを直感で見せる）。★ 写真だけ ✕（取り込みで来ない・カッキーさんの添削）
eq('★★★ 1列目は 〇 か ✕ だけ', R.rows.every((r) => r.cells[0] === m.OK || r.cells[0] === m.NO), true);
eq('★★★ ✕ は写真・キャッチ・駅ちかで消した方（自動では動かないもの）', R.rows.filter((r) => r.cells[0] === m.NO).map((r) => r.label), ['写真', 'キャッチ・紹介文', '駅ちかで消した方']);
eq('★★ 何が流れるかの項目が揃っている（新しい方・名前・年齢サイズ・写真・キャッチ・消した方）',
   ['駅ちかの新人', 'お名前', '年齢・サイズ', '写真', 'キャッチ・紹介文', '駅ちかで消した方'].every((l) => !!label(R, l)), true);
eq('★ 6行（出勤・即ヒメは上の早見表へ）', R.rows.length, 6);
eq('★★★ 新しい方は【公開・NEW】で作る（第227便）', rc(R, '駅ちかの新人'), '自動反映（公開・NEW付き）');
eq('★★ 写真とキャッチは来ない（ingest は age / body_type しか書かない）',
   [rc(R, '写真'), rc(R, 'キャッチ・紹介文')], ['フクエスでの登録が必要', 'フクエスでの登録が必要']);
eq('★★ 年齢・サイズは毎周の上書き（import_profile・age / body_type）', rc(R, '年齢・サイズ').includes('自動変更'), true);
eq('★★ 名前は作るときだけ（castId 照合・名前の変更は書かない）', rc(R, 'お名前') === '初回固定。駅ちかで変更しても、フクエスは自動変更なし', true);
eq('★★ 駅ちかで消してもフクエスからは消えない（sweep は出勤の行を倒すだけ・therapists は触らない）', rc(R, '駅ちかで消した方'), '自動では消えないのでフクエスでの削除が必要');
eq('★★ ほかの3サイトの行は置かない（カッキーさんの添削・列が「フクエス」だけで足りる）', !!label(R, 'エステ魂・エステラブ・エスラン'), false);
eq('★★ 「駅ちかの新人」は一番下（カッキーさんの添削）', R.rows[R.rows.length - 1].label, '駅ちかの新人');
// ★★ 出勤・即ヒメの行は置かない（★ 上の早見表に同じものがある・カッキーさんの添削）。★ 二重に言わない
eq('★★ 出勤・即ヒメの行は置かない（上の早見表と二重にしない）', !!label(R, '出勤・即ヒメ'), false);
// ── フクエスから反映（→ 各サイト）
const W = T[0];
// ★ エステラブは書き込みを止められているので列を出さない。★ エスランは列を残す（カッキーさんの添削）
eq('★★ 列は駅ちか・エステ魂・エスラン', W.headers, ['駅ちか', 'エステ魂', 'エスラン']);
eq('★★ 「送れるか」の行は置かない（カッキーさんの添削）', !!label(W, '送れるか'), false);
eq('★★ 何が流れるかの項目が揃っている',
   ['お名前', '年齢・身長・3サイズ・カップ', '特徴（バッジ）', '写真', 'キャッチ・紹介文', '新人マーク', 'フクエスでの修正', 'フクエスで非公開・退店'].every((l) => !!label(W, l)), true);
eq('★★ エスランは全部 ―（セラピストを扱わない）', W.rows.every((r) => r.cells[2] === m.NA), true);
// ★★★ 印（〇 / ✕）は【駅ちかとエステ魂で必ずそろえる】（カッキーさんの添削で頭に付けた）。
//   ★ 片方だけ 〇 が付いていると、もう片方が「できない」と読める。
eq('★★★ 印は駅ちかとエステ魂でそろっている（★ △ はサイトごとに違ってよい）',
   W.rows.every((r) => {
     const mark = (c) => (c.startsWith(m.OK) ? m.OK : c.startsWith(m.NO) ? m.NO : c.startsWith(m.MAYBE) ? m.MAYBE : '');
     const a = mark(r.cells[0]), b = mark(r.cells[1]);
     return a === b || a === m.MAYBE || b === m.MAYBE;
   }), true);
eq('★★★ ✕ で始まるのは送らないもの（キャッチ・紹介文／登録後の修正）',
   W.rows.filter((r) => r.cells[0].startsWith(m.NO)).map((r) => r.label), ['キャッチ・紹介文', 'フクエスでの修正', 'フクエスで非公開・退店']);
// ★★ 登録は1回だけ。★ あとでフクエス側を直しても追いかけない（★ 送る口は「登録」だけ）
eq('★★ フクエスでの修正は向こうの画面で（サイトの名前で言う）',
   label(W, 'フクエスでの修正').cells.slice(0, 2), [m.NO + '駅ちかでの修正が必要', m.NO + 'エステ魂での修正が必要']);
eq('★★ 写真は登録と一緒に1枚目を1枚（第267〜269便で駅ちかとエステ魂が揃った）',
   label(W, '写真').cells.slice(0, 2).every((c) => c === m.OK + '\n1枚（トップ画像）'), true);
eq('★★ キャッチ・紹介文は送らない（girlCreatePlan / castCreatePlan）',
   label(W, 'キャッチ・紹介文').cells.slice(0, 2), [m.NO + '駅ちかでの登録が必要', m.NO + 'エステ魂での登録が必要']);
// ★★ エステ魂の「新人」タグは【特徴が1つも無いときだけ】入る。★ 必ず付くのではないので △（カッキーさんの添削）
eq('★★ 新人: 駅ちかは 〇、エステ魂は △（付いた場合のみ）',
   label(W, '新人マーク').cells.slice(0, 2), [m.OK, m.MAYBE + '新人タグが付いた場合のみ']);
// ★★ 「向こうでの公開」の行は置かない（カッキーさんの添削）。★ 即公開の断りは押す前の確認で出る
eq('★★ 「向こうでの公開」の行は置かない', !!label(W, '向こうでの公開'), false);
// ★ 10文字までの断りは画面から外した（カッキーさんの添削）。★ 長すぎる名前は押す前の確認で止まる
eq('★★ お名前は 〇 だけ', label(W, 'お名前').cells.slice(0, 2), [m.OK, m.OK]);
// ★★ バストは必須ではなかった（カッキーさんの確認・2026-09-12）。★ 画面に「必須」と書かない
eq('★★ 「バスト」の断りは書かない', W.rows.every((r) => r.cells.every((c) => !c.includes('バスト'))), true);
// ★★ 「登録のあと」の行は置かない（カッキーさんの添削）。★ 登録後に名簿を読み直すのは内側の話（第270・271便）
eq('★★ 「登録のあと」の行は置かない', !!label(W, '登録のあと'), false);
eq('★★ 非公開・退店は向こうに残る（削除は向こうの画面・駅ちかの削除口は運営だけ）',
   label(W, 'フクエスで非公開・退店').cells.slice(0, 2), [m.NO + '駅ちかでの削除が必要', m.NO + 'エステ魂での削除が必要']);
// ★★ 1行目からボタンの名前を落とした（カッキーさんの添削・第298便）。★ 押し方は「セラピスト設定」の画面にその場で書いてある
eq('★★★ 時間の言葉を書かない（押したときだけ動く）', W.rows.every((r) => r.cells.every((c) => !c.includes('分以内') && !c.includes('ごと'))), true);
// ★★ 表の下の補足はどちらも持たない（カッキーさんの添削）。★ 押し方・止まる条件は「セラピスト設定」の画面にある
eq('★★ 表の下の補足は持たない', T.map((t) => t.notes.length), [0, 0]);
// ★★ 「駅ちかから反映」の補足は1行だけ（カッキーさんの添削）。★ フクエス側の設定が要ることだけ言う
// ★★ ※ は見出しの下の1行へ移したので、表の下の補足は持たない（カッキーさんの添削）
// ★★ 上の早見表は触っていない（★ 行を足していない）
eq('★★★ 上の早見表は5行のまま', m.MATRIX_ROWS.length, 5);
eq('★★★ 上の早見表にセラピストの行を足していない', m.MATRIX_ROWS.includes('お名前'), false);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
