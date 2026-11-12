// 媒体への自動操作の決まり（第1993便・2026-11-12・カッキーさん）の見張り。
// ★ コネックエフ／フクエスリンクが自動でするのは「店舗様が管理画面で手でできる操作（出勤・セラピスト・写メ日記・お知らせの投稿、上位表示・アピールのボタン）を、
//   サイトが決めた回数の内側で代わりに行う」ことだけ。
// ★★★ 予約数・アクセス数（閲覧・クリック）・口コミ・お気に入りなど、お客様の行動として数えられるものを機械的に増やさない。公開ページを機械的に開かない。
//   （エステ魂 10/30 の警告「機械的な予約操作・不正アクセスで人気ランキングを上げる店舗」には当たらない作りを守る）
// ここでは、サーバー側のコードに書かれた媒体の URL を洗い、決まりに外れる行き先が足されていないかを見る。
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const DIRS = ['src/lib', 'src/app/lib', 'src/app/api', 'src/app/actions'];
const MEDIA = /(?:^|[^\w.-])((?:www\.)?(?:estama\.jp|ranking-deli\.jp|eslove\.jp|cocoa-job\.jp|qzin\.jp))(\/[^\s'"`)<>]*)?/g;
// お客様の行動として数えられるものに当たる言葉（行き先にこれが入っていたら NG）
const FORBIDDEN = /reserv|yoyaku|booking|kuchikomi|review|favorite|favourite|okiniiri|\blike\b|good_?btn|access_?count|pv\b|click_?count|ranking\/vote|vote/i;
// エステ魂は行き先を決め打ち（管理画面・投稿の口・ログイン・たまセラの口だけ）
const ESTAMA_OK = [/^\/?$/, /^\/admin(?:_post)?\b/, /^\/post\//, /^\/login\//, /^\/tamathera\//, /^\/file_upload\//, /^\/file\b/];

let ng = 0, ok = 0, seen = 0, paths = 0;
const MEDIA_FILE = /esutama|ekichika|eslove|cocoa|qzin|zenkoku|relay|media|bump|imasugu|sokuhime|diary/i;
const eq = (label, cond) => { if (cond) { ok++; } else { ng++; console.log('NG ' + label); } };
function walk(dir) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((d) => {
    const rel = path.join(dir, d.name);
    if (d.isDirectory()) return walk(rel);
    return /\.(ts|tsx)$/.test(d.name) ? [rel] : [];
  });
}
for (const f of DIRS.flatMap(walk)) {
  const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const code = line.replace(/(^|[^:])\/\/.*$/, '$1'); // ★ https:// は残す
    if (/^\s*\*/.test(code)) return; // 説明のコメント
    for (const m of code.matchAll(MEDIA)) {
      seen++;
      const host = m[1].replace(/^www\./, '');
      const p = (m[2] ?? '').replace(/\$\{[^}]*\}/g, 'X');
      const where = `${f}:${i + 1} ${host}${p}`;
      eq(`★★★ お客様の行動（予約・口コミ・お気に入り・閲覧の数）に当たる行き先は使わない: ${where}`, !FORBIDDEN.test(p));
      if (host === 'estama.jp') eq(`★★★ エステ魂は管理画面・投稿の口・ログインだけ（公開ページを機械的に開かない）: ${where}`, ESTAMA_OK.some((r) => r.test(p)));
    }
    // 媒体のファイルでは、origin につなげる行き先（'/admin/...' のような文字）も見る
    if (MEDIA_FILE.test(path.basename(f))) {
      for (const m of code.matchAll(/['"`](\/[a-z_][\w/.${}-]*)['"`]/gi)) {
        paths++;
        eq(`★★★ お客様の行動に当たる行き先は使わない: ${f}:${i + 1} ${m[1]}`, !FORBIDDEN.test(m[1]));
      }
    }
  });
}
eq('洗った URL が 0 件ではない（見張りが空回りしていない）', seen > 10 && paths > 30);
console.log(`\n媒体の URL ${seen}件・行き先 ${paths}件を見た`);
console.log(ng === 0 ? `★ すべて通った（${ok}件）` : `★ NG ${ng} 件`);
process.exit(ng === 0 ? 0 : 1);
