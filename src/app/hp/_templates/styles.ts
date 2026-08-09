// ひな形A/B/C のスタイル定義（2026-08-08 段階2）。
//
// DOM は HpTemplate.tsx の1本のみで、ここでは「同じクラス名を各ひな形がどう装飾するか」だけを持つ。
// カラーは CSS 変数（--hp-accent / --hp-accent-soft / --hp-accent-deep）で受け取り、
// 値は lib/hpSite.ts の HP_COLOR_VARIANTS が HpTemplate 側で style 属性に注入する。
// デザインの原本は 2026-08-08 のHTMLモック（タイプA=LUXE / B=CLEAN / C=MODE）。
//
// 共通の作り:
//  - .hp-root は最大幅640pxの中央寄せ（PCでもスマホの見え方を保つ。/hp/layout.tsx の暗背景が額縁になる）
//  - .hp-hero-img は「自然な縦横比＋max-height 78vh の cover」
//    → 横長バナーは全体表示・縦長写真は切り抜き、が自動で切り替わる
//  - .hp-idx（連番）と .hp-topbar はタイプCだけ表示
//  - .hp-rule（短い罫線）はタイプAだけ表示

const COMMON = `
/* isolation: isolate は壁紙レイヤー（z-index:-1）のため必須。
   これが無いと負の z-index がページ全体の背面（レイアウトの額縁背景の裏）まで潜って見えなくなる。 */
.hp-root { max-width: 640px; margin: 0 auto; min-height: 100vh; -webkit-font-smoothing: antialiased; padding-bottom: 64px; position: relative; isolation: isolate; }
.hp-root * { margin: 0; padding: 0; box-sizing: border-box; }
.hp-hero picture { display: block; }
.hp-hero-img { display: block; width: 100%; height: auto; max-height: 78vh; object-fit: cover; }
.hp-sec { padding: 48px 22px; }
.hp-idx, .hp-topbar { display: none; }
.hp-topbar-nav { display: none; }
.hp-rule { display: none; }
.hp-embed { display: block; width: 100%; border: none; background: #fff; }
.hp-more { display: inline-block; margin-top: 12px; text-decoration: none; font-size: 11px; font-weight: 700; }
.hp-note { margin-top: 14px; font-size: 10px; opacity: .7; }
.hp-card { margin-bottom: 12px; }
.hp-th-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
.hp-th-card { flex: 0 0 128px; text-decoration: none; }
.hp-th-frame img, .hp-th-noimg { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; }
.hp-info-row { display: flex; padding: 12px 2px; font-size: 12px; }
.hp-info-row dt { flex: 0 0 84px; }
.hp-info-row dd { line-height: 1.8; }
.hp-banner-img { display: block; width: 100%; height: auto; margin-bottom: 10px; }
.hp-sec-banners { padding-top: 0; }
.hp-cta { position: fixed; bottom: 0; left: 50%; transform: translateX(-50%); width: 100%; max-width: 640px; display: flex; z-index: 20; }
.hp-cta a { flex: 1; text-align: center; padding: 16px 0; font-size: 13px; text-decoration: none; font-weight: 700; letter-spacing: .15em; }
.hp-footer { padding: 44px 22px 60px; text-align: center; }
.hp-th-catch { display: none; }
.hp-th-badges { display: none; }
.hp-sched-date { font-size: 11px; margin: -8px 0 12px; opacity: .75; letter-spacing: .1em; }
/* 出勤行は <a>（セラピスト個別ページへ）。A/B/C は従来の「名前 …… 時間」1行のままにする:
   サムネと年齢体型は隠し、hp-sched-body を display:contents にして
   名前と時間を行（flex）の直接の子に戻す。タイプSだけがこれを上書きして写真グリッドにする。 */
.hp-sched-row { color: inherit; text-decoration: none; }
.hp-sched-body { display: contents; }
.hp-sched-thumb, .hp-sched-meta { display: none; }
/* テーマ壁紙レイヤー（有効時は .hp-has-wallpaper が付き、ひな形側で透過調整する） */
.hp-wallpaper { position: fixed; inset: 0; z-index: -1; background-size: cover; background-position: center; pointer-events: none; }
.hp-wallpaper::after { content: ''; position: absolute; inset: 0; }
/* スクロール出現（reduced-motion 時はアニメなしで常時表示） */
@media (prefers-reduced-motion: no-preference) {
  [data-hp-reveal] { opacity: 0; transform: translateY(26px); transition: opacity .7s ease, transform .7s ease; }
  [data-hp-reveal].hp-revealed { opacity: 1; transform: none; }
}
`;

