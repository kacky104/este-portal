// 公式ホームページのトップページ本体（2026-08-08 段階2 → 2026-08-11 外枠を HpShell へ分離）。
//
// ★ ここが「外側は違うが中身は同じ」を実現する要：
//   - DOM 構造（ブロックの種類・並び順）は全ひな形で完全に共通（この1コンポーネント）。
//   - ひな形S/A/B/C の違いは styles.ts の CSS 文字列と、カラーCSS変数（--hp-accent 等）だけ。
//   - ブロックを増やす／変えるときはこのファイルと data.ts だけを直す（4ひな形同時に変わる）。
//
// 共通の外枠（トップバー・ドロワー・フッター・予約CTA・スクリプト）は HpShell が持つ。
// このファイルはヒーローと各セクションだけを返し、それを HpShell が素のまま流し込む
// （ラッパーの div を挟むと order による並び替えが死ぬ。HpShell の冒頭コメント参照）。
//
// ブロックの ON/OFF・件数は salon_sites.blocks（sanitizeHpBlocks 済み）に従う。
// 写メ日記・口コミは /embed/salon/[id]/* の iframe（重複コンテンツ回避。設計メモ4章）。
// 「もっと見る」はフクエス本体への絶対URLリンク（HPからフクエスへの実流入導線）。
//
// ★ 外部リンクの rel は "noopener" だけにする（"noreferrer" は付けない）。
//   noreferrer を付けると Referer が送られず、リンク先のアクセス解析で
//   「直接アクセス」扱いになる＝HPからフクエスへの流入も、相互リンクの流入も数えられない。
//   セキュリティ面は noopener で足りる（target="_blank" は最近のブラウザでは既定で noopener）。
//   例外: LINE予約だけは他社サービスで計測の必要が無いので従来どおり（HpShell 側）。

import { EMBED_SITE_URL } from '@/app/embed/salon/[id]/embedShared';
import { hpBundledHeroImages, hpHeroImages, hpSectionOrder } from '@/app/lib/hpSite';
import type { HpSectionKey } from '@/app/lib/hpSite';
import type { HpPageData } from '@/app/hp/_lib/data';
import {
  groupCourses,
  hpVisibleSections,
  HP_DIGEST_COURSE_GROUPS,
  HP_DIGEST_NEWS,
  HP_DIGEST_THERAPISTS,
} from '@/app/hp/_lib/sections';
import { hpTopbarNavItems } from '@/app/hp/_lib/sections';
import { HpShell, HP_ORDER_HERO, HP_ORDER_QUICKNAV_ABOVE_HERO } from './HpShell';
import { CourseGroups, QuickNav, SecHead, TherapistCards } from './parts';

/** 色味を振った既定キービジュアル（public/hp-s/hero-pc-{色}.webp）を持つ配色。 */
const HP_S_HERO_FALLBACK_COLORS = ['wine', 'blue', 'emerald'];

