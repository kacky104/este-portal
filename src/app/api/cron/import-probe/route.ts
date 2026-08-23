import { NextResponse } from 'next/server';

// ── 外部媒体取り込みの疎通確認（第28便・段階0）───────────────────────────
// Vercel の本番サーバーから駅ちか（ranking-deli.jp）へ到達できるかを確かめるだけの
// 使い捨てルート。取り込み本体を作る前に「そもそも Vercel から読めるのか」を判定する。
//   - クラウドの開発環境からは駅ちかへ 403（許可リスト外）で到達できないため、
//     本番（Vercel）で確かめる必要がある。
//   - GET /api/cron/import-probe に Authorization: Bearer <CRON_SECRET> を付けて叩く。
//   - 在籍一覧ページと個人ページ1枚を取得し、ステータス・本文長・解析できるかを返す。
// 疎通が確認できたら、このファイルは削除してよい（本体 /api/cron/import-sources に置き換える）。
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UA = 'fukues-import/1.0 (+https://fukues.com)';
// enju（driver 店舗）の駅ちか。shop_id=42129。在籍一覧と、その中の1枚を試す。
const GIRLS_URL = 'https://ranking-deli.jp/fukuoka/area175/style8/42129/girls/';
const SHOP_BASE = 'https://ranking-deli.jp/fukuoka/area175/style8/42129/';

async function probe(url: string) {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ja,en;q=0.8' },
      cache: 'no-store',
      redirect: 'follow',
    });
    const body = await res.text();
    return {
      url,
      ok: res.ok,
      status: res.status,
      finalUrl: res.url,
      bytes: body.length,
      ms: Date.now() - started,
      // 解析可能かの目印（在籍一覧: 個人ページへのリンク数 / 個人ページ: 出勤予定の見出し）
      castLinks: (body.match(/\/42129\/\d+\//g) || []).length,
      hasSchedule: body.includes('1週間の出勤予定') || body.includes('出勤'),
      hasName: body.includes('セラピスト') || body.includes('嬢'),
    };
  } catch (e) {
    return { url, ok: false, error: e instanceof Error ? e.message : String(e), ms: Date.now() - started };
  }
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'CRON_SECRET is not set' }, { status: 500 });
  }
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const girls = await probe(GIRLS_URL);
  // 在籍一覧から個人ページ ID を1つ拾えたら、その1枚も取得してみる
  let firstCast: Awaited<ReturnType<typeof probe>> | null = null;
  if ('castLinks' in girls && girls.castLinks && girls.status === 200) {
    // castLinks の中身までは probe が返さないので、ここで軽く再取得して1件だけ拾う
    try {
      const html = await fetch(GIRLS_URL, { headers: { 'User-Agent': UA }, cache: 'no-store' }).then((r) => r.text());
      const id = (html.match(/\/42129\/(\d+)\//) || [])[1];
      if (id) firstCast = await probe(`${SHOP_BASE}${id}/`);
    } catch {
      /* noop */
    }
  }

  const reachable = girls.status === 200;
  return NextResponse.json({
    ok: reachable,
    verdict: reachable
      ? 'Vercel から駅ちかへ到達できました。取り込み実装に進めます。'
      : '駅ちかへ到達できませんでした（ブロックの可能性）。設計の見直しが必要です。',
    girls,
    firstCast,
  });
}