const TYPE_A = `
@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500;600&display=swap');
${COMMON}
.hp-a { background: #17161a; color: #e8e4dc; font-family: 'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'Noto Serif CJK JP', serif; }
/* PCワイド対応: 枠を広げ、背景に繻子（サテン）風の淡い光沢を敷く。
   セクションの背景帯は全幅・本文は中央 720px（padding で作る＝帯が途切れない）。 */
.hp-a { max-width: 1024px; background-image:
  radial-gradient(900px 480px at 85% -120px, color-mix(in srgb, var(--hp-accent, #c4a469) 9%, transparent), transparent 70%),
  radial-gradient(700px 420px at -10% 30%, color-mix(in srgb, var(--hp-accent, #c4a469) 5%, transparent), transparent 70%); }
@media (min-width: 768px) {
  .hp-a .hp-sec { padding: 76px calc((100% - 720px) / 2); }
  .hp-a .hp-hero-text { padding: 48px 24px 56px; }
}
.hp-a .hp-sec-alt { background: #1f1d22; }
.hp-a .hp-sec + .hp-sec:not(.hp-sec-alt) { border-top: 1px solid #26242b; }
/* 壁紙が有効なとき: 地を透かして壁紙を見せ、帯・カードは半透明のガラス調に */
.hp-a.hp-has-wallpaper { background-color: transparent; }
.hp-a .hp-wallpaper::after { background: rgba(23,22,26,.62); }
.hp-a.hp-has-wallpaper .hp-sec-alt { background: rgba(31,29,34,.72); }
.hp-a.hp-has-wallpaper .hp-card { background: rgba(35,33,40,.8); }
.hp-a.hp-has-wallpaper .hp-topbar { background: rgba(23,22,26,.82); }
/* 固定トップバー（店名＋予約）。スクロールしても店名と導線が消えない */
.hp-a .hp-topbar { display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 30;
  padding: 13px 20px; background: rgba(23,22,26,.9); backdrop-filter: blur(8px); border-bottom: 1px solid color-mix(in srgb, var(--hp-accent, #c4a469) 40%, transparent); }
.hp-a .hp-topbar-name { font-size: 13px; letter-spacing: .22em; color: #e8e4dc; }
.hp-a .hp-topbar-cta { font-size: 10px; letter-spacing: .25em; color: #17161a; background: var(--hp-accent, #c4a469); padding: 8px 16px; text-decoration: none; }
.hp-a .hp-en { letter-spacing: .35em; font-size: 10px; color: var(--hp-accent, #c4a469); text-transform: uppercase; }
.hp-a .hp-h2 { font-size: 21px; font-weight: 600; letter-spacing: .18em; margin: 8px 0 6px; }
/* 罫線は二重線（内側は淡く）でホテルライクに */
.hp-a .hp-rule { display: block; width: 56px; height: 5px; margin: 16px 0 26px; background: none; border-top: 1px solid var(--hp-accent, #c4a469); position: relative; }
.hp-a .hp-rule::after { content: ''; position: absolute; top: 3px; left: 10px; right: 10px; border-top: 1px solid color-mix(in srgb, var(--hp-accent, #c4a469) 45%, transparent); }
.hp-a .hp-hero-text { padding: 34px 24px 44px; text-align: center; }
.hp-a .hp-hero-en { font-size: 11px; letter-spacing: .4em; color: var(--hp-accent, #c4a469); margin-bottom: 14px; }
.hp-a .hp-hero-name { font-size: 32px; font-weight: 500; letter-spacing: .12em; line-height: 1.35; }
.hp-a .hp-hero-catch { margin-top: 14px; font-size: 13px; color: #cfc9bd; letter-spacing: .14em; line-height: 2; }
.hp-a .hp-hero-area { margin-top: 20px; font-size: 10px; color: #948f85; letter-spacing: .3em; }
@media (min-width: 768px) { .hp-a .hp-hero-name { font-size: 40px; } }
.hp-a .hp-concept-text { font-size: 13px; line-height: 2.3; color: #cfc9bd; letter-spacing: .06em; white-space: pre-wrap; }
.hp-a .hp-concept-img { width: 100%; height: auto; margin-bottom: 20px; border: 1px solid #3a3742; }
.hp-a .hp-course-group { margin-bottom: 24px; }
.hp-a .hp-course-name { font-size: 13px; letter-spacing: .12em; color: var(--hp-accent, #c4a469); margin-bottom: 6px; font-weight: 600; }
.hp-a .hp-course-row { display: flex; justify-content: space-between; align-items: baseline; padding: 13px 2px; border-bottom: 1px solid #3a3742; }
.hp-a .hp-course-min { font-size: 12px; letter-spacing: .1em; }
.hp-a .hp-course-price { font-size: 15px; color: var(--hp-accent, #c4a469); font-style: italic; }
.hp-a .hp-th-card { flex-basis: 150px; }
@media (min-width: 768px) { .hp-a .hp-th-row { flex-wrap: wrap; } .hp-a .hp-th-card { flex-basis: 158px; } }
.hp-a .hp-th-frame { border: 1px solid #3a3742; padding: 6px; background: #232128; }
.hp-a .hp-th-noimg { background: linear-gradient(160deg, #26242b, #34313a); }
.hp-a .hp-th-name { margin-top: 10px; font-size: 12px; letter-spacing: .12em; text-align: center; color: #e8e4dc; }
.hp-a .hp-th-age { font-size: 10px; color: var(--hp-accent-soft, #a8905e); text-align: center; margin-top: 3px; }
.hp-a .hp-th-catch { display: block; margin-top: 6px; font-size: 10px; color: #948f85; text-align: center; line-height: 1.7;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.hp-a .hp-th-badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 7px; }
.hp-a .hp-th-badge { font-size: 8.5px; color: #cfc9bd; border: 1px solid #4a4650; padding: 2px 7px; letter-spacing: .08em; }
.hp-a .hp-th-onduty { display: block; width: fit-content; margin: 8px auto 0; font-size: 9px; color: var(--hp-accent, #c4a469); border: 1px solid var(--hp-accent-soft, #a8905e); padding: 2px 8px; letter-spacing: .15em; }
.hp-a .hp-sched-row { display: flex; justify-content: space-between; padding: 13px 2px; border-bottom: 1px solid #3a3742; font-size: 12px; letter-spacing: .08em; }
.hp-a .hp-sched-time { color: var(--hp-accent-soft, #a8905e); font-style: italic; }
.hp-a .hp-embed { border: 1px solid #3a3742; }
.hp-a .hp-more { color: var(--hp-accent, #c4a469); letter-spacing: .2em; border-bottom: 1px solid var(--hp-accent-soft, #a8905e); padding-bottom: 3px; }
/* カードは内側に淡い金の飾り枠（G1 の EVENT 枠のイメージ） */
.hp-a .hp-card { background: #232128; border: 1px solid #3a3742; padding: 20px; position: relative; }
.hp-a .hp-card::before { content: ''; position: absolute; inset: 5px; border: 1px solid color-mix(in srgb, var(--hp-accent, #c4a469) 28%, transparent); pointer-events: none; }
.hp-a .hp-card-title { font-size: 12px; letter-spacing: .1em; margin-bottom: 8px; }
.hp-a .hp-coupon-discount { font-size: 16px; color: var(--hp-accent, #c4a469); margin-bottom: 6px; }
.hp-a .hp-card-body { font-size: 11px; color: #948f85; line-height: 1.9; white-space: pre-wrap; }
.hp-a .hp-card-meta { margin-top: 10px; font-size: 9px; color: #6d675e; letter-spacing: .1em; }
.hp-a .hp-info-row { border-bottom: 1px solid #3a3742; }
.hp-a .hp-info-row dt { color: var(--hp-accent-soft, #a8905e); font-size: 10px; letter-spacing: .25em; padding-top: 3px; }
.hp-a .hp-info-row dd { color: #cfc9bd; }
.hp-a .hp-footer { background: #1f1d22; }
.hp-a .hp-footer-name { font-size: 13px; letter-spacing: .3em; color: var(--hp-accent, #c4a469); margin-bottom: 12px; }
.hp-a .hp-footer-sub { font-size: 9px; color: #6d675e; letter-spacing: .2em; line-height: 2.4; }
.hp-a .hp-footer-sub a { color: var(--hp-accent-soft, #a8905e); }
.hp-a .hp-cta { max-width: 1024px; }
.hp-a .hp-cta-tel { background: #232128; color: #e8e4dc; border-top: 1px solid var(--hp-accent-soft, #a8905e); }
.hp-a .hp-cta-line { background: var(--hp-accent, #c4a469); color: #17161a; }
.hp-a .hp-sched-date { display: inline-block; background: #2a2730; border: 1px solid #3a3742; padding: 6px 18px; margin: 0 0 18px; font-size: 12px; color: var(--hp-accent, #c4a469); letter-spacing: .2em; opacity: 1; }
`;

