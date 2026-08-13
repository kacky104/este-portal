// 公式ホームページの共通の外枠（2026-08-11 マルチページ化 段階1）。
//
// トップ・利用規約・（以後の）下層ページが共通で持つ「額縁」をここ1本にまとめる。
// これまで HpTemplate.tsx と terms/page.tsx が同じ外枠を別々に書いていたため、
// ヘッダーのロゴを直すと規約ページだけ古いまま、といった食い違いが起きる作りだった。
//
// ★★ ここは「DOM の並びそのもの」が CSS の前提になっている。
//    ラッパーの <div> を1枚でも足すと、以下が壊れる（styles.ts の該当行を併記）:
//
//    - .hp-ordered の flex ＋ インラインの order（styles.ts:63）
//      → {children} を <div> で包むと全セクションが1個の flex アイテムにまとまり、
//        セクションの並び替え機能が丸ごと死ぬ。children は素のまま流し込むこと。
//    - #hp-drawer:checked ~ .hp-drawer-scrim / ~ .hp-drawer（styles.ts:83, 87）
//      → スクリムとドロワー本体は「チェックボックスと同じ親の後方兄弟」でなければ開かない。
//    - #hp-drawer:checked + .hp-topbar（styles.ts:77-80）
//      → チェックボックスは .hp-topbar の直前に置くこと（ハンバーガーが×に変わる仕掛け）。
//    React のフラグメント（<>…</>）は DOM ノードを作らないので、これらの兄弟関係は保たれる。
//
// ★ ドロワー本体を .hp-topbar の外に出しているのは従来どおり。トップバーの
//   backdrop-filter が position:fixed の包含ブロックになり、中に入れると全画面に広がらない。

import { hpColorCssVars, hpColorRootClass } from '@/app/lib/hpSite';
import type { HpPageData } from '@/app/hp/_lib/data';
import { hpFooterPageLinks, hpJobsUrl, hpMenuItems, hpTopbarNavItems, type HpPageKey } from '@/app/hp/_lib/sections';
import { TEMPLATE_CSS, TEMPLATE_VARIANT_CSS } from './styles';

/**
 * 外枠の作り。
 *   'full' … トップ・セラピスト一覧・料金。ドロワー＋電話アイコン＋3つのスクリプト
 *   'doc'  … 利用規約などの文章ページ。ドロワーを置かず「← ホームへ」だけ
 *            （2026-08-10 の判断を踏襲。スクリプトも積まない＝スクロール時の影も出ない）
 */
export type HpChrome = 'full' | 'doc';

/** 固定位置のもの。並び替えても「トップバー→ヒーロー→（並び替え対象）→フッター」は不変。 */
export const HP_ORDER_TOPBAR = -3;
export const HP_ORDER_HERO   = -1;
export const HP_ORDER_FOOTER = 100;
/**
 * SPクイックナビを「ヒーローより前」に置きたいひな形（タイプA）が使う値（2026-08-12）。
 * トップバー(-3) < ここ(-2) < ヒーロー(-1) の順。既定は 0（＝ヒーローの直下）。
 * ★ このために HP_ORDER_TOPBAR を -2 から -3 に下げた。見た目は変わらない（間を空けただけ）。
 */
export const HP_ORDER_QUICKNAV_ABOVE_HERO = -2;

