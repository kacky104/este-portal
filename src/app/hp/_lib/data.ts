// 公式ホームページ（/hp/[slug]）のデータ組み立て層（2026-08-08 段階2）。
//
// ここで全ブロックぶんのデータを一度に組み立て、ひな形（_templates/）には
// 「同じ形の props」を渡す。ひな形はレイアウトと装飾だけを持ち、データ取得をしない
// （＝ひな形を増やしてもこのファイルは変わらない。設計メモ6章の境界線）。
//
// - createPublicClient（anon・cookie なし）で取得するため、呼び出し元ページの ISR が効く。
// - 掲載データ（salons / therapists / therapist_schedules / coupons / announcements /
//   salon_free_pages）をそのまま流用する＝二重入力なし。
// - 写メ日記・口コミは iframe 埋め込み（/embed/salon/[id]/*）を使うためここでは取得しない
//   （重複コンテンツ回避。設計メモ4章）。

import { createPublicClient } from '@/app/lib/supabase/public';
import { createServiceClient } from '@/app/lib/supabase/service';
import { getBusinessDateJST } from '@/lib/dutyStatus';
import { sanitizeBadges } from '@/lib/therapistBadges';
import {
  type HpSite,
  type HpTemplateKey,
  HP_DEMO_SLUG,
  HP_SITE_COLUMNS,
  hpSiteKeyColumn,
  isHpDomainKey,
  mapHpSiteRow,
  normalizeHpSiteKey,
} from '@/app/lib/hpSite';

export type HpCourse = { name: string; duration: string; price: string };

export type HpTherapist = {
  id:          string;
  name:        string;
  age:         number | null;
  imageUrl:    string | null;
  onDuty:      boolean;        // 本日出勤か
  todayTime:   string | null;  // 「12:00〜22:00」形式（出勤日のみ）
  catchphrase: string;         // ひとことキャッチ（therapists.catchphrase）
  bodyType:    string;         // 体型（therapists.body_type）
  badges:      string[];       // 特徴バッジ（lib/therapistBadges の sanitizeBadges 済みラベル）
  /** 週間スケジュール用。days[i] は weekDays[i] に対応（出勤日は「12:00〜22:00」・休みは null） */
  week:        (string | null)[];
};

/** 週間スケジュールの日付見出し（本日から blocks.schedule.days 日ぶん）。 */
export type HpWeekDay = {
  date:    string;  // 'YYYY-MM-DD'
  label:   string;  // 「8/9」
  weekday: string;  // 「日」
  isToday: boolean;
  /** 土=sat / 日=sun / 平日=空文字（色分け用） */
  tone:    'sat' | 'sun' | '';
};

export type HpCouponItem = { id: string; title: string; discount: string; conditions: string };
export type HpNewsItem   = { id: string; title: string; content: string; createdAt: string };
export type HpFreePage   = { id: number; title: string; body: string; images: string[] };

export type HpPageData = {
  site:   HpSite;
  salon: {
    id:          number;
    name:        string;
    catchphrase: string;
    area:        string;
    address:     string;
    access:      string;
    hours:       string;
    closedDays:  string;
    phone:       string;
    lineUrl:     string;
    jobsEnabled: boolean;
    /** 支払い方法のスラッグ（salons.payment_methods）。表示は paymentMethodLabel() で変換 */
    paymentMethods: string[];
  };
  courses:    HpCourse[];
  therapists: HpTherapist[];
  coupons:    HpCouponItem[];
  news:       HpNewsItem[];
  freePages:  HpFreePage[];
  /** フクエスワークの求人ID（求人リンクブロック用。無ければ null） */
  jobId:      number | null;
  /** 本日の営業日（JST・午前6時切替）の表示ラベル（例「8/9 (土)」）。出勤ブロックの日付表示用 */
  todayLabel: string;
  /** 週間スケジュールの日付列（本日から blocks.schedule.days 日ぶん） */
  weekDays:   HpWeekDay[];
  /** テーマ壁紙のURL（theme_wallpapers・/admin でアップロードした画像を流用）。無ければ null */
  wallpaperUrl: string | null;
  /**
   * このサイトのルート（同一サイト内リンクの前置き）。
   *   独自ドメイン経由 … '' （/terms でそのまま届く。proxy.ts が /hp/{host}/terms へ rewrite）
   *   暫定URL         … '/hp/{slug}'
   * ページ内で「/利用規約」等へ飛ばすときは必ずこれを前に付ける。
   */
  basePath: string;
};

