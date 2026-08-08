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
.hp-root { max-width: 640px; margin: 0 auto; min-height: 100vh; -webkit-font-smoothing: antialiased; padding-bottom: 64px; position: relative; }
.hp-root * { margin: 0; padding: 0; box-sizing: border-box; }
.hp-hero-img { display: block; width: 100%; height: auto; max-height: 78vh; object-fit: cover; }
.hp-sec { padding: 48px 22px; }
.hp-idx, .hp-topbar { display: none; }
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
`;

const TYPE_A = `
${COMMON}
.hp-a { background: #17161a; color: #e8e4dc; font-family: 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'Noto Serif CJK JP', serif; }
.hp-a .hp-sec-alt { background: #1f1d22; }
.hp-a .hp-en { letter-spacing: .35em; font-size: 10px; color: var(--hp-accent, #c4a469); text-transform: uppercase; }
.hp-a .hp-h2 { font-size: 20px; font-weight: 600; letter-spacing: .18em; margin: 8px 0 6px; }
.hp-a .hp-rule { display: block; width: 36px; height: 1px; background: var(--hp-accent, #c4a469); margin: 18px 0 26px; }
.hp-a .hp-hero-text { padding: 34px 24px 44px; text-align: center; }
.hp-a .hp-hero-en { font-size: 11px; letter-spacing: .5em; color: var(--hp-accent, #c4a469); margin-bottom: 14px; }
.hp-a .hp-hero-name { font-size: 32px; font-weight: 500; letter-spacing: .12em; line-height: 1.35; }
.hp-a .hp-hero-catch { margin-top: 14px; font-size: 13px; color: #cfc9bd; letter-spacing: .14em; line-height: 2; }
.hp-a .hp-hero-area { margin-top: 20px; font-size: 10px; color: #948f85; letter-spacing: .3em; }
.hp-a .hp-concept-text { font-size: 13px; line-height: 2.3; color: #cfc9bd; letter-spacing: .06em; white-space: pre-wrap; }
.hp-a .hp-concept-img { width: 100%; height: auto; margin-bottom: 20px; border: 1px solid #3a3742; }
.hp-a .hp-course-group { margin-bottom: 24px; }
.hp-a .hp-course-name { font-size: 13px; letter-spacing: .12em; color: var(--hp-accent, #c4a469); margin-bottom: 6px; font-weight: 600; }
.hp-a .hp-course-row { display: flex; justify-content: space-between; align-items: baseline; padding: 13px 2px; border-bottom: 1px solid #3a3742; }
.hp-a .hp-course-min { font-size: 12px; letter-spacing: .1em; }
.hp-a .hp-course-price { font-size: 15px; color: var(--hp-accent, #c4a469); font-style: italic; }
.hp-a .hp-th-frame { border: 1px solid #3a3742; padding: 6px; background: #232128; }
.hp-a .hp-th-noimg { background: linear-gradient(160deg, #26242b, #34313a); }
.hp-a .hp-th-name { margin-top: 10px; font-size: 12px; letter-spacing: .12em; text-align: center; color: #e8e4dc; }
.hp-a .hp-th-age { font-size: 10px; color: var(--hp-accent-soft, #a8905e); text-align: center; margin-top: 3px; }
.hp-a .hp-th-onduty { display: block; width: fit-content; margin: 6px auto 0; font-size: 9px; color: var(--hp-accent, #c4a469); border: 1px solid var(--hp-accent-soft, #a8905e); padding: 2px 8px; letter-spacing: .15em; }
.hp-a .hp-sched-row { display: flex; justify-content: space-between; padding: 13px 2px; border-bottom: 1px solid #3a3742; font-size: 12px; letter-spacing: .08em; }
.hp-a .hp-sched-time { color: var(--hp-accent-soft, #a8905e); font-style: italic; }
.hp-a .hp-embed { border: 1px solid #3a3742; }
.hp-a .hp-more { color: var(--hp-accent, #c4a469); letter-spacing: .2em; border-bottom: 1px solid var(--hp-accent-soft, #a8905e); padding-bottom: 3px; }
.hp-a .hp-card { background: #232128; border: 1px solid #3a3742; padding: 16px; }
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
.hp-a .hp-cta-tel { background: #232128; color: #e8e4dc; border-top: 1px solid var(--hp-accent-soft, #a8905e); }
.hp-a .hp-cta-line { background: var(--hp-accent, #c4a469); color: #17161a; }
`;

const TYPE_B = `
${COMMON}
.hp-b { background: #faf8f4; color: #3d3a35; font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif; }
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
.hp-b .hp-th-onduty { display: block; width: fit-content; margin: 6px auto 0; font-size: 9px; font-weight: 800; color: #fff; background: var(--hp-accent, #8fae8b); border-radius: 999px; padding: 3px 10px; }
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
`;

const TYPE_C = `
${COMMON}
.hp-c { background: #f4f4f6; color: #1c1c20; font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif; }
.hp-c .hp-topbar { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 2px solid #111114; }
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
`;

export const TEMPLATE_CSS: Record<'a' | 'b' | 'c', string> = {
  a: TYPE_A,
  b: TYPE_B,
  c: TYPE_C,
};
