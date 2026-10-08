// 写メ日記の転送の添付画像の形式（src/lib/diaryAttach.ts）の自己点検（第1313便・2026-10-08）。
//   ★ 見張り: WebP は JPEG に変えて送る（駅ちかで画像が載らなかった件）。JPEG・PNG・GIF はそのまま。
//   使い方:  npm run check:diaryattach
const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'diaryAttach.js'));
let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; } else console.log('ok ' + name);
};
const bytes = (...xs) => Uint8Array.from(xs.flatMap((x) => typeof x === 'string' ? [...x].map((c) => c.charCodeAt(0)) : [x]));
const jpeg = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10);
const png = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a);
const gif = bytes('GIF89a');
const webp = bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 ');
const heic = bytes(0, 0, 0, 0x18, 'ftypheic', 0, 0, 0, 0);
eq('形式を中身で見る', [jpeg, png, gif, webp, heic, bytes(1, 2, 3)].map(m.attachKindOf), ['jpeg', 'png', 'gif', 'webp', 'heic', 'unknown']);
eq('★★★ WebP・HEIC・不明は JPEG に変える／JPEG・PNG・GIF はそのまま', ['webp', 'heic', 'unknown', 'jpeg', 'png', 'gif'].map(m.attachNeedsJpeg), [true, true, true, false, false, false]);
eq('拡張子は中身に合わせる', ['jpeg', 'png', 'gif'].map(m.attachExt), ['jpg', 'png', 'gif']);
const src = fs.readFileSync(path.join(__dirname, '..', 'src/app/lib/diary/forwardDiary.ts'), 'utf8');
eq('★★ 転送は形式を見て JPEG に変えている（URL の拡張子をそのまま使っていない）', [/attachNeedsJpeg\(kind\)/.test(src), /sharp\(buf\)[\s\S]{0,40}\.jpeg\(/.test(src), /split\('\.'\)\.pop\(\)/.test(src)], [true, true, false]);
console.log(fail === 0 ? '\n全部 ok' : `\n${fail} 件 NG`);
process.exit(fail === 0 ? 0 : 1);