const TYPE_B = `
@import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&display=swap');
${COMMON}
.hp-b { background: #faf8f4; color: #3d3a35; font-family: 'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif; }
/* PCワイド対応（Aと同じ考え方：帯は全幅・本文720px中央） */
.hp-b { max-width: 1024px; }
@media (min-width: 768px) {
  .hp-b .hp-sec { padding: 64px calc((100% - 720px) / 2); }
  .hp-b .hp-hero-name { font-size: 34px; }
  .hp-b .hp-th-row { flex-wrap: wrap; }
}
.hp-b .hp-cta { max-width: 1024px; }
/* 固定トップバー（白のすりガラス） */
.hp-b .hp-topbar { display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 30;
  padding: 12px 18px; background: rgba(250,248,244,.9); backdrop-filter: blur(8px); border-bottom: 1px solid #eee7db; }
.hp-b .hp-topbar-name { font-size: 13px; font-weight: 900; color: #3d3a35; }
.hp-b .hp-topbar-cta { font-size: 10px; font-weight: 900; letter-spacing: .15em; color: #fff; background: var(--hp-accent-deep, #6b8f67); border-radius: 999px; padding: 8px 16px; text-decoration: none; }
.hp-b .hp-en { display: inline-block; font-size: 10px; font-weight: 700; color: var(--hp-accent-deep, #6b8f67); background: #ffffff; border: 1px solid #eee7db; border-radius: 999px; padding: 5px 14px; letter-spacing: .12em; text-transform: uppercase; }
.hp-b .hp-h2 { font-size: 19px; font-weight: 800; margin: 14px 0 16px; letter-spacing: .04em; }
.hp-b .hp-hero-text { padding: 26px 20px 10px; text-align: center; }
.hp-b .hp-hero-en { margin-top: 4px; font-size: 10px; color: var(--hp-accent-deep, #6b8f67); font-weight: 700; letter-spacing: .3em; }
.hp-b .hp-hero-name { font-size: 26px; font-weight: 900; letter-spacing: .06em; }
.hp-b .hp-hero-catch { margin-top: 12px; font-size: 13px; line-height: 2; color: #6b6459; }
.hp-b .hp-hero-area { margin-top: 12px; font-size: 10px; font-weight: 700; color: #9b948a; letter-spacing: .1em; }
.hp-b .hp-hero-img { border-radius: 0 0 28px 28px; }
.hp-b .hp-concept-text { font-size: 13px; line-height: 2.1; color: #5d574e; background: #fff; border: 1px solid #eee7db; border-radius: 20px; padding: 18px; box-shadow: 0 4px 16px rgba(80,70,55,.05); white-space: pre-wrap; }
.hp-b .hp-concept-img { width: 100%; height: auto; border-radius: 20px; margin-bottom: 14px; }
.hp-b .hp-course-group { margin-bottom: 18px; }
.hp-b .hp-course-name { font-size: 13px; font-weight: 800; margin-bottom: 8px; color: var(--hp-accent-deep, #6b8f67); }
.hp-b .hp-course-row { display: flex; justify-content: space-between; align-items: center; background: #fff; border: 1px solid #eee7db; border-radius: 16px; padding: 14px 18px; margin-bottom: 8px; }
.hp-b .hp-course-min { font-size: 12px; font-weight: 700; }
.hp-b .hp-course-price { font-size: 15px; font-weight: 900; color: var(--hp-accent-deep, #6b8f67); }
.hp-b .hp-th-card { flex-basis: 118px; }
.hp-b .hp-th-frame { background: #fff; border: 1px solid #eee7db; border-radius: 18px; overflow: hidden; }
.hp-b .hp-th-noimg { background: linear-gradient(160deg, #f0ece4, #e2e6da); }
.hp-b .hp-th-name { margin-top: 8px; font-size: 12px; font-weight: 800; text-align: center; color: #3d3a35; }
.hp-b .hp-th-age { font-size: 10px; color: #9b948a; text-align: center; margin-top: 2px; }
.hp-b .hp-th-catch { display: block; margin-top: 6px; padding: 0 6px; font-size: 10px; color: #8a8378; text-align: center; line-height: 1.7;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.hp-b .hp-th-badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 7px; padding: 0 6px; }
.hp-b .hp-th-badge { font-size: 8.5px; font-weight: 700; color: #7d766c; background: #fff; border: 1px solid #eee7db; border-radius: 999px; padding: 2px 8px; }
.hp-b .hp-th-onduty { display: block; width: fit-content; margin: 8px auto 0; font-size: 9px; font-weight: 800; color: #fff; background: var(--hp-accent, #8fae8b); border-radius: 999px; padding: 3px 10px; }
.hp-b .hp-sched-row { display: flex; justify-content: space-between; align-items: center; padding: 11px 4px; border-bottom: 1px dashed #eee7db; font-size: 13px; }
.hp-b .hp-sched-name { font-weight: 800; }
.hp-b .hp-sched-time { font-size: 12px; font-weight: 700; color: var(--hp-accent-deep, #6b8f67); background: #ffffff; border: 1px solid #eee7db; border-radius: 999px; padding: 4px 12px; }
.hp-b .hp-embed { border: 1px solid #eee7db; border-radius: 20px; }
.hp-b .hp-more { display: block; text-align: center; color: var(--hp-accent-deep, #6b8f67); font-weight: 800; }
.hp-b .hp-card { background: #fff; border: 1px solid #eee7db; border-radius: 20px; padding: 18px; box-shadow: 0 4px 16px rgba(80,70,55,.05); }
.hp-b .hp-card-title { font-size: 13px; font-weight: 800; margin-bottom: 6px; }
.hp-b .hp-coupon-discount { font-size: 17px; font-weight: 900; color: var(--hp-accent-deep, #6b8f67); margin-bottom: 6px; }
.hp-b .hp-card-body { font-size: 12px; color: #6b6459; line-height: 1.9; white-space: pre-wrap; }
.hp-b .hp-card-meta { margin-top: 8px; font-size: 10px; color: #9b948a; }
.hp-b .hp-info { background: #fff; border: 1px solid #eee7db; border-radius: 20px; padding: 6px 18px; }
.hp-b .hp-info-row { border-bottom: 1px dashed #eee7db; }
.hp-b .hp-info-row:last-child { border-bottom: none; }
.hp-b .hp-info-row dt { font-weight: 800; color: var(--hp-accent-deep, #6b8f67); }
.hp-b .hp-info-row dd { color: #5d574e; }
.hp-b .hp-footer-name { font-size: 14px; font-weight: 900; margin-bottom: 8px; }
.hp-b .hp-footer-sub { font-size: 10px; color: #9b948a; line-height: 2.2; }
.hp-b .hp-footer-sub a { color: var(--hp-accent-deep, #6b8f67); font-weight: 800; }
.hp-b .hp-cta { padding: 0 14px 14px; gap: 8px; }
.hp-b .hp-cta a { border-radius: 999px; font-weight: 900; box-shadow: 0 6px 18px rgba(80,70,55,.16); }
.hp-b .hp-cta-tel { background: #fff; color: #3d3a35; border: 1px solid #eee7db; }
.hp-b .hp-cta-line { background: var(--hp-accent-deep, #6b8f67); color: #fff; }
.hp-b .hp-sched-date { display: inline-block; background: color-mix(in srgb, var(--hp-accent, #8fae8b) 16%, #ffffff); color: var(--hp-accent-deep, #6b8f67); border-radius: 999px; padding: 5px 16px; margin: 0 0 16px; font-size: 12px; font-weight: 800; opacity: 1; }
`;

