// マルチページの下層ページの「中身」（2026-08-11）。
//
// なぜ切り出したか:
//   実ページ（/therapist など）とデザインプレビュー（/preview/{ひな形}/{カラー}/therapist）で
//   まったく同じ中身を出したいため。ページ側にJSXを置いたままプレビューを別に書くと、
//   片方だけ直して食い違う（HpShell を切り出したときと同じ理由）。
//
// 役割分担:
//   - ここ            … 表示してよいかの判定（isHpXxxOpen）と中身（HpXxxView）
//   - 各 page.tsx     … URL・ISR設定・メタデータ・データ取得・404 の判断
//   - preview/…/[page]… 同じ View を、配色を差し替えたデータで描くだけ
//
// preview を true にすると構造化データ（JSON-LD）を出さない。
// プレビューは noindex の一時的なURLなので、canonical と食い違う JSON-LD を出さないため。

import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';
import type { HpPageData, HpTherapist } from '@/app/hp/_lib/data';
import { hpSiteOrigin } from '@/app/hp/_lib/meta';
import { groupCourses, hpHasAnyDuty } from '@/app/hp/_lib/sections';
import {
  fetchHpDiaryItems,
  fetchHpReviews,
  fetchHpTherapistDiaryItems,
  HP_THERAPIST_VOICE_LIMIT,
  type HpTherapistDetail,
} from '@/app/hp/_lib/subpageData';
import { buildHpTerms } from '@/app/hp/_lib/terms';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { CourseGroups, Crumb, ScheduleRows, SecHead, TherapistCards } from '@/app/hp/_templates/parts';
import { HP_DEMO_SLUG, normalizeHpSiteKey } from '@/app/lib/hpSite';
import { buildBreadcrumbJsonLd, buildItemListJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { paymentMethodLabel } from '@/app/lib/paymentMethods';
import { getApprovedReviews, getSalonReviewStats } from '@/app/lib/reviews';

type ViewProps = {
  data: HpPageData;
  /** デザインプレビューとして描くか（true なら JSON-LD を出さない） */
  preview?: boolean;
};

/** 公開中で、マルチページ構成か。各ページの共通の前提。 */
function isMultipageLive(data: HpPageData): boolean {
  return data.site.status === 'live' && data.site.blocks.multipage;
}

/** デモ店（写メ日記・口コミを全店ぶん出す唯一の例外）か。 */
function isDemoSite(data: HpPageData): boolean {
  return normalizeHpSiteKey(data.site.slug) === HP_DEMO_SLUG;
}

/** パンくずの構造化データ（下層ページ共通）。 */
function CrumbJsonLd({ data, label, path, preview }: { data: HpPageData; label: string; path: string; preview?: boolean }) {
  // 構造化データは独自ドメインで公開しているときだけ（暫定URLとプレビューは noindex なので不要）。
  // ★ origin を必ず渡すこと。省略すると fukues.com の絶対URLになり、canonical と食い違う。
  const origin = preview ? null : hpSiteOrigin(data);
  if (!origin) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: toJsonLdString(
          buildBreadcrumbJsonLd([{ name: data.salon.name, path: '/' }, { name: label, path }], { origin }),
        ),
      }}
    />
  );
}

// ── セラピスト一覧 ───────────────────────────────────
export function isHpTherapistOpen(data: HpPageData): boolean {
  // ★ ブロックの ON/OFF は見ない。マルチページ時の ON/OFF は「トップに抜粋を出すか」だけの
  //   意味で、OFF＝トップに載せない店でもこのページとメニューの導線は残る（2026-08-11）。
  return isMultipageLive(data) && data.therapists.length > 0;
}

