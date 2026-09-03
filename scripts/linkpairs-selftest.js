// 名簿の結び（src/lib/mediaLinkPairs.ts）の自己点検（第115便・2026-09-03）。
//
// ★★★ この判定で危ないのは【取り違えて結ぶこと】。
//   結びを間違えると、その人の出勤が **他人の欄に書き込まれる**（取り返しがつかない側）。
//   → 断る側に倒っていることを、ここで固定する。
//
//   使い方:  npm run check:linkpairs

const path = require('path');
const v = require(path.join(__dirname, '..', '_tmpcheck', 'mediaLinkPairs.js'));

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

const T = (id, name, isActive) => ({ id, name, isActive: isActive !== false });
const E = (castId, name) => ({ castId, name });

console.log('── 1. 比較用の文字列（候補を出すためだけのもの）──');
eq('カタカナ→ひらがな', v.kanaKey('レミ'), 'れみ');
eq('ひらがなはそのまま', v.kanaKey('れみ'), 'れみ');
eq('★ 漢字は変えない（愛 と あい は別）', [v.kanaKey('愛'), v.kanaKey('あい')], ['愛', 'あい']);
eq('★ 空白は落とす', v.kanaKey(' レ ミ '), 'れみ');
eq('★ 半角カナも読める（NFKC）', v.kanaKey('ﾚﾐ'), 'れみ');
eq('★ 全角英数は普通の形に', v.kanaKey('Ａｉ'), 'Ai');
eq('★ 空文字は空文字', v.kanaKey(''), '');
eq('★ ヴも落ちない', v.kanaKey('ヴィ'), 'ゔぃ');

console.log('\n── 2. 名簿が読めていないとき（★ 0人と混ぜない）──');
{
  const p = v.buildLinkPairs({ therapists: [T(1, 'レミ')], links: [], entries: null });
  eq('★★★ known は false', p.known, false);
  eq('★★ 候補は空（分からないので出さない）', p.unlinked[0].candidates, []);
  eq('★ 空いている番号も空', p.free, []);
  // ★★★ 分からないものを数えない。★ 読めていないときの文言に数字を出さない
  eq('★★★ 文言に件数（数字）を出さない', /[0-9０-９]/.test(v.pairsSummary(p)), false);
  eq('★★★ 読めていないときは結べない', v.canLink(p, 1, '999').ok, false);
}
{
  const p = v.buildLinkPairs({ therapists: [T(1, 'レミ')], links: [{ therapistId: 1, castId: '5' }], entries: null });
  eq('★★★ 結び済みでも onMedia は false（いない、ではない）', p.linked[0].onMedia, false);
  eq('★ 媒体側の名前は分からない', p.linked[0].mediaName, null);
}

console.log('\n── 3. 候補（★ 決めるのは人。ここは並べるだけ）──');
{
  const p = v.buildLinkPairs({
    therapists: [T(1, 'レミ'), T(2, 'さくら'), T(3, 'ひなの')],
    links: [],
    entries: [E('101', 'れみ'), E('102', 'さくら'), E('103', 'まりあ')],
  });
  eq('★ 3人とも未結び', p.unlinked.map((u) => u.therapistId), [1, 2, 3]);
  eq('★★ 読みが同じなら候補に出る', p.unlinked[0].candidates.map((c) => c.castId + ':' + c.strength), ['101:kana']);
  eq('★★ 名前が同じなら強い候補', p.unlinked[1].candidates.map((c) => c.castId + ':' + c.strength), ['102:exact']);
  eq('★ 候補が無い人は空（★ 無理に出さない）', p.unlinked[2].candidates, []);
  eq('★ 空いている番号は3つ', p.free.map((e) => e.castId), ['101', '102', '103']);
  eq('★ 文言', v.pairsSummary(p), 'まだ結びついていない方が3名（うち2名は候補があります）');
}
{
  // ★★ 名前が同じ候補と読みが同じ候補が両方あるとき、強いほうが先
  const p = v.buildLinkPairs({
    therapists: [T(1, 'アイ')],
    links: [],
    entries: [E('201', 'あい'), E('202', 'アイ')],
  });
  eq('★★★ 強い候補が先に並ぶ', p.unlinked[0].candidates.map((c) => c.castId), ['202', '201']);
  eq('★ 弱いほうも消さない（人が選べるように残す）', p.unlinked[0].candidates.length, 2);
}
{
  // ★★★ 他の人に結ばれている番号は候補にしない（押せると取り違えになる）
  const p = v.buildLinkPairs({
    therapists: [T(1, 'レミ'), T(2, 'れみ')],
    links: [{ therapistId: 2, castId: '101' }],
    entries: [E('101', 'れみ')],
  });
  eq('★★★ 取られている番号は候補に出ない', p.unlinked[0].candidates, []);
  eq('★ 空いている番号も無い', p.free, []);
  eq('★ 取られている番号は分かる', p.takenCastIds, ['101']);
}
{
  // ★ 名前が空の人に候補を出さない（全員が候補になってしまう）
  const p = v.buildLinkPairs({ therapists: [T(1, '')], links: [], entries: [E('301', '')] });
  eq('★★ 名前が空なら候補なし', p.unlinked[0].candidates, []);
}
{
  // ★ 名簿に同じ番号が2行あっても1つとして数える
  const p = v.buildLinkPairs({ therapists: [], links: [], entries: [E('1', 'あ'), E('1', 'あ'), E('2', 'い')] });
  eq('★ 重複した番号は1つ', p.free.map((e) => e.castId), ['1', '2']);
}
{
  // ★ 番号が空の行は捨てる（結びようがない）
  const p = v.buildLinkPairs({ therapists: [], links: [], entries: [E('', 'あ'), E('2', 'い')] });
  eq('★ 空の番号は捨てる', p.free.map((e) => e.castId), ['2']);
}

