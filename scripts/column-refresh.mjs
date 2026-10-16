// コラム月1自動リライト（フクエス本体 / フクエスワーク）。カッキーさん決定 2026-10-16。
//
// 何をするか:
//   指定ディレクトリの *.md のうち「(updatedAt ?? publishedAt) がいちばん古い」記事を1本選び、
//   Claude の Messages API で本文を今の時期に合わせて自然に新しくし、歯止め（columnRefreshGuard）を
//   通してから、updatedAt を当日（JST）にしてファイルを書き換える。commit / push はワークフロー側。
//   DB・Storage・認証には触れない。本文の Markdown だけを相手にする。
//
// 使い方:
//   node scripts/column-refresh.mjs --dir src/content/column
//   node scripts/column-refresh.mjs --dir src/content/work-column --dry
//     --dry: ファイルを書かない。選んだ記事を表示する。ANTHROPIC_API_KEY があれば
//            リライト→歯止めまで試して結果（合否・文字数）も出すが、書き込みはしない。
//
// 必要なもの: 環境変数 ANTHROPIC_API_KEY（--dry でキー無しなら選択の表示だけ）。
//             node 標準のみ（依存なし）。歯止めは src/lib/columnRefreshGuard.ts を
//             node のネイティブ型ストリップでそのまま import する（CI は node 24）。

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { checkRefresh, charCount } from '../src/lib/columnRefreshGuard.ts';

