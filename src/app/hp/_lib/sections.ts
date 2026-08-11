// 公式ホームページのセクション共通ロジック（2026-08-11 マルチページ化 段階1）。
//
// これまで HpTemplate.tsx の中に閉じていた「どのセクションが実際に画面に出るか」と
// 「ドロワーに何を並べるか」をここへ出す。公開ページが1枚では無くなるため、
// 外枠（HpShell）と本体（HpTemplate・各下層ページ）の両方が同じ判定を必要とする。
//
// ★ セクションの並び順の正は従来どおり lib/hpSite.ts の hpSectionOrder() ただ1つ。
//   このファイルは「出る／出ない」と「メニューの行き先」だけを持ち、並び順は持たない。

import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';
import type { HpSectionKey } from '@/app/lib/hpSite';
import type { HpPageData, HpCourse } from '@/app/hp/_lib/data';

/**
 * 公式HPのページ種別。
 *   home      … トップ（/ または /hp/{slug}）
 *   therapist … セラピスト一覧（/therapist）
 *   system    … コース料金（/system）
 *   terms     … 利用規約（/terms）
 */
export type HpPageKey = 'home' | 'therapist' | 'system' | 'news' | 'diary' | 'voice' | 'terms';

// ── トップに出す抜粋の件数（マルチページ時）──────────────
// トップと下層で同じ内容をそのまま二度出すと自社ドメイン内で重複コンテンツになるため、
// トップは「先頭だけ＋もっと見る」にして、全件は下層ページにだけ置く。
export const HP_DIGEST_THERAPISTS    = 6; // セラピスト（SP2列・PC4列のグリッドが埋まる数）
export const HP_DIGEST_COURSE_GROUPS = 1; // コース料金（主力コース1グループ）
export const HP_DIGEST_NEWS          = 3; // お知らせ（従来の表示件数と同じ）

/** courses を同名グループにまとめる（/salon/[id] の CoursesContent と同じ規約）。 */
export function groupCourses(courses: HpCourse[]): [string, HpCourse[]][] {
  return Array.from(
    courses.reduce((map, c) => {
      if (!map.has(c.name)) map.set(c.name, []);
      map.get(c.name)!.push(c);
      return map;
    }, new Map<string, HpCourse[]>())
  );
}

/**
 * 実際に画面へ出るセクション。ブロックの ON/OFF に加えて「中身があるか」も見る。
 * 交互の地色（hp-sec-alt）の計算と、ドロワーの項目の出し分けが同じ判定を使うための1本。
 */
export function hpVisibleSections(data: HpPageData): Record<HpSectionKey, boolean> {
  const { site, courses, therapists, coupons, news, freePages } = data;
  const b = site.blocks;
  const onDuty = therapists.filter((t) => t.onDuty);
  return {
    concept:    b.concept.on && Boolean(site.concept_text || site.concept_title),
    courses:    b.courses.on && groupCourses(courses).length > 0,
    therapists: b.therapists.on && therapists.length > 0,
    schedule:   b.schedule.on && onDuty.length > 0,
    diary:      b.diary.on,
    reviews:    b.reviews.on,
    coupon:     b.coupon.on && coupons.length > 0,
    news:       b.news.on && news.length > 0,
    freePages:  b.freePages.on && freePages.length > 0,
    info:       true,
    links:      b.links.on && site.link_banners.length > 0,
    banners:    site.banners.length > 0,
  };
}

/** 求人リンク（フクエスワークの求人ページ）を出すか。出すなら絶対URL、出さないなら null。 */
export function hpJobsUrl(data: HpPageData): string | null {
  const { site, salon, jobId } = data;
  return site.blocks.jobs.on && salon.jobsEnabled && jobId !== null
    ? `${EMBED_SITE_URL}/jobs/${jobId}`
    : null;
}

/**
 * 下層ページが存在するか（マルチページ時）。
 *
 * ★ ブロックの ON/OFF は見ない（2026-08-11 の設計判断）。
 *   マルチページ時、ON/OFF は「トップに抜粋を出すか」だけの意味になる。
 *   OFF にしてもコースやセラピストが登録されていれば下層ページとメニューの導線は残る
 *   ＝「料金はトップに載せず /system だけで見せたい」という運用ができる。
 *   下層ページ自体を消したいときは、中身（コース登録・在籍）を空にするか multipage を戻す。
 */
export function hpSubpages(data: HpPageData): {
  therapist: boolean;
  system:    boolean;
  news:      boolean;
  diary:     boolean;
  voice:     boolean;
} {
  const multi = data.site.blocks.multipage;
  const b = data.site.blocks;
  return {
    therapist: multi && data.therapists.length > 0,
    system:    multi && groupCourses(data.courses).length > 0,
    news:      multi && data.news.length > 0,
    // 写メ日記・口コミの中身は iframe（サーバー側から件数が見えない）ため、
    // この2つだけはブロックの ON/OFF をそのまま存在条件に使う。
    diary:     multi && b.diary.on,
    voice:     multi && b.reviews.on,
  };
}

export type HpMenuItem = {
  href:      string;
  label:     string;
  external?: boolean;
  /** 今いるページ自身か（aria-current="page" を付ける） */
  current?:  boolean;
};

/**
 * トップ内アンカーの href を作る。
 * トップに居るときは今までどおり素のハッシュ（'#therapist'）＝出力は従来と完全に同じ。
 * 下層ページからは「トップのURL＋ハッシュ」にする。
 *   独自ドメイン（basePath=''）… '/#therapist'
 *   暫定URL（basePath='/hp/x'）… '/hp/x#therapist'
 * 末尾にスラッシュを挟むと 308 リダイレクトが1回増えるので付けない。
 */
