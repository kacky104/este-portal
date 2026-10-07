// 「出勤をサイトへ」のお知らせの出し分け（src/lib/workSendNotes.ts）の自己点検（第1267便）。
//   使い方:  npm run check:worksendnotes

const m = require(require('path').join(__dirname, '..', '_tmpcheck', 'workSendNotes.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const N = (kind, detail, extra) => ({ kind, detail, ...(extra || {}) });

// ── ラビリンス様の画面に出ていた4行（2026-10-07）を、新しい種類で ──
{
  const notes = [
    N('unmapped_therapist', '1名は、いま駅ちかの出勤表に出ていないため更新できません', { names: ['さくら'] }),
    N('missing_row_as_rest', '出勤を入れていない日（66件）は、駅ちかでは「お休み」として出しています（出勤を入れた日は、そのまま出ています）'),
    N('unknown_girl', '1名は、駅ちかにだけ登録がある方です。その方の出勤には触っていません', { names: ['ゆい'] }),
    N('target_off', '1名は、送り先サイトで「送らない」にしているため更新していません（すでに載っている出勤はそのままです）', { names: ['まい'] }),
  ];
  const r = m.splitWorkNotes(notes);
  eq('★★★ 送れていない方は1行（出勤表に出ていない）', r.unsent.map((n) => n.kind), ['unmapped_therapist']);
  eq('★★★ 残り3行はお知らせ（畳む側）', r.info.map((n) => n.kind), ['missing_row_as_rest', 'unknown_girl', 'target_off']);
  eq('★ 並びは渡された順のまま', r.info[0].detail.startsWith('出勤を入れていない日'), true);
}

// ── 種類ごと ──
eq('★★ 連携していない方 → 送れていない', m.splitWorkNotes([N('unmapped_therapist', '2名は駅ちかと連携していないため更新できません')]).unsent.length, 1);
eq('★★ 選べない時刻 → 送れていない', m.splitWorkNotes([N('time_not_selectable', '1件は、駅ちかで選べない時刻のため反映していません')]).unsent.length, 1);
eq('★★ 時刻を寄せた → お知らせ', m.splitWorkNotes([N('time_snapped', '1件は、駅ちかが30分刻みのため時刻を寄せて反映しました')]).info.length, 1);
eq('★★ 送らないにしている → お知らせ（店舗様が決めたこと）', m.splitWorkNotes([N('target_off', '1名は、送り先サイトで「送らない」にしているため更新していません')]).info.length, 1);
eq('★★★ 知らない種類 → お知らせ（勝手に警告にしない）', m.splitWorkNotes([N('something_new', 'x')]).info.length, 1);
eq('★★★ 古い計画: 「送らない」が unmapped_therapist で保存されていても、お知らせの側',
  m.splitWorkNotes([N('unmapped_therapist', '1名は送り先サイトで「送らない」にしているため更新していません（すでに載っている出勤はそのままです）')]), {
    unsent: [], info: [N('unmapped_therapist', '1名は送り先サイトで「送らない」にしているため更新していません（すでに載っている出勤はそのままです）')],
  });
eq('★ 空・null', [m.splitWorkNotes(null), m.splitWorkNotes([])], [{ unsent: [], info: [] }, { unsent: [], info: [] }]);
eq('★ 文が無い行は捨てる（画面を壊さない）', m.splitWorkNotes([{ kind: 'unknown_girl' }, null]), { unsent: [], info: [] });

// ── 名前 ──
eq('★★★ 名前を出す', m.workNoteNames(N('unknown_girl', 'x', { names: ['ゆい'] })), '対象：ゆい');
eq('★★ 複数は中点でつなぐ', m.workNoteNames(N('unknown_girl', 'x', { names: ['ゆい', 'まい'] })), '対象：ゆい・まい');
eq('★★★ 名前が無ければ null（空の「対象：」を出さない）', m.workNoteNames(N('unknown_girl', 'x')), null);
eq('★ 空の配列も null', m.workNoteNames(N('unknown_girl', 'x', { names: [] })), null);
eq('★ 空白だけの名前は数えない', m.workNoteNames(N('unknown_girl', 'x', { names: [' ', ''] })), null);
eq('★★ 上限を超えたら「ほか◯名」', m.workNoteNames(N('unknown_girl', 'x', { names: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'] })), '対象：1・2・3・4・5・6・7・8（ほか2名）');
eq('★ null を渡しても落ちない', m.workNoteNames(null), null);

console.log(fail === 0 ? '\n★ すべて通った' : '\n★ NG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