export function HpTherapistView({ data, preview }: ViewProps) {
  const { salon, therapists, basePath } = data;
  const homeHref = basePath || '/';
  const origin = preview ? null : hpSiteOrigin(data);

  return (
    <HpShell data={data} page="therapist">
      <section id="therapist" className="hp-sec hp-sec-therapists" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="セラピスト" />
        <SecHead no="03" en="Therapist" jp="セラピスト" />
        {/* このページが出ている時点で個別ページの存在条件（マルチページ＋在籍1名以上）は満たすので、
            detailBase は常に basePath（2026-08-20 第25便・HP内の個別ページへ） */}
        <TherapistCards therapists={therapists} grid detailBase={basePath} />
        <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
      </section>

      <CrumbJsonLd data={data} label="セラピスト" path="/therapist" preview={preview} />
      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdString(
              // 順序・件数は画面に出しているカードと同じにすること（非表示コンテンツはNG）。
              // ★ 2026-08-20（第25便）: カードのリンク先がHP内の個別ページになったので、
              //   ItemList の origin も自サイトに変更（画面のリンクと食い違わせない）。
              //   個別ページは noindex だが、実在するURLなので ItemList に載せて問題ない。
              buildItemListJsonLd(
                therapists.map((t) => ({ name: t.name, path: `/therapist/${t.id}` })),
                { name: `${salon.name} セラピスト一覧`, origin },
              ),
            ),
          }}
        />
      )}
    </HpShell>
  );
}

// ── セラピスト個別ページ（2026-08-20 第25便）──────────────
//
// マルチページの店だけが持つ。一覧・トップ・出勤表のカードから同じタブで遷移する。
// ★ このページは【noindex】（オーナー判断・2026-08-20）。フクエス本体の /therapist/[id] と
//   内容が重複するため、検索対象は本体側に一本化する。よって JSON-LD も出さない。
// ★ 写メ日記・口コミは本体のセラピストページに任せ、ここからは外部リンクで送る
//   （「HPからフクエスへの実流入」という従来設計の導線を絶やさないため）。
// ★ 新しい hp-thd-* のCSSは styles.ts の COMMON に1式だけ持つ（配色は --hp-accent 変数で
//   受けるので、ひな形・配色ごとの追加CSSは不要）。