// ひな形ごとに敷くテーマ壁紙のキー（theme_wallpapers.theme_key）。
// A（LUXE・黒基調）はフクエスの「ブラック」壁紙を薄く敷く（2026-08-08 要望）。
// S/B/C は現状なし（敷きたくなったらここにキーを足すだけ）。
const HP_WALLPAPER_THEME: Record<HpTemplateKey, string | null> = {
  s: null,
  a: 'black',
  b: null,
  c: null,
};

/** HH:MM:SS → HH:MM（therapist_schedules の time 列表示用） */
function hm(v: unknown): string {
  const s = String(v ?? '');
  return /^\d{1,2}:\d{2}/.test(s) ? s.slice(0, 5) : s;
}

/**
 * URLキー（slug または独自ドメイン）から公開ページ用データ一式を取得する。サイト行が無ければ null。
 * status のゲート（live 以外は準備中ページ）は呼び出し側（page.tsx）で行う。
 *
 * キーの解釈は lib/hpSite.ts の hpSiteKeyColumn（ドットを含めば domain、含まなければ slug）。
 * 独自ドメイン経由（proxy.ts の rewrite）でも同じ関数で引ける。
 *
 * designOverride: ギャラリーの実物プレビュー（/hp/[slug]/preview/…）用。DBの値の代わりに
 * 指定のひな形・カラーで組み立てる（壁紙もひな形に追従）。保存はしない・表示だけ。
 */
