// salons.courses(JSON) から「サロンカードに出す最安コース料金」を算出する共有ヘルパー。
// salons 一覧の取得層（lib/salons）とピックアップ（lib/featured）で共有し、二重実装を避ける。
//
// 対象は「通常コース」のみ。courses JSON では「その他メニュー（延長/オプション/指名料 等）」が
// name: 'その他' として保存される（mypage の buildCoursesJson / parseCourseGroups と同じ規約）。
// その他はラベルに「30分」等の数字が入りうるため、テキストではなく name==='その他' で構造的に除外する
// （buildRepresentativePrice の groups-only スコープと一致）。さらにカードの「○分 ¥○」形式に合わせ、
// duration が時間（○分）の行のみを対象に、price を数値抽出して最小を選ぶ。
// 整形フォーマットは従来の代表料金（salons.price / buildRepresentativePrice）と同じ「60分 ¥8,000」。

// その他メニューのカテゴリ名（mypage 側の予約名と一致させる）。
const OTHER_CATEGORY = 'その他';

type CourseLike = { duration?: string | null; price?: string | null; name?: string | null };

// 表示用 price 文字列（例「¥11,000」「8000円」）から比較用の数値を抽出。数値が無ければ null。
function priceToNumber(price: string | null | undefined): number | null {
  const digits = String(price ?? '').replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = parseInt(digits, 10);
  return Number.isNaN(n) ? null : n;
}

// 「○分」を含む行か（指名料・極液など時間の無い項目を除外）。
function hasMinutes(duration: string): boolean {
  return /\d+\s*分/.test(duration);
}

/**
 * courses の中で「時間付き かつ price 最小」のコースを「duration price」で返す（例「60分 ¥8,000」）。
 * 対象が無ければ空文字を返す（呼び出し側でフォールバック）。同額複数は先に見つかった最安を採用。
 */
export function cheapestCoursePrice(courses: unknown): string {
  if (!Array.isArray(courses)) return '';
  let best: { num: number; duration: string; price: string } | null = null;
  for (const c of courses as CourseLike[]) {
    // その他メニュー（延長/オプション/指名料等）は構造的に除外（ラベルに数字が入っても拾わない）。
    if (String(c?.name ?? '').trim() === OTHER_CATEGORY) continue;
    const duration = String(c?.duration ?? '').trim();
    const price = String(c?.price ?? '').trim();
    if (!duration || !price || !hasMinutes(duration)) continue;
    const num = priceToNumber(price);
    if (num == null) continue;
    if (!best || num < best.num) best = { num, duration, price };
  }
  return best ? `${best.duration} ${best.price}` : '';
}