export async function HpTherapistDetailView({
  data,
  therapist,
  detail,
}: {
  data: HpPageData;
  /** data.therapists の中の1人（page.tsx が存在確認済みのものを渡す） */
  therapist: HpTherapist;
  detail: HpTherapistDetail;
}) {
  const { weekDays, basePath } = data;
  const homeHref = basePath || '/';
  const listHref = `${basePath}/therapist`;
  const t = therapist;
  // 写真: 複数写真（profile_images）優先。無ければ一覧と同じメイン写真1枚。
  const images = detail.images.length > 0 ? detail.images : t.imageUrl ? [t.imageUrl] : [];
  const [main, ...others] = images;

  // この子の写メ日記と口コミ（2026-08-20 追記・オーナー要望）。
  // 見た目は店の /diary・/voice と同じ部品（hp-dy-* / hp-card）を使い回す。
  // 「全部見る」はフクエス本体のセラピスト別ページ（/therapist/{id}/diary・/reviews）へ
  // ＝店単位の一覧ではなく【その子の掲載場所】へ飛ばす。
  const [diaryItems, allReviews] = await Promise.all([
    fetchHpTherapistDiaryItems(t.id),
    getApprovedReviews(Number(t.id)),
  ]);
  const reviews = allReviews.slice(0, HP_THERAPIST_VOICE_LIMIT);

  return (
    <HpShell data={data} page="therapist">
      <section id="therapist" className="hp-sec hp-sec-therapists" style={{ order: 1 }}>
        {/* パンくず（3階層）。共通の Crumb は「ホーム › 現在地」の2階層専用なので、
            同じクラス構成で直接組む（見た目は各ひな形の .hp-crumb がそのまま効く）。 */}
        <nav className="hp-crumb" aria-label="パンくずリスト">
          <a href={homeHref}>ホーム</a>
          <span className="hp-crumb-sep" aria-hidden="true">›</span>
          <a href={listHref}>セラピスト</a>
          <span className="hp-crumb-sep" aria-hidden="true">›</span>
          <span>{t.name}</span>
        </nav>
        <SecHead no="03" en="Therapist" jp={t.name} />

        <div className="hp-thd">
          {/* ── 写真（メイン1枚＋残りはサムネイルのグリッド。JSなし＝拡大はしない）── */}
          <div className="hp-thd-photos">
            {main ? (
              <div className="hp-thd-main">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={main} alt={t.name} />
              </div>
            ) : (
              <div className="hp-thd-main hp-th-noimg" />
            )}
            {others.length > 0 && (
              <div className="hp-thd-thumbs">
                {others.map((u, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={u} src={u} alt={`${t.name}の写真${i + 2}`} loading="lazy" decoding="async" />
                ))}
              </div>
            )}
          </div>

          {/* ── プロフィール ── */}
          <div className="hp-thd-info">
            <div className="hp-thd-meta">
              {t.age !== null && <span>{t.age}歳</span>}
              {t.bodyType && <span>{t.bodyType}</span>}
              {t.onDuty && <span className="hp-th-onduty">本日出勤</span>}
            </div>
            {t.badges.length > 0 && (
              <div className="hp-thd-badges">
                {t.badges.map((b) => (
                  <span key={b} className="hp-thd-badge">{b}</span>
                ))}
              </div>
            )}
            {t.catchphrase && <p className="hp-thd-catch">{t.catchphrase}</p>}
            {detail.profileText && <p className="hp-thd-text">{detail.profileText}</p>}

            {/* ── 週間出勤（7日ぶん・データは一覧と同じ t.week）── */}
            <h3 className="hp-thd-subhead">出勤スケジュール</h3>
            <div className="hp-thd-week">
              {weekDays.map((d, i) => (
                <div key={d.date} className={`hp-thd-day${d.isToday ? ' is-today' : ''}`}>
                  <span className={`hp-thd-date${d.tone ? ` is-${d.tone}` : ''}`}>
                    {d.label}（{d.weekday}）{d.isToday ? ' 本日' : ''}
                  </span>
                  <span className="hp-thd-time">{t.week[i] ?? '−'}</span>
                </div>
              ))}
            </div>

            {/* 日記も口コミも1件も無い子だけ、従来の合同リンクで本体へ送る
                （下の2セクションが両方消えると本体への導線がゼロになるため） */}
            {diaryItems.length === 0 && reviews.length === 0 && (
              <div>
                <a className="hp-more" href={`${EMBED_SITE_URL}/therapist/${t.id}`} target="_blank" rel="noopener">
                  写メ日記・口コミを見る（フクエス）→
                </a>
              </div>
            )}
          </div>
        </div>

        {/* ── この子の写メ日記（最新6件・2026-08-20 追記）──
             見た目は店の /diary と同じ部品（hp-dy-grid / hp-dy-card）。
             本人のページなのでサムネ下の名前は出さない（therapistName は空で来る）。
             「全部見る」は【その子の】日記ページ（フクエス本体 /therapist/{id}/diary）へ。 */}
        {diaryItems.length > 0 && (
          <>
            <h3 className="hp-thd-subhead">写メ日記</h3>
            <div className="hp-dy-grid">
              {diaryItems.map((e) => (
                <a
                  key={e.id}
                  className="hp-dy-card"
                  href={`${EMBED_SITE_URL}/diary/${e.id}`}
                  target="_blank"
                  rel="noopener"
                  title={e.title || `${t.name}の写メ日記`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="hp-dy-thumb" src={e.image} alt={e.title || `${t.name}の写メ日記`} loading="lazy" />
                </a>
              ))}
            </div>
            <div>
              <a className="hp-more" href={`${EMBED_SITE_URL}/therapist/${t.id}/diary`} target="_blank" rel="noopener">
                {t.name}の写メ日記を全部見る →
              </a>
            </div>
          </>
        )}

        {/* ── この子の口コミ（最新3件・2026-08-20 追記）──
             見た目は店の /voice と同じ部品（hp-card ＋ Stars）。
             「全部見る」は【その子の】口コミページ（フクエス本体 /therapist/{id}/reviews）へ。 */}
        {reviews.length > 0 && (
          <>
            <h3 className="hp-thd-subhead">口コミ</h3>
            {reviews.map((r) => (
              <div key={r.id} className="hp-card">
                <div className="hp-card-title">
                  <Stars value={r.overall} />
                  <span className="hp-voice-score">{r.overall.toFixed(1)}</span>
                </div>
                <div className="hp-card-body">{r.body}</div>
                <div className="hp-card-meta">
                  {r.nickname} さん
                  {r.createdAt ? `｜${r.createdAt.slice(0, 10).replaceAll('-', '/')}` : ''}
                </div>
              </div>
            ))}
            <div>
              <a className="hp-more" href={`${EMBED_SITE_URL}/therapist/${t.id}/reviews`} target="_blank" rel="noopener">
                {t.name}の口コミを全部見る →
              </a>
            </div>
          </>
        )}

        <a className="hp-more" href={listHref}>← セラピスト一覧へ戻る</a>
      </section>
    </HpShell>
  );
}

// ── 出勤スケジュール（7日タブ・2026-08-18 第23便）──────
//
// トップの「本日の出勤」は本日1日ぶんだけ。ここは7日ぶんを日付タブで切り替える。
// 行の見た目（写真グリッド／1行表示）はひな形ごとの既存CSSがそのまま効く。
//
// ★★ タブの切り替えは【CSSだけ】で行う（素のラジオボタン＋<label>）。
//   理由: 公式HPには 'use client' の部品が1つも無く、ページは全部サーバーで
//   HTMLを吐き切る作りになっている。ここだけクライアント部品を入れると、
//   4ひな形ぶんのCSS文字列（styles.ts）を注入する仕組みと噛み合わない。
//   おまけにJSが動かない環境でも全日ぶんが切り替えられる。
// ★ 7日ぶんの中身はすべてHTMLに出ている（隠しているのは display:none だけ）。
//   1日ぶんずつ取りに行かないので、押した瞬間に切り替わる。

export function isHpScheduleOpen(data: HpPageData): boolean {
  // ★ 本日だけで判定しない。「今日は全員休みだが明日から出勤がある」店を404にしないため。
  return isMultipageLive(data) && hpHasAnyDuty(data);
}

export function HpScheduleView({ data, preview }: ViewProps) {
  const { salon, therapists, weekDays, basePath } = data;
  const homeHref = basePath || '/';

  // 日ごとの出勤者。並びは「出勤開始が早い順 → 同時刻は名前順」。
  // therapists 自体は data.ts が「本日出勤が先頭」で並べているが、それは本日限定の順序なので
  // 明日以降のタブでは意味を持たない。各日ごとに並べ直す。
  const byDay = weekDays.map((_d, i) =>
    therapists
      .flatMap((t) => {
        const time = t.week[i];
        return time ? [{ t, time }] : [];
      })
      .sort((x, y) => x.time.localeCompare(y.time) || x.t.name.localeCompare(y.t.name, 'ja')),
  );

  return (
    <HpShell data={data} page="schedule">
      <section id="schedule" className="hp-sec hp-sec-schedule" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="出勤スケジュール" />
        <SecHead no="04" en="Schedule" jp="出勤スケジュール" />

        {/* ★★ ラジオ・タブ・パネルは【必ずこの div の直接の子】に並べること。
             CSS が「#hp-sd-N:checked ~ #hp-sp-N」という後方兄弟セレクタで出し分けている。
             間にラッパーを1枚挟むと全パネルが display:none のまま＝真っ白になる
             （HpShell のドロワーと同じ仕掛け・同じ落とし穴）。 */}
        <div className="hp-sched-week">
          {weekDays.map((d, i) => (
            <input
              key={`radio-${d.date}`}
              type="radio"
              name="hp-sched-day"
              id={`hp-sd-${i}`}
              className="hp-sched-radio"
              defaultChecked={i === 0}
            />
          ))}

          <div className="hp-sched-tabs">
            {weekDays.map((d, i) => (
              <label
                key={`tab-${d.date}`}
                className={`hp-sched-tab${d.tone ? ` hp-sched-tab-${d.tone}` : ''}`}
                htmlFor={`hp-sd-${i}`}
              >
                <span className="hp-sched-tab-md">{d.label}</span>
                <span className="hp-sched-tab-wd">{d.weekday}</span>
              </label>
            ))}
          </div>

          {weekDays.map((d, i) => (
            <div key={`panel-${d.date}`} id={`hp-sp-${i}`} className="hp-sched-panel">
              {/* 日付はタブにも出ているが、ここにも置く。押した日がどこか一目で分かるのと、
                  CSSが効かない環境（読み上げ・検索エンジン）で名前と日付が結びつくため。 */}
              <div className="hp-sched-date">
                {d.label}（{d.weekday}）{d.isToday ? ' 本日' : ''}
              </div>
              {byDay[i].length === 0 ? (
                <p className="hp-note">この日の出勤予定はありません</p>
              ) : (
                // detailBase: マルチページで在籍が居る店（このページが出ている時点で満たす）はHP内の個別ページへ（2026-08-20）
                <ScheduleRows rows={byDay[i]} detailBase={therapists.length > 0 ? basePath : null} />
              )}
            </div>
          ))}
        </div>

        {/* フクエス本体への導線は残す（第23便でトップの「もっと見る」を自社/scheduleへ
            付け替えたぶん、本体への流入をここで受ける）。
            2本のリンクは div で1本ずつ包んで全ひな形で縦に並べる（A/C の hp-more は inline-block）。 */}
        <div>
          <a
            className="hp-more"
            href={`${EMBED_SITE_URL}/salon/${salon.id}/schedule`}
            target="_blank"
            rel="noopener"
          >
            フクエスで出勤スケジュールを見る →
          </a>
        </div>
        <div>
          <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
        </div>
      </section>

      <CrumbJsonLd data={data} label="出勤スケジュール" path="/schedule" preview={preview} />
    </HpShell>
  );
}

// ── コース料金 ───────────────────────────────────────
export function isHpSystemOpen(data: HpPageData): boolean {
  return isMultipageLive(data) && groupCourses(data.courses).length > 0;
}

export function HpSystemView({ data, preview }: ViewProps) {
  const { salon, courses, basePath } = data;
  const grouped = groupCourses(courses);
  const homeHref = basePath || '/';

  return (
    <HpShell data={data} page="system">
      <section id="menu" className="hp-sec hp-sec-courses" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="コース料金" />
        <SecHead no="02" en="Menu" jp="コース料金" />
        <CourseGroups grouped={grouped} />
        <p className="hp-note">※ 表示料金はすべて税込みです。</p>
        {(salon.hours || salon.phone) && (
          <dl className="hp-info">
            {salon.hours && (
              <div className="hp-info-row">
                <dt>受付時間</dt>
                <dd>{salon.hours}{salon.closedDays ? `（${salon.closedDays}）` : ''}</dd>
              </div>
            )}
            {salon.phone && (
              <div className="hp-info-row">
                <dt>ご予約</dt>
                <dd><a href={`tel:${salon.phone}`}>{salon.phone}</a></dd>
              </div>
            )}
          </dl>
        )}
        <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
      </section>

      <CrumbJsonLd data={data} label="コース料金" path="/system" preview={preview} />
    </HpShell>
  );
}

// ── お知らせ ─────────────────────────────────────────
export function isHpNewsOpen(data: HpPageData): boolean {
  return isMultipageLive(data) && data.news.length > 0;
}

export function HpNewsView({ data, preview }: ViewProps) {
  const { news, basePath } = data;
  const homeHref = basePath || '/';

  return (
    <HpShell data={data} page="news">
      <section id="news" className="hp-sec hp-sec-news" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="お知らせ" />
        <SecHead no="08" en="News" jp="お知らせ" />
        {news.map((n) => (
          <div key={n.id} className="hp-card">
            <div className="hp-card-title">{n.title}</div>
            <div className="hp-card-body">{n.content}</div>
            {n.createdAt && <div className="hp-card-meta">{n.createdAt.slice(0, 10).replaceAll('-', '/')}</div>}
          </div>
        ))}
        <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
      </section>

      <CrumbJsonLd data={data} label="お知らせ" path="/news" preview={preview} />
    </HpShell>
  );
}

// ── 写メ日記（常に noindex・HPが直接一覧を描く）──────────
export function isHpDiaryOpen(data: HpPageData): boolean {
  return isMultipageLive(data) && data.diaryCount > 0;
}

export async function HpDiaryView({ data }: ViewProps) {
  const { salon, basePath } = data;
  const homeHref = basePath || '/';
  const isDemo = isDemoSite(data);
  const items = await fetchHpDiaryItems(salon.id, isDemo);
  // 「もっと見る」の行き先。デモは全店の日記一覧、実店舗は自店の日記一覧（どちらもフクエス本体）
  const moreHref = isDemo ? `${EMBED_SITE_URL}/diary` : `${EMBED_SITE_URL}/salon/${salon.id}/diary`;

  return (
    <HpShell data={data} page="diary">
      <section id="diary" className="hp-sec hp-sec-diary" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="写メ日記" />
        <SecHead no="05" en="Diary" jp="写メ日記" />

        {items.length === 0 ? (
          <p className="hp-note">写メ日記はまだありません</p>
        ) : (
          <div className="hp-dy-grid">
            {items.map((e) => (
              <a
                key={e.id}
                className="hp-dy-card"
                href={`${EMBED_SITE_URL}/diary/${e.id}?from=salon`}
                target="_blank"
                rel="noopener"
                title={e.title || `${e.therapistName}の写メ日記`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="hp-dy-thumb" src={e.image} alt={e.title || `${e.therapistName}の写メ日記`} loading="lazy" />
                <span className="hp-dy-name">
                  {e.therapistName}
                  {e.salonName ? `（${e.salonName}）` : ''}
                </span>
              </a>
            ))}
          </div>
        )}

        {/* 続きはフクエス本体へ（rel は noopener だけ＝計測を殺さない）。
            2本のリンクは div で1本ずつ包んで全ひな形で縦に並べる（A/Cの hp-more は inline-block のため） */}
        <div>
          <a className="hp-more" href={moreHref} target="_blank" rel="noopener">
            写メ日記をもっと見る →
          </a>
        </div>
        <div>
          <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
        </div>
      </section>
    </HpShell>
  );
}

// ── 口コミ（常に noindex・HPが直接一覧を描く）────────────
export function isHpVoiceOpen(data: HpPageData): boolean {
  return isMultipageLive(data) && data.reviewCount > 0;
}

/** ★を5個並べる（埋め込みウィジェットと同じ簡易表示）。色はひな形のアクセント。 */
function Stars({ value }: { value: number }) {
  const filled = Math.round(value);
  return (
    <span className="hp-voice-stars" aria-label={`5点満点中${value}点`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= filled ? '' : 'hp-voice-star-off'}>★</span>
      ))}
    </span>
  );
}