export async function fetchHpPageData(
  key: string,
  designOverride?: { template_key: HpTemplateKey; theme_key: string },
): Promise<HpPageData | null> {
  const siteKey = normalizeHpSiteKey(key);
  // ★ デモ店舗だけ service_role で読む（2026-08-10）。
  //   デモ用サロンは「フクエス本体の一覧に出さない」ため is_hidden=true で作るが、
  //   salons は非表示の店を anon から隠す設定になっており、公開ページ（anon）だと
  //   サロンが取得できず 404 になっていた（/hp/demo だけ404・/hp/test-shop は正常、が症状）。
  //   デモは運営が作る固定の1件（slug は予約語）なので、ここだけ権限を上げて確実に描画する。
  //   ※ このファイルはサーバー専用（page.tsx からのみ import）。キーはクライアントに出ない。
  const supabase = siteKey === HP_DEMO_SLUG ? createServiceClient() : createPublicClient();
  const { data: siteRow, error: siteErr } = await supabase
    .from('salon_sites')
    .select(HP_SITE_COLUMNS)
    .eq(hpSiteKeyColumn(siteKey), siteKey)
    .maybeSingle();
  // ★ エラーは握りつぶさず投げる。null を返すと呼び出し元が notFound() を呼び、
  //   その404がISRキャッシュに焼き付いて「DBを直しても404のまま」になるため
  //   （2026-08-10 に実際に発生: 列追加SQLの適用前にデプロイした数分間の404が居座った）。
  //   例外なら500になりキャッシュされないので、原因を直せば次のアクセスで復旧する。
  if (siteErr) throw new Error(`salon_sites の取得に失敗: ${siteErr.message}`);
  if (!siteRow) return null;
  const site = mapHpSiteRow(siteRow as Record<string, unknown>);
  if (designOverride) {
    site.template_key = designOverride.template_key;
    site.theme_key = designOverride.theme_key;
  }
  const salonId = site.salon_id;

  const { data: salonRow, error: salonErr } = await supabase
    .from('salons')
    .select('id, name, catchphrase, area, address, access, hours, closed_days, phone, line_url, jobs_enabled, payment_methods, courses, is_hidden')
    .eq('id', salonId)
    .maybeSingle();
  if (salonErr) throw new Error(`salons の取得に失敗: ${salonErr.message}`);
  if (!salonRow) return null;
  // is_hidden の店は公開HPも出さない。ただしデモ店舗（slug='demo'）は例外：
  // デモ用サロンはフクエス本体の店舗一覧に出したくないので is_hidden=true で作る運用のため
  // （デザイン一覧 /hp/templates からのプレビュー専用。2026-08-09）。
  if (salonRow.is_hidden && siteKey !== HP_DEMO_SLUG) return null;

  const today = getBusinessDateJST();
  // 週間スケジュールの表示日数（1〜7）。sanitizeHpBlocks で丸め済み。
  const weekDays = buildWeekDays(today, site.blocks.schedule.days);
  const lastDay = weekDays[weekDays.length - 1]?.date ?? today;

  // セラピストだけ先に引く。出勤は therapist_id で自店に絞りたいため
  // （therapist_schedules に salon_id が無い。絞らないと全店舗ぶんを取ってしまい、
  //   週間表示で日数が増えたときに PostgREST の既定上限1000行を超えて取りこぼす）。
  const therapistRes = await supabase
    .from('therapists')
    .select('id, name, age, profile_image_url, catchphrase, body_type, feature_badges')
    .eq('salon_id', salonId);
  const therapistIds = (therapistRes.data ?? []).map((t) => String(t.id));

  const [schedRes, couponRes, newsRes, freeRes, jobRes] = await Promise.all([
    therapistIds.length > 0
      ? supabase
          .from('therapist_schedules')
          .select('therapist_id, schedule_date, is_active, start_time, end_time')
          .in('therapist_id', therapistIds)
          .gte('schedule_date', today)
          .lte('schedule_date', lastDay)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    supabase
      .from('coupons')
      .select('id, title, discount, conditions')
      .eq('salon_id', salonId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      .limit(3),
    supabase
      .from('announcements')
      .select('id, title, content, created_at')
      .eq('salon_id', salonId)
      .eq('is_published', true)
      .order('created_at', { ascending: false })
      // トップに出すのは先頭3件（HP_DIGEST_NEWS）。残りはお知らせページ（/news）用。
      .limit(20),
    supabase
      .from('salon_free_pages')
      .select('id, title, body, images')
      .eq('salon_id', salonId)
      .order('display_order', { ascending: true })
      .limit(3),
    supabase
      .from('salon_jobs')
      .select('id')
      .eq('salon_id', salonId)
      .eq('is_active', true)
      .maybeSingle(),
  ]);

  // テーマ壁紙（ひな形に対応するキーがある場合のみ・/salon/[id] と同じ theme_wallpapers を流用）
  const wallpaperKey = HP_WALLPAPER_THEME[site.template_key];
  let wallpaperUrl: string | null = null;
  if (wallpaperKey) {
    const { data: wp } = await supabase
      .from('theme_wallpapers')
      .select('image_url')
      .eq('theme_key', wallpaperKey)
      .maybeSingle();
    wallpaperUrl = (wp?.image_url as string | undefined) ?? null;
  }

  // 出勤マップ（`${日付}|${セラピストID}` → 「12:00〜22:00」）。is_active のみ入れる。
  const dutyMap = new Map<string, string>();
  (schedRes.data ?? []).forEach((r) => {
    if (!r.is_active) return;
    dutyMap.set(`${String(r.schedule_date)}|${String(r.therapist_id)}`, `${hm(r.start_time)}〜${hm(r.end_time)}`);
  });

  const therapists: HpTherapist[] = (therapistRes.data ?? []).map((t) => {
    const week = weekDays.map((d) => dutyMap.get(`${d.date}|${String(t.id)}`) ?? null);
    const duty = week[0] ?? null; // 先頭＝本日
    return {
      id:          String(t.id),
      name:        (t.name as string) ?? '',
      age:         (t.age as number | null) ?? null,
      imageUrl:    (t.profile_image_url as string | null) ?? null,
      onDuty:      duty !== null,
      todayTime:   duty,
      catchphrase: (t.catchphrase as string | null) ?? '',
      bodyType:    (t.body_type as string | null) ?? '',
      badges:      sanitizeBadges(t.feature_badges),
      week,
    };
  });
  // 出勤中を先頭に（並びの安定のため名前で二次ソート）
  therapists.sort((x, y) => Number(y.onDuty) - Number(x.onDuty) || x.name.localeCompare(y.name, 'ja'));

  const courses: HpCourse[] = Array.isArray(salonRow.courses)
    ? (salonRow.courses as Record<string, unknown>[])
        .map((c) => ({
          name:     String(c?.name ?? ''),
          duration: String(c?.duration ?? ''),
          price:    String(c?.price ?? ''),
        }))
        .filter((c) => c.duration !== '' && c.price !== '')
    : [];

  return {
    site,
    basePath: isHpDomainKey(siteKey) ? '' : `/hp/${siteKey}`,
    salon: {
      id:          Number(salonRow.id),
      name:        (salonRow.name as string) ?? '',
      catchphrase: (salonRow.catchphrase as string) ?? '',
      area:        (salonRow.area as string) ?? '',
      address:     (salonRow.address as string) ?? '',
      access:      (salonRow.access as string) ?? '',
      hours:       (salonRow.hours as string) ?? '',
      closedDays:  (salonRow.closed_days as string) ?? '',
      phone:       (salonRow.phone as string) ?? '',
      lineUrl:     (salonRow.line_url as string) ?? '',
      jobsEnabled: Boolean(salonRow.jobs_enabled),
      paymentMethods: Array.isArray(salonRow.payment_methods)
        ? (salonRow.payment_methods as string[]).filter((v) => typeof v === 'string')
        : [],
    },
    courses,
    therapists,
    coupons: (couponRes.data ?? []).map((c) => ({
      id: String(c.id), title: (c.title as string) ?? '', discount: (c.discount as string) ?? '', conditions: (c.conditions as string) ?? '',
    })),
    news: (newsRes.data ?? []).map((n) => ({
      id: String(n.id), title: (n.title as string) ?? '', content: (n.content as string) ?? '', createdAt: (n.created_at as string) ?? '',
    })),
    freePages: (freeRes.data ?? []).map((f) => ({
      id: Number(f.id), title: (f.title as string) ?? '', body: (f.body as string) ?? '',
      images: Array.isArray(f.images) ? (f.images as string[]).filter((u) => typeof u === 'string') : [],
    })),
    jobId: jobRes.data ? Number(jobRes.data.id) : null,
    todayLabel: formatTodayLabel(today),
    weekDays,
    wallpaperUrl,
  };
}

const WEEKDAY_JP = ['日', '月', '火', '水', '木', '金', '土'];

/** 本日（営業日基準）から days 日ぶんの日付列を作る。曜日は UTC 基準で計算（ズレ防止）。 */
function buildWeekDays(todayYmd: string, days: number): HpWeekDay[] {
  const m = todayYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return [];
  const base = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Array.from({ length: days }, (_, i) => {
    const d = new Date(base + i * 86400000);
    const wd = d.getUTCDay();
    return {
      date:    d.toISOString().slice(0, 10),
      label:   `${d.getUTCMonth() + 1}/${d.getUTCDate()}`,
      weekday: WEEKDAY_JP[wd],
      isToday: i === 0,
      tone:    wd === 6 ? ('sat' as const) : wd === 0 ? ('sun' as const) : ('' as const),
    };
  });
}

/** 'YYYY-MM-DD' → 「M/D (曜)」。営業日基準の日付をそのまま表示する。 */
function formatTodayLabel(ymd: string): string {
  const m = ymd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  const wd = ['日', '月', '火', '水', '木', '金', '土'][d.getUTCDay()];
  return `${Number(m[2])}/${Number(m[3])} (${wd})`;
}
