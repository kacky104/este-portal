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
import type { HpPageData } from '@/app/hp/_lib/data';
import { hpSiteOrigin } from '@/app/hp/_lib/meta';
import { groupCourses } from '@/app/hp/_lib/sections';
import { fetchHpDiaryItems, fetchHpReviews } from '@/app/hp/_lib/subpageData';
import { buildHpTerms } from '@/app/hp/_lib/terms';
import { HpShell } from '@/app/hp/_templates/HpShell';
import { CourseGroups, Crumb, SecHead, TherapistCards } from '@/app/hp/_templates/parts';
import { HP_DEMO_SLUG, normalizeHpSiteKey } from '@/app/lib/hpSite';
import { buildBreadcrumbJsonLd, buildItemListJsonLd, toJsonLdString } from '@/app/lib/jsonLd';
import { paymentMethodLabel } from '@/app/lib/paymentMethods';
import { getSalonReviewStats } from '@/app/lib/reviews';

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
        <TherapistCards therapists={therapists} grid />
        <a className="hp-more" href={homeHref}>← ホームへ戻る</a>
      </section>

      <CrumbJsonLd data={data} label="セラピスト" path="/therapist" preview={preview} />
      {origin && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: toJsonLdString(
              // 順序・件数は画面に出しているカードと同じにすること（非表示コンテンツはNG）。
              // ★ セラピストの個別ページは公式HP側に無くフクエス本体にあるので、
              //   この ItemList だけは origin が本体（fukues.com）になる。
              buildItemListJsonLd(
                therapists.map((t) => ({ name: t.name, path: `/therapist/${t.id}` })),
                { name: `${salon.name} セラピスト一覧`, origin: EMBED_SITE_URL },
              ),
            ),
          }}
        />
      )}
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
