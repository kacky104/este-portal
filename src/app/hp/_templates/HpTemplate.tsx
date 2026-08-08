// 公式ホームページのひな形本体（2026-08-08 段階2）。
//
// ★ ここが「外側は違うが中身は同じ」を実現する要：
//   - DOM 構造（ブロックの種類・並び順）は全ひな形で完全に共通（この1コンポーネント）。
//   - ひな形A/B/C の違いは styles.ts の CSS 文字列と、カラーCSS変数（--hp-accent 等）だけ。
//   - ブロックを増やす／変えるときはこのファイルと data.ts だけを直す（3ひな形同時に変わる）。
//
// ブロックの ON/OFF・件数は salon_sites.blocks（sanitizeHpBlocks 済み）に従う。
// 写メ日記・口コミは /embed/salon/[id]/* の iframe（重複コンテンツ回避。設計メモ4章）。
// 「もっと見る」はフクエス本体への絶対URLリンク（HPからフクエスへの実流入導線）。

import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';
import { hpColorCssVars } from '@/app/lib/hpSite';
import type { HpPageData, HpCourse } from '@/app/hp/_lib/data';
import { TEMPLATE_CSS } from './styles';

// courses を同名グループにまとめる（/salon/[id] の CoursesContent と同じ規約）
function groupCourses(courses: HpCourse[]): [string, HpCourse[]][] {
  return Array.from(
    courses.reduce((map, c) => {
      if (!map.has(c.name)) map.set(c.name, []);
      map.get(c.name)!.push(c);
      return map;
    }, new Map<string, HpCourse[]>())
  );
}

// セクションの飾り（EN ラベル・番号・罫線）。表示の有無は各ひな形のCSSが決める。
function SecHead({ no, en, jp }: { no: string; en: string; jp: string }) {
  return (
    <>
      <div className="hp-idx">{no}</div>
      <div className="hp-en">{en}</div>
      <h2 className="hp-h2">{jp}</h2>
      <div className="hp-rule" />
    </>
  );
}