export async function HpVoiceView({ data }: ViewProps) {
  const { salon, basePath } = data;
  const homeHref = basePath || '/';
  const isDemo = isDemoSite(data);
  const [reviews, stats] = await Promise.all([
    fetchHpReviews(salon.id, isDemo),
    // 平均評価は自店モードのときだけ出す（全店の平均を1店のHPに出しても意味が無い）
    isDemo ? Promise.resolve(null) : getSalonReviewStats(salon.id),
  ]);
  const moreHref = isDemo ? `${EMBED_SITE_URL}/reviews` : `${EMBED_SITE_URL}/salon/${salon.id}/reviews`;

  return (
    <HpShell data={data} page="voice">
      <section id="voice" className="hp-sec hp-sec-reviews" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="口コミ" />
        <SecHead no="06" en="Voice" jp="口コミ" />

        {stats && stats.avgOverall != null && (
          <p className="hp-voice-summary">
            <Stars value={stats.avgOverall} />
            <span className="hp-voice-score">{stats.avgOverall.toFixed(1)}</span>
            <span className="hp-voice-count">（{stats.count}件）</span>
          </p>
        )}

        {reviews.length === 0 ? (
          <p className="hp-note">口コミはまだありません</p>
        ) : (
          reviews.map((r) => (
            <div key={r.id} className="hp-card">
              <div className="hp-card-title">
                <Stars value={r.overall} />
                <span className="hp-voice-score">{r.overall.toFixed(1)}</span>
              </div>
              <div className="hp-card-body">{r.body}</div>
              <div className="hp-card-meta">
                {r.nickname} さん
                {r.therapistName ? ` → ${r.therapistName}さん` : ''}
                {r.salonName ? `｜${r.salonName}` : ''}
                {r.createdAt ? `｜${r.createdAt.slice(0, 10).replaceAll('-', '/')}` : ''}
              </div>
            </div>
          ))
        )}

        {/* 続きはフクエス本体へ（rel は noopener だけ＝計測を殺さない）。
            2本のリンクは div で1本ずつ包んで全ひな形で縦に並べる */}
        <div>
          <a className="hp-more" href={moreHref} target="_blank" rel="noopener">
            口コミをもっと見る →
          </a>
        </div>
        <div>
          <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
        </div>
      </section>
    </HpShell>
  );
}