export function HpTemplate({ data }: { data: HpPageData }) {
  const { site, salon, courses, therapists, coupons, news, freePages, basePath } = data;
  const b = site.blocks;
  // マルチページ時はセラピストと料金を抜粋にして、全件は下層ページ（/therapist・/system）へ送る。
  // 同じ内容をトップと下層にそのまま二度出すと自社ドメイン内で重複コンテンツになるため。
  const multipage = b.multipage;
  const salonUrl = `${EMBED_SITE_URL}/salon/${salon.id}`;
  const grouped = groupCourses(courses);
  // ヒーローは「1枚目=PC用（横長）／2枚目=スマホ用（縦長・省略可）」の約束。
  // 2枚目が無ければ1枚目を両方に使う（従来どおりの挙動）。
  // カラー別の写真（デモ店のプレビュー用・blocks.heroByColor）があればそちらが勝つ。
  const heroImages = hpHeroImages(site);
  const heroPc = heroImages[0] ?? null;
  const heroSp = heroImages[1] ?? null;
  // タイプSの既定キービジュアル（店舗が画像を入れていないとき用）。
  // 配色に合わせて色味を振った同じ写真を public/hp-s/ に用意している
  // （2026-08-11: ワインレッド・ロイヤルブルー・エメラルドグリーン）。配色を足すときは
  // 画像を置いてここに1行足すだけ。店舗が自分の写真を入れたらこの経路は使われない。
  const heroFallbackSuffix =
    site.template_key === 's' && HP_S_HERO_FALLBACK_COLORS.includes(site.theme_key)
      ? `-${site.theme_key}`
      : '';
  // タイプAの既定キービジュアル（2026-08-12）。タイプSと同じ考え方で、同じ写真の暗部だけに
  // 配色の色を差したものを public/hp-a/ に4色ぶん同梱してある（生成: tools-gen-hp-a-kv.py）。
  // 店舗が自分の写真を入れていれば heroPc が先に立つので、この経路は使われない。
  const heroBundledA =
    site.template_key === 'a'
      ? hpBundledHeroImages('a', site.theme_key) ?? hpBundledHeroImages('a', 'gold')
      : null;
  const onDuty = therapists.filter((t) => t.onDuty);

  // ── セクションの表示順（2026-08-10）──
  //   DOM の並びは全ひな形共通のまま（作業ルール1）で、画面の並びは flex の order で作る。
  //   使う並びは hpSectionOrder() ただ1つ＝管理画面の一覧と必ず一致する
  //   （以前はタイプSだけ styles.ts のCSSで並べ替えていたため管理画面とずれていた）。
  const orderList = hpSectionOrder(site.template_key, b.order);
  const orderCustom = b.order !== null; // オーナーが自分で並べ替えたか（地色の付け方に使う）
  const ord = (k: HpSectionKey): React.CSSProperties => ({ order: orderList.indexOf(k) + 1 });

  // 交互の地色（.hp-sec-alt）は「実際に画面に出るセクションの並び」で1つおきに付ける。
  // 並び替えると canonical 前提の固定クラスでは同じ地色が2つ続いてしまうため、
  // 並び替え時だけ実際の並び＋表示有無から付け直す（未設定時は従来の固定クラスのまま）。
  const visible = hpVisibleSections(data);
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

  return (
    <HpShell data={data} page="home">
      {/* ── ヒーロー ──
           画像は自然な縦横比で表示しつつ max-height でキャップ（CSS側）。
           横長バナー＝全体表示／縦長写真＝切り抜き、が自動で切り替わる。
           スマホ用（hero_images[1]）があれば 639px 以下で <picture> が自動で差し替える。
           タイプSは店舗の画像が未設定でも成立するよう、既定のキービジュアル
           （public/hp-s/・PC 2400×960 / SP 1080×760 を出し分け）にフォールバックする。 */}
      <div id="top" className="hp-hero" style={{ order: HP_ORDER_HERO }}>
        {heroPc ? (
          <picture>
            {heroSp && <source media="(max-width: 639px)" srcSet={heroSp} />}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hp-hero-img" src={heroPc} alt={salon.name} />
          </picture>
        ) : site.template_key === 's' ? (
          <picture>
            <source media="(max-width: 639px)" srcSet={`/hp-s/hero-sp${heroFallbackSuffix}.webp`} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hp-hero-img" src={`/hp-s/hero-pc${heroFallbackSuffix}.webp`} alt={salon.name} />
          </picture>
        ) : heroBundledA ? (
          <picture>
            <source media="(max-width: 639px)" srcSet={heroBundledA[1]} />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="hp-hero-img" src={heroBundledA[0]} alt={salon.name} />
          </picture>
        ) : null}
        <div className="hp-hero-text">
          {salon.catchphrase && <div className="hp-hero-en">{salon.catchphrase}</div>}
          {/* data-hp-fitline: PC幅で2行に折り返す場合、1行に収まるまで文字を自動縮小
              （HpShell のスクリプト）。JSなしなら従来どおり折り返すだけ。 */}
          <h1 className="hp-hero-name" data-hp-fitline>{salon.name}</h1>
          {site.hero_catch && <p className="hp-hero-catch" data-hp-fitline>{site.hero_catch}</p>}
          <p className="hp-hero-area">{salon.area}{salon.hours ? `　${salon.hours}` : ''}</p>
        </div>
      </div>

      {/* ── SPクイックナビ（order で位置固定。並び替えの対象外）──
           項目とリンク先はPCヘッダーのナビと同じ（hpTopbarNavItems）。スマホ幅のみ表示。
           タイプAだけヒーロー画像の【上】（ヘッダー直下）に出す（2026-08-12 要望）。
           タイプAはヒーローの下に店名・キャッチが来る作りなので、ナビは上にまとめた方が収まる。 */}
      <QuickNav
        items={hpTopbarNavItems(data, 'home')}
        order={site.template_key === 'a' ? HP_ORDER_QUICKNAV_ABOVE_HERO : 0}
      />

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
          <CourseGroups grouped={grouped} limit={multipage ? HP_DIGEST_COURSE_GROUPS : undefined} />
          {multipage ? (
            /* 税込みの注記は下層ページ側に置く（トップは抜粋なので導線を優先） */
            <a className="hp-more" href={`${basePath}/system`}>
              {grouped.length > HP_DIGEST_COURSE_GROUPS ? '料金・コースをすべて見る →' : '料金・コースを見る →'}
            </a>
          ) : (
            <p className="hp-note">※ 表示料金はすべて税込みです。</p>
          )}
        </section>
      )}

      {/* ── セラピスト ── */}
      {visible.therapists && (
        <section id="therapist" data-hp-reveal className={secCls('therapists', 'hp-sec-therapists', false)} style={ord('therapists')}>
          <SecHead no="03" en="Therapist" jp="セラピスト" />
          <TherapistCards therapists={therapists} limit={multipage ? HP_DIGEST_THERAPISTS : undefined} />
          {multipage && (
            <a className="hp-more" href={`${basePath}/therapist`}>
              {therapists.length > HP_DIGEST_THERAPISTS
                ? `セラピスト一覧をすべて見る（全${therapists.length}名） →`
                : 'セラピスト一覧を見る →'}
            </a>
          )}
        </section>
      )}

      {/* ── 本日の出勤 ──
           行は「サムネイル＋（名前・年齢体型・時間）」の共通DOM。
           A/B/C は COMMON で hp-sched-thumb / hp-sched-meta を display:none にし、
           hp-sched-body を display:contents にすることで従来どおり「名前 …… 時間」の
           1行レイアウトのまま（見た目は変わらない）。タイプSだけが写真グリッドとして使う。 */}
      {visible.schedule && (
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
                rel="noopener"
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
          <a className="hp-more" href={`${salonUrl}/schedule`} target="_blank" rel="noopener">
            出勤スケジュールをもっと見る →
          </a>
        </section>
      )}

      {/* ── 写メ日記（埋め込み） ── */}
      {visible.diary && (
        <section id="diary" data-hp-reveal className={secCls('diary', 'hp-sec-diary', false)} style={ord('diary')}>
          <SecHead no="05" en="Diary" jp="写メ日記" />
          <iframe className="hp-embed" src={`/embed/salon/${salon.id}/diary`} title="写メ日記" loading="lazy" style={{ height: 480 }} />
          <a className="hp-more" href={`${salonUrl}/diary`} target="_blank" rel="noopener">もっと見る →</a>
        </section>
      )}

      {/* ── 口コミ（埋め込み） ── */}
      {visible.reviews && (
        <section id="voice" data-hp-reveal className={secCls('reviews', 'hp-sec-reviews', true)} style={ord('reviews')}>
          <SecHead no="06" en="Voice" jp="口コミ" />
          <iframe className="hp-embed" src={`/embed/salon/${salon.id}/reviews`} title="口コミ" loading="lazy" style={{ height: 420 }} />
          <a className="hp-more" href={`${salonUrl}/reviews`} target="_blank" rel="noopener">もっと見る →</a>
        </section>
      )}

      {/* ── クーポン ── */}
      {visible.coupon && (
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
      {visible.news && (
        <section id="news" data-hp-reveal className={secCls('news', 'hp-sec-news', true)} style={ord('news')}>
          <SecHead no="08" en="News" jp="お知らせ" />
          {/* data.ts は最大20件取るが、トップに出すのは従来どおり先頭3件。残りは /news 用 */}
          {news.slice(0, HP_DIGEST_NEWS).map((n) => (
            <div key={n.id} className="hp-card">
              <div className="hp-card-title">{n.title}</div>
              <div className="hp-card-body">{n.content}</div>
              {n.createdAt && <div className="hp-card-meta">{n.createdAt.slice(0, 10).replaceAll('-', '/')}</div>}
            </div>
          ))}
          {multipage && (
            <a className="hp-more" href={`${basePath}/news`}>
              {news.length > HP_DIGEST_NEWS ? 'お知らせをすべて見る →' : 'お知らせ一覧へ →'}
            </a>
          )}
        </section>
      )}

      {/* ── フリーページ ── */}
      {visible.freePages && freePages.map((f, i) => (
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
        {multipage && (
          <a className="hp-more" href={`${basePath}/info`}>店舗情報の詳細へ →</a>
        )}
      </section>

      {/* ── リンク（相互リンクのバナー群）──
           rel は noopener だけ（noreferrer は付けない）。noreferrer を付けると
           リンク先のアクセス解析に参照元が渡らず「直接アクセス」扱いになり、
           相互リンク経由の流入を数えられなくなるため。安全性は noopener で足りる。
           貼られたHTMLは保存していない。画像URL・リンク先・表示文字の3つだけを
           持っているので、ここで組み直して表示する。画像が無いものは文字リンクになる。 */}
      {visible.links && (
        <section id="link" data-hp-reveal className={secCls('links', 'hp-sec-links', false)} style={ord('links')}>
          <SecHead no="10" en="Link" jp="リンク" />
          <div className="hp-links">
            {site.link_banners.map((l, i) =>
              l.link ? (
                <a key={i} className="hp-link-item" href={l.link} target="_blank" rel="noopener">
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
      {visible.banners && (
        <section data-hp-reveal className={secCls('banners', 'hp-sec-banners', false)} style={ord('banners')}>
          {site.banners.map((bn, i) =>
            bn.link ? (
              <a key={i} href={bn.link} target="_blank" rel="noopener">
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
    </HpShell>
  );
}
