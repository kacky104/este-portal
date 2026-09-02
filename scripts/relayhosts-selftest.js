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

  // ★ いま許しているのはこの3つだけ。★ 増やすときはここも直す（気づかず増えないように）
  eq('★ いま許しているのは駅ちか・エステラブ・エステ魂だけ（第109便）',
    sortU(fukues), ['eslove.jp', 'estama.jp', 'ranking-deli.jp']);
}

// ── 判定の規則そのもの（両方に同じ文言でコメントがあること）──
eq('★ フクエス側に「前方一致・後方一致で判定しない」の注意がある',
  /前方一致・後方一致で判定しない/.test(ts), true);
eq('★ VPS側にも同じ注意がある', /前方一致・後方一致で書かないこと/.test(sh), true);

// ── ★★★ 第106便: 画像の【取り先】の表も2か所でそろっているか（★ 宛先の表とは別の表）──
//   フクエス側  src/lib/relayMultipart.ts   RELAY_FILE_HOSTS / RELAY_FILE_PATH_PREFIX
//   VPS 側      scripts/relay.sh            FILE_HOSTS / FILE_PATH
{
  const mp = fs.readFileSync(path.join(root, 'src/lib/relayMultipart.ts'), 'utf8');
  const mpM = /RELAY_FILE_HOSTS:\s*readonly string\[\]\s*=\s*\[([^\]]*)\]/.exec(mp);
  const fukuesFile = mpM ? mpM[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : null;
  const shFM = /FILE_HOSTS\s*=\s*\{([^}]*)\}/.exec(sh);
  const vpsFile = shFM ? shFM[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : null;
  eq('★ フクエス側の【取り先】の表を読める', fukuesFile !== null, true);
  eq('★ VPS側の【取り先】の表を読める', vpsFile !== null, true);
  if (fukuesFile && vpsFile) {
    const sortU = (a) => Array.from(new Set(a)).sort();
    eq('★★★ 2か所の【取り先】が一致する', sortU(fukuesFile), sortU(vpsFile));
    eq('★ 取り先は fukues.com だけ', sortU(fukuesFile), ['fukues.com']);
    // ★★ 宛先の表と取り先の表を【混ぜていない】（fukues.com へ投げない・駅ちかから取らない）
    const dest = /RELAY_ALLOWED_HOSTS:\s*readonly string\[\]\s*=\s*\[([^\]]*)\]/.exec(ts);
    const destHosts = dest ? dest[1].split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean) : [];
    eq('★★ 宛先の表と取り先の表が重ならない', destHosts.filter((h) => fukuesFile.includes(h)), []);
  }
  const pfx = /RELAY_FILE_PATH_PREFIX\s*=\s*'([^']+)'/.exec(mp);
  const shP = /FILE_PATH\s*=\s*"([^"]+)"/.exec(sh);
  eq('★★ 取りに行く口も2か所で一致する', pfx && pfx[1], shP && shP[1]);
  eq('★ 口は /api/relay/file', pfx && pfx[1], '/api/relay/file');
  // ★ VPS が文字の項目を --form-string で渡していること（-F だと先頭の @ がファイル扱いになる）
  eq('★ VPS は文字の項目を --form-string で渡す', /--form-string/.test(sh), true);
  eq('★ VPS はファイル付きのとき content-type を渡さない', /content-type.*continue/.test(sh), true);
}

console.log(fail === 0 ? '\nすべて通りました' : '\n' + fail + '件 失敗');
process.exit(fail === 0 ? 0 : 1);