console.log('\n── 4. 結び済みの見え方 ──');
{
  const p = v.buildLinkPairs({
    therapists: [T(1, 'レミ'), T(2, 'さくら', false)],
    links: [{ therapistId: 1, castId: '101' }, { therapistId: 2, castId: '999' }],
    entries: [E('101', 'れみ')],
  });
  eq('★ 名簿にある番号は確かめられる', [p.linked[0].onMedia, p.linked[0].mediaName], [true, 'れみ']);
  eq('★★★ 名簿に無い番号は onMedia false（古い番号のおそれ）',
     [p.linked[1].onMedia, p.linked[1].mediaName], [false, null]);
  eq('★ 非公開の人も並ぶ（結びは公開とは別の話）', p.linked[1].isActive, false);
  eq('★ 未結びは0人', p.unlinked, []);
  eq('★ 文言', v.pairsSummary(p), '全員が結びついています（2名）');
}

console.log('\n── 5. ★★★ 結んでよいかの判定（画面もサーバもこれを呼ぶ）──');
{
  const p = v.buildLinkPairs({
    therapists: [T(1, 'レミ'), T(2, 'ゆい')],
    links: [{ therapistId: 2, castId: '102' }],
    entries: [E('101', 'れみ'), E('102', 'ゆい')],
  });
  eq('★ 空いている番号なら結べる', v.canLink(p, 1, '101'), { ok: true });
  eq('★ 前後の空白は落として同じ番号とみなす', v.canLink(p, 1, ' 101 '), { ok: true });
  eq('★★★ 取られている番号は断る', v.canLink(p, 1, '102').ok, false);
  eq('★★★ 名簿に無い番号は断る（打ち間違いを弾く）', v.canLink(p, 1, '999').ok, false);
  eq('★★ 番号が空なら断る', v.canLink(p, 1, '').ok, false);
  eq('★★★ すでに結ばれている人は断る（黙って上書きしない）', v.canLink(p, 2, '101').ok, false);
  eq('★★ この店舗にいない人は断る', v.canLink(p, 99, '101').ok, false);
  // ★ 断るときは必ず理由がある（画面にそのまま出す）
  eq('★★ 断り文は空でない',
     ['102', '999', ''].filter((id) => { const r = v.canLink(p, 1, id); return r.ok || !r.error; }), []);

  eq('★ 結ばれている人は外せる', v.canUnlink(p, 2), { ok: true });
  eq('★★★ 結ばれていない人を外したと言わない', v.canUnlink(p, 1).ok, false);
}

console.log('\n── 6. 言葉 ──');
eq('★ 強さの言い方', [v.strengthLabel('exact'), v.strengthLabel('kana')], ['名前が同じ', '読みが同じ']);
eq('★★ 読めていないときの文言',
   v.pairsSummary(v.buildLinkPairs({ therapists: [T(1, 'あ')], links: [], entries: null })),
   '媒体側の名簿をまだ読めていないので、結びつきを確かめられません');
eq('★ 誰も居ない店は0名と言い切ってよい（名簿は読めている）',
   v.pairsSummary(v.buildLinkPairs({ therapists: [], links: [], entries: [] })),
   '全員が結びついています（0名）');

console.log(fail === 0 ? '\n★ すべて通りました' : '\n' + fail + ' 件 通りませんでした');
process.exit(fail === 0 ? 0 : 1);
