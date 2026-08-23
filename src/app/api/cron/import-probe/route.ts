import { NextResponse } from 'next/server';

// ── 外部媒体取り込みの疎通確認 v2（第28便・段階0・診断強化版）─────────────
// v1 で Vercel から駅ちかへ 403（即時・本文118バイト）だった。
// IPブロックかヘッダー不足かを切り分けるため、
//   (1) 本物のブラウザ並みのヘッダーを付ける
//   (2) 弾かれた本文（先頭）を返して、ブロックの主体（Cloudflare/WAF等）を見る
//   (3) 複数URL・複数ヘッダーセットを一度に試す
// を行う。疎通できたら本体へ置き換え、このファイルは削除する。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ラビリンス（駅ちか shop_id=46440・area175 博多）で試す。
const URLS = {
  girls: 'https://ranking-deli.jp/fukuoka/area175/style8/46440/girls/',
  shop: 'https://ranking-deli.jp/fukuoka/area175/style8/46440/',
  top: 'https://ranking-deli.jp/',
};

// ヘッダーセット2種。A=最小、B=Chrome相当のフルセット。
const HEADERS: Record<string, Record<string, string>> = {
  minimal: { 'User-Agent': 'fukues-import/1.0 (+https://fukues.com)' },
  browser: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
    Accept:
      'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
    'Upgrade-Insecure-Requests': '1',
    'sec-ch-ua': '"Chromium";v="140", "Not=A?Brand";v="24", "Google Chrome";v="140"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
  },
};

async function probe(url: string, headers: Record<string, string>) {
  const started = Date.now();
  try {
    const res = await fetch(url, { headers, cache: 'no-store', redirect: 'follow' });
    const body = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      server: res.headers.get('server'),
      cfRay: res.headers.get('cf-ray'),
      contentType: res.headers.get('content-type'),
      bytes: body.length,
      ms: Date.now() - started,
      bodyHead: body.slice(0, 300).replace(/\s+/g, ' ').trim(),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  if (req.headers.get('authorization') !== `Bearer ${secret}`)
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });

  const results: Record<string, unknown> = {};
  for (const [uKey, url] of Object.entries(URLS)) {
    for (const [hKey, headers] of Object.entries(HEADERS)) {
      results[`${uKey}/${hKey}`] = await probe(url, headers);
    }
  }

  const anyOk = Object.values(results).some((r) => r && typeof r === 'object' && (r as { ok?: boolean }).ok);
  return NextResponse.json({
    ok: anyOk,
    verdict: anyOk
      ? '到達できた組み合わせがあります（下の結果で ok:true を確認）。'
      : 'すべて弾かれました。bodyHead と server/cfRay でブロック主体を判定します。',
    results,
  });
}
