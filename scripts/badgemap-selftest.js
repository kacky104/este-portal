// 特徴バッジ → 媒体のタグ 変換表（src/lib/mediaBadgeMap.ts）の自己点検（第230便・2026-09-09）。
//
// ★★★ なぜ要るか
//   この表は「フクエスの言葉」を「相手の番号」に置き換える。★ 番号を1つ間違えると、
//   **まったく違う特徴が相手の公開ページに出る**（例: 23 綺麗系 のつもりが 24 で別の意味）。
//   ★ しかも間違いは画面を見ないと分からない。★ だから【表そのもの】を点検で固定する。
//
//   使い方:  npm run check:badgemap

const path = require('path');
const M = require(path.join(__dirname, '..', '_tmpcheck', 'mediaBadgeMap.js'));
const B = require(path.join(__dirname, '..', '_tmpcheck', 'therapistBadges.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};

// ── ① 表そのもの（★ ここが本体）──────────────────────────────
const ORDER = M.fukuesBadgeOrder();
eq('★★★ フクエスのバッジは42種', ORDER.length, 42);
eq('★★★ 表は42行ちょうど（★ 足りない＝送られない特徴が在るということ）', M.MEDIA_BADGE_ROWS.length, 42);
eq('★★★ 表の並びが therapistBadges.ts と同じ（★ 目で見比べられるように）',
   M.MEDIA_BADGE_ROWS.map((r) => r.badge), ORDER);

// ★★ 番号の形。★ 相手に無い番号を送らないための最低限の枠
//   ★★★ 番号は **通し番号ではない**。★ エステ魂は語彙27種だが id は 31 まで在る（お嬢様系29・小柄31）。
//     ★ 「27種だから 1..27」と決めつけない（★ 2026-09-09・この点検を書いたときに一度踏んだ）。
{
  const bad = M.MEDIA_BADGE_ROWS.filter((r) =>
    (r.ekichika !== null && !(Number.isInteger(r.ekichika) && r.ekichika >= 1))
    || (r.esutama !== null && !(Number.isInteger(r.esutama) && r.esutama >= 1)));
  eq('★★ 番号は1以上の整数', bad.map((r) => r.badge), []);
  // ★★★ 表ぜんぶの指紋。★ 1つでも番号が変われば、ここが動いて気づける。
  //   ★ 2026-09-09 に設計メモ §6-2 の表と1行ずつ突き合わせ、42行すべて一致することを確かめた並び。
  const uniq = (a) => [...new Set(a)].sort((x, y) => x - y);
  eq('★★★ 駅ちかへ送る番号ぜんぶ（31種）',
     uniq(M.MEDIA_BADGE_ROWS.map((r) => r.ekichika).filter((v) => v !== null)),
     [1, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 22, 23, 25, 34, 41, 45, 49, 52, 54, 58, 65, 77, 78, 85, 86, 89, 90, 91]);
  eq('★★★ エステ魂へ送る番号ぜんぶ（19種）',
     uniq(M.MEDIA_BADGE_ROWS.map((r) => r.esutama).filter((v) => v !== null)),
     [1, 2, 3, 7, 8, 9, 10, 12, 16, 19, 20, 21, 22, 23, 24, 26, 28, 29, 31]);
  // ★ 番号が在るのにラベルが無い（＝写し間違い）を見張る
  const noLabel = M.MEDIA_BADGE_ROWS.filter((r) =>
    (r.ekichika !== null) !== (r.ekichikaLabel !== null) || (r.esutama !== null) !== (r.esutamaLabel !== null));
  eq('★ 番号とラベルが対で入っている', noLabel.map((r) => r.badge), []);
}

// ★★★ 設計メモ §6-2 から、目で確かめる代表を抜き出して固定する。
//   ★ 「全部」ではなく「間違えたら痛い所」を選んである。
const row = (b) => { const r = M.MEDIA_BADGE_ROWS.find((x) => x.badge === b); return r ? [r.ekichika, r.esutama] : null; };
eq('★★★ 新人 → 駅ちかへは送らない（rookie_flg で別に送るため）', row('新人'), [null, 1]);
eq('★★★ 未経験 → 78 エステ未経験（★ 40 未経験 は使わない）', row('未経験'), [78, 3]);
eq('★★ 経験者 → 77 / 2', row('経験者'), [77, 2]);
eq('★★ 妹系 → 11 ロリ系 / 26 妹系', row('妹系'), [11, 26]);
eq('★★ 童顔 → 11 ロリ系（★ 妹系と同じ番号）', row('童顔'), [11, null]);
eq('★★ キレイ → 23 綺麗系 / 20 美人系（★ 言葉が違うので取り違えやすい）', row('キレイ'), [23, 20]);
eq('★★ 低身長 → 65 / 31 小柄', row('低身長'), [65, 31]);
eq('★ 施術上手 → 25 テクニシャン / 28', row('施術上手'), [25, 28]);
eq('★ 熟女 → 駅ちかは無し / 21', row('熟女'), [null, 21]);
eq('★ 明るい → 駅ちかは無し / 8', row('明るい'), [null, 8]);
eq('★ 殿堂入り → どちらにも送らない', row('殿堂入り'), [null, null]);
eq('★ アロマ得意 → どちらにも送らない', row('アロマ得意'), [null, null]);

// ★★ 駅ちかの既定（店長オススメ）は、表の中で【誰の変換先にもなっていない】こと。
//   ★ もし誰かの変換先になっていたら、「既定を入れた」のか「その人の特徴」なのか区別できなくなる
eq('★★ 5 店長オススメ は既定専用（表の変換先には出ない）',
   M.MEDIA_BADGE_ROWS.some((r) => r.ekichika === M.EKICHIKA_DEFAULT_GENRE_ID), false);

// ── ② 駅ちかへの変換 ─────────────────────────────────────────
eq('★★★ バッジが無ければ 5 店長オススメ だけ（★ 空で送ると登録が弾かれる）', M.toEkichikaGenreIds([]), [5]);
eq('★★★ 「新人」だけの人も、駅ちかへは 5 店長オススメ（新人は変換しないため）', M.toEkichikaGenreIds(['新人']), [5]);
eq('★★★ 妹系＋童顔 は 11 が1つだけ（重なりを取り除く）', M.toEkichikaGenreIds(['妹系', '童顔']), [11]);
eq('★ 並びはカテゴリ順（選んだ順ではない）', M.toEkichikaGenreIds(['施術上手', 'NO.1', '清楚']), [1, 49, 25]);
eq('★ 知らない言葉は捨てる', M.toEkichikaGenreIds(['そんなバッジは無い', 'NO.1']), [1]);
eq('★ 同じバッジを2回渡しても1つ', M.toEkichikaGenreIds(['NO.1', 'NO.1']), [1]);
eq('★★ 変換先の無いバッジばかりなら既定に倒れる', M.toEkichikaGenreIds(['殿堂入り', '熟女', '明るい']), [5]);

// ── ③ エステ魂への変換 ───────────────────────────────────────
eq('★★★ エステ魂は4つまで（★ 5つ目からは落ちる）',
   M.toEsutamaTypeIds(['未経験', 'お嬢様', 'ギャル', '清楚', '癒し系', '施術上手']), [3, 29, 19, 9]);
eq('★★★ 落ちるのは「後ろ」＝スキル寄り（カテゴリ順のため）',
   M.toEsutamaTypeIds(['施術上手', '癒し系', '清楚', 'ギャル', 'お嬢様', '未経験']), [3, 29, 19, 9]);
// ★★★ エステ魂も type[] が必須。★ 空になったら 1 新人 を入れる（カッキーさん決定・2026-09-09）
//   ★★ この既定は【自動で消えない】。★ だから explainBadgeMapping で「既定を入れた」と分かるようにしてある
eq('★★★ 1つも無いときは 1 新人（★ 必須なので・自動では消えないタグ）', M.toEsutamaTypeIds(['殿堂入り', '童顔']), [1]);
eq('★ 駅ちかとエステ魂で既定が違う（5 店長オススメ / 1 新人）',
   [M.EKICHIKA_DEFAULT_GENRE_ID, M.ESUTAMA_DEFAULT_TYPE_ID], [5, 1]);
eq('★★★ 「新人」バッジのある人だけ 1 新人 が付く（★ 自動では消えないタグ）', M.toEsutamaTypeIds(['新人']), [1]);
eq('★ 妹系＋かわいい は別の番号', M.toEsutamaTypeIds(['妹系', 'かわいい']), [22, 26]);
eq('★★ 空の入力も既定に倒れる', M.toEsutamaTypeIds([]), [1]);

// ── ④ 内訳（画面や記録に出す用）──────────────────────────────
{
  const x = M.explainBadgeMapping(['施術上手', '癒し系', '清楚', 'ギャル', 'お嬢様', '未経験', '知らない言葉']);
  eq('★ 知らない言葉を分けて返す', x.unknown, ['知らない言葉']);
  eq('★ 知っているぶんはカテゴリ順', x.known, ['未経験', 'お嬢様', 'ギャル', '清楚', '癒し系', '施術上手']);
  eq('★★ 駅ちかは6つとも行く', x.ekichika.ids, [78, 9, 14, 49, 22, 25]);
  eq('★ 既定は使っていない', x.ekichika.usedDefault, false);
  eq('★★★ エステ魂で「4つを超えて落ちた」ぶんが分かる', x.esutama.overflowBadges, ['癒し系', '施術上手']);
  eq('★ 「相手に言葉が無くて落ちた」ぶんは別', x.esutama.droppedBadges, []);
  eq('★ 既定は使っていない（エステ魂）', x.esutama.usedDefault, false);
}
{
  // ★ どちらの媒体にも言葉が無い2つ（★ 童顔は駅ちか 11 に行くので、ここでは使えない）
  const y = M.explainBadgeMapping(['殿堂入り', 'ベテラン']);
  eq('★★ 既定に倒れたことが分かる', [y.ekichika.usedDefault, y.ekichika.ids], [true, [5]]);
  eq('★★ 駅ちかで落ちたぶんが分かる', y.ekichika.droppedBadges, ['殿堂入り', 'ベテラン']);
  eq('★★★ エステ魂も既定 1 新人 に倒れる', [y.esutama.usedDefault, y.esutama.ids], [true, [1]]);
  eq('★ エステ魂で落ちたぶんが分かる', y.esutama.droppedBadges, ['殿堂入り', 'ベテラン']);
}
{
  // ★★ 重なりで落ちたぶんも「落ちた」に入る（妹系 26 と 童顔 は別だが、駅ちかでは同じ 11）
  const z = M.explainBadgeMapping(['妹系', '童顔']);
  eq('★★★ 駅ちかは 11 が1つだけ', z.ekichika.ids, [11]);
  eq('★ そのとき既定は使わない', z.ekichika.usedDefault, false);
}

// ── ⑤ 上限の数（★ 相手の決まり。★ 勝手に変えない）──────────────
eq('★ 駅ちかの上限は19', M.EKICHIKA_MAX_GENRES, 19);
eq('★★ エステ魂の上限は4', M.ESUTAMA_MAX_TYPES, 4);
eq('★ フクエスの上限は6（★ だから駅ちかの19には届かない）', B.MAX_BADGES, 6);
eq('★★ エステ魂の新人は 1', M.ESUTAMA_ROOKIE_TYPE_ID, 1);

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + ' 件 NG');
process.exit(fail === 0 ? 0 : 1);
