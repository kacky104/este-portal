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
import { hpColorCssVars, hpSectionOrder } from '@/app/lib/hpSite';
import type { HpSectionKey } from '@/app/lib/hpSite';
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
  // ヒーローは「1枚目=PC用（横長）／2枚目=スマホ用（縦長・省略可）」の約束。
  // 2枚目が無ければ1枚目を両方に使う（従来どおりの挙動）。
  const heroPc = site.hero_images[0] ?? null;
  const heroSp = site.hero_images[1] ?? null;
  const onDuty = therapists.filter((t) => t.onDuty);

  // ── セクションの表示順（2026-08-10）──
  //   DOM の並びは全ひな形共通のまま（作業ルール1）で、画面の並びは flex の order で作る。
  //   使う並びは hpSectionOrder() ただ1つ＝管理画面の一覧と必ず一致する
  //   （以前はタイプSだけ styles.ts のCSSで並べ替えていたため管理画面とずれていた）。
  const orderList = hpSectionOrder(site.template_key, b.order);
  const orderCustom = b.order !== null; // オーナーが自分で並べ替えたか（地色の付け方に使う）
  const ord = (k: HpSectionKey): React.CSSProperties => ({ order: orderList.indexOf(k) + 1 });
  // 固定位置のもの。並び替えても「トップバー→ヒーロー→（並び替え対象）→フッター」は不変。
  const ordTopbar = { order: -2 };
  const ordHero   = { order: -1 };
  const ordFooter = { order: 100 };

  // 交互の地色（.hp-sec-alt）は「実際に画面に出るセクションの並び」で1つおきに付ける。
  // 並び替えると canonical 前提の固定クラスでは同じ地色が2つ続いてしまうため、
  // 並び替え時だけ実際の並び＋表示有無から付け直す（未設定時は従来の固定クラスのまま）。
  const visible: Record<HpSectionKey, boolean> = {
    concept:    b.concept.on && Boolean(site.concept_text || site.concept_title),
    courses:    b.courses.on && grouped.length > 0,
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
  const altKeys = new Set<HpSectionKey>();
  if (orderCustom) {
    let i = 0;
    for (const k of orderList) {
      // バナーは地色を持たない枠（上のセクションに続けて見せる）ので数にも入れない
      if (!visible[k] || k === 'banners') continue;
      if (i % 2 === 1) altKeys.add(k);
      i += 1;
    }
  }
  /** セクションのclass。第3引数は「並び替え未設定のときの既定（従来の固定クラス）」。 */
  const secCls = (k: HpSectionKey, name: string, defaultAlt: boolean) =>
    `hp-sec${(orderCustom ? altKeys.has(k) : defaultAlt) ? ' hp-sec-alt' : ''} ${name}`;

  // ── ドロワーメニューの項目（2026-08-10。ヘッダーの RESERVE をハンバーガーに置換）──
  // 中身が無い／OFF のブロックは押しても動かないだけなので、最初からメニューに出さない。
  // 求人だけはページ内セクションではなくフクエスワークの求人ページへの外部リンク。
  const menuItems: { href: string; label: string; external?: boolean }[] = [
    { href: '#top', label: 'TOP' },
    ...(visible.news       ? [{ href: '#news',      label: '新着情報' }] : []),
    ...(visible.schedule   ? [{ href: '#schedule',  label: '出勤スケジュール' }] : []),
    ...(visible.therapists ? [{ href: '#therapist', label: 'セラピスト一覧' }] : []),
    ...(visible.courses    ? [{ href: '#menu',      label: '料金システム' }] : []),
    ...(visible.diary      ? [{ href: '#diary',     label: '写メ日記' }] : []),
    ...(visible.reviews    ? [{ href: '#voice',     label: '口コミ' }] : []),
    ...(b.jobs.on && salon.jobsEnabled && jobId !== null
      ? [{ href: `${EMBED_SITE_URL}/jobs/${jobId}`, label: '求人情報', external: true }]
      : []),
    { href: '#info', label: '店舗情報' },
  ];

  return (
    <div
      className={`hp-root hp-${site.template_key}${data.wallpaperUrl ? ' hp-has-wallpaper' : ''} hp-ordered`}
      style={cssVars}
    >
      <style dangerouslySetInnerHTML={{ __html: TEMPLATE_CSS[site.template_key] }} />

      {/* ── テーマ壁紙（theme_wallpapers 流用・固定レイヤー）。
           background-attachment: fixed はモバイルで無視されるため /salon/[id] と同じ固定配置レイヤー方式。
           暗色オーバーレイは各ひな形のCSS（.hp-wallpaper::after）が持つ。 ── */}
      {data.wallpaperUrl && (
        <div className="hp-wallpaper" style={{ backgroundImage: `url(${data.wallpaperUrl})` }} />
      )}

      {/* ── トップバー＋ドロワーメニュー（表示の有無・見た目は各ひな形のCSSが決める）──
           ナビ（.hp-topbar-nav）はタイプSのPCのみ表示（COMMON で display:none）。
           開閉は素のチェックボックス＋<label>で行う（JSなしでも開ける）。下部の
           スクリプトはリンク押下・Escでの自動クローズと背面スクロール止めだけを担う。
           チェックボックスは .hp-topbar の直前に置くこと（+ で見た目を切り替えている）。
           ドロワー本体をトップバーの外に出しているのは、トップバーの backdrop-filter が
           position:fixed の基準（包含ブロック）になってしまい全画面に広がらないため。 */}
      <input type="checkbox" id="hp-drawer" className="hp-drawer-toggle" aria-label="メニュー" />
      <div className="hp-topbar" style={ordTopbar}>
        {/* ロゴ未設定なら従来どおり店名の文字。設定時も alt に店名を入れるので
            検索エンジン・読み上げから店名が消えることはない。 */}
        {site.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="hp-topbar-logo" src={site.logo_url} alt={salon.name} />
        ) : (
          <span className="hp-topbar-name">{salon.name}</span>
        )}
        <nav className="hp-topbar-nav">
          <a href="#concept">CONCEPT</a>
          <a href="#menu">SYSTEM</a>
          <a href="#therapist">THERAPIST</a>
          <a href="#schedule">SCHEDULE</a>
          <a href="#info">ACCESS</a>
        </nav>
        <div className="hp-topbar-actions">
          {/* 電話アイコン。押すと登録の電話番号へ発信（PCでは通話アプリが開く） */}
          {salon.phone && (
            <a className="hp-topbar-tel" href={`tel:${salon.phone}`} aria-label={`電話で予約 ${salon.phone}`}>
              <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
                <path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.4.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.4 0 .7-.2 1l-2.3 2.2z" />
              </svg>
            </a>
          )}
          <label className="hp-drawer-btn" htmlFor="hp-drawer" aria-hidden="true">
            <span /><span /><span />
          </label>
        </div>
      </div>
      <label className="hp-drawer-scrim" htmlFor="hp-drawer" aria-hidden="true" />
      <nav className="hp-drawer" aria-label="メニュー">
        {/* ドロワーはトップバーより手前に出るので、閉じるボタンはドロワー側にも置く
            （スクリムのタップ・Escでも閉じられる） */}
        <label className="hp-drawer-close" htmlFor="hp-drawer" aria-hidden="true">
          <span /><span />
        </label>
        <ul className="hp-drawer-list">
          {menuItems.map((m) => (
            <li key={m.label}>
              {m.external ? (
                <a href={m.href} target="_blank" rel="noopener noreferrer">{m.label}</a>
              ) : (
                <a href={m.href}>{m.label}</a>
              )}
            </li>
          ))}
        </ul>
        <div className="hp-drawer-foot">
          {salon.hours && (
            <div className="hp-drawer-hours">
              <span className="hp-drawer-label">OPEN</span>
              {salon.hours}{salon.closedDays ? `（${salon.closedDays}）` : ''}
            </div>
          )}
          {salon.phone && (
            <a className="hp-drawer-tel" href={`tel:${salon.phone}`}>
              <span className="hp-drawer-label">TEL</span>
              {salon.phone}
            </a>
          )}
          {/* 利用規約（全店共通の文面）。独自ドメインなら /terms、暫定URLなら /hp/{slug}/terms */}
          <a className="hp-drawer-terms" href={`${data.basePath}/terms`}>利用規約</a>
        </div>
      </nav>

      {/* ── ヒーロー ──
           画像は自然な縦横比で表示しつつ max-height でキャップ（CSS側）。
           横長バナー＝全体表示／縦長写真＝切り抜き、が自動で切り替わる。
           スマホ用（hero_images[1]）があれば 639px 以下で <picture> が自動で差し替える。
           タイプSは店舗の画像が未設定でも成立するよう、既定のキービジュアル
           （public/hp-s/・PC 2400×960 / SP 1080×760 を出し分け）にフォールバックする。 */}
      <div id="top" className="hp-hero" style={ordHero}>
        {heroPc ? (
          <picture>
            {heroSp && <source media="(max-width: 639px)" srcSet={heroSp} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hp-hero-img" src={heroPc} alt={salon.name} />
          </picture>
        ) : site.template_key === 's' ? (
          <picture>
            <source media="(max-width: 639px)" srcSet="/hp-s/hero-sp.webp" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hp-hero-img" src="/hp-s/hero-pc.webp" alt={salon.name} />
          </picture>
        ) : null}
        <div className="hp-hero-text">
          {salon.catchphrase && <div className="hp-hero-en">{salon.catchphrase}</div>}
          <h1 className="hp-hero-name">{salon.name}</h1>
          {site.hero_catch && <p className="hp-hero-catch">{site.hero_catch}</p>}
          <p className="hp-hero-area">{salon.area}{salon.hours ? `　${salon.hours}` : ''}</p>
        </div>
      </div>

      {/* ── コンセプト ── */}
      {visible.concept && (
        <section id="concept" data-hp-reveal className={secCls('concept', 'hp-sec-concept', false)} style={ord('concept')}>
          <SecHead no="01" en="Concept" jp={site.concept_title || 'コンセプト'} />
          {site.concept_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hp-concept-img" src={site.concept_image_url} alt="" />
          )}
          <p className="hp-concept-text">{site.concept_text}</p>
        </section>
      )}

      {/* ── コース料金 ── */}
      {visible.courses && (
        <section id="menu" data-hp-reveal className={secCls('courses', 'hp-sec-courses', true)} style={ord('courses')}>
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
        <section id="therapist" data-hp-reveal className={secCls('therapists', 'hp-sec-therapists', false)} style={ord('therapists')}>
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
                {/* 名前より下は hp-th-body でひとまとめにする。COMMON で display:contents に
                    しているので A/B/C の見え方は従来どおり（カード直下に並ぶ）。
                    タイプSだけがこれを写真の上に重ねるレイヤーとして使う（出勤ブロックと同じ作法）。 */}
                <div className="hp-th-body">
                  <div className="hp-th-name">{t.name}</div>
                  {(t.age !== null || t.bodyType) && (
                    <div className="hp-th-age">
                      {t.age !== null && <span className="hp-th-age-num">{t.age}歳</span>}
                      {/* 体型はタイプSでは非表示（写真に重ねる情報を名前と年齢に絞るため） */}
                      {t.bodyType && <span className="hp-th-body-type">{t.bodyType}</span>}
                    </div>
                  )}
                  {t.catchphrase && <div className="hp-th-catch">{t.catchphrase}</div>}
                  {t.badges.length > 0 && (
                    <div className="hp-th-badges">
                      {t.badges.slice(0, 4).map((bd) => (
                        <span key={bd} className="hp-th-badge">{bd}</span>
                      ))}
                    </div>
                  )}
                  {t.onDuty && <span className="hp-th-onduty">本日出勤</span>}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── 本日の出勤 ──
           行は「サムネイル＋（名前・年齢体型・時間）」の共通DOM。
           A/B/C は COMMON で hp-sched-thumb / hp-sched-meta を display:none にし、
           hp-sched-body を display:contents にすることで従来どおり「名前 …… 時間」の
           1行レイアウトのまま（見た目は変わらない）。タイプSだけが写真グリッドとして使う。 */}
      {b.schedule.on && onDuty.length > 0 && (
        <section id="schedule" data-hp-reveal className={secCls('schedule', 'hp-sec-schedule', true)} style={ord('schedule')}>
          <SecHead no="04" en="Schedule" jp="本日の出勤" />
          <div className="hp-sched-date">{data.todayLabel}</div>
          <div className="hp-sched-list">
            {onDuty.map((t) => (
              <a
                key={t.id}
                className="hp-sched-row"
                href={`${EMBED_SITE_URL}/therapist/${t.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span className="hp-sched-thumb">
                  {t.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={t.imageUrl} alt={t.name} />
                  ) : (
                    <span className="hp-sched-noimg" />
                  )}
                </span>
                <span className="hp-sched-body">
                  <span className="hp-sched-name">{t.name}</span>
                  {/* 出勤欄は名前と年齢だけ（体型・特徴はセラピスト一覧に任せて情報量を絞る） */}
                  <span className="hp-sched-meta">{t.age !== null ? `${t.age}歳` : ''}</span>
                  <span className="hp-sched-time">{t.todayTime}</span>
                </span>
              </a>
            ))}
          </div>

          {/* 週間の出勤はHP側に表を持たず、フクエス本体の店舗スケジュールに集約する（2026-08-10）。
              HPからフクエスへの実流入をつくるのが目的なので、この導線は常に置く。
              ※ 週間データ（data.weekDays / therapist.week）は残してあるので、表を復活させたくなったらここに戻せる。 */}
          <a className="hp-more" href={`${salonUrl}/schedule`} target="_blank" rel="noopener noreferrer">
            出勤スケジュールをもっと見る →
          </a>
        </section>
      )}

      {/* ── 写メ日記（埋め込み） ── */}
      {b.diary.on && (
        <section id="diary" data-hp-reveal className={secCls('diary', 'hp-sec-diary', false)} style={ord('diary')}>
          <SecHead no="05" en="Diary" jp="写メ日記" />
          <iframe className="hp-embed" src={`/embed/salon/${salon.id}/diary`} title="写メ日記" loading="lazy" style={{ height: 480 }} />
          <a className="hp-more" href={`${salonUrl}/diary`} target="_blank" rel="noopener noreferrer">もっと見る →</a>
        </section>
      )}

      {/* ── 口コミ（埋め込み） ── */}
      {b.reviews.on && (
        <section id="voice" data-hp-reveal className={secCls('reviews', 'hp-sec-reviews', true)} style={ord('reviews')}>
          <SecHead no="06" en="Voice" jp="口コミ" />
          <iframe className="hp-embed" src={`/embed/salon/${salon.id}/reviews`} title="口コミ" loading="lazy" style={{ height: 420 }} />
          <a className="hp-more" href={`${salonUrl}/reviews`} target="_blank" rel="noopener noreferrer">もっと見る →</a>
        </section>
      )}

      {/* ── クーポン ── */}
      {b.coupon.on && coupons.length > 0 && (
        <section data-hp-reveal className={secCls('coupon', 'hp-sec-coupon', false)} style={ord('coupon')}>
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
        <section id="news" data-hp-reveal className={secCls('news', 'hp-sec-news', true)} style={ord('news')}>
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
        <section key={f.id} className={secCls('freePages', 'hp-sec-free', false)} style={ord('freePages')}>
          <SecHead no={String(9 + i).padStart(2, '0')} en="Information" jp={f.title} />
          {f.images[0] && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="hp-concept-img" src={f.images[0]} alt="" />
          )}
          <p className="hp-concept-text">{f.body}</p>
        </section>
      ))}

      {/* ── 店舗情報 ── */}
      <section id="info" data-hp-reveal className={secCls('info', 'hp-sec-info', true)} style={ord('info')}>
        <SecHead no="12" en="Information" jp="店舗情報" />
        <dl className="hp-info">
          {salon.address && (<div className="hp-info-row"><dt>住所</dt><dd>{salon.address}</dd></div>)}
          {salon.hours && (<div className="hp-info-row"><dt>営業時間</dt><dd>{salon.hours}{salon.closedDays ? `（${salon.closedDays}）` : ''}</dd></div>)}
          {salon.access && (<div className="hp-info-row"><dt>アクセス</dt><dd>{salon.access}</dd></div>)}
          {salon.phone && (<div className="hp-info-row"><dt>電話</dt><dd>{salon.phone}</dd></div>)}
        </dl>
      </section>

      {/* ── リンク（相互リンクのバナー群）──
           貼られたHTMLは保存していない。画像URL・リンク先・表示文字の3つだけを
           持っているので、ここで組み直して表示する。画像が無いものは文字リンクになる。 */}
      {visible.links && (
        <section id="link" data-hp-reveal className={secCls('links', 'hp-sec-links', false)} style={ord('links')}>
          <SecHead no="10" en="Link" jp="リンク" />
          <div className="hp-links">
            {site.link_banners.map((l, i) =>
              l.link ? (
                <a key={i} className="hp-link-item" href={l.link} target="_blank" rel="noopener noreferrer">
                  {l.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image_url} alt={l.label} loading="lazy" />
                  ) : (
                    <span className="hp-link-text">{l.label}</span>
                  )}
                </a>
              ) : (
                <span key={i} className="hp-link-item">
                  {l.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={l.image_url} alt={l.label} loading="lazy" />
                  ) : (
                    <span className="hp-link-text">{l.label}</span>
                  )}
                </span>
              )
            )}
          </div>
        </section>
      )}

      {/* ── バナー ── */}
      {site.banners.length > 0 && (
        <section data-hp-reveal className={secCls('banners', 'hp-sec-banners', false)} style={ord('banners')}>
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
      <footer className="hp-footer" style={ordFooter}>
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

      {/* ── スクロール出現アニメ（依存なしの素の IntersectionObserver）。
           prefers-reduced-motion はCSS側で無効化。IO 非対応環境は即時表示にフォールバック。 ── */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var els=document.querySelectorAll('[data-hp-reveal]');if(!('IntersectionObserver'in window)){els.forEach(function(el){el.classList.add('hp-revealed')});return}var io=new IntersectionObserver(function(entries){entries.forEach(function(e){if(e.isIntersecting){e.target.classList.add('hp-revealed');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});els.forEach(function(el){io.observe(el)})})();`,
        }}
      />

      {/* ── トップバーの「浮き上がり」。少しでもスクロールしたら .hp-scrolled を付け、
           CSS側が影と不透明な地を足す（追従そのものは position:sticky が担当）。 ── */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var r=(document.currentScript&&document.currentScript.closest('.hp-root'))||document.querySelector('.hp-root');if(!r)return;var t=false;function u(){r.classList.toggle('hp-scrolled',(window.scrollY||document.documentElement.scrollTop)>8);t=false}u();window.addEventListener('scroll',function(){if(!t){t=true;requestAnimationFrame(u)}},{passive:true})})();`,
        }}
      />

      {/* ── ドロワーの補助（無くても開閉はできる）。リンクを押したら閉じる・Escで閉じる・
           開いている間は背面をスクロールさせない。 ── */}
      <script
        dangerouslySetInnerHTML={{
          __html: `(function(){var c=document.getElementById('hp-drawer');if(!c)return;var d=document.querySelector('.hp-drawer');if(d){d.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){c.checked=false;document.body.style.overflow=''})})}c.addEventListener('change',function(){document.body.style.overflow=c.checked?'hidden':''});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&c.checked){c.checked=false;document.body.style.overflow=''}})})();`,
        }}
      />

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