// ── 店舗情報 ─────────────────────────────────────────
export function isHpInfoOpen(data: HpPageData): boolean {
  // 店舗情報は常に中身がある（店名・エリアは必須データ）ので中身の有無は見ない。
  return isMultipageLive(data);
}

export function HpInfoView({ data, preview }: ViewProps) {
  const { salon, basePath } = data;
  const homeHref = basePath || '/';
  const origin = preview ? null : hpSiteOrigin(data);
  const payments = salon.paymentMethods.map(paymentMethodLabel).join('・');

  return (
    <HpShell data={data} page="info">
      <section id="info" className="hp-sec hp-sec-info" style={{ order: 1 }}>
        <Crumb homeHref={homeHref} label="店舗情報" />
        <SecHead no="12" en="Information" jp="店舗情報" />
        <dl className="hp-info">
          <div className="hp-info-row"><dt>店名</dt><dd>{salon.name}</dd></div>
          {salon.area && (<div className="hp-info-row"><dt>エリア</dt><dd>{salon.area}</dd></div>)}
          {salon.address && (<div className="hp-info-row"><dt>住所</dt><dd>{salon.address}</dd></div>)}
          {salon.access && (<div className="hp-info-row"><dt>アクセス</dt><dd>{salon.access}</dd></div>)}
          {salon.hours && (<div className="hp-info-row"><dt>営業時間</dt><dd>{salon.hours}</dd></div>)}
          {salon.closedDays && (<div className="hp-info-row"><dt>定休日</dt><dd>{salon.closedDays}</dd></div>)}
          {salon.phone && (
            <div className="hp-info-row"><dt>電話</dt><dd><a href={`tel:${salon.phone}`}>{salon.phone}</a></dd></div>
          )}
          {payments !== '' && (<div className="hp-info-row"><dt>支払い方法</dt><dd>{payments}</dd></div>)}
        </dl>
        <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
      </section>

      <CrumbJsonLd data={data} label="店舗情報" path="/info" preview={preview} />
      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdString({
              // 店の公式サイトとしての基本情報。@id を自ドメインに固定することで、
              // フクエス本体の HealthAndBeautyBusiness とは別エンティティとして扱われる。
              '@context': 'https://schema.org/',
              '@type': 'HealthAndBeautyBusiness',
              '@id': `${origin}/#business`,
              name: salon.name,
              url: `${origin}/`,
              ...(salon.phone ? { telephone: salon.phone } : {}),
              ...(salon.address
                ? { address: { '@type': 'PostalAddress', streetAddress: salon.address, addressCountry: 'JP' } }
                : {}),
            }),
          }}
        />
      )}
    </HpShell>
  );
}

// ── 利用規約（全店共通の文面・常に noindex・ドロワーを置かない doc 表示）──
export function isHpTermsOpen(data: HpPageData): boolean {
  return data.site.status === 'live'; // マルチページでなくても出す（従来どおり）
}

export function HpTermsView({ data }: ViewProps) {
  const { salon, basePath } = data;
  const sections = buildHpTerms(salon.name);

  return (
    <HpShell data={data} page="terms" chrome="doc">
      <section className="hp-sec hp-sec-doc" style={{ order: 1 }}>
        <div className="hp-en">Terms</div>
        <h1 className="hp-h2">利用規約</h1>
        <div className="hp-rule" />

        <div className="hp-doc">
          {sections.map((sec) => (
            <section key={sec.heading} className="hp-doc-sec">
              <h2 className="hp-doc-h">{sec.heading}</h2>
              {sec.paragraphs?.map((t, i) => (
                <p key={i} className="hp-doc-p">{t}</p>
              ))}
              {sec.items && (
                <ul className="hp-doc-list">
                  {sec.items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <a className="hp-more" href={basePath || '/'}>← ホームへ戻る</a>
      </section>
    </HpShell>
  );
}