// 使うモデル。
// ※ 指示書のモデル名「claude-sonnet-5-5」は Claude のモデル一覧に存在しない（現行の Sonnet は
//   claude-sonnet-4-6）。ここでは実在する現行 Sonnet を既定にし、環境変数で差し替えられるようにした。
//   本当に別のモデル名で動かしたいときは ANTHROPIC_MODEL で上書きする。
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6';
const API_URL = 'https://api.anthropic.com/v1/messages';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function die(msg) {
  console.error(`✖ ${msg}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { dir: '', dry: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') {
      args.dir = argv[i + 1] || '';
      i += 1;
    } else if (a === '--dry') {
      args.dry = true;
    }
  }
  return args;
}

// frontmatter（1行「key: value」）と本文を分ける。workColumnFiles.ts と同じ最低限の読み方。
function splitFrontmatter(raw) {
  const lines = raw.replace(/\r\n/g, '\n').split('\n');
  if (lines[0]?.trim() !== '---') return null;
  let end = -1;
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) return null;
  const meta = {};
  for (let i = 1; i < end; i += 1) {
    const m = /^([A-Za-z_][A-Za-z0-9_]*):(?:\s+(.*))?$/.exec(lines[i]);
    if (m) meta[m[1]] = (m[2] ?? '').trim();
  }
  return {
    meta,
    frontLines: lines.slice(1, end), // --- と --- の間
    body: lines.slice(end + 1).join('\n').trim(),
  };
}

// (updatedAt ?? publishedAt) が最も古いもの。同じなら publishedAt が古いもの、それも同じなら slug 順。
function pickOldest(dir) {
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_'))
    .map((f) => f.slice(0, -3))
    .sort();
  const items = [];
  for (const slug of files) {
    const full = path.join(dir, `${slug}.md`);
    const parsed = splitFrontmatter(fs.readFileSync(full, 'utf8'));
    if (!parsed) die(`frontmatter を読めない: ${full}`);
    const publishedAt = parsed.meta.publishedAt || '';
    if (!DATE_RE.test(publishedAt)) die(`publishedAt が YYYY-MM-DD でない: ${full}`);
    const updatedAt = parsed.meta.updatedAt || '';
    if (updatedAt && !DATE_RE.test(updatedAt)) die(`updatedAt が YYYY-MM-DD でない: ${full}`);
    items.push({ slug, full, publishedAt, updatedAt, effective: updatedAt || publishedAt, parsed });
  }
  if (items.length === 0) die(`記事が無い: ${dir}`);
  items.sort((a, b) => {
    if (a.effective !== b.effective) return a.effective < b.effective ? -1 : 1;
    if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? -1 : 1;
    return a.slug < b.slug ? -1 : 1;
  });
  return items[0];
}

// JST の当日 YYYY-MM-DD。
function todayJst() {
  // en-CA ロケールは YYYY-MM-DD 形式。timeZone で JST に固定する。
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// frontmatter の updatedAt を当日に書き換える（無ければ publishedAt の次の行に足す）。
function withUpdatedAt(frontLines, today) {
  // すでに updatedAt 行があれば、その値だけ当日に差し替える。
  if (frontLines.some((line) => /^updatedAt:/.test(line.trim()))) {
    return frontLines.map((line) => (/^updatedAt:/.test(line.trim()) ? `updatedAt: ${today}` : line));
  }
  // 無ければ publishedAt の直後に足す。
  const out = [];
  for (const line of frontLines) {
    out.push(line);
    if (/^publishedAt:/.test(line.trim())) out.push(`updatedAt: ${today}`);
  }
  return out;
}

function readerKind(dir) {
  // src/content/work-column → ワーク（働きたい女性向け）／それ以外 → 本体（利用者向け）
  return dir.replace(/\\/g, '/').includes('work-column') ? 'ワーク' : '本体';
}

function buildPrompt(kind, today, title, body) {
  const reader =
    kind === 'ワーク'
      ? 'メンズエステで働きたい女性（これから働く人・働いている人）'
      : 'メンズエステを利用する一般の方';
  const system = [
    'あなたは健全なリラクゼーション／メンズエステのポータルサイトの編集者です。',
    `読者は「${reader}」です。`,
    '渡された記事本文（Markdown）を、内容の正確さと読みやすさを保ったまま、今の時期に合わせて自然に新しくしてください。',
    '',
    'してよいこと:',
    '・古い季節の話題や言い回しを今に合わせる。',
    '・分かりにくい段落を書き直す。',
    '・見出し（##）を1つまで足してよい。まとめの段落を書き直してよい。',
    '',
    '必ず守ること:',
    '・見出しの構成（既存の ## 見出し）は残す。減らさない。',
    '・既存の内部リンク（](/column/… ](/glossary/… ](/jobs/… など ](/ で始まるもの）はすべてそのまま残す。',
    '・外部リンク（http:// https://）、電話番号、具体的な金額（◯円）、店舗名を新たに書かない。',
    '・性的なサービスを思わせる表現は書かない（健全なリラクゼーション・メンズエステの範囲）。',
    '・本文の長さは元と大きく変えない（短くしすぎない・増やしすぎない）。',
    '',
    `今日は ${today}（日本時間）です。`,
    '返答は本文の Markdown だけにしてください。frontmatter（--- で囲む部分）や前置き・あいさつは一切付けないでください。',
  ].join('\n');
  const user = [
    `タイトル: ${title}`,
    '',
    '--- ここから元の本文 ---',
    body,
    '--- ここまで元の本文 ---',
    '',
    '上のルールに従って新しくした本文の Markdown だけを返してください。',
  ].join('\n');
  return { system, user };
}

async function callClaude(system, user) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) die('ANTHROPIC_API_KEY が無い');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5 * 60 * 1000); // 5分で打ち切り
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 16000,
        system,
        messages: [{ role: 'user', content: user }],
      }),
    });
  } catch (e) {
    die(`API 呼び出しに失敗: ${e && e.message ? e.message : e}`);
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  if (!res.ok) die(`API がエラー（HTTP ${res.status}）: ${text.slice(0, 500)}`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    die(`API の返事を JSON として読めない: ${text.slice(0, 300)}`);
  }
  if (data.stop_reason === 'refusal') die('API が応答を拒否した（refusal）');
  if (data.stop_reason === 'max_tokens') die('API の出力が max_tokens で途切れた');
  const block = Array.isArray(data.content) ? data.content.find((b) => b.type === 'text') : null;
  if (!block || typeof block.text !== 'string' || block.text.trim() === '') {
    die('API の返事に本文テキストが無い');
  }
  return block.text.trim();
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.dir) die('--dir を指定してください（例: --dir src/content/column）');
  const dir = args.dir;
  if (!fs.existsSync(dir)) die(`ディレクトリが無い: ${dir}`);
  const kind = readerKind(dir);
  const chosen = pickOldest(dir);
  const today = todayJst();

  console.log(`[${kind}] 対象: ${chosen.slug}`);
  console.log(`  publishedAt=${chosen.publishedAt} updatedAt=${chosen.updatedAt || '(なし)'} 基準日=${chosen.effective}`);
  console.log(`  本文の文字数=${charCount(chosen.parsed.body)} モデル=${MODEL} 当日(JST)=${today}`);

  // --dry でキーが無ければ、選んだ記事の表示だけで終わり（API は呼ばない・書き込まない）。
  if (args.dry && !process.env.ANTHROPIC_API_KEY) {
    console.log('  --dry（キー無し）: 選択の表示のみ。API は呼ばず、書き込みもしない。');
    return;
  }

  const { system, user } = buildPrompt(kind, today, chosen.parsed.meta.title || chosen.slug, chosen.parsed.body);
  const next = await callClaude(system, user);
  const result = checkRefresh(chosen.parsed.body, next);
  console.log(`  リライト後の文字数=${charCount(next)} 歯止め=${result.ok ? 'OK' : 'NG'}`);
  if (!result.ok) die(`歯止めに引っかかったので公開しない: ${result.reason}`);

  if (args.dry) {
    console.log('  --dry: 歯止めまで OK。書き込みはしない。');
    return;
  }

  // frontmatter の updatedAt を当日にして、本文を差し替える。
  const front = withUpdatedAt(chosen.parsed.frontLines, today).join('\n');
  const out = `---\n${front}\n---\n\n${next}\n`;
  fs.writeFileSync(chosen.full, out, 'utf8');
  console.log(`  書き込み完了: ${chosen.full}`);

  // ワークフロー側が commit メッセージに使えるよう、slug と kind を出力する。
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `slug=${chosen.slug}\nkind=${kind}\n`);
  }
}

main().catch((e) => die(e && e.stack ? e.stack : String(e)));