const TYPE_C = `
${COMMON}
.hp-c { background: #f4f4f6; color: #1c1c20; font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif; }
/* PCワイド対応（罫線・帯は全幅・本文760px中央） */
.hp-c { max-width: 1024px; }
@media (min-width: 768px) {
  .hp-c .hp-sec { padding: 64px calc((100% - 760px) / 2); }
  .hp-c .hp-en { font-size: 40px; }
  .hp-c .hp-hero-name { font-size: 48px; }
  /* 後方の基本ルール（flex: 0 0 44%）に勝つよう詳細度を1段上げる */
  .hp-c .hp-th-row .hp-th-cell { flex-basis: 25%; }
}
.hp-c .hp-cta { max-width: 1024px; }
.hp-c .hp-topbar { display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; z-index: 30;
  padding: 14px 20px; background: rgba(244,244,246,.92); backdrop-filter: blur(8px); border-bottom: 2px solid #111114; }
.hp-c .hp-topbar-name { font-size: 15px; font-weight: 900; letter-spacing: .04em; }
.hp-c .hp-topbar-cta { font-size: 10px; font-weight: 900; background: #111114; color: #fff; padding: 8px 14px; letter-spacing: .15em; text-decoration: none; }
.hp-c .hp-sec { border-top: 2px solid #111114; padding: 46px 20px; }
.hp-c .hp-idx { display: block; font-size: 10px; font-weight: 900; letter-spacing: .1em; color: var(--hp-accent, #ff4658); }
.hp-c .hp-en { display: block; font-size: 28px; font-weight: 900; letter-spacing: -.01em; line-height: 1.05; margin: 6px 0 2px; text-transform: uppercase; color: #111114; }
.hp-c .hp-h2 { font-size: 11px; font-weight: 700; color: #77777e; letter-spacing: .2em; margin-bottom: 20px; }
.hp-c .hp-hero-img { border-bottom: 2px solid #111114; }
.hp-c .hp-hero-text { padding: 22px 20px 26px; }
.hp-c .hp-hero-en { font-size: 10px; font-weight: 900; letter-spacing: .2em; color: var(--hp-accent, #ff4658); }
.hp-c .hp-hero-name { margin-top: 6px; font-size: 34px; font-weight: 900; letter-spacing: -.01em; line-height: 1.1; }
.hp-c .hp-hero-catch { margin-top: 12px; font-size: 14px; font-weight: 800; line-height: 1.9; }
.hp-c .hp-hero-area { margin-top: 10px; font-size: 10px; font-weight: 800; color: #77777e; letter-spacing: .12em; }
.hp-c .hp-concept-text { font-size: 13px; line-height: 2.1; font-weight: 500; white-space: pre-wrap; }
.hp-c .hp-concept-img { width: 100%; height: auto; border: 2px solid #111114; margin-bottom: 16px; }
.hp-c .hp-course-group { margin-bottom: 20px; }
.hp-c .hp-course-name { font-size: 13px; font-weight: 900; margin-bottom: 4px; }
.hp-c .hp-course-row { display: flex; justify-content: space-between; align-items: baseline; padding: 15px 0; border-bottom: 1px solid #c9c9cf; }
.hp-c .hp-course-min { font-size: 13px; font-weight: 700; }
.hp-c .hp-course-price { font-size: 18px; font-weight: 900; letter-spacing: -.02em; }
.hp-c .hp-th-row { border: 2px solid #111114; background: #111114; gap: 0; padding-bottom: 0; }
.hp-c .hp-th-card { flex: 0 0 44%; background: #f4f4f6; border-right: 2px solid #111114; padding-bottom: 12px; }
.hp-c .hp-th-card:last-child { border-right: none; }
.hp-c .hp-th-frame img, .hp-c .hp-th-noimg { border-bottom: 2px solid #111114; }
.hp-c .hp-th-noimg { background: linear-gradient(160deg, #e4e4e8, #d2d2d8); }
.hp-c .hp-th-name { padding: 10px 12px 0; font-size: 14px; font-weight: 900; color: #1c1c20; }
.hp-c .hp-th-age { padding: 2px 12px 0; font-size: 10px; font-weight: 700; color: #77777e; letter-spacing: .15em; }
.hp-c .hp-th-catch { display: block; padding: 6px 12px 0; font-size: 10.5px; font-weight: 600; color: #55555c; line-height: 1.7;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.hp-c .hp-th-badges { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 0; }
.hp-c .hp-th-badge { font-size: 8.5px; font-weight: 900; color: #111114; border: 1.5px solid #111114; padding: 2px 7px; letter-spacing: .05em; }
.hp-c .hp-th-onduty { margin: 8px 12px 0; display: inline-block; font-size: 9px; font-weight: 900; color: var(--hp-accent, #ff4658); border: 2px solid var(--hp-accent, #ff4658); padding: 2px 8px; letter-spacing: .1em; }
.hp-c .hp-sched-row { display: flex; justify-content: space-between; padding: 14px 2px; border-bottom: 1px solid #c9c9cf; font-size: 13px; font-weight: 800; }
.hp-c .hp-sched-time { font-weight: 900; }
.hp-c .hp-embed { border: 2px solid #111114; background: #fff; }
.hp-c .hp-more { color: #111114; font-weight: 900; border-bottom: 3px solid var(--hp-accent, #ff4658); padding-bottom: 2px; letter-spacing: .1em; }
.hp-c .hp-card { border: 2px solid #111114; background: #fff; padding: 16px; box-shadow: 5px 5px 0 #111114; margin-bottom: 16px; }
.hp-c .hp-card-title { font-size: 13px; font-weight: 900; }
.hp-c .hp-coupon-discount { font-size: 18px; font-weight: 900; color: var(--hp-accent, #ff4658); margin: 4px 0; }
.hp-c .hp-card-body { margin-top: 6px; font-size: 12px; line-height: 1.9; font-weight: 500; white-space: pre-wrap; }
.hp-c .hp-card-meta { margin-top: 10px; font-size: 9px; font-weight: 800; color: #77777e; letter-spacing: .15em; }
.hp-c .hp-info-row { border-bottom: 1px solid #c9c9cf; padding: 13px 2px; }
.hp-c .hp-info-row dt { font-weight: 900; letter-spacing: .1em; font-size: 10px; padding-top: 2px; }
.hp-c .hp-info-row dd { font-weight: 600; }
.hp-c .hp-footer { background: #111114; color: #fff; text-align: left; padding: 40px 20px 60px; }
.hp-c .hp-footer-name { font-size: 20px; font-weight: 900; }
.hp-c .hp-footer-sub { margin-top: 10px; font-size: 10px; color: #9a9aa2; font-weight: 700; line-height: 2; }
.hp-c .hp-footer-sub a { color: #fff; }
.hp-c .hp-cta { border-top: 2px solid #111114; }
.hp-c .hp-cta a { font-weight: 900; letter-spacing: .2em; }
.hp-c .hp-cta-tel { background: #fff; color: #111114; border-right: 2px solid #111114; }
.hp-c .hp-cta-line { background: var(--hp-accent, #ff4658); color: #fff; }
.hp-c .hp-sched-date { display: inline-block; background: #111114; color: #fff; padding: 6px 16px; margin: 0 0 16px; font-size: 12px; font-weight: 900; letter-spacing: .15em; opacity: 1; }
`;

