// テストから src/lib/*.ts を直接読むための解決フック（第38便）。
//
// ★ なぜ要るか
//   アプリ側のコードは Next.js の作法で `import { x } from './y'`（拡張子なし）と書く。
//   Node に直接読ませるとこれが解決できない（ESMは拡張子が要る）。
//   アプリ側を Node に合わせて書き換えると Next 側の作法から外れるので、
//   【テストのときだけ】拡張子を補う。アプリのコードは触らない。
//
// 使い方（テストファイルの先頭）:
//   import { register } from 'node:module';
//   register('./tools-ts-resolve.mjs', import.meta.url);
//   const M = await import('./src/lib/xxx.ts');   // ← register 後なので動的 import で

// ★ 第40便で追加: `@/...`（tsconfig の paths エイリアス）も解決する。
//   src/lib/therapistStatusBadge.ts のように、アプリ側が `@/lib/imasugu` と書いているファイルを
//   テストから読めるようにするため。★ アプリのコードは触らない、という方針は同じ。

import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');

function withTsExtension(absNoExt) {
  for (const ext of ['.ts', '.tsx', '']) {
    if (existsSync(absNoExt + ext)) return absNoExt + ext;
  }
  return null;
}

export function resolve(specifier, context, next) {
  // `@/lib/xxx` → <repo>/src/lib/xxx.ts
  if (specifier.startsWith('@/')) {
    const hit = withTsExtension(path.join(SRC, specifier.slice(2)));
    if (hit) return next(pathToFileURL(hit).href, context);
  }
  if (specifier.startsWith('.') && !/\.(ts|tsx|js|mjs|cjs|json)$/i.test(specifier)) {
    const candidate = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return next(specifier + '.ts', context);
  }
  return next(specifier, context);
}
