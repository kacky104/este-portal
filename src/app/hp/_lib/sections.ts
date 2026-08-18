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
 *   schedule  … 出勤スケジュール（/schedule・7日タブ。2026-08-18 第23便）
 *   terms     … 利用規約（/terms）
 */
export type HpPageKey = 'home' | 'therapist' | 'system' | 'news' | 'schedule' | 'diary' | 'voice' | 'info' | 'terms';

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

/**
 * 7日ぶんの出勤予定が1件でもあるか（/schedule の存在条件）。
 * therapist.week は data.ts が weekDays と同じ並びで作った配列（出勤日は「12:00〜22:00」・休みは null）。
 */
export function hpHasAnyDuty(data: HpPageData): boolean {
  return data.therapists.some((t) => t.week.some((v) => v !== null));
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
  schedule:  boolean;
  diary:     boolean;
  voice:     boolean;
  info:      boolean;
} {
  const multi = data.site.blocks.multipage;
  return {
    therapist: multi && data.therapists.length > 0,
    system:    multi && groupCourses(data.courses).length > 0,
    news:      multi && data.news.length > 0,
    // 出勤スケジュール（2026-08-18 第23便）。7日ぶんのどこかに1人でも出勤があれば出す。
    // ★ 本日だけで判定しない。「今日は全員休みだが明日から出勤がある」店のページを
    //   404 にしてしまうため（週間表なのだから本日以外も中身に数える）。
    schedule:  multi && hpHasAnyDuty(data),
    // 写メ日記・口コミも「中身の有無」で判定（2026-08-11 修正）。
    // 以前は iframe で件数が見えず ON/OFF を存在条件にしていたが、HP直接描画に変えて
    // 件数（diaryCount / reviewCount）を取れるようになったため、他ページと同じ扱いに統一。
    // ON/OFF は全ページ共通で「トップに抜粋を出すか」だけの意味。
    diary:     multi && data.diaryCount > 0,
    voice:     multi && data.reviewCount > 0,
    // 店舗情報は常に中身がある（店名・エリアは必須データ）ので multipage だけで決まる
    info:      multi,
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
  // 出勤スケジュール（2026-08-18 第23便）。マルチページ時は7日タブの独立ページへ。
  // 1ページ構成のときは従来どおりトップの「本日の出勤」セクションへのアンカー。
  const scheduleItem: HpMenuItem | null = multi
    ? subs.schedule
      ? { href: `${basePath}/schedule`, label: '出勤スケジュール', current: page === 'schedule' }
      : null
    : visible.schedule
      ? { href: hash('schedule'), label: '出勤スケジュール' }
      : null;

  return [
    { href: page === 'home' ? '#top' : basePath || '/', label: 'TOP' },
    ...(newsItem !== null ? [newsItem] : []),
    ...(scheduleItem !== null ? [scheduleItem] : []),
    ...(therapistItem !== null ? [therapistItem] : []),
    ...(systemItem !== null ? [systemItem] : []),
    ...(diaryItem !== null ? [diaryItem] : []),
    ...(voiceItem !== null ? [voiceItem] : []),
    ...(jobsUrl !== null ? [{ href: jobsUrl, label: '求人情報', external: true }] : []),
    subs.info
      ? { href: `${basePath}/info`, label: '店舗情報', current: page === 'info' }
      : { href: hash('info'), label: '店舗情報' },
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
    ...(subs.schedule  ? [{ href: `${basePath}/schedule`,  label: '出勤スケジュール' }] : []),
    ...(subs.news      ? [{ href: `${basePath}/news`,      label: 'お知らせ' }] : []),
    ...(subs.diary     ? [{ href: `${basePath}/diary`,     label: '写メ日記' }] : []),
    ...(subs.voice     ? [{ href: `${basePath}/voice`,     label: '口コミ' }] : []),
    ...(subs.info      ? [{ href: `${basePath}/info`,      label: '店舗情報' }] : []),
    { href: `${basePath}/terms`, label: '利用規約' },
  ];
}

/**
 * タイプSのPCヘッダーに出る英字ナビ（デザイン都合の固定4項目・ドロワーとは別物）。
 * COMMON で display:none なので、タイプS以外では描かれても見えない。
 * 2026-08-11: CONCEPT・SCHEDULE を外し、NEWS を先頭に（NEWS/SYSTEM/THERAPIST/ACCESS）。
 */
export function hpTopbarNavItems(data: HpPageData, page: HpPageKey): HpMenuItem[] {
  const { basePath } = data;
  const hash = (id: string) => hpHashHref(basePath, page, id);
  const subs = hpSubpages(data);
  // 下層ページがあるときだけ本物のリンクにする（中身ゼロで404になるページへは飛ばさない）。
  // 無ければトップ内アンカーに落とす（お知らせ0件の店の NEWS など）。
  return [
    subs.news
      ? { href: `${basePath}/news`, label: 'NEWS', current: page === 'news' }
      : { href: hash('news'), label: 'NEWS' },
    subs.system
      ? { href: `${basePath}/system`, label: 'SYSTEM', current: page === 'system' }
      : { href: hash('menu'), label: 'SYSTEM' },
    subs.therapist
      ? { href: `${basePath}/therapist`, label: 'THERAPIST', current: page === 'therapist' }
      : { href: hash('therapist'), label: 'THERAPIST' },
    subs.info
      ? { href: `${basePath}/info`, label: 'ACCESS', current: page === 'info' }
      : { href: hash('info'), label: 'ACCESS' },
  ];
}