// タイプS（GRACE・フラッグシップ）: LPのキービジュアルに描かれたサイトの実物化（2026-08-09）。
// 白〜クリーム地×シャンパンゴールド×しっぽり明朝。全幅ヒーローに文字を重ね、
// 上部固定ナビ（CONCEPT/SYSTEM/…・アンカー）を出す唯一のひな形。
// 既定ヒーロー画像は public/hp-s/（PC 2400×960 / SP 1080×760・口元から下の構図）。
const TYPE_S = `
@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500;600&display=swap');
${COMMON}
.hp-s { background: #fdfbf7; color: #4a4238; font-family: 'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'Noto Serif CJK JP', serif; }
/* フラッグシップは全幅（額縁なし）。本文は中央760pxに寄せる */
.hp-s { max-width: none; }
.hp-s .hp-sec { padding: 60px 22px; }
@media (min-width: 768px) { .hp-s .hp-sec { padding: 84px calc((100% - 860px) / 2); } }
/* 写真グリッド（出勤・セラピスト）だけは本文より広く取り、1枚を大きく見せる。
   本文は読みやすさ優先で 860px のまま。負の padding にならないよう 1240px 以上でのみ適用。 */
@media (min-width: 1240px) {
  .hp-s .hp-sec-schedule, .hp-s .hp-sec-therapists {
    padding-left: calc((100% - 1180px) / 2); padding-right: calc((100% - 1180px) / 2);
  }
}
.hp-s .hp-sec-alt { background: #f7f2ea; }
.hp-s section[id] { scroll-margin-top: 64px; }

/* ── セクションの並べ替え（タイプSのみ）──
   DOM は全ひな形共通のまま、flex の order だけで「ヒーロー直下に本日の出勤」を実現する
   （HpTemplate.tsx に "このひな形だけの並び" を持ち込まないため。作業ルール1）。
   <style> と <script> は display:none なので flex アイテムにならない。
   .hp-wallpaper / .hp-cta は position:fixed なので order の影響を受けない。 */
.hp-s { display: flex; flex-direction: column; }
.hp-s .hp-topbar          { order: 1; }
.hp-s .hp-hero            { order: 2; }
.hp-s .hp-sec-schedule    { order: 3; }
.hp-s .hp-sec-concept     { order: 4; }
.hp-s .hp-sec-courses     { order: 5; }
.hp-s .hp-sec-therapists  { order: 6; }
.hp-s .hp-sec-diary       { order: 7; }
.hp-s .hp-sec-reviews     { order: 8; }
.hp-s .hp-sec-coupon      { order: 9; }
.hp-s .hp-sec-news        { order: 10; }
.hp-s .hp-sec-free        { order: 11; }
.hp-s .hp-sec-info        { order: 12; }
.hp-s .hp-sec-banners     { order: 13; }
.hp-s .hp-footer          { order: 14; }
/* 並べ替えで背景の縞（無地↔生成り）がずれるぶんを付け替える。
   schedule=帯 / concept=無地 / courses=帯 / therapists=無地 …と交互に戻す。 */
.hp-s .hp-sec-diary, .hp-s .hp-sec-coupon, .hp-s .hp-sec-free { background: #f7f2ea; }
.hp-s .hp-sec-reviews, .hp-s .hp-sec-news, .hp-s .hp-sec-info { background: #fdfbf7; }

/* ── 固定ナビ（白のすりガラス・店名／ナビ／RESERVE） ── */
.hp-s .hp-topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; position: sticky; top: 0; z-index: 30;
  padding: 14px 22px; background: rgba(253,251,247,.92); backdrop-filter: blur(10px); border-bottom: 1px solid #eee4d4; }
.hp-s .hp-topbar-name { font-size: 14px; letter-spacing: .24em; color: var(--hp-accent, #b98d4f); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hp-s .hp-topbar-nav { display: none; gap: 26px; }
@media (min-width: 900px) { .hp-s .hp-topbar-nav { display: flex; } }
.hp-s .hp-topbar-nav a { font-size: 11px; letter-spacing: .22em; color: #7a6f60; text-decoration: none; padding: 4px 0; border-bottom: 1px solid transparent; transition: color .3s, border-color .3s; }
.hp-s .hp-topbar-nav a:hover { color: var(--hp-accent, #b98d4f); border-bottom-color: var(--hp-accent, #b98d4f); }
.hp-s .hp-topbar-cta { font-size: 10px; letter-spacing: .28em; color: #fff; background: var(--hp-accent, #b98d4f); padding: 10px 22px; text-decoration: none; white-space: nowrap; }

/* ── ヒーロー：全幅画像に文字を重ねる（PC=左側の余白へ／SP=下側の余白へ） ── */
.hp-s .hp-hero { position: relative; }
.hp-s .hp-hero-img { max-height: none; }
.hp-s .hp-hero-text { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
  text-align: left; padding: 0 0 0 6%; max-width: 56%; }
/* 大きく見せるのはキャッチコピー（順序はCSSで入れ替え） */
.hp-s .hp-hero-catch { order: -1; margin: 0 0 4%; font-size: clamp(19px, 3.1vw, 42px); line-height: 1.7; letter-spacing: .1em; color: #4a4238;
  text-shadow: 0 1px 12px rgba(253,251,247,.8); }
.hp-s .hp-hero-en { font-size: clamp(9px, 1vw, 12px); letter-spacing: .42em; color: #9b8c74; margin-bottom: 10px; }
.hp-s .hp-hero-name { font-size: clamp(15px, 1.9vw, 26px); font-weight: 500; letter-spacing: .3em; color: var(--hp-accent, #b98d4f); position: relative; padding-bottom: 12px; }
.hp-s .hp-hero-name::after { content: ''; position: absolute; left: 2px; bottom: 0; width: 64px; border-top: 1px solid var(--hp-accent-soft, #d5b98a); }
.hp-s .hp-hero-area { margin-top: 14px; font-size: clamp(8px, .9vw, 11px); color: #9b8c74; letter-spacing: .3em; }
@media (max-width: 639px) {
  /* SP: 横長寄り（1080×760）のヒーロー下部に文字を載せる。
     写真の上に直接置くと小さい英字が読めないため、下から明るいスクリムを重ねる。 */
  .hp-s .hp-hero-text { justify-content: flex-end; padding: 0 20px 26px; max-width: 100%; z-index: 1; }
  .hp-s .hp-hero-catch { margin-bottom: 12px; font-size: 21px; }
  .hp-s .hp-hero::after {
    content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 68%;
    background: linear-gradient(to top, rgba(253,251,247,.94), rgba(253,251,247,.6) 42%, rgba(253,251,247,0));
    pointer-events: none;
  }
}

/* ── セクション見出し（金の英字＋明朝＋二重罫線。Aの意匠を明るい地に移植） ── */
.hp-s .hp-en { letter-spacing: .38em; font-size: 11px; color: var(--hp-accent, #b98d4f); text-transform: uppercase; }
.hp-s .hp-h2 { font-size: 22px; font-weight: 600; letter-spacing: .16em; margin: 10px 0 6px; color: #3f382e; }

.hp-s .hp-concept-text { font-size: 13.5px; line-height: 2.4; color: #6b6154; letter-spacing: .06em; white-space: pre-wrap; }
.hp-s .hp-concept-img { width: 100%; height: auto; margin-bottom: 22px; border: 1px solid #eadfcd; padding: 6px; background: #fff; }

.hp-s .hp-course-group { margin-bottom: 26px; }
.hp-s .hp-course-name { font-size: 13px; letter-spacing: .14em; color: var(--hp-accent, #b98d4f); margin-bottom: 6px; font-weight: 600; }
.hp-s .hp-course-row { display: flex; justify-content: space-between; align-items: baseline; padding: 13px 2px; border-bottom: 1px solid #e7dcc9; }
.hp-s .hp-course-min { font-size: 12.5px; letter-spacing: .1em; color: #5d5346; }
.hp-s .hp-course-price { font-size: 15px; color: var(--hp-accent, #b98d4f); font-style: italic; }

/* セラピストは横スクロールではなくグリッド（SP2列・PC4列）で大きく見せる。
   列幅を上限つきにして justify-content:center → 端数の行も中央に揃う。 */
.hp-s .hp-th-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); justify-content: center; gap: 22px 12px; overflow: visible; padding-bottom: 0; }
@media (min-width: 768px) { .hp-s .hp-th-row { grid-template-columns: repeat(4, minmax(0, 268px)); gap: 34px 20px; } }
.hp-s .hp-th-frame { border: 1px solid #eadfcd; padding: 6px; background: #fff; box-shadow: 0 6px 20px rgba(120,100,70,.08); }
.hp-s .hp-th-noimg { background: linear-gradient(160deg, #f3ecdf, #e7dcc9); }
.hp-s .hp-th-name { margin-top: 11px; font-size: 12.5px; letter-spacing: .14em; text-align: center; color: #4a4238; }
.hp-s .hp-th-age { font-size: 10px; color: var(--hp-accent, #b98d4f); text-align: center; margin-top: 3px; }
.hp-s .hp-th-catch { display: block; margin-top: 6px; font-size: 10px; color: #9b8c74; text-align: center; line-height: 1.7;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.hp-s .hp-th-badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 7px; }
.hp-s .hp-th-badge { font-size: 8.5px; color: #7a6f60; border: 1px solid #e0d4bf; background: #fff; padding: 2px 7px; letter-spacing: .08em; }
.hp-s .hp-th-onduty { display: block; width: fit-content; margin: 8px auto 0; font-size: 9px; color: #fff; background: var(--hp-accent, #b98d4f); padding: 2px 10px; letter-spacing: .15em; }

/* ── 本日の出勤（ヒーロー直下の主役ブロック）──
   SP2列・PC4列の写真グリッド。セラピスト一覧と同じ寸法感で揃える。 */
.hp-s .hp-sched-date { display: inline-block; background: #fff; border: 1px solid #eadfcd; padding: 6px 18px; margin: 0 0 22px; font-size: 12px; color: var(--hp-accent, #b98d4f); letter-spacing: .2em; opacity: 1; }
.hp-s .hp-sched-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); justify-content: center; gap: 22px 12px; }
@media (min-width: 768px) { .hp-s .hp-sched-list { grid-template-columns: repeat(4, minmax(0, 268px)); gap: 34px 20px; } }
.hp-s .hp-sched-row { display: block; padding: 0; border: none; }
.hp-s .hp-sched-thumb { display: block; border: 1px solid #eadfcd; padding: 6px; background: #fff; box-shadow: 0 6px 20px rgba(120,100,70,.08); }
.hp-s .hp-sched-thumb img, .hp-s .hp-sched-noimg { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.hp-s .hp-sched-noimg { background: linear-gradient(160deg, #f3ecdf, #e7dcc9); }
.hp-s .hp-sched-body { display: flex; flex-direction: column; align-items: center; gap: 3px; margin-top: 12px; }
.hp-s .hp-sched-name { font-size: 13.5px; letter-spacing: .14em; color: #4a4238; }
.hp-s .hp-sched-meta { display: block; font-size: 10.5px; color: #9b8c74; letter-spacing: .06em; }
.hp-s .hp-sched-time { margin-top: 3px; font-size: 12px; color: var(--hp-accent, #b98d4f); font-style: italic; letter-spacing: .04em; }

.hp-s .hp-embed { border: 1px solid #eadfcd; }
.hp-s .hp-more { color: var(--hp-accent, #b98d4f); letter-spacing: .2em; border-bottom: 1px solid var(--hp-accent-soft, #d5b98a); padding-bottom: 3px; }

/* カードは白地に淡い金の内飾り枠（Aのカード意匠の明るい版） */
.hp-s .hp-card { background: #fff; border: 1px solid #eadfcd; padding: 22px; position: relative; box-shadow: 0 6px 20px rgba(120,100,70,.06); }
.hp-s .hp-card::before { content: ''; position: absolute; inset: 5px; border: 1px solid color-mix(in srgb, var(--hp-accent, #b98d4f) 30%, transparent); pointer-events: none; }
.hp-s .hp-card-title { font-size: 12.5px; letter-spacing: .1em; margin-bottom: 8px; color: #4a4238; }
.hp-s .hp-coupon-discount { font-size: 16px; color: var(--hp-accent, #b98d4f); margin-bottom: 6px; }
.hp-s .hp-card-body { font-size: 11px; color: #8a7d6a; line-height: 1.9; white-space: pre-wrap; }
.hp-s .hp-card-meta { margin-top: 10px; font-size: 9px; color: #b3a48c; letter-spacing: .1em; }

.hp-s .hp-info-row { border-bottom: 1px solid #e7dcc9; }
.hp-s .hp-info-row dt { color: var(--hp-accent, #b98d4f); font-size: 10px; letter-spacing: .25em; padding-top: 3px; }
.hp-s .hp-info-row dd { color: #5d5346; }

.hp-s .hp-footer { background: #3f382e; }
.hp-s .hp-footer-name { font-size: 13px; letter-spacing: .3em; color: var(--hp-accent-soft, #d5b98a); margin-bottom: 12px; }
.hp-s .hp-footer-sub { font-size: 9px; color: #a1988a; letter-spacing: .2em; line-height: 2.4; }
.hp-s .hp-footer-sub a { color: var(--hp-accent-soft, #d5b98a); }

.hp-s .hp-cta { max-width: none; }
.hp-s .hp-cta-tel { background: #fff; color: #4a4238; border-top: 1px solid var(--hp-accent-soft, #d5b98a); }
.hp-s .hp-cta-line { background: var(--hp-accent, #b98d4f); color: #fff; }

/* ══════════ 神秘的な仕上げ（2026-08-09 要望）══════════
   狙いは「静けさ・左右対称・淡い光」。装飾はCSSだけで完結させ、DOMには手を入れない。 */

/* 1) 霞（かすみ）— 画面全体に淡い光のたまりを置く。スクロールしても位置が変わらないので
      セクションをまたいで“光の中にいる”感じが続く。 */
.hp-s {
  background-image:
    radial-gradient(1200px 680px at 50% -180px, color-mix(in srgb, var(--hp-accent, #b98d4f) 15%, transparent), transparent 66%),
    radial-gradient(820px 560px at 4% 38%,   color-mix(in srgb, var(--hp-accent, #b98d4f) 7%,  transparent), transparent 70%),
    radial-gradient(820px 560px at 96% 76%,  color-mix(in srgb, var(--hp-accent, #b98d4f) 7%,  transparent), transparent 70%);
}

/* 2) 見出しは左右対称に。英字→和文→飾り罫、を中央で積む */
.hp-s .hp-en { text-align: center; letter-spacing: .5em; text-indent: .5em; font-size: 10.5px; }
.hp-s .hp-h2 { text-align: center; letter-spacing: .22em; text-indent: .22em; font-size: 23px; margin: 12px 0 0; }
/* 飾り罫: 端に向かって消える金の細線＋中央に光る菱形 */
.hp-s .hp-rule {
  display: block; width: 156px; height: 1px; margin: 22px auto 34px; border-top: none; position: relative;
  background: linear-gradient(to right, transparent, var(--hp-accent-soft, #d5b98a) 24%, var(--hp-accent, #b98d4f) 50%, var(--hp-accent-soft, #d5b98a) 76%, transparent);
}
.hp-s .hp-rule::after {
  content: ''; position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px;
  background: var(--hp-accent, #b98d4f); transform: rotate(45deg);
  box-shadow: 0 0 12px color-mix(in srgb, var(--hp-accent, #b98d4f) 60%, transparent);
}

/* 3) 本文まわりも中央寄せ（要望「本日の出勤を中央表示」に合わせ、全体の重心を中央へ） */
.hp-s .hp-concept-text { text-align: center; line-height: 2.6; }
.hp-s .hp-note { text-align: center; }
.hp-s .hp-more { display: block; width: fit-content; margin-left: auto; margin-right: auto; }
.hp-s .hp-card-title, .hp-s .hp-coupon-discount, .hp-s .hp-card-body, .hp-s .hp-card-meta { text-align: center; }
.hp-s .hp-course-name { text-align: center; letter-spacing: .2em; text-indent: .2em; }
/* 出勤の日付は中央のバッジに */
.hp-s .hp-sched-date { display: block; width: fit-content; margin: 0 auto 24px; }
/* 料金・店舗情報の行はPCで間延びしないよう中央の細い柱に収める */
.hp-s .hp-course-group, .hp-s .hp-info { max-width: 560px; margin-left: auto; margin-right: auto; }

/* 4) 写真は淡い光をまとわせ、内側に金の細枠を重ねる */
.hp-s .hp-sched-thumb, .hp-s .hp-th-frame { position: relative; box-shadow: 0 12px 34px rgba(150,120,70,.14); }
.hp-s .hp-sched-thumb::after, .hp-s .hp-th-frame::after {
  content: ''; position: absolute; inset: 3px; pointer-events: none;
  border: 1px solid color-mix(in srgb, var(--hp-accent, #b98d4f) 26%, transparent);
}

/* 5) 出現はゆっくり浮かび上がるように（タイプSだけ長め・イージングも穏やかに） */
@media (prefers-reduced-motion: no-preference) {
  .hp-s [data-hp-reveal] { transform: translateY(34px); transition: opacity 1.1s ease, transform 1.1s cubic-bezier(.22,.61,.36,1); }
  .hp-s [data-hp-reveal].hp-revealed { transform: none; }
}

/* 6) PCのヒーローにも霞を一枚。文字の可読性が上がり、写真との境目がやわらぐ */
@media (min-width: 640px) {
  .hp-s .hp-hero::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: radial-gradient(820px 560px at 24% 52%, rgba(253,251,247,.62), rgba(253,251,247,0) 68%);
  }
}
`;

export const TEMPLATE_CSS: Record<'s' | 'a' | 'b' | 'c', string> = {
  s: TYPE_S,
  a: TYPE_A,
  b: TYPE_B,
  c: TYPE_C,
};