export function HpShell({
  data,
  page,
  chrome = 'full',
  children,
}: {
  data:      HpPageData;
  page:      HpPageKey;
  chrome?:   HpChrome;
  children:  React.ReactNode;
}) {
  const { site, salon, basePath } = data;
  const cssVars = hpColorCssVars(site.template_key, site.theme_key) as React.CSSProperties;
  // 地色まで変える配色（タイプSのワインレッド）だけがクラスを返す。
  // 従来の配色は空文字＝クラスが増えないので、既存店のDOMは完全に同じまま。
  const colorClass = hpColorRootClass(site.template_key, site.theme_key);
  const homeHref = basePath || '/';
  const jobsUrl = hpJobsUrl(data);
  const footerLinks = hpFooterPageLinks(data);

  // ロゴ未設定なら従来どおり店名の文字。設定時も alt に店名を入れるので
  // 検索エンジン・読み上げから店名が消えることはない。
  const logo = site.logo_url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className="hp-topbar-logo" src={site.logo_url} alt={salon.name} />
  ) : (
    <span className="hp-topbar-name">{salon.name}</span>
  );

  return (
    <div
      className={`hp-root hp-${site.template_key}${colorClass ? ` ${colorClass}` : ''}${data.wallpaperUrl ? ' hp-has-wallpaper' : ''} hp-ordered`}
      style={cssVars}
    >
      {/* ひな形のCSS＋（地色まで変える配色なら）その配色の上書き。
          配色の上書きは該当の店のページにだけ足す＝従来の配色のHTMLは1バイトも増えない。 */}
      <style
        dangerouslySetInnerHTML={{
          __html: TEMPLATE_CSS[site.template_key] + (colorClass ? TEMPLATE_VARIANT_CSS[colorClass] ?? '' : ''),
        }}
      />

      {/* ── テーマ壁紙（theme_wallpapers 流用・固定レイヤー）。
           background-attachment: fixed はモバイルで無視されるため /salon/[id] と同じ固定配置レイヤー方式。
           暗色オーバーレイは各ひな形のCSS（.hp-wallpaper::after）が持つ。 ── */}
      {data.wallpaperUrl && (
        <div className="hp-wallpaper" style={{ backgroundImage: `url(${data.wallpaperUrl})` }} />
      )}

      {chrome === 'doc' ? (
        /* 文章ページのトップバー: ロゴ（ホームへ）と「← ホームへ」だけ。ドロワーは置かない。 */
        <div className="hp-topbar" style={{ order: HP_ORDER_TOPBAR }}>
          <a className="hp-topbar-home" href={homeHref}>{logo}</a>
          <a className="hp-doc-back" href={homeHref}>← ホームへ</a>
        </div>
      ) : (
        <>
          {/* ── トップバー＋ドロワーメニュー（表示の有無・見た目は各ひな形のCSSが決める）──
               ナビ（.hp-topbar-nav）はタイプS・A・BのPCのみ表示（COMMON で display:none）。
               開閉は素のチェックボックス＋<label>で行う（JSなしでも開ける）。下部の
               スクリプトはリンク押下・Escでの自動クローズと背面スクロール止めだけを担う。 */}
          <input type="checkbox" id="hp-drawer" className="hp-drawer-toggle" aria-label="メニュー" />
          <div className="hp-topbar" style={{ order: HP_ORDER_TOPBAR }}>
            {/* トップでは従来どおり素のロゴ。下層ページではロゴがホームへの導線になる。 */}
            {page === 'home' ? logo : <a className="hp-topbar-home" href={homeHref}>{logo}</a>}
            <nav className="hp-topbar-nav">
              {hpTopbarNavItems(data, page).map((m) => (
                <a key={m.label} href={m.href} {...(m.current ? { 'aria-current': 'page' as const } : {})}>
                  {m.label}
                </a>
              ))}
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
              {hpMenuItems(data, page).map((m) => (
                <li key={m.label}>
                  {m.external ? (
                    <a href={m.href} target="_blank" rel="noopener">{m.label}</a>
                  ) : (
                    <a href={m.href} {...(m.current ? { 'aria-current': 'page' as const } : {})}>{m.label}</a>
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
              <a className="hp-drawer-terms" href={`${basePath}/terms`}>利用規約</a>
            </div>
          </nav>
        </>
      )}

      {/* ── 各ページの中身（ヒーロー・セクション）。
           ★ 必ず素のまま流し込むこと（<div> で包むと order による並び替えが死ぬ） ── */}
      {children}

      {/* ── フッター ── */}
      <footer className="hp-footer" style={{ order: HP_ORDER_FOOTER }}>
        <div className="hp-footer-name">{salon.name}</div>
        {/* マルチページ時のページ一覧。どのページからでも全ページへ辿れるようにする
            （地味だが、内部リンクが全ページに通っていることがSEOでいちばん効く）。 */}
        {chrome === 'full' && footerLinks.length > 0 && (
          <div className="hp-footer-sub hp-footer-links">
            {footerLinks.map((m) => (
              <a key={m.label} href={m.href} {...(m.href === (basePath || '/') && page === 'home' ? { 'aria-current': 'page' as const } : {})}>
                {m.label}
              </a>
            ))}
          </div>
        )}
        <div className="hp-footer-sub">
          © {salon.name} all rights reserved.
          {chrome === 'full' && jobsUrl !== null && (
            <>
              <br />
              <a href={jobsUrl} target="_blank" rel="noopener">セラピスト求人はこちら</a>
            </>
          )}
        </div>
      </footer>

      {chrome === 'full' && (
        <>
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

          {/* ── ヒーロー文字の1行フィット（2026-08-11）──
               PC幅（640px以上）で店名・キャッチコピーが2行に折り返す場合、
               1行に収まるサイズまで文字を縮める（下限15px。それでも収まらない長文は従来どおり折り返す）。
               ★ 比較する幅は要素自身ではなく「親の内側の幅」。タイプSのヒーロー文字は flex の
                 子要素で、nowrap にすると要素自身が親からはみ出して広がるため、自分の幅との
                 比較では常に収まって見えてしまう（Playwright 検証で発覚）。
               ウェブフォント読み込み後・リサイズ時に測り直す。JSなしなら折り返すだけ＝安全側。 ── */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var els=document.querySelectorAll('[data-hp-fitline]');if(!els.length)return;var mq=window.matchMedia('(min-width: 640px)');function fit(el){el.style.fontSize='';el.style.whiteSpace='';if(!mq.matches)return;var p=el.parentElement;if(!p)return;var pcs=getComputedStyle(p);var avail=p.clientWidth-parseFloat(pcs.paddingLeft)-parseFloat(pcs.paddingRight);el.style.whiteSpace='nowrap';var need=el.scrollWidth;if(need>avail){var cs=parseFloat(getComputedStyle(el).fontSize);var s=cs*avail/need*0.98;if(s<15){el.style.whiteSpace='';return}el.style.fontSize=s+'px'}}function run(){els.forEach(fit)}run();if(document.fonts&&document.fonts.ready){document.fonts.ready.then(run)}var t=false;window.addEventListener('resize',function(){if(!t){t=true;requestAnimationFrame(function(){run();t=false})}},{passive:true})})();`,
            }}
          />

          {/* ── ドロワーの補助（無くても開閉はできる）。リンクを押したら閉じる・Escで閉じる・
               開いている間は背面をスクロールさせない。 ── */}
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){var c=document.getElementById('hp-drawer');if(!c)return;var d=document.querySelector('.hp-drawer');if(d){d.querySelectorAll('a').forEach(function(a){a.addEventListener('click',function(){c.checked=false;document.body.style.overflow=''})})}c.addEventListener('change',function(){document.body.style.overflow=c.checked?'hidden':''});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&c.checked){c.checked=false;document.body.style.overflow=''}})})();`,
            }}
          />
        </>
      )}

      {/* ── 予約CTA（画面下固定） ── */}
      {(salon.phone || salon.lineUrl) && (
        <div className="hp-cta">
          {salon.phone && <a className="hp-cta-tel" href={`tel:${salon.phone}`}>電話予約</a>}
          {/* LINE予約だけは他社サービスで計測の必要が無いので noreferrer のまま */}
          {salon.lineUrl && <a className="hp-cta-line" href={salon.lineUrl} target="_blank" rel="noopener noreferrer">LINE予約</a>}
        </div>
      )}
    </div>
  );
}