export function HpTemplate({ data }: { data: HpPageData }) {
  const { site, salon, courses, therapists, coupons, news, freePages, jobId } = data;
  const b = site.blocks;
  const cssVars = hpColorCssVars(site.template_key, site.theme_key) as React.CSSProperties;
  const salonUrl = `${EMBED_SITE_URL}/salon/${salon.id}`;
  const grouped = groupCourses(courses);
  const heroImage = site.hero_images[0] ?? null;
  const onDuty = therapists.filter((t) => t.onDuty);

  return (
    <div className={`hp-root hp-${site.template_key}`} style={cssVars}>
      <style dangerouslySetInnerHTML={{ __html: TEMPLATE_CSS[site.template_key] }} />

      {/* ── トップバー（タイプCのみCSSで表示） ── */}
      <div className="hp-topbar">
        <span className="hp-topbar-name">{salon.name}</span>
        {salon.phone && <a className="hp-topbar-cta" href={`tel:${salon.phone}`}>RESERVE</a>}
      </div>

      {/* ── ヒーロー ──
           画像は自然な縦横比で表示しつつ max-height でキャップ（CSS側）。
           横長バナー＝全体表示／縦長写真＝切り抜き、が自動で切り替わる。 */}
      <div className="hp-hero">
        {heroImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="hp-hero-img" src={heroImage} alt={salon.name} />
        )}
        <div className="hp-hero-text">
          <div className="hp-hero-en">AROMA PRIVATE SALON</div>
          <h1 className="hp-hero-name">{salon.name}</h1>
          {site.hero_catch && <p className="hp-hero-catch">{site.hero_catch}</p>}
          <p className="hp-hero-area">{salon.area}{salon.hours ? `　${salon.hours}` : ''}</p>
        </div>
      </div>

      {/* ── コンセプト ── */}
      {(site.concept_text || site.concept_title) && (
        <section className="hp-sec hp-sec-concept">
          <SecHead no="01" en="Concept" jp={site.concept_title || 'コンセプト'} />
          {site.concept_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hp-concept-img" src={site.concept_image_url} alt="" />
          )}
          <p className="hp-concept-text">{site.concept_text}</p>
        </section>
      )}

      {/* ── コース料金 ── */}
      {grouped.length > 0 && (
        <section className="hp-sec hp-sec-alt hp-sec-courses">
          <SecHead no="02" en="Menu" jp="コース料金" />
          {grouped.map(([name, items]) => (
            <div key={name} className="hp-course-group">
              <h3 className="hp-course-name">{name}</h3>
              {items.map((c, i) => (
                <div key={i} className="hp-course-row">
                  <span className="hp-course-min">{c.duration}</span>
                  <span className="hp-course-price">{c.price}</span>
                </div>
              ))}
            </div>
          ))}
          <p className="hp-note">※ 表示料金はすべて税込みです。</p>
        </section>
      )}

      {/* ── セラピスト ── */}
      {b.therapists.on && therapists.length > 0 && (
        <section className="hp-sec hp-sec-therapists">
          <SecHead no="03" en="Therapist" jp="セラピスト" />
          <div className="hp-th-row">
            {therapists.map((t) => (
              <a key={t.id} className="hp-th-card" href={`${EMBED_SITE_URL}/therapist/${t.id}`} target="_blank" rel="noopener noreferrer">
                <div className="hp-th-frame">
                  {t.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUrl} alt={t.name} />
                  ) : (
                    <div className="hp-th-noimg" />
                  )}
                </div>
                <div className="hp-th-name">{t.name}</div>
                {t.age !== null && <div className="hp-th-age">{t.age}歳</div>}
                {t.onDuty && <span className="hp-th-onduty">本日出勤</span>}
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── 本日の出勤 ── */}
      {b.schedule.on && onDuty.length > 0 && (
        <section className="hp-sec hp-sec-alt hp-sec-schedule">
          <SecHead no="04" en="Schedule" jp="本日の出勤" />
          {onDuty.map((t) => (
            <div key={t.id} className="hp-sched-row">
              <span className="hp-sched-name">{t.name}</span>
              <span className="hp-sched-time">{t.todayTime}</span>
            </div>
          ))}
        </section>
      )}

      {/* ── 写メ日記（埋め込み） ── */}
      {b.diary.on && (
        <section className="hp-sec hp-sec-diary">
          <SecHead no="05" en="Diary" jp="写メ日記" />
          <iframe className="hp-embed" src={`/embed/salon/${salon.id}/diary`} title="写メ日記" loading="lazy" style={{ height: 480 }} />
          <a className="hp-more" href={`${salonUrl}/diary`} target="_blank" rel="noopener noreferrer">もっと見る →</a>
        </section>
      )}

      {/* ── 口コミ（埋め込み） ── */}
      {b.reviews.on && (
        <section className="hp-sec hp-sec-alt hp-sec-reviews">
          <SecHead no="06" en="Voice" jp="口コミ" />
          <iframe className="hp-embed" src={`/embed/salon/${salon.id}/reviews`} title="口コミ" loading="lazy" style={{ height: 420 }} />
          <a className="hp-more" href={`${salonUrl}/reviews`} target="_blank" rel="noopener noreferrer">もっと見る →</a>
        </section>
      )}

      {/* ── クーポン ── */}
      {b.coupon.on && coupons.length > 0 && (
        <section className="hp-sec hp-sec-coupon">
          <SecHead no="07" en="Coupon" jp="クーポン" />
          {coupons.map((c) => (
            <div key={c.id} className="hp-card">
              <div className="hp-card-title">{c.title}</div>
              <div className="hp-coupon-discount">{c.discount}</div>
              {c.conditions && <div className="hp-card-body">{c.conditions}</div>}
            </div>
          ))}
        </section>
      )}

      {/* ── お知らせ ── */}
      {b.news.on && news.length > 0 && (
        <section className="hp-sec hp-sec-alt hp-sec-news">
          <SecHead no="08" en="News" jp="お知らせ" />
          {news.map((n) => (
            <div key={n.id} className="hp-card">
              <div className="hp-card-title">{n.title}</div>
              <div className="hp-card-body">{n.content}</div>
              {n.createdAt && <div className="hp-card-meta">{n.createdAt.slice(0, 10).replaceAll('-', '/')}</div>}
            </div>
          ))}
        </section>
      )}

      {/* ── フリーページ ── */}
      {b.freePages.on && freePages.length > 0 && freePages.map((f, i) => (
        <section key={f.id} className="hp-sec hp-sec-free">
          <SecHead no={String(9 + i).padStart(2, '0')} en="Information" jp={f.title} />
          {f.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hp-concept-img" src={f.images[0]} alt="" />
          )}
          <p className="hp-concept-text">{f.body}</p>
        </section>
      ))}

      {/* ── 店舗情報 ── */}
      <section className="hp-sec hp-sec-alt hp-sec-info">
        <SecHead no="12" en="Information" jp="店舗情報" />
        <dl className="hp-info">
          {salon.address && (<div className="hp-info-row"><dt>住所</dt><dd>{salon.address}</dd></div>)}
          {salon.hours && (<div className="hp-info-row"><dt>営業時間</dt><dd>{salon.hours}{salon.closedDays ? `（${salon.closedDays}）` : ''}</dd></div>)}
          {salon.access && (<div className="hp-info-row"><dt>アクセス</dt><dd>{salon.access}</dd></div>)}
          {salon.phone && (<div className="hp-info-row"><dt>電話</dt><dd>{salon.phone}</dd></div>)}
        </dl>
      </section>

      {/* ── バナー ── */}
      {site.banners.length > 0 && (
        <section className="hp-sec hp-sec-banners">
          {site.banners.map((bn, i) =>
            bn.link ? (
              <a key={i} href={bn.link} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="hp-banner-img" src={bn.image_url} alt="" />
              </a>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} className="hp-banner-img" src={bn.image_url} alt="" />
            )
          )}
        </section>
      )}

      {/* ── フッター ── */}
      <footer className="hp-footer">
        <div className="hp-footer-name">{salon.name}</div>
        <div className="hp-footer-sub">
          © {salon.name} all rights reserved.
          {b.jobs.on && salon.jobsEnabled && jobId !== null && (
            <>
              <br />
              <a href={`${EMBED_SITE_URL}/jobs/${jobId}`} target="_blank" rel="noopener noreferrer">セラピスト求人はこちら</a>
            </>
          )}
        </div>
      </footer>

      {/* ── 予約CTA（画面下固定） ── */}
      {(salon.phone || salon.lineUrl) && (
        <div className="hp-cta">
          {salon.phone && <a className="hp-cta-tel" href={`tel:${salon.phone}`}>電話予約</a>}
          {salon.lineUrl && <a className="hp-cta-line" href={salon.lineUrl} target="_blank" rel="noopener noreferrer">LINE予約</a>}
        </div>
      )}
    </div>
  );
}