export function hpHashHref(basePath: string, page: HpPageKey, id: string): string {
  if (page === 'home') return `#${id}`;
  return basePath === '' ? `/#${id}` : `${basePath}#${id}`;
}

/**
 * ドロワーメニューの項目。
 *
 * 中身が無い／OFF のブロックは押しても動かないだけなので、最初からメニューに出さない。
 * 求人だけはページ内セクションではなくフクエスワークの求人ページへの外部リンク。
 */
export function hpMenuItems(data: HpPageData, page: HpPageKey): HpMenuItem[] {
  const visible = hpVisibleSections(data);
  const { basePath } = data;
  const hash = (id: string) => hpHashHref(basePath, page, id);
  const jobsUrl = hpJobsUrl(data);
  const multi = data.site.blocks.multipage;
  const subs = hpSubpages(data);

  // マルチページ時、セラピスト一覧と料金は下層ページへの本物のリンクになる。
  // ★ 出す条件が1ページ構成と違う: 下層ページが存在するか（＝中身があるか）で決まり、
  //   ブロックの ON/OFF（トップに抜粋を出すか）には従わない。トップから隠しても導線は残る。
  const therapistItem: HpMenuItem | null = multi
    ? subs.therapist
      ? { href: `${basePath}/therapist`, label: 'セラピスト一覧', current: page === 'therapist' }
      : null
    : visible.therapists
      ? { href: hash('therapist'), label: 'セラピスト一覧' }
      : null;
  const systemItem: HpMenuItem | null = multi
    ? subs.system
      ? { href: `${basePath}/system`, label: '料金システム', current: page === 'system' }
      : null
    : visible.courses
      ? { href: hash('menu'), label: '料金システム' }
      : null;

  const newsItem: HpMenuItem | null = multi
    ? subs.news
      ? { href: `${basePath}/news`, label: '新着情報', current: page === 'news' }
      : null
    : visible.news
      ? { href: hash('news'), label: '新着情報' }
      : null;
  const diaryItem: HpMenuItem | null = multi
    ? subs.diary
      ? { href: `${basePath}/diary`, label: '写メ日記', current: page === 'diary' }
      : null
    : visible.diary
      ? { href: hash('diary'), label: '写メ日記' }
      : null;
  const voiceItem: HpMenuItem | null = multi
    ? subs.voice
      ? { href: `${basePath}/voice`, label: '口コミ', current: page === 'voice' }
      : null
    : visible.reviews
      ? { href: hash('voice'), label: '口コミ' }
      : null;

  return [
    { href: page === 'home' ? '#top' : basePath || '/', label: 'TOP' },
    ...(newsItem !== null ? [newsItem] : []),
    ...(visible.schedule ? [{ href: hash('schedule'), label: '出勤スケジュール' }] : []),
    ...(therapistItem !== null ? [therapistItem] : []),
    ...(systemItem !== null ? [systemItem] : []),
    ...(diaryItem !== null ? [diaryItem] : []),
    ...(voiceItem !== null ? [voiceItem] : []),
    ...(jobsUrl !== null ? [{ href: jobsUrl, label: '求人情報', external: true }] : []),
    { href: hash('info'), label: '店舗情報' },
  ];
}

/**
 * フッターに出すページ一覧（マルチページ時のみ）。
 * 全ページから全ページへ内部リンクを通すのが目的なので、実在するページだけを並べる。
 */
export function hpFooterPageLinks(data: HpPageData): HpMenuItem[] {
  if (!data.site.blocks.multipage) return [];
  const subs = hpSubpages(data);
  const { basePath } = data;
  return [
    { href: basePath || '/', label: 'ホーム' },
    ...(subs.therapist ? [{ href: `${basePath}/therapist`, label: 'セラピスト一覧' }] : []),
    ...(subs.system    ? [{ href: `${basePath}/system`,    label: '料金・コース' }] : []),
    ...(subs.news      ? [{ href: `${basePath}/news`,      label: 'お知らせ' }] : []),
    ...(subs.diary     ? [{ href: `${basePath}/diary`,     label: '写メ日記' }] : []),
    ...(subs.voice     ? [{ href: `${basePath}/voice`,     label: '口コミ' }] : []),
    { href: `${basePath}/terms`, label: '利用規約' },
  ];
}

/**
 * タイプSのPCヘッダーに出る英字ナビ（デザイン都合の固定5項目・ドロワーとは別物）。
 * COMMON で display:none なので、タイプS以外では描かれても見えない。
 */
export function hpTopbarNavItems(data: HpPageData, page: HpPageKey): HpMenuItem[] {
  const { basePath } = data;
  const hash = (id: string) => hpHashHref(basePath, page, id);
  const subs = hpSubpages(data);
  // 下層ページがあるときだけ本物のリンクにする（中身ゼロで404になるページへは飛ばさない）。
  // 無ければ従来どおりトップ内アンカー（ドロワーと違い、ナビはデザイン都合の固定5項目なので残す）。
  return [
    { href: hash('concept'), label: 'CONCEPT' },
    subs.system
      ? { href: `${basePath}/system`, label: 'SYSTEM', current: page === 'system' }
      : { href: hash('menu'), label: 'SYSTEM' },
    subs.therapist
      ? { href: `${basePath}/therapist`, label: 'THERAPIST', current: page === 'therapist' }
      : { href: hash('therapist'), label: 'THERAPIST' },
    { href: hash('schedule'), label: 'SCHEDULE' },
    { href: hash('info'),     label: 'ACCESS' },
  ];
}
