// 中継の宛先 allowlist が【2か所でそろっているか】の自己点検（第80便）。
//
// ★★★ なぜ要るか
//   allowlist は2か所にある。片方だけに頼らないための、意図した二重化:
//     フクエス側  src/lib/relayJob.ts   RELAY_ALLOWED_HOSTS
//     VPS 側      scripts/relay.sh      ALLOWED_HOSTS
//   ★ 片方だけ直すと **通らない**（そこは安全側に倒れる）。
//   ★ だが「なぜ通らないのか」を突き止めるのに時間がかかる。
//   → **ずれていること自体を、ここで落とす。**
//
// ★★ この点検は【ファイルの中身を読んで突き合わせる】。実行はしない。
//   設計メモの作法「表とラベルの取り違えを点検で落とす」と同じ形。
//
//   使い方:  npm run check:relayhosts

const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

let fail = 0;
const eq = (name, got, want) => {
  const a = JSON.stringify(got), b = JSON.stringify(want);
  if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; }
  else console.log('ok ' + name);
};

// ── フクエス側（TypeScript の配列リテラルを読む）──
const ts = fs.readFileSync(path.join(root, 'src/lib/relayJob.ts'), 'utf8');
const tsM = /RELAY_ALLOWED_HOSTS:\s*readonly string\[\]\s*=\s*\[([^\]]*)\]/.exec(ts);
const fukues = tsM
  ? tsM[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  : null;

// ── VPS 側（Python の集合リテラルを読む）──
const sh = fs.readFileSync(path.join(root, 'scripts/relay.sh'), 'utf8');
const shM = /ALLOWED_HOSTS\s*=\s*\{([^}]*)\}/.exec(sh);
const vps = shM
  ? shM[1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
  : null;

// ★ そもそも読めなければ、そこで止める（「そろっている」と言わない）
eq('★ フクエス側の表を読める', fukues !== null, true);
eq('★ VPS側の表を読める', vps !== null, true);

if (fukues && vps) {
  const sortU = (a) => Array.from(new Set(a)).sort();
  // ★★★ ここが本体。並び順は問わないが、中身は完全に一致すること
  eq('★★★ 2か所の allowlist が一致する', sortU(fukues), sortU(vps));

  // ★ 重複を書かない（消すときに片方だけ残る）
  eq('フクエス側に重複が無い', fukues.length, new Set(fukues).size);
  eq('VPS側に重複が無い', vps.length, new Set(vps).size);

  // ★ 空を入れない（空文字が入ると hostname 比較が壊れる）
  eq('空の宛先が入っていない', sortU(fukues).every((h) => h.length > 0), true);

  // ★★ 前方一致・後方一致で書かない（ranking-deli.jp.evil.com が通る形にしない）
  eq('★ ワイルドカードを書かない', sortU(fukues).some((h) => h.includes('*')), false);
  eq('★ スキームを書かない（ホスト名だけ）', sortU(fukues).some((h) => h.includes('/')), false);
  eq('★ ポートを書かない', sortU(fukues).some((h) => h.includes(':')), false);

  // ★ いま許しているのはこの2つだけ。★ 増やすときはここも直す（気づかず増えないように）
  eq('★ いま許しているのは駅ちかとエステラブだけ',
    sortU(fukues), ['eslove.jp', 'ranking-deli.jp']);
}

// ── 判定の規則そのもの（両方に同じ文言でコメントがあること）──
eq('★ フクエス側に「前方一致・後方一致で判定しない」の注意がある',
  /前方一致・後方一致で判定しない/.test(ts), true);
eq('★ VPS側にも同じ注意がある', /前方一致・後方一致で書かないこと/.test(sh), true);

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
