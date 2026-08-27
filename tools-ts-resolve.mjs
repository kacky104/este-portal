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

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function resolve(specifier, context, next) {
  if (specifier.startsWith('.') && !/\.(ts|tsx|js|mjs|cjs|json)$/i.test(specifier)) {
    const candidate = new URL(specifier + '.ts', context.parentURL);
    if (existsSync(fileURLToPath(candidate))) return next(specifier + '.ts', context);
  }
  return next(specifier, context);
}
