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
.hp-root { --hp-col-half: 320px; max-width: 640px; margin: 0 auto; min-height: 100vh; -webkit-font-smoothing: antialiased; padding-bottom: 64px; position: relative; isolation: isolate; }
.hp-root * { margin: 0; padding: 0; box-sizing: border-box; }
.hp-hero picture { display: block; }
.hp-hero-img { display: block; width: 100%; height: auto; max-height: 78vh; object-fit: cover; }
/* ── トップ画像のスライダー（2026-08-18 第21便）──
   店舗が2枚以上入れたときだけ HpTemplate が .hp-hero-slides で包む。
   1枚の店はこの塊がまるごと出ない＝従来と同じDOM・同じ見え方。

   ★ 1枚目だけが通常の流れに置かれ、2枚目以降は position:absolute で重なる。
     つまり【高さは1枚目が決める】。縦横比の違う写真は object-fit:cover で切り抜かれるが、
     そのかわり送っても下の内容が上下に飛び跳ねない（実測: 幅1058pxで423pxのまま）。
   ★ 2枚目以降に max-height:none を入れているのは、共通の .hp-hero-img が持つ
     max-height:78vh が効いたままだと、重ねた写真だけ縦に足りなくなるため。
   ★ 切り替えは opacity のクロスフェード0.8秒／自動送り4秒（HpShell のスクリプト）。 */
.hp-hero-slides { position: relative; }
.hp-hero-slides .hp-hero-slide { display: block; opacity: 0; transition: opacity .8s ease; }
.hp-hero-slides .hp-hero-slide.is-on { opacity: 1; }
.hp-hero-slides .hp-hero-slide + .hp-hero-slide { position: absolute; inset: 0; }
.hp-hero-slides .hp-hero-slide + .hp-hero-slide .hp-hero-img { height: 100%; max-height: none; }
.hp-hero-dots { position: absolute; left: 0; right: 0; bottom: 12px; z-index: 2; display: flex; justify-content: center; gap: 8px; }
.hp-hero-dot { width: 8px; height: 8px; padding: 0; border: 0; border-radius: 999px; cursor: pointer;
  background: rgba(255,255,255,.45); box-shadow: 0 0 0 1px rgba(0,0,0,.25); transition: background .3s, width .3s; }
.hp-hero-dot.is-on { background: #fff; width: 20px; }
/* 動きを減らす設定の人にはフェードも自動送りもしない（自動送りはスクリプト側で止める） */
@media (prefers-reduced-motion: reduce) { .hp-hero-slides .hp-hero-slide { transition: none; } }
.hp-sec { padding: 48px 22px; }
.hp-idx, .hp-topbar { display: none; }
.hp-topbar-nav { display: none; }
/* ヘッダーのロゴ（未設定なら .hp-topbar-name の文字が出る）。
   縦を揃えたいので高さで合わせ、横は原寸比のまま。長い横長ロゴは max-width で抑える。 */
.hp-topbar-logo { display: block; height: 30px; width: auto; max-width: 190px; object-fit: contain; }
@media (min-width: 768px) { .hp-topbar-logo { height: 36px; max-width: 260px; } }
.hp-rule { display: none; }
.hp-embed { display: block; width: 100%; border: none; background: #fff; }
.hp-more { display: inline-block; margin-top: 12px; text-decoration: none; font-size: 11px; font-weight: 700; }
.hp-note { margin-top: 14px; font-size: 10px; opacity: .7; }
.hp-card { margin-bottom: 12px; }
.hp-th-row { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
.hp-th-card { flex: 0 0 128px; text-decoration: none; }
.hp-th-frame img, .hp-th-noimg { width: 100%; aspect-ratio: 4 / 5; object-fit: cover; display: block; }
/* 名前より下のまとまり。A/B/C はカード直下に並ぶ従来の見え方のまま（display:contents）。
   タイプSだけがこれを写真に重ねるレイヤーとして使う。 */
.hp-th-body { display: contents; }
/* 年齢と体型は別要素にして「24歳 / スレンダー」を組み立てる（タイプSは体型だけ隠せる） */
.hp-th-age-num + .hp-th-body-type::before { content: ' / '; }
.hp-info-row { display: flex; padding: 12px 2px; font-size: 12px; }
.hp-info-row dt { flex: 0 0 84px; }
.hp-info-row dd { line-height: 1.8; }
.hp-banner-img { display: block; width: 100%; height: auto; margin-bottom: 10px; }
/* リンク（相互リンクのバナー群）。配布バナーは幅がバラバラなので、
   横並び＋中央寄せで詰めて、画像は元の大きさのまま（枠に収まらない時だけ縮小）。 */
.hp-links { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 8px; }
.hp-link-item { display: inline-flex; align-items: center; max-width: 100%; text-decoration: none; }
.hp-link-item img { display: block; max-width: 100%; height: auto; }
.hp-link-text { display: inline-block; padding: 4px 10px; font-size: 11.5px; line-height: 1.7; }
.hp-sec-banners { padding-top: 0; }
/* 固定トップバーの下にアンカーが潜らないように（ドロワーからの遷移用） */
.hp-root [id] { scroll-margin-top: calc(58px + var(--hp-topbar-top, 0px)); }
/* トップバーは position:sticky で最初から追従しているが、地色と同系だと
   「消えた」ように見えるので、少しでもスクロールしたら影で浮かせて境目を作る。
   .hp-scrolled は HpTemplate のスクリプトが付ける（JSが無くても追従自体は効く）。 */
.hp-topbar { transition: background-color .3s ease, box-shadow .3s ease; }
.hp-scrolled .hp-topbar { box-shadow: 0 2px 14px rgba(20,16,10,.12); }
/* 画面の並びは flex の order で作る（DOM は全ひな形共通のまま＝作業ルール1）。
   order の値は HpTemplate がインラインで振る。既定の並びは hpSite.ts の
   DEFAULT_HP_SECTION_ORDER_BY_TEMPLATE が唯一の正で、管理画面の一覧と一致する。 */
.hp-ordered { display: flex; flex-direction: column; }

/* ── ハンバーガー＋ドロワーメニュー（全ひな形共通の骨格。色は各ひな形が上書き）──
   開閉は #hp-drawer（チェックボックス）の :checked だけで行う＝JSなしでも動く。
   .hp-drawer は position:fixed。.hp-root は max-width 640px の中央寄せなので、
   right を「画面端」ではなく「本文カラムの右端」に合わせる（PCで枠外に出ないように）。 */
.hp-drawer-toggle { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip-path: inset(50%); border: 0; }
/* ヘッダー右側（電話アイコン＋ハンバーガー）。トップバーは space-between なので、
   2つをまとめて1つの子にしておくと店名・ナビの配置が崩れない。 */
.hp-topbar-actions { display: flex; align-items: center; gap: 10px; flex: 0 0 auto; }
.hp-topbar-tel { display: inline-flex; align-items: center; justify-content: center; width: 32px; height: 32px; text-decoration: none; }
.hp-topbar-tel svg { display: block; }
.hp-drawer-btn { display: flex; flex-direction: column; justify-content: center; gap: 5px; width: 32px; height: 32px; flex: 0 0 auto; cursor: pointer; }
.hp-drawer-btn span { display: block; width: 100%; height: 1.5px; background: currentColor; transition: transform .3s, opacity .2s; }
.hp-drawer-toggle:checked + .hp-topbar .hp-drawer-btn span:nth-child(1) { transform: translateY(6.5px) rotate(45deg); }
.hp-drawer-toggle:checked + .hp-topbar .hp-drawer-btn span:nth-child(2) { opacity: 0; }
.hp-drawer-toggle:checked + .hp-topbar .hp-drawer-btn span:nth-child(3) { transform: translateY(-6.5px) rotate(-45deg); }
.hp-drawer-toggle:focus-visible + .hp-topbar .hp-drawer-btn { outline: 2px solid currentColor; outline-offset: 4px; }
.hp-drawer-scrim { position: fixed; inset: 0; z-index: 40; background: rgba(22,18,12,.46);
  opacity: 0; visibility: hidden; transition: opacity .3s, visibility .3s; cursor: pointer; }
.hp-drawer-toggle:checked ~ .hp-drawer-scrim { opacity: 1; visibility: visible; }
.hp-drawer { position: fixed; top: 0; bottom: 0; right: max(0px, calc(50vw - var(--hp-col-half, 320px))); z-index: 50;
  width: min(80vw, 300px); display: flex; flex-direction: column; overflow-y: auto;
  transform: translateX(105%); visibility: hidden; transition: transform .34s cubic-bezier(.22,.61,.36,1), visibility .34s; }
.hp-drawer-toggle:checked ~ .hp-drawer { transform: none; visibility: visible; }
.hp-drawer-close { position: absolute; top: 16px; right: 20px; width: 30px; height: 30px; cursor: pointer; }
.hp-drawer-close span { position: absolute; top: 50%; left: 3px; right: 3px; height: 1.5px; background: currentColor; }
.hp-drawer-close span:nth-child(1) { transform: rotate(45deg); }
.hp-drawer-close span:nth-child(2) { transform: rotate(-45deg); }
.hp-drawer-list { list-style: none; padding: 70px 0 10px; }
.hp-drawer-list a { display: block; padding: 15px 24px; text-decoration: none; font-size: 13px; letter-spacing: .1em; }
.hp-drawer-foot { margin-top: auto; padding: 22px 24px 30px; }
.hp-drawer-label { display: block; font-size: 9px; letter-spacing: .28em; opacity: .7; margin-bottom: 4px; }
.hp-drawer-hours { font-size: 12px; line-height: 1.8; }
.hp-drawer-tel { display: block; margin-top: 16px; font-size: 21px; letter-spacing: .04em; text-decoration: none; }
.hp-drawer-terms { display: inline-block; margin-top: 18px; font-size: 11px; letter-spacing: .08em; text-decoration: underline; text-underline-offset: 3px; }
/* ── SPクイックナビ（ヒーロー直下の4分割アイコンメニュー・2026-08-11）──
   スマホ幅のみ表示（PCはヘッダーのナビが同じ項目を持つ）。骨格はここ・色は各ひな形が上書き。
   区切り線・地色は currentColor / --hp-accent から作るので、上書きが無くても破綻しない。 */
.hp-quicknav { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr));
  border-bottom: 1px solid color-mix(in srgb, currentColor 14%, transparent); }
@media (min-width: 640px) { .hp-quicknav { display: none; } }
.hp-qn-item { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
  padding: 14px 2px 13px; text-decoration: none; color: inherit; min-width: 0; }
.hp-qn-item + .hp-qn-item { border-left: 1px solid color-mix(in srgb, currentColor 14%, transparent); }
.hp-qn-en { font-size: 10px; letter-spacing: .18em; text-indent: .18em; font-weight: 700; }
.hp-qn-jp { font-size: 8.5px; opacity: .6; letter-spacing: .06em; white-space: nowrap; }

/* ── マルチページ用（2026-08-11）──
   写メ日記の一覧ページ（/diary）。3列（PC4列）の正方形グリッド＋名前の小さなキャプション。
   色は本文色と --hp-accent をそのまま継承するので、ひな形ごとの追加指定は要らない。 */
.hp-dy-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
@media (min-width: 768px) { .hp-dy-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; } }
.hp-dy-card { display: block; text-decoration: none; color: inherit; min-width: 0; }
.hp-dy-thumb { display: block; width: 100%; aspect-ratio: 1 / 1; object-fit: cover; }
.hp-dy-name { display: block; margin-top: 4px; font-size: 10.5px; opacity: .75; letter-spacing: .04em;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
/* 口コミの一覧ページ（/voice）。カードは既存の .hp-card 装飾をそのまま使う。 */
.hp-voice-stars { color: var(--hp-accent, #c4a469); font-size: 13px; letter-spacing: 2px; }
.hp-voice-star-off { opacity: .25; }
.hp-voice-score { margin-left: 6px; font-size: 12px; font-weight: 700; }
.hp-voice-count { font-size: 11px; opacity: .7; }
.hp-voice-summary { margin-bottom: 18px; }
/* パンくず。色は本文色をそのまま薄めて使うので、ひな形ごとの追加指定は要らない。 */
.hp-crumb { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 16px; font-size: 10.5px; letter-spacing: .08em; opacity: .75; }
.hp-crumb a { color: inherit; text-decoration: none; border-bottom: 1px solid currentColor; padding-bottom: 1px; }
.hp-crumb-sep { opacity: .55; }
/* フッターのページ一覧（全ページから全ページへ内部リンクを通すため）。
   文字色・大きさは .hp-footer-sub の指定をそのまま使い、ここでは並べ方だけ足す。 */
.hp-footer-links { display: flex; flex-wrap: wrap; justify-content: center; gap: 6px 16px; margin-bottom: 12px; }
.hp-footer-links a { text-decoration: none; }
/* 利用規約などの文章ページ。読みやすさ優先で行間を広めに取る */
.hp-topbar-home { display: inline-flex; align-items: center; text-decoration: none; color: inherit; min-width: 0; }
.hp-doc-back { font-size: 11px; letter-spacing: .08em; text-decoration: none; white-space: nowrap; }
.hp-doc-sec + .hp-doc-sec { margin-top: 28px; }
.hp-doc-h { font-size: 14px; font-weight: 700; letter-spacing: .06em; margin-bottom: 10px; }
.hp-doc-p { font-size: 13px; line-height: 2.1; }
.hp-doc-p + .hp-doc-p { margin-top: 12px; }
.hp-doc-list { margin-top: 10px; padding-left: 1.2em; }
.hp-doc-list li { font-size: 13px; line-height: 2; list-style: disc; margin-bottom: 2px; }
.hp-sec-doc { padding-top: 34px; padding-bottom: 46px; }
@media (prefers-reduced-motion: reduce) {
  .hp-drawer, .hp-drawer-scrim, .hp-drawer-btn span { transition: none; }
}
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
/* ブロック（セクション）の上下の余白を従来の 3/4 に詰める（2026-08-12 要望）。
   SP: 48px → 36px ／ PC: 76px → 57px。
   バナー帯（上0）と規約などの文書ページ（34/46px）は元の性格を保ったまま同じ比率で縮める。
   PC 側は下の @media の padding を 57px に直してあるので、ここは SP 専用にする。 */
@media (max-width: 767px) {
  .hp-a .hp-sec { padding-top: 36px; padding-bottom: 36px; }
  .hp-a .hp-sec-banners { padding-top: 0; }
  .hp-a .hp-sec-doc { padding-top: 26px; padding-bottom: 35px; }
}
@media (min-width: 768px) {
  .hp-a .hp-sec { padding: 57px calc((100% - 720px) / 2); }
  .hp-a .hp-hero-text { padding: 48px 24px 56px; }
  /* ★ ヘッダーとヒーローは画面幅いっぱいに（2026-08-12 要望・タイプSと同じ迫力を出す）。
     .hp-a は max-width:1024px の中央寄せなので、100vw ＋ 負のマージンで額縁を食い破る。
     スクロールバーぶんの横はみ出しは /hp/layout.tsx の overflow-x:clip が受ける。
     本文（セクション・カード・フッター）は従来どおり中央の枠の中。 */
  .hp-a .hp-topbar, .hp-a .hp-hero { width: 100vw; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); }
  .hp-a .hp-hero-img { max-height: 82vh; }
}
.hp-a .hp-sec-alt { background: #1f1d22; }
.hp-a .hp-sec + .hp-sec:not(.hp-sec-alt) { border-top: 1px solid #26242b; }
/* 壁紙が有効なとき: 地を透かして壁紙を見せ、帯・カードは半透明のガラス調に */
.hp-a.hp-has-wallpaper { background-color: transparent; }
/* タイプAの壁紙（public/hp-a/wallpaper.webp）は継ぎ目のないパターンなので、
   引き伸ばさずタイル状に繰り返す。粒の大きさはここで決める（2026-08-12）。 */
.hp-a .hp-wallpaper { background-size: 520px auto; background-repeat: repeat; }
@media (min-width: 768px) { .hp-a .hp-wallpaper { background-size: 680px auto; } }
.hp-a .hp-wallpaper::after { background: rgba(23,22,26,.62); }
.hp-a.hp-has-wallpaper .hp-sec-alt { background: rgba(31,29,34,.72); }
.hp-a.hp-has-wallpaper .hp-card { background: rgba(35,33,40,.8); }
.hp-a.hp-has-wallpaper .hp-topbar { background: rgba(23,22,26,.82); }
/* 固定トップバー（店名＋メニュー）。スクロールしても店名と導線が消えない */
.hp-a .hp-topbar { display: flex; justify-content: space-between; align-items: center; position: sticky; top: var(--hp-topbar-top, 0px); z-index: 30;
  padding: 13px 20px; background: rgba(23,22,26,.9); backdrop-filter: blur(8px); border-bottom: 1px solid color-mix(in srgb, var(--hp-accent, #c4a469) 40%, transparent); }
.hp-a .hp-topbar-name { font-size: 13px; letter-spacing: .22em; color: #e8e4dc; }
/* PCナビ（NEWS / SYSTEM / THERAPIST / ACCESS）。項目とリンク先は hpTopbarNavItems が作る
   ＝タイプSとまったく同じ。COMMON で display:none にしてあるのをここで出す（2026-08-12 要望）。 */
.hp-a .hp-topbar-nav { display: none; gap: 26px; }
@media (min-width: 900px) { .hp-a .hp-topbar-nav { display: flex; } }
.hp-a .hp-topbar-nav a { font-size: 11px; letter-spacing: .22em; color: #cfc9bd; text-decoration: none;
  padding: 4px 0; border-bottom: 1px solid transparent; transition: color .3s, border-color .3s; }
.hp-a .hp-topbar-nav a:hover { color: var(--hp-accent, #c4a469); border-bottom-color: var(--hp-accent, #c4a469); }
/* SPクイックナビ（タイプAはヘッダーの直下に置くので、地色と罫線をヘッダーに揃える） */
.hp-a .hp-quicknav { background: rgba(23,22,26,.9); border-bottom: 1px solid color-mix(in srgb, var(--hp-accent, #c4a469) 26%, transparent); }
.hp-a .hp-qn-item + .hp-qn-item { border-left: 1px solid #2a2730; }
.hp-a .hp-qn-en { color: var(--hp-accent, #c4a469); }
.hp-a .hp-qn-jp { color: #948f85; opacity: 1; }
/* ドロワー（タイプA・黒地に金） */
.hp-a .hp-drawer-btn { color: var(--hp-accent, #c4a469); }
.hp-a .hp-topbar-tel { color: var(--hp-accent, #c4a469); }
.hp-a .hp-drawer { background: #1f1d22; border-left: 1px solid #3a3742; }
.hp-a .hp-drawer-list a { color: #cfc9bd; letter-spacing: .16em; }
.hp-a .hp-drawer-list li + li a { border-top: 1px solid #2a2730; }
.hp-a .hp-drawer-foot { border-top: 1px solid #3a3742; color: #948f85; }
.hp-a .hp-drawer-tel { color: var(--hp-accent, #c4a469); }
.hp-a .hp-drawer-terms, .hp-a .hp-doc-back { color: #948f85; }
.hp-a .hp-doc-h { color: var(--hp-accent, #c4a469); }
.hp-a .hp-doc-p, .hp-a .hp-doc-list li { color: #cfc9bd; }
.hp-a .hp-link-text { color: #cfc9bd; border: 1px solid #3a3742; }
.hp-a .hp-link-item:hover .hp-link-text { color: var(--hp-accent, #c4a469); border-color: var(--hp-accent-soft, #a8905e); }
.hp-a .hp-drawer-close { color: #948f85; }
/* 見出しは中央寄せ（2026-08-12 要望）。英字→和文→飾り罫 を中央で積む。
   letter-spacing のぶん右に寄って見えるので、text-indent で同じ量を戻して光学的に中央へ。 */
.hp-a .hp-en { letter-spacing: .35em; text-indent: .35em; font-size: 10px; color: var(--hp-accent, #c4a469); text-transform: uppercase; text-align: center; }
.hp-a .hp-h2 { font-size: 21px; font-weight: 600; letter-spacing: .18em; text-indent: .18em; margin: 8px 0 6px; text-align: center; }
/* 罫線は二重線（内側は淡く）でホテルライクに */
.hp-a .hp-rule { display: block; width: 56px; height: 5px; margin: 16px auto 26px; background: none; border-top: 1px solid var(--hp-accent, #c4a469); position: relative; }
.hp-a .hp-rule::after { content: ''; position: absolute; top: 3px; left: 10px; right: 10px; border-top: 1px solid color-mix(in srgb, var(--hp-accent, #c4a469) 45%, transparent); }
/* ヒーロー写真の左右に細い白い筋が出るのを防ぐ（2026-08-12）。
   書き出し時に1pxほどの明るい縁が入っている画像があるため、ごくわずかに拡大して枠外を切り落とす。
   写真は0.8%大きくなるだけで、見た目には分からない。 */
.hp-a .hp-hero { overflow: hidden; }
.hp-a .hp-hero-img { transform: scale(1.008); }
.hp-a .hp-hero-text { padding: 34px 24px 44px; text-align: center; }
.hp-a .hp-hero-en { font-size: 11px; letter-spacing: .4em; color: var(--hp-accent, #c4a469); margin-bottom: 14px; }
.hp-a .hp-hero-name { font-size: 32px; font-weight: 500; letter-spacing: .12em; line-height: 1.35; }
.hp-a .hp-hero-catch { margin-top: 14px; font-size: 13px; color: #cfc9bd; letter-spacing: .14em; line-height: 2; }
/* エリア・営業時間の行は出さない（2026-08-12 要望。同じ内容は店舗情報ブロックに載る）。
   display:none ではなく視覚的に隠すだけにして、読み上げ・検索エンジンには残す。 */
.hp-a .hp-hero-area { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); }
@media (min-width: 768px) { .hp-a .hp-hero-name { font-size: 40px; } }
/* 本文まわりも中央寄せ（2026-08-12 要望・タイプSと同じ組み方） */
.hp-a .hp-concept-text { font-size: 13px; line-height: 2.3; color: #cfc9bd; letter-spacing: .06em; white-space: pre-wrap; text-align: center; }
.hp-a .hp-note { text-align: center; }
/* 料金・店舗情報の行はPCで間延びしないよう中央の細い柱に収める */
.hp-a .hp-course-group, .hp-a .hp-info { max-width: 560px; margin-left: auto; margin-right: auto; }
.hp-a .hp-concept-img { width: 100%; height: auto; margin-bottom: 20px; border: 1px solid #3a3742; }
.hp-a .hp-course-group { margin-bottom: 24px; }
/* 料金の行はタイプSと同じ大きさに（コース名15px・時間16px・価格22px。2026-08-12） */
.hp-a .hp-course-name { font-size: 15px; letter-spacing: .2em; text-indent: .2em; text-align: center; color: var(--hp-accent, #c4a469); margin-bottom: 6px; font-weight: 600; }
.hp-a .hp-course-row { display: flex; justify-content: space-between; align-items: baseline; padding: 13px 2px; border-bottom: 1px solid #3a3742; }
.hp-a .hp-course-min { font-size: 16px; letter-spacing: .1em; }
.hp-a .hp-course-price { font-size: 22px; color: var(--hp-accent, #c4a469); font-style: italic; }
/* 写真は「本日の出勤」と同じ大きさに（2026-08-12 要望）。
   額縁（枠線と内側の余白）は外して、写真そのものを大きく見せる。
   トップは横スクロール（PCは折り返し）のまま＝一覧ページのグリッドとは並べ方が違う。 */
.hp-a .hp-th-card { flex-basis: 176px; }
@media (min-width: 768px) {
  .hp-a .hp-th-row { flex-wrap: wrap; gap: 5px; }     /* 出勤のPC4列と同じ隙間 */
  .hp-a .hp-th-card { flex-basis: 176px; }            /* 出勤のPC4列と同じ幅 */
}
/* スマホは「横に流れる」と一目で分かるよう、2.2枚ぶんが見える幅にする（2026-08-12 要望）。
   左右の余白を食い破ったうえで内側に同じだけ padding を戻す＝最初の1枚は本文と頭が揃い、
   右端の1枚は画面の外へ続いて見える。41vw は「2.2枚＋隙間2つ」がちょうど収まる幅。 */
@media (max-width: 639px) {
  .hp-a .hp-th-row { gap: 8px; margin-left: -22px; margin-right: -22px; padding-left: 22px; padding-right: 22px; }
  .hp-a .hp-th-card { flex-basis: 41vw; }
}
.hp-a .hp-th-frame { border: none; padding: 0; background: #232128; }
.hp-a .hp-th-noimg { background: linear-gradient(160deg, #26242b, #34313a); }
/* 文字は「本日の出勤」と同じ大きさに（名前14px・年齢11px。2026-08-12 要望） */
.hp-a .hp-th-name { margin-top: 10px; font-size: 14px; letter-spacing: .12em; text-align: center; color: #e8e4dc; }
.hp-a .hp-th-age { font-size: 11px; color: var(--hp-accent-soft, #a8905e); text-align: center; margin-top: 3px; }

/* ── セラピスト一覧ページ（/therapist）だけ、写真を「本日の出勤」と同じ寸法のグリッドに ──
   トップは抜粋なので横スクロールのまま（2026-08-12 要望）。
   .hp-th-grid は TherapistCards に grid を渡したときだけ付く。 */
.hp-a .hp-th-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; overflow: visible; padding-bottom: 0; }
@media (min-width: 768px) { .hp-a .hp-th-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; } }
/* スマホは左右の余白を食い破って画面の端まで（出勤ブロックと同じ） */
@media (max-width: 639px) { .hp-a .hp-th-grid { margin-left: -22px; margin-right: -22px; } }
.hp-a .hp-th-grid .hp-th-card { flex: none; }
.hp-a .hp-th-grid .hp-th-name, .hp-a .hp-th-grid .hp-th-age,
.hp-a .hp-th-grid .hp-th-catch, .hp-a .hp-th-grid .hp-th-badges { padding-left: 6px; padding-right: 6px; }
.hp-a .hp-th-catch { display: block; margin-top: 6px; font-size: 11px; color: #948f85; text-align: center; line-height: 1.7;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.hp-a .hp-th-badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 7px; }
.hp-a .hp-th-badge { font-size: 9px; color: #cfc9bd; border: 1px solid #4a4650; padding: 2px 7px; letter-spacing: .08em; }
.hp-a .hp-th-onduty { display: block; width: fit-content; margin: 8px auto 0; font-size: 9px; color: var(--hp-accent, #c4a469); border: 1px solid var(--hp-accent-soft, #a8905e); padding: 2px 8px; letter-spacing: .15em; }
/* ── 本日の出勤（2026-08-12: タイプSと同じ写真グリッドに揃えた）──
   SP2列・PC4列で写真を敷き詰め、名前・年齢・出勤時間は写真の中（下端）へ重ねる。
   COMMON では hp-sched-thumb / hp-sched-meta を隠して「名前 …… 時間」の1行にしているので、
   ここで出し直す。DOM は共通のまま（作業ルール1）。 */
.hp-a .hp-sched-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 3px; }
@media (min-width: 768px) { .hp-a .hp-sched-list { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 5px; } }
/* スマホは左右の余白を食い破って画面の端まで（セクションの padding 22px ぶん） */
@media (max-width: 639px) { .hp-a .hp-sched-list { margin-left: -22px; margin-right: -22px; } }
.hp-a .hp-sched-row { display: block; padding: 0; border: none; position: relative; overflow: hidden; }
.hp-a .hp-sched-thumb { display: block; border: none; padding: 0; background: #232128; position: relative; }
.hp-a .hp-sched-thumb img, .hp-a .hp-sched-noimg { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.hp-a .hp-sched-noimg { background: linear-gradient(160deg, #26242b, #34313a); }
/* 文字を読ませるための暗いレイヤー（写真の下から立ち上がるグラデーション） */
.hp-a .hp-sched-thumb::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 62%; pointer-events: none;
  background: linear-gradient(to top, rgba(10,9,12,.86), rgba(10,9,12,.38) 44%, rgba(10,9,12,0));
}
.hp-a .hp-sched-body {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 1;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  margin: 0; padding: 0 8px 11px; text-align: center;
}
.hp-a .hp-sched-name { font-size: 14px; letter-spacing: .14em; text-indent: .14em; color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,.5); }
.hp-a .hp-sched-meta { display: block; font-size: 11px; color: rgba(255,255,255,.85); letter-spacing: .08em; text-shadow: 0 1px 6px rgba(0,0,0,.5); }
.hp-a .hp-sched-time { margin-top: 3px; font-size: 11.5px; color: var(--hp-accent-soft, #a8905e); font-style: italic; letter-spacing: .04em; text-shadow: 0 1px 6px rgba(0,0,0,.55); }
.hp-a .hp-embed { border: 1px solid #3a3742; }
.hp-a .hp-more { color: var(--hp-accent, #c4a469); letter-spacing: .2em; border-bottom: 1px solid var(--hp-accent-soft, #a8905e); padding-bottom: 3px;
  display: block; width: fit-content; margin-left: auto; margin-right: auto; }
/* カードは内側に淡い金の飾り枠（G1 の EVENT 枠のイメージ） */
.hp-a .hp-card { background: #232128; border: 1px solid #3a3742; padding: 20px; position: relative; }
.hp-a .hp-card::before { content: ''; position: absolute; inset: 5px; border: 1px solid color-mix(in srgb, var(--hp-accent, #c4a469) 28%, transparent); pointer-events: none; }
.hp-a .hp-card-title { font-size: 12px; letter-spacing: .1em; margin-bottom: 8px; }
.hp-a .hp-coupon-discount { font-size: 16px; color: var(--hp-accent, #c4a469); margin-bottom: 6px; }
.hp-a .hp-card-body { font-size: 11px; color: #948f85; line-height: 1.9; white-space: pre-wrap; }
.hp-a .hp-card-meta { margin-top: 10px; font-size: 9px; color: #6d675e; letter-spacing: .1em; }
.hp-a .hp-card-title, .hp-a .hp-coupon-discount, .hp-a .hp-card-body, .hp-a .hp-card-meta { text-align: center; }
/* 新着情報だけ文字を大きく（トップの抜粋と /news ページの両方に効く。クーポン等は据え置き） */
.hp-a .hp-sec-news .hp-card-title { font-size: 15px; }
.hp-a .hp-sec-news .hp-card-body { font-size: 13.5px; line-height: 2; }
.hp-a .hp-sec-news .hp-card-meta { font-size: 10.5px; }
.hp-a .hp-info-row { border-bottom: 1px solid #3a3742; }
.hp-a .hp-info-row dt { color: var(--hp-accent-soft, #a8905e); font-size: 10px; letter-spacing: .25em; padding-top: 3px; }
.hp-a .hp-info-row dd { color: #cfc9bd; }
.hp-a .hp-footer { background: #1f1d22; }
.hp-a .hp-footer-name { font-size: 13px; letter-spacing: .3em; color: var(--hp-accent, #c4a469); margin-bottom: 12px; }
.hp-a .hp-footer-sub { font-size: 9px; color: #6d675e; letter-spacing: .2em; line-height: 2.4; }
.hp-a .hp-footer-sub a { color: var(--hp-accent-soft, #a8905e); }
.hp-a .hp-cta { max-width: 1024px; }
.hp-a { --hp-col-half: 512px; }
/* ★ ドロワーは画面の右端から出す（2026-08-13 修正）。ハンバーガーは全幅ヘッダーの右端に
   あるのに、ドロワーだけ額縁の内側（中央1024pxの右端）から出ていた。
   --hp-col-half は .hp-drawer の right 計算にだけ使う変数で、詳細度が同じなので
   【必ず上の .hp-a { --hp-col-half: 512px } より後ろ】に書くこと（前に置くと効かない）。 */
@media (min-width: 768px) { .hp-a { --hp-col-half: 50vw; } }
.hp-a .hp-cta-tel { background: #232128; color: #e8e4dc; border-top: 1px solid var(--hp-accent-soft, #a8905e); }
.hp-a .hp-cta-line { background: var(--hp-accent, #c4a469); color: #17161a; }
.hp-a .hp-sched-date { display: block; width: fit-content; background: #2a2730; border: 1px solid #3a3742; padding: 6px 18px; margin: 0 auto 18px; font-size: 12px; color: var(--hp-accent, #c4a469); letter-spacing: .2em; opacity: 1; }
`;

const TYPE_B = `
@import url('https://fonts.googleapis.com/css2?family=Zen+Maru+Gothic:wght@500;700;900&display=swap');
${COMMON}
.hp-b { background: #faf8f4; color: #3d3a35; font-family: 'Zen Maru Gothic', 'Hiragino Maru Gothic ProN', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif; }
/* PCワイド対応（Aと同じ考え方：帯は全幅・本文720px中央） */
.hp-b { max-width: 1024px; }
/* ブロック（セクション）の上下の余白を従来の 1/2 に詰める（2026-08-13 要望）。
   SP: 48px → 24px ／ PC: 64px → 32px。
   バナー帯（上0）と規約などの文書ページ（34/46px）は元の性格を保ったまま同じ比率で縮める。
   PC 側は下の @media の padding を 32px に直してあるので、ここは SP 専用にする。 */
@media (max-width: 767px) {
  .hp-b .hp-sec { padding-top: 24px; padding-bottom: 24px; }
  .hp-b .hp-sec-banners { padding-top: 0; }
  .hp-b .hp-sec-doc { padding-top: 17px; padding-bottom: 23px; }
}
@media (min-width: 768px) {
  .hp-b .hp-sec { padding: 32px calc((100% - 720px) / 2); }
  .hp-b .hp-hero-name { font-size: 34px; }
  .hp-b .hp-th-row { flex-wrap: wrap; }
}
.hp-b .hp-cta { max-width: 1024px; }
.hp-b { --hp-col-half: 512px; }
/* 固定トップバー（白のすりガラス） */
.hp-b .hp-topbar { display: flex; justify-content: space-between; align-items: center; position: sticky; top: var(--hp-topbar-top, 0px); z-index: 30;
  padding: 12px 18px; background: rgba(250,248,244,.9); backdrop-filter: blur(8px); border-bottom: 1px solid #eee7db; }
.hp-b .hp-topbar-name { font-size: 13px; font-weight: 900; color: #3d3a35; }
/* PC共通ヘッダーのナビ（2026-08-13 要望・タイプS/Aと同じ4項目）。
   DOM は HpShell が全ひな形ぶん出しているので、ここで表示に切り替えるだけ。
   文字色は --hp-accent-deep（配色ごとの「白地で読める濃さ」）をそのまま使う＝
   4配色ぶんの追加CSSが要らない。出す幅はタイプS/Aと同じ 900px から。 */
.hp-b .hp-topbar-nav { display: none; gap: 26px; }
@media (min-width: 900px) { .hp-b .hp-topbar-nav { display: flex; } }
.hp-b .hp-topbar-nav a { font-size: 11.5px; font-weight: 800; letter-spacing: .14em; color: var(--hp-accent-deep, #6b8f67);
  text-decoration: none; padding: 4px 0; border-bottom: 1px solid transparent; transition: opacity .3s, border-color .3s; }
.hp-b .hp-topbar-nav a:hover { opacity: .7; border-bottom-color: currentColor; }
.hp-b .hp-topbar-nav a[aria-current='page'] { border-bottom-color: currentColor; }
/* ドロワー（タイプB・生成りの白） */
.hp-b .hp-drawer-btn { color: #3d3a35; }
.hp-b .hp-topbar-tel { color: var(--hp-accent-deep, #6b8f67); }
.hp-b .hp-drawer { background: #faf8f4; border-left: 1px solid #eee7db; }
.hp-b .hp-drawer-list a { color: #5d574e; font-weight: 800; }
.hp-b .hp-drawer-list li + li a { border-top: 1px dashed #eee7db; }
.hp-b .hp-drawer-foot { border-top: 1px solid #eee7db; color: #9b948a; }
.hp-b .hp-drawer-tel { color: var(--hp-accent-deep, #6b8f67); font-weight: 900; }
.hp-b .hp-drawer-terms, .hp-b .hp-doc-back { color: #9b948a; }
.hp-b .hp-doc-h { color: var(--hp-accent-deep, #6b8f67); font-weight: 800; }
.hp-b .hp-doc-p, .hp-b .hp-doc-list li { color: #5d574e; }
.hp-b .hp-link-text { color: #5d574e; background: #fff; border: 1px solid #eee7db; border-radius: 999px; font-weight: 700; }
.hp-b .hp-drawer-close { color: #9b948a; }
/* ブロックの見出しは中央寄せ（2026-08-13 要望）。
   .hp-en は丸ピルなので text-align では動かない。幅を中身ぶんにして左右マージンautoで中央へ。 */
.hp-b .hp-en { display: block; width: fit-content; margin-left: auto; margin-right: auto; font-size: 10px; font-weight: 700; color: var(--hp-accent-deep, #6b8f67); background: #ffffff; border: 1px solid #eee7db; border-radius: 999px; padding: 5px 14px; letter-spacing: .12em; text-transform: uppercase; }
.hp-b .hp-h2 { font-size: 19px; font-weight: 800; margin: 14px 0 16px; letter-spacing: .04em; text-align: center; }
.hp-b .hp-hero-text { padding: 26px 20px 10px; text-align: center; }
.hp-b .hp-hero-en { margin-top: 4px; font-size: 10px; color: var(--hp-accent-deep, #6b8f67); font-weight: 700; letter-spacing: .3em; }
.hp-b .hp-hero-name { font-size: 26px; font-weight: 900; letter-spacing: .06em; }
.hp-b .hp-hero-catch { margin-top: 12px; font-size: 13px; line-height: 2; color: #6b6459; }
/* エリア・営業時間の行は出さない（2026-08-13 要望。同じ内容は店舗情報ブロックに載る）。
   display:none ではなく視覚的に隠すだけにして、読み上げ・検索エンジンには残す（タイプAと同じ）。 */
.hp-b .hp-hero-area { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); }
.hp-b .hp-concept-text { font-size: 13px; line-height: 2.1; color: #5d574e; background: #fff; border: 1px solid #eee7db; border-radius: 20px; padding: 18px; box-shadow: 0 4px 16px rgba(80,70,55,.05); white-space: pre-wrap; }
.hp-b .hp-concept-img { width: 100%; height: auto; border-radius: 20px; margin-bottom: 14px; }
/* ★ コース料金とお知らせ（カード）の文字の大きさは、タイプS・Aと同じ数値に揃えてある
   （2026-08-13 要望。グループ名15px / 分16px / 価格22px、カードの見出し12.5px・本文11px・
   日付9px・クーポン16px）。太さ（700〜900）と丸ゴシックはタイプBのまま。
   S/A側の数値を動かすときは、ここも一緒に見直すこと。 */
.hp-b .hp-course-group { margin-bottom: 18px; }
.hp-b .hp-course-name { font-size: 15px; font-weight: 800; margin-bottom: 8px; color: var(--hp-accent-deep, #6b8f67); }
.hp-b .hp-course-row { display: flex; justify-content: space-between; align-items: center; background: #fff; border: 1px solid #eee7db; border-radius: 16px; padding: 14px 18px; margin-bottom: 8px; }
.hp-b .hp-course-min { font-size: 16px; font-weight: 700; }
.hp-b .hp-course-price { font-size: 22px; font-weight: 900; color: var(--hp-accent-deep, #6b8f67); }
.hp-b .hp-th-card { flex-basis: 118px; }
/* ── スマホのセラピスト横スクロール（2026-08-13 要望・タイプAと同じ考え方）──
   写真を大きくして「2.2枚見える」幅にする＝右端で3枚目が切れて見え、
   横に流せることが一目で分かる。隙間は 12px → 8px（従来の2/3）。
   左右のマージンを食い破って画面の端まで使い、padding で本文と同じ位置から始める。
   ★ :not(.hp-th-grid) は一覧ページ（/therapist）のグリッドに効かせないため。
     .hp-th-grid と詳細度が同じだと後に書いた方が勝ってしまい、グリッドの隙間まで変わる。 */
@media (max-width: 639px) {
  .hp-b .hp-th-row:not(.hp-th-grid) {
    gap: 8px; margin-left: -22px; margin-right: -22px; padding-left: 22px; padding-right: 22px;
  }
  .hp-b .hp-th-row:not(.hp-th-grid) .hp-th-card { flex-basis: 41vw; }
}
.hp-b .hp-th-frame { background: #fff; border: 1px solid #eee7db; border-radius: 18px; overflow: hidden; }
.hp-b .hp-th-noimg { background: linear-gradient(160deg, #f0ece4, #e2e6da); }
.hp-b .hp-th-name { margin-top: 8px; font-size: 12px; font-weight: 800; text-align: center; color: #3d3a35; }
.hp-b .hp-th-age { font-size: 10px; color: #9b948a; text-align: center; margin-top: 2px; }
.hp-b .hp-th-catch { display: block; margin-top: 6px; padding: 0 6px; font-size: 10px; color: #8a8378; text-align: center; line-height: 1.7;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.hp-b .hp-th-badges { display: flex; flex-wrap: wrap; gap: 4px; justify-content: center; margin-top: 7px; padding: 0 6px; }
.hp-b .hp-th-badge { font-size: 8.5px; font-weight: 700; color: #7d766c; background: #fff; border: 1px solid #eee7db; border-radius: 999px; padding: 2px 8px; }
.hp-b .hp-th-onduty { display: block; width: fit-content; margin: 8px auto 0; font-size: 9px; font-weight: 800; color: #fff; background: var(--hp-accent, #8fae8b); border-radius: 999px; padding: 3px 10px; }
/* ── マルチページのセラピスト一覧（/therapist）── 2026-08-13
   タイプS・Aと同じ「SP2列・PC4列のグリッド」に。トップは従来どおり横スクロールのまま
   （.hp-th-grid が付くのは一覧ページだけ＝parts.tsx の TherapistCards grid フラグ）。
   カードの中身（白い角丸の枠・名前は写真の下）はタイプBのまま＝角は丸いまま。 */
.hp-b .hp-th-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; overflow: visible; padding-bottom: 0; }
@media (min-width: 768px) { .hp-b .hp-th-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } }
.hp-b .hp-th-grid .hp-th-card { flex: none; }
/* ── 本日の出勤（2026-08-13: タイプS・Aと同じ写真グリッドに揃えた）──
   SP2列・PC4列で写真を並べ、名前・年齢・出勤時間は写真の中（下端）へ重ねる。
   COMMON では hp-sched-thumb / hp-sched-meta を隠して「名前 …… 時間」の1行にしているので、
   ここで出し直す。DOM は共通のまま（作業ルール1）。
   ★ タイプS・Aは写真を隙間3〜5pxで敷き詰めて角も直角だが、タイプBは角丸・白枠が持ち味なので
     隙間を広めに取り、カードは角丸のまま（S/Aのように画面端まで食い破らせない）。
   ★ 出勤時間は写真の上に載るので、暗いグラデーションではなく【白い丸ピル】のまま出す。
     配色ごとの文字色（--hp-accent-deep）がそのまま効くので、配色別の追加CSSが要らない。 */
.hp-b .hp-sched-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 768px) { .hp-b .hp-sched-list { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } }
.hp-b .hp-sched-row { display: block; padding: 0; border: none; position: relative; }
.hp-b .hp-sched-thumb { display: block; position: relative; background: #fff; border: 1px solid #eee7db; border-radius: 18px; overflow: hidden; }
.hp-b .hp-sched-thumb img, .hp-b .hp-sched-noimg { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.hp-b .hp-sched-noimg { background: linear-gradient(160deg, #f0ece4, #e2e6da); }
/* 文字を読ませるための暗いレイヤー（写真の下から立ち上がるグラデーション） */
.hp-b .hp-sched-thumb::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 58%; pointer-events: none;
  background: linear-gradient(to top, rgba(30,26,20,.72), rgba(30,26,20,.28) 46%, rgba(30,26,20,0));
}
.hp-b .hp-sched-body {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 1;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  margin: 0; padding: 0 8px 10px; text-align: center;
}
.hp-b .hp-sched-name { font-size: 13px; font-weight: 800; color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,.45); }
.hp-b .hp-sched-meta { display: block; font-size: 10.5px; font-weight: 700; color: rgba(255,255,255,.88); text-shadow: 0 1px 6px rgba(0,0,0,.45); }
.hp-b .hp-sched-time { margin-top: 5px; font-size: 10.5px; font-weight: 800; color: var(--hp-accent-deep, #6b8f67); background: #ffffff; border: 1px solid #eee7db; border-radius: 999px; padding: 3px 10px; }
.hp-b .hp-embed { border: 1px solid #eee7db; border-radius: 20px; }
.hp-b .hp-more { display: block; text-align: center; color: var(--hp-accent-deep, #6b8f67); font-weight: 800; }
.hp-b .hp-card { background: #fff; border: 1px solid #eee7db; border-radius: 20px; padding: 18px; box-shadow: 0 4px 16px rgba(80,70,55,.05); }
.hp-b .hp-card-title { font-size: 12.5px; font-weight: 800; margin-bottom: 6px; }
.hp-b .hp-coupon-discount { font-size: 16px; font-weight: 900; color: var(--hp-accent-deep, #6b8f67); margin-bottom: 6px; }
.hp-b .hp-card-body { font-size: 11px; color: #6b6459; line-height: 1.9; white-space: pre-wrap; }
.hp-b .hp-card-meta { margin-top: 10px; font-size: 9px; color: #9b948a; }
/* 新着情報だけ文字を大きく（トップの抜粋と /news ページの両方に効く。クーポン等の hp-card は据え置き）。
   数値はタイプS・Aと同じ（2026-08-13）。 */
.hp-b .hp-sec-news .hp-card-title { font-size: 15px; }
.hp-b .hp-sec-news .hp-card-body { font-size: 13.5px; line-height: 2; }
.hp-b .hp-sec-news .hp-card-meta { font-size: 10.5px; }
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
/* 日付のバッジは見出しに合わせて中央へ（2026-08-13・写真グリッド化に合わせて） */
.hp-b .hp-sched-date { display: block; width: fit-content; background: color-mix(in srgb, var(--hp-accent, #8fae8b) 16%, #ffffff); color: var(--hp-accent-deep, #6b8f67); border-radius: 999px; padding: 5px 16px; margin: 0 auto 16px; font-size: 12px; font-weight: 800; opacity: 1; }
/* ★ ヘッダーとヒーローは画面幅いっぱいに（2026-08-13 要望・タイプA/Sと同じ迫力を出す）。
   .hp-b は max-width:1024px の中央寄せなので、100vw ＋ 負のマージンで額縁を食い破る。
   横のはみ出しは /hp/layout.tsx の overflow-x:clip が受ける（hidden にすると sticky ヘッダーが壊れる）。
   本文（セクション・カード・フッター）は従来どおり中央の枠の中。
   ★★ このブロックは必ずタイプBの共通CSSの【いちばん最後】に置くこと。
     .hp-b の --hp-col-half（ドロワーの right の計算用）と詳細度が同じなので、
     前に置くと「後に書いた方」に負けて効かない（メディアクエリでも同じ）。 */
@media (min-width: 768px) {
  .hp-b .hp-topbar, .hp-b .hp-hero { width: 100vw; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); }
  .hp-b .hp-hero-img { max-height: 82vh; }
  /* ★ 全幅のヘッダーは【不透明】にする。中央1024pxの外側は額縁の暗い地なので、
     すりガラス（半透明）のままだと左右の端だけ暗く濁って帯が3色に割れて見える。
     配色ごとの地色は各配色ブロックの同じメディアクエリで上書きしている（詳細度が1段上）。 */
  .hp-b .hp-topbar { background: #faf8f4; }
  /* ハンバーガーが画面の右端に来るので、ドロワーも画面の右端から出す */
  .hp-b { --hp-col-half: 50vw; }
}
`;

// タイプC（MODE・都会的でシャープ）: 白地に極太ゴシック＋2pxの罫線、連番付きの見出し。
// 2026-08-13: S・A・Bと同じ考え方で「アクセント1色しか変わらない6色」を4色へ整理し、
// 地色・太罫・フッターまで配色ごとに作り分けた。
//
// ★ タイプCだけ作りが少し違う（S・A・Bとの差分。次の担当はここを読むこと）:
//   S・A・B は配色ブロック（TEMPLATE_VARIANT_CSS）に色をベタ書きしているが、
//   タイプCは「地色（--hp-paper）と太罫・見出しの色（--hp-ink）」の2本だけで
//   ほぼ全部の面が決まる作りなので、この2本を CSS変数で受けている。
//   細罫・弱い文字は --hp-ink から color-mix で作る（配色ごとに自動で寄る）。
//   配色ブロックに書くのは「変数では表せないもの」だけ＝帯のグラデーション・交互の地色・黄の例外。
//   ＝ 変数の値は hpSite.ts の HP_COLOR_VARIANTS が唯一の正。色を変えるときはまずそこを見る。
//
// ★ --hp-accent は面（コース名の帯・LINE予約ボタン・クイックナビ）、
//   --hp-accent-deep は白地に載る小さな文字（連番・出勤中・電話・割引額）。
//   タイプBと同じ役割分担。素のCSSは deep が無ければ accent に落ちる。
const TYPE_C = `
${COMMON}
.hp-c { background: var(--hp-paper, #f4f4f6); color: var(--hp-ink, #1c1c20); font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Noto Sans CJK JP', sans-serif; }
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
.hp-c { --hp-col-half: 512px; }
.hp-c .hp-topbar { display: flex; justify-content: space-between; align-items: center; position: sticky; top: var(--hp-topbar-top, 0px); z-index: 30;
  padding: 14px 20px; background: color-mix(in srgb, var(--hp-paper, #f4f4f6) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 2px solid var(--hp-ink, #111114); }
.hp-c .hp-topbar-name { font-size: 15px; font-weight: 900; letter-spacing: .04em; }
/* PC共通ヘッダーのナビ（2026-08-13 要望・タイプS/A/Bと同じ4項目）。
   DOM は HpShell が全ひな形ぶん出しているので、ここで表示に切り替えるだけ。出す幅も同じ 900px から。
   文字は太字の --hp-ink、下線ホバーは --hp-accent（.hp-more と同じ組み合わせ＝MODEの流儀）。
   どちらも配色の変数なので、4配色ぶんの追加CSSは要らない。 */
.hp-c .hp-topbar-nav { display: none; gap: 26px; }
@media (min-width: 900px) { .hp-c .hp-topbar-nav { display: flex; } }
.hp-c .hp-topbar-nav a { font-size: 11.5px; font-weight: 900; letter-spacing: .14em; color: var(--hp-ink, #111114);
  text-decoration: none; padding: 4px 0; border-bottom: 3px solid transparent; transition: opacity .3s, border-color .3s; }
.hp-c .hp-topbar-nav a:hover { opacity: .7; border-bottom-color: var(--hp-accent, #ff4658); }
.hp-c .hp-topbar-nav a[aria-current='page'] { border-bottom-color: var(--hp-accent, #ff4658); }
/* ドロワー（タイプC・白地に黒の太罫） */
.hp-c .hp-drawer-btn { color: var(--hp-ink, #111114); }
.hp-c .hp-topbar-tel { color: var(--hp-accent-deep, var(--hp-accent, #ff4658)); }
.hp-c .hp-drawer { background: #fff; border-left: 2px solid var(--hp-ink, #111114); }
.hp-c .hp-drawer-list a { color: var(--hp-ink, #111114); font-weight: 900; }
.hp-c .hp-drawer-list li + li a { border-top: 1px solid color-mix(in srgb, var(--hp-ink, #111114) 22%, transparent); }
.hp-c .hp-drawer-foot { border-top: 2px solid var(--hp-ink, #111114); color: color-mix(in srgb, var(--hp-ink, #111114) 64%, transparent); }
.hp-c .hp-drawer-tel { color: var(--hp-accent-deep, var(--hp-accent, #ff4658)); font-weight: 900; }
.hp-c .hp-drawer-terms, .hp-c .hp-doc-back { color: color-mix(in srgb, var(--hp-ink, #111114) 64%, transparent); }
.hp-c .hp-doc-h { color: var(--hp-ink, #111114); font-weight: 900; }
.hp-c .hp-doc-p, .hp-c .hp-doc-list li { color: var(--hp-ink, #111114); }
.hp-c .hp-link-text { color: var(--hp-ink, #111114); border: 2px solid var(--hp-ink, #111114); font-weight: 800; }
.hp-c .hp-drawer-close { color: var(--hp-ink, #111114); }
.hp-c .hp-sec { border-top: 2px solid var(--hp-ink, #111114); padding: 46px 20px; }
/* 連番（01/02…）は出さない（2026-08-13 要望）。COMMON が .hp-idx を display:none に
   しているので、ここで表示に切り替えなければ消えたまま＝打ち消しの行は不要。 */
.hp-c .hp-en { display: block; font-size: 28px; font-weight: 900; letter-spacing: -.01em; line-height: 1.05; margin: 6px 0 2px; text-transform: uppercase; color: var(--hp-ink, #111114); text-align: center; }
.hp-c .hp-h2 { font-size: 11px; font-weight: 700; color: color-mix(in srgb, var(--hp-ink, #111114) 64%, transparent); letter-spacing: .2em; margin-bottom: 20px; text-align: center; }
.hp-c .hp-hero-img { border-bottom: 2px solid var(--hp-ink, #111114); }
.hp-c .hp-hero-text { padding: 22px 20px 26px; text-align: center; }
.hp-c .hp-hero-en { font-size: 10px; font-weight: 900; letter-spacing: .2em; color: var(--hp-accent-deep, var(--hp-accent, #ff4658)); }
.hp-c .hp-hero-name { margin-top: 6px; font-size: 34px; font-weight: 900; letter-spacing: -.01em; line-height: 1.1; }
.hp-c .hp-hero-catch { margin-top: 12px; font-size: 14px; font-weight: 800; line-height: 1.9; }
/* エリア・営業時間の行は視覚的に隠す（2026-08-13 要望・タイプA/Bと同じやり方）。
   display:none ではなく1pxに畳む＝読み上げ・検索エンジンには残す。 */
.hp-c .hp-hero-area { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); }
.hp-c .hp-concept-text { font-size: 13px; line-height: 2.1; font-weight: 500; white-space: pre-wrap; }
.hp-c .hp-concept-img { width: 100%; height: auto; border: 2px solid var(--hp-ink, #111114); margin-bottom: 16px; }
.hp-c .hp-course-group { margin-bottom: 20px; }
/* コース名は配色の帯に白抜き（タイプBのピルと同じ役割。MODEなので角は直角のまま）。
   ★ 黄のように「面に白抜きが載らない」配色は、配色ブロック側で color だけ上書きする。 */
.hp-c .hp-course-name { display: inline-block; font-size: 15px; font-weight: 900; margin-bottom: 8px;
  background: var(--hp-accent, #ff4658); color: #fff; padding: 6px 14px; }
.hp-c .hp-course-row { display: flex; justify-content: space-between; align-items: baseline; padding: 15px 0; border-bottom: 1px solid color-mix(in srgb, var(--hp-ink, #111114) 22%, transparent); }
.hp-c .hp-course-min { font-size: 16px; font-weight: 700; }
.hp-c .hp-course-price { font-size: 22px; font-weight: 900; letter-spacing: -.02em; }
.hp-c .hp-th-row { border: 2px solid var(--hp-ink, #111114); background: var(--hp-ink, #111114); gap: 0; padding-bottom: 0; }
.hp-c .hp-th-card { flex: 0 0 44%; background: var(--hp-paper, #f4f4f6); border-right: 2px solid var(--hp-ink, #111114); padding-bottom: 12px; }
.hp-c .hp-th-card:last-child { border-right: none; }
.hp-c .hp-th-frame img, .hp-c .hp-th-noimg { border-bottom: 2px solid var(--hp-ink, #111114); }
.hp-c .hp-th-noimg { background: linear-gradient(160deg, color-mix(in srgb, var(--hp-ink, #111114) 9%, var(--hp-paper, #f4f4f6)), color-mix(in srgb, var(--hp-ink, #111114) 17%, var(--hp-paper, #f4f4f6))); }
.hp-c .hp-th-name { padding: 10px 12px 0; font-size: 14px; font-weight: 900; color: var(--hp-ink, #1c1c20); }
.hp-c .hp-th-age { padding: 2px 12px 0; font-size: 10px; font-weight: 700; color: color-mix(in srgb, var(--hp-ink, #111114) 64%, transparent); letter-spacing: .15em; }
.hp-c .hp-th-catch { display: block; padding: 6px 12px 0; font-size: 10.5px; font-weight: 600; color: color-mix(in srgb, var(--hp-ink, #111114) 76%, transparent); line-height: 1.7;
  overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.hp-c .hp-th-badges { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px 0; }
.hp-c .hp-th-badge { font-size: 8.5px; font-weight: 900; color: var(--hp-ink, #111114); border: 1.5px solid var(--hp-ink, #111114); padding: 2px 7px; letter-spacing: .05em; }
.hp-c .hp-th-onduty { margin: 8px 12px 0; display: inline-block; font-size: 9px; font-weight: 900; color: var(--hp-accent-deep, var(--hp-accent, #ff4658)); border: 2px solid var(--hp-accent-deep, var(--hp-accent, #ff4658)); padding: 2px 8px; letter-spacing: .1em; }
.hp-c .hp-sched-row { display: flex; justify-content: space-between; padding: 14px 2px; border-bottom: 1px solid color-mix(in srgb, var(--hp-ink, #111114) 22%, transparent); font-size: 13px; font-weight: 800; }
.hp-c .hp-sched-time { font-weight: 900; }
.hp-c .hp-embed { border: 2px solid var(--hp-ink, #111114); background: #fff; }
/* もっと見るは中央寄せ（2026-08-13 要望）。inline-block のままでは text-align では
   動かないので、幅ぴったりのブロック＋左右マージン auto（タイプBの見出しピルと同じやり方）。
   margin-top:12px は COMMON の値を引き継ぐ。 */
.hp-c .hp-more { display: block; width: fit-content; margin-left: auto; margin-right: auto;
  color: var(--hp-ink, #111114); font-weight: 900; border-bottom: 3px solid var(--hp-accent, #ff4658); padding-bottom: 2px; letter-spacing: .1em; }
.hp-c .hp-card { border: 2px solid var(--hp-ink, #111114); background: #fff; padding: 16px; box-shadow: 5px 5px 0 var(--hp-ink, #111114); margin-bottom: 16px; }
.hp-c .hp-card-title { font-size: 12.5px; font-weight: 900; }
.hp-c .hp-coupon-discount { font-size: 16px; font-weight: 900; color: var(--hp-accent-deep, var(--hp-accent, #ff4658)); margin: 4px 0; }
.hp-c .hp-card-body { margin-top: 6px; font-size: 11px; line-height: 1.9; font-weight: 500; white-space: pre-wrap; }
/* 新着情報だけ文字を大きく（トップの抜粋と /news ページの両方に効く。クーポン等の hp-card は据え置き）。
   数値はタイプS・A・Bと同じ（2026-08-13）。 */
.hp-c .hp-sec-news .hp-card-title { font-size: 15px; }
.hp-c .hp-sec-news .hp-card-body { font-size: 13.5px; line-height: 2; }
.hp-c .hp-sec-news .hp-card-meta { font-size: 10.5px; }
.hp-c .hp-card-meta { margin-top: 10px; font-size: 9px; font-weight: 800; color: color-mix(in srgb, var(--hp-ink, #111114) 64%, transparent); letter-spacing: .15em; }
.hp-c .hp-info-row { border-bottom: 1px solid color-mix(in srgb, var(--hp-ink, #111114) 22%, transparent); padding: 13px 2px; }
.hp-c .hp-info-row dt { font-weight: 900; letter-spacing: .1em; font-size: 10px; padding-top: 2px; }
.hp-c .hp-info-row dd { font-weight: 600; }
.hp-c .hp-footer { background: var(--hp-ink, #111114); color: #fff; text-align: left; padding: 40px 20px 60px; }
.hp-c .hp-footer-links { justify-content: flex-start; }
.hp-c .hp-footer-name { font-size: 20px; font-weight: 900; }
.hp-c .hp-footer-sub { margin-top: 10px; font-size: 10px; color: rgba(255,255,255,.66); font-weight: 700; line-height: 2; }
.hp-c .hp-footer-sub a { color: #fff; }
.hp-c .hp-cta { border-top: 2px solid var(--hp-ink, #111114); }
.hp-c .hp-cta a { font-weight: 900; letter-spacing: .2em; }
.hp-c .hp-cta-tel { background: #fff; color: var(--hp-ink, #111114); border-right: 2px solid var(--hp-ink, #111114); }
.hp-c .hp-cta-line { background: var(--hp-accent, #ff4658); color: #fff; }
.hp-c .hp-sched-date { display: inline-block; background: var(--hp-ink, #111114); color: #fff; padding: 6px 16px; margin: 0 0 16px; font-size: 12px; font-weight: 900; letter-spacing: .15em; opacity: 1; }
/* ★ ヘッダーとヒーローは画面幅いっぱいに（2026-08-13 要望・タイプS/A/Bと同じ迫力を出す）。
   .hp-c は max-width:1024px の中央寄せなので、100vw ＋ 負のマージンで額縁を食い破る。
   横のはみ出しは /hp/layout.tsx の overflow-x:clip が受ける（hidden にすると sticky ヘッダーが壊れる）。
   ★★ このブロックは必ずタイプCの共通CSSの【いちばん最後】に置くこと。
     前方の .hp-c { --hp-col-half: 512px } と詳細度が同じなので、
     前に置くと「後に書いた方」に負けて効かない（メディアクエリでも同じ）。 */
@media (min-width: 768px) {
  .hp-c .hp-topbar, .hp-c .hp-hero { width: 100vw; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); }
  .hp-c .hp-hero-img { max-height: 82vh; }
  /* ★ 店名ブロック（写真の下の帯）は中央1024pxの枠へ戻す。
     .hp-hero ごと全幅にしたので、そのままだと文字が額縁の暗い地の上から始まってしまう
     （タイプBは固定壁紙が画面全体を覆うので起きない。タイプCは壁紙が無い）。
     写真だけ全幅・文字は本文と同じ枠の中、がタイプCの形。 */
  .hp-c .hp-hero-text { max-width: 1024px; margin: 0 auto; }
  /* ★ 全幅のヘッダーは【不透明】にする。中央1024pxの外側は額縁の暗い地なので、
     すりガラス（半透明）のままだと左右の端だけ暗く濁って帯が3色に割れて見える。
     タイプCは地色が変数（--hp-paper）なので、B と違って配色ごとの上書きは要らない。 */
  .hp-c .hp-topbar { background: var(--hp-paper, #f4f4f6); }
  /* ハンバーガーが画面の右端に来るので、ドロワーも画面の右端から出す */
  .hp-c { --hp-col-half: 50vw; }
}
/* ★ スマホの上部は「雑誌の表紙風・文字が先」（2026-08-13 要望）。
   S＝写真に文字を重ねる／A＝色帯→写真→店名／B＝写真→店名→色帯 と全部違う形にするため、
   Cだけ ヘッダー→店名のタイポブロック→写真→色帯ナビ の順にする。
   DOM は共通のまま：.hp-hero（picture＋.hp-hero-text）を flex にして picture に order:2 を
   振るだけで入れ替わる（並び替えの order は .hp-ordered 側の話なので干渉しない）。
   写真は他のタイプと同じ【幅いっぱい】（2026-08-13 要望。当初の額装＝黒2px枠＋ずらし影は廃止）。
   下端の黒2px罫は共通の .hp-c .hp-hero-img がそのまま効く＝写真と色帯ナビの区切りになる。
   PCは従来どおり全幅ヒーローのまま。 */
@media (max-width: 767px) {
  .hp-c .hp-hero { display: flex; flex-direction: column; }
  /* ★★ スライダー（2枚以上）のときは picture が .hp-hero-slides の中に入るので、
     picture への order だけでは効かない（並び順を決めるのは .hp-hero の直接の子）。
     包む div にも同じ order を振ること。これを忘れると、タイプCのスマホだけ
     写真と文字の上下が元に戻る。 */
  .hp-c .hp-hero > picture,
  .hp-c .hp-hero > .hp-hero-slides { order: 2; }
  /* タイポブロック。英字キャッチ→極太の店名→アクセントの太バー→キャッチコピー */
  .hp-c .hp-hero-text { padding: 26px 20px 22px; }
  .hp-c .hp-hero-name::after { content: ''; display: block; width: 56px; height: 6px;
    background: var(--hp-accent, #ff4658); margin: 14px auto 0; }
  .hp-c .hp-hero-catch { margin-top: 14px; }
}

/* ── マルチページのセラピスト一覧（/therapist）── 2026-08-13
   タイプS・A・Bと同じ「SP2列・PC4列のグリッド」に。トップは従来どおり横スクロールのまま
   （.hp-th-grid が付くのは一覧ページだけ＝parts.tsx の TherapistCards grid フラグ）。
   横スクロール用の「黒い帯にセルを詰める」枠はグリッドでは解き、1枚ずつ黒2px枠の
   カードにする（MODEの意匠。角は直角のまま）。
   ★ このブロックは基本の .hp-th-row / .hp-th-card 定義より【後ろ】に置くこと（同じ詳細度＝後勝ち）。 */
.hp-c .hp-th-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px;
  border: none; background: transparent; overflow: visible; padding-bottom: 0; }
@media (min-width: 768px) { .hp-c .hp-th-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } }
.hp-c .hp-th-grid .hp-th-card { flex: none; border: 2px solid var(--hp-ink, #111114); background: var(--hp-paper, #f4f4f6); }

/* ── 本日の出勤（2026-08-13: タイプS・A・Bと同じ写真グリッドに揃えた）──
   SP2列・PC4列で写真を並べ、名前・年齢・出勤時間は写真の中（下端）へ重ねる。
   COMMON では hp-sched-thumb / hp-sched-meta を隠して「名前 …… 時間」の1行にしているので、
   ここで出し直す。DOM は共通のまま（作業ルール1）。
   ★ 写真は黒2px枠・角は直角（MODEの意匠）。S/Aのように画面端までは食い破らせない（Bと同じ）。
   ★ 出勤時間は暗いグラデの上で配色が沈むので、白い札のまま写真に重ねる（Bと同じ考え方）。
     文字色は --hp-accent-deep がそのまま効く＝配色別の追加CSSが要らない。 */
.hp-c .hp-sched-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
@media (min-width: 768px) { .hp-c .hp-sched-list { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; } }
.hp-c .hp-sched-row { display: block; padding: 0; border: none; position: relative; }
.hp-c .hp-sched-thumb { display: block; position: relative; background: var(--hp-paper, #f4f4f6);
  border: 2px solid var(--hp-ink, #111114); overflow: hidden; }
.hp-c .hp-sched-thumb img, .hp-c .hp-sched-noimg { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.hp-c .hp-sched-noimg { background: linear-gradient(160deg,
  color-mix(in srgb, var(--hp-ink, #111114) 9%, var(--hp-paper, #f4f4f6)),
  color-mix(in srgb, var(--hp-ink, #111114) 17%, var(--hp-paper, #f4f4f6))); }
/* 文字を読ませるための暗いレイヤー（写真の下から立ち上がるグラデーション） */
.hp-c .hp-sched-thumb::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 58%; pointer-events: none;
  background: linear-gradient(to top, rgba(12,12,14,.74), rgba(12,12,14,.3) 46%, rgba(12,12,14,0));
}
.hp-c .hp-sched-body {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 1;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  margin: 0; padding: 0 8px 10px; text-align: center;
}
.hp-c .hp-sched-name { font-size: 13px; font-weight: 900; color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,.5); }
.hp-c .hp-sched-meta { display: block; font-size: 10.5px; font-weight: 700; color: rgba(255,255,255,.88); text-shadow: 0 1px 6px rgba(0,0,0,.5); }
.hp-c .hp-sched-time { margin-top: 5px; font-size: 10.5px; font-weight: 900; color: var(--hp-accent-deep, var(--hp-accent, #ff4658));
  background: #fff; border: 2px solid var(--hp-ink, #111114); padding: 2px 9px; }
/* 日付の札は見出しに合わせて中央へ（写真グリッド化に合わせて。塗りは従来のインク色のまま） */
.hp-c .hp-sched-date { display: block; width: fit-content; margin-left: auto; margin-right: auto; }

/* ── 壁紙（白大理石・2026-08-13）────────────────────────────
   タイプS/Bと同じ「固定レイヤー2枚」方式: ::before = 大理石 ／ ::after = 地色のベール。
   大理石はほぼ無彩色なので、タイプBのように色相を回した4枚は作らず【1枚だけ】敷き、
   ベールを配色の変数（--hp-paper）で塗って4配色すべてに馴染ませる（Cの変数設計の利点）。
   タイル繰り返しではなく cover で1枚を画面全体に敷く＝継ぎ目の問題が起きない。
   負の z-index が使えるのは .hp-root の isolation:isolate のおかげ（COMMON 参照）。
   ★ 地色を transparent にしないと壁紙が root の背景に隠れる。
   ★ ベールの濃さ（.62）を変えるときは、各配色ブロックの .hp-sec-alt（.72）も一緒に見ること。 */
.hp-c { background-color: transparent; }
.hp-c::before {
  content: ''; position: fixed; inset: 0; z-index: -2; pointer-events: none;
  background: url('/hp-c/wallpaper.webp') center / cover no-repeat;
}
.hp-c::after {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: color-mix(in srgb, var(--hp-paper, #f4f4f6) 62%, transparent);
}
`;

// タイプS（GRACE・フラッグシップ）: LPのキービジュアルに描かれたサイトの実物化（2026-08-09）。
// 白〜クリーム地×シャンパンゴールド×しっぽり明朝。全幅ヒーローに文字を重ね、
// 上部固定ナビ（CONCEPT/SYSTEM/…・アンカー）を出す唯一のひな形。
// 既定ヒーロー画像は public/hp-s/（PC 2400×960 / SP 1080×760・口元から下の構図）。
const TYPE_S = `
@import url('https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;500;600&display=swap');
${COMMON}
.hp-s { background: #fdfbf7; color: #4a4238; font-family: 'Shippori Mincho', 'Hiragino Mincho ProN', 'Yu Mincho', 'Noto Serif JP', 'Noto Serif CJK JP', serif; }
/* 2026-08-13: ページ全体を全幅にする作りをやめ、タイプA/Bと同じ「額縁の中」に揃えた。
   ヘッダーとヒーローだけがその額縁を食い破って画面幅いっぱいに出る（このファイル末尾）。 */
.hp-s { max-width: 1024px; }
/* ブロックの上下の余白は詰めて、セクション同士を近づける（2026-08-10・従来の1/4） */
.hp-s .hp-sec { padding: 15px 22px; }
/* 本文の幅もタイプA/Bと同じ720px（2026-08-13）。
   ★ 以前は本文860px＋写真グリッドだけ1180pxに広げていたが、外枠が1024pxになって
     1180pxが入らなくなった（padding が負になる）ので、広げる指定ごと外した。 */
@media (min-width: 768px) { .hp-s .hp-sec { padding: 21px calc((100% - 720px) / 2); } }
.hp-s .hp-sec-alt { background: #f7f2ea; }
.hp-s section[id] { scroll-margin-top: 64px; }

/* 並べ替えは .hp-ordered（COMMON）＋ HpTemplate のインライン order が担う。
   タイプSの「ヒーロー直下に本日の出勤」は hpSite.ts の既定の並びで表現している。
   <style> と <script> は display:none なので flex アイテムにならない。
   .hp-wallpaper / .hp-cta / .hp-drawer は position:fixed なので order の影響を受けない。 */
/* 並べ替えで背景の縞（無地↔生成り）がずれるぶんを付け替える。
   schedule=帯 / concept=無地 / courses=帯 / therapists=無地 …と交互に戻す。 */
.hp-s .hp-sec-diary, .hp-s .hp-sec-coupon, .hp-s .hp-sec-free { background: rgba(247,242,234,.70); }
.hp-s .hp-sec-reviews, .hp-s .hp-sec-news, .hp-s .hp-sec-info { background: rgba(253,251,247,.30); }

/* ── 固定ナビ（白のすりガラス・店名／ナビ／メニューボタン） ── */
.hp-s .hp-topbar { display: flex; justify-content: space-between; align-items: center; gap: 16px; position: sticky; top: var(--hp-topbar-top, 0px); z-index: 30;
  padding: 14px 22px; background: rgba(253,251,247,.86); backdrop-filter: blur(10px); border-bottom: 1px solid #eee4d4; }
.hp-s.hp-scrolled .hp-topbar { background: rgba(253,251,247,.97); box-shadow: 0 2px 16px rgba(74,66,56,.13); }
.hp-s .hp-topbar-name { font-size: 14px; letter-spacing: .24em; color: var(--hp-accent, #b98d4f); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hp-s .hp-topbar-nav { display: none; gap: 26px; }
@media (min-width: 900px) { .hp-s .hp-topbar-nav { display: flex; } }
.hp-s .hp-topbar-nav a { font-size: 11px; letter-spacing: .22em; color: #7a6f60; text-decoration: none; padding: 4px 0; border-bottom: 1px solid transparent; transition: color .3s, border-color .3s; }
.hp-s .hp-topbar-nav a:hover { color: var(--hp-accent, #b98d4f); border-bottom-color: var(--hp-accent, #b98d4f); }
/* ドロワー（タイプS・生成りのすりガラスに金） */
.hp-s .hp-drawer-btn { color: var(--hp-accent, #b98d4f); }
.hp-s .hp-topbar-tel { color: var(--hp-accent, #b98d4f); transition: opacity .3s; }
.hp-s .hp-topbar-tel:hover { opacity: .65; }
.hp-s .hp-drawer { background: rgba(253,251,247,.97); border-left: 1px solid #eee4d4; backdrop-filter: blur(10px); }
.hp-s .hp-drawer-list a { color: #6b6154; letter-spacing: .18em; transition: color .3s; }
.hp-s .hp-drawer-list li + li a { border-top: 1px solid #f0e7d8; }
.hp-s .hp-drawer-list a:hover { color: var(--hp-accent, #b98d4f); }
.hp-s .hp-drawer-foot { border-top: 1px solid #eee4d4; color: #9b8c74; }
.hp-s .hp-drawer-tel { color: var(--hp-accent, #b98d4f); }
.hp-s .hp-drawer-terms, .hp-s .hp-doc-back { color: #9b8c74; }
.hp-s .hp-doc-h { color: var(--hp-accent, #b98d4f); font-weight: 600; letter-spacing: .12em; }
.hp-s .hp-doc-p, .hp-s .hp-doc-list li { color: #6b6154; letter-spacing: .04em; }
/* SPクイックナビ（タイプS: 生成り地×金・トップバーと同じ色帳） */
.hp-s .hp-quicknav { background: rgba(253,251,247,.92); border-bottom: 1px solid #eee4d4; }
.hp-s .hp-qn-item + .hp-qn-item { border-left: 1px solid #f0e7d8; }
.hp-s .hp-qn-en { color: #6b6154; }
.hp-s .hp-qn-jp { color: #9b8c74; opacity: 1; }
/* タイプSは見出し・本文とも中央寄せなので、パンくず・口コミの平均評価も中央に揃える */
.hp-s .hp-crumb { justify-content: center; }
.hp-s .hp-voice-summary { text-align: center; }
.hp-s .hp-sec-doc { padding-left: 22px; padding-right: 22px; }
@media (min-width: 768px) { .hp-s .hp-sec-doc { padding-left: calc((100% - 720px) / 2); padding-right: calc((100% - 720px) / 2); } }
.hp-s .hp-link-text { color: #6b6154; border: 1px solid #eadfcd; background: rgba(255,255,255,.6); letter-spacing: .04em; }
.hp-s .hp-link-item:hover .hp-link-text { color: var(--hp-accent, #b98d4f); border-color: var(--hp-accent-soft, #d5b98a); }
.hp-s .hp-drawer-close { color: #9b8c74; }

/* ── ヒーロー：全幅画像に文字を重ねる（PC=左側の余白へ／SP=下側の余白へ） ── */
.hp-s .hp-hero { position: relative; }
.hp-s .hp-hero-img { max-height: none; }
.hp-s .hp-hero-text { position: absolute; inset: 0; z-index: 1; display: flex; flex-direction: column; justify-content: center; align-items: flex-start;
  text-align: left; padding: 0 0 0 13%; max-width: 60%; }
/* 大きく見せるのはキャッチコピー（順序はCSSで入れ替え） */
.hp-s .hp-hero-catch { order: -1; margin: 0 0 4%; font-size: clamp(21px, 3.6vw, 48px); line-height: 1.7; letter-spacing: .1em; color: #4a4238;
  text-shadow: 0 1px 12px rgba(253,251,247,.8); }
.hp-s .hp-hero-en { font-size: clamp(10px, 1.15vw, 14px); letter-spacing: .42em; color: #9b8c74; margin-bottom: 12px; }
.hp-s .hp-hero-name { font-size: clamp(17px, 2.2vw, 30px); font-weight: 500; letter-spacing: .3em; color: var(--hp-accent, #b98d4f); position: relative; padding-bottom: 14px; }
.hp-s .hp-hero-name::after { content: ''; position: absolute; left: 2px; bottom: 0; width: 76px; border-top: 1px solid var(--hp-accent-soft, #d5b98a); }
.hp-s .hp-hero-area { margin-top: 16px; font-size: clamp(9px, 1.05vw, 13px); color: #9b8c74; letter-spacing: .3em; }
@media (max-width: 639px) {
  /* SP: キービジュアルは写真1枚で見せる（2026-08-10）。
     スマホ用の画像はもともと文字入りで作るため、店名・キャッチ・エリアを重ねると
     二重表示になり、可読性のための明るいスクリムも写真を白くくすませていた。
     そこで文字レイヤーごと消す（PCは従来どおり左側に文字を重ねる）。
     display:none ではなく視覚的に隠すだけにするのは、ページ唯一の h1（店名）を
     検索エンジンと読み上げに残すため。 */
  .hp-s .hp-hero-text {
    position: absolute; inset: auto; width: 1px; height: 1px;
    padding: 0; margin: -1px; overflow: hidden; clip-path: inset(50%); border: 0;
  }
}

/* ── セクション見出し（金の英字＋明朝＋二重罫線。Aの意匠を明るい地に移植） ── */
.hp-s .hp-en { letter-spacing: .38em; font-size: 11px; color: var(--hp-accent, #b98d4f); text-transform: uppercase; }
.hp-s .hp-h2 { font-size: 22px; font-weight: 600; letter-spacing: .16em; margin: 10px 0 6px; color: #3f382e; }

.hp-s .hp-concept-text { font-size: 13.5px; line-height: 2.4; color: #6b6154; letter-spacing: .06em; white-space: pre-wrap; }
.hp-s .hp-concept-img { width: 100%; height: auto; margin-bottom: 22px; border: 1px solid #eadfcd; padding: 6px; background: #fff; }

.hp-s .hp-course-group { margin-bottom: 26px; }
/* 2026-08-11: 料金の行を読みやすく大きめに（元 13/12.5/15px → 15/16/22px） */
.hp-s .hp-course-name { font-size: 15px; letter-spacing: .14em; color: var(--hp-accent, #b98d4f); margin-bottom: 6px; font-weight: 600; }
.hp-s .hp-course-row { display: flex; justify-content: space-between; align-items: baseline; padding: 13px 2px; border-bottom: 1px solid #e7dcc9; }
.hp-s .hp-course-min { font-size: 16px; letter-spacing: .1em; color: #5d5346; }
.hp-s .hp-course-price { font-size: 22px; color: var(--hp-accent, #b98d4f); font-style: italic; }

/* セラピストは「本日の出勤」とまったく同じ見せ方に揃える（2026-08-09 要望）:
   横スクロールではなくグリッド（SP2列・PC4列）、隙間は3px（PC5px）、
   額縁なしで写真を敷き詰め、名前と年齢は写真の中に重ねる。 */
.hp-s .hp-th-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); justify-content: center; gap: 3px; overflow: visible; padding-bottom: 0; }
@media (min-width: 768px) { .hp-s .hp-th-row { grid-template-columns: repeat(4, minmax(0, 268px)); gap: 5px; } }
/* スマホは左右の余白を食い破って画面の端まで（出勤ブロックと同じ） */
@media (max-width: 639px) { .hp-s .hp-th-row { margin-left: -22px; margin-right: -22px; } }
.hp-s .hp-th-card { position: relative; overflow: hidden; }
.hp-s .hp-th-frame { border: none; padding: 0; background: #f3ecdf; position: relative; box-shadow: none; }
.hp-s .hp-th-noimg { background: linear-gradient(160deg, #f3ecdf, #e7dcc9); }
/* 文字を読ませるための暗いレイヤー */
.hp-s .hp-th-frame::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; top: auto; height: 62%; pointer-events: none; border: none;
  background: linear-gradient(to top, rgba(44,32,18,.80), rgba(44,32,18,.34) 44%, rgba(44,32,18,0));
}
.hp-s .hp-th-body {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 1;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  margin: 0; padding: 0 8px 11px; text-align: center;
}
.hp-s .hp-th-name { margin-top: 0; font-size: 15px; letter-spacing: .16em; text-indent: .16em; text-align: center; color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,.4); }
.hp-s .hp-th-age { margin-top: 0; font-size: 11px; color: rgba(255,255,255,.85); letter-spacing: .08em; text-align: center; text-shadow: 0 1px 6px rgba(0,0,0,.4); }
/* 出勤ブロックに合わせ、体型・ひとことキャッチ・特徴バッジは出さない */
.hp-s .hp-th-body-type, .hp-s .hp-th-catch, .hp-s .hp-th-badges { display: none; }
/* 「本日出勤」は出勤ブロックの時間と同じ位置・同じ金色で */
.hp-s .hp-th-onduty { display: block; width: auto; margin: 3px 0 0; padding: 0; background: none;
  font-size: 11.5px; color: var(--hp-accent-soft, #d5b98a); letter-spacing: .1em; text-shadow: 0 1px 6px rgba(0,0,0,.45); }

/* ── 本日の出勤（ヒーロー直下の主役ブロック）──
   SP2列・PC4列の写真グリッド。セラピスト一覧と同じ寸法感で揃える。 */
.hp-s .hp-sched-date { display: inline-block; background: #fff; border: 1px solid #eadfcd; padding: 6px 18px; margin: 0 0 22px; font-size: 12px; color: var(--hp-accent, #b98d4f); letter-spacing: .2em; opacity: 1; }
.hp-s .hp-sched-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); justify-content: center; gap: 3px; }
@media (min-width: 768px) { .hp-s .hp-sched-list { grid-template-columns: repeat(4, minmax(0, 268px)); gap: 5px; } }
/* スマホは左右の余白を食い破って画面の端まで使う（枠いっぱいのモザイク） */
@media (max-width: 639px) { .hp-s .hp-sched-list { margin-left: -22px; margin-right: -22px; } }
.hp-s .hp-sched-row { display: block; padding: 0; border: none; position: relative; overflow: hidden; }
.hp-s .hp-sched-thumb { display: block; border: none; padding: 0; background: #f3ecdf; position: relative; box-shadow: none; }
.hp-s .hp-sched-thumb img, .hp-s .hp-sched-noimg { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; }
.hp-s .hp-sched-noimg { background: linear-gradient(160deg, #f3ecdf, #e7dcc9); }
/* 文字を読ませるための暗いレイヤー（写真の下から立ち上がるグラデーション） */
.hp-s .hp-sched-thumb::after {
  content: ''; position: absolute; left: 0; right: 0; bottom: 0; height: 62%; pointer-events: none;
  background: linear-gradient(to top, rgba(44,32,18,.80), rgba(44,32,18,.34) 44%, rgba(44,32,18,0));
}
/* 名前・年齢・出勤時間は写真の中（下端）へ重ねる */
.hp-s .hp-sched-body {
  position: absolute; left: 0; right: 0; bottom: 0; z-index: 1;
  display: flex; flex-direction: column; align-items: center; gap: 1px;
  margin: 0; padding: 0 8px 11px; text-align: center;
}
.hp-s .hp-sched-name { font-size: 15px; letter-spacing: .16em; text-indent: .16em; color: #fff; text-shadow: 0 1px 8px rgba(0,0,0,.4); }
.hp-s .hp-sched-meta { display: block; font-size: 11px; color: rgba(255,255,255,.85); letter-spacing: .08em; text-shadow: 0 1px 6px rgba(0,0,0,.4); }
.hp-s .hp-sched-time { margin-top: 3px; font-size: 11.5px; color: var(--hp-accent-soft, #d5b98a); font-style: italic; letter-spacing: .04em; text-shadow: 0 1px 6px rgba(0,0,0,.45); }

.hp-s .hp-embed { border: 1px solid #eadfcd; }
.hp-s .hp-more { color: var(--hp-accent, #b98d4f); letter-spacing: .2em; border-bottom: 1px solid var(--hp-accent-soft, #d5b98a); padding-bottom: 3px; }

/* カードは白地に淡い金の内飾り枠（Aのカード意匠の明るい版） */
.hp-s .hp-card { background: #fff; border: 1px solid #eadfcd; padding: 22px; position: relative; box-shadow: 0 6px 20px rgba(120,100,70,.06); }
.hp-s .hp-card::before { content: ''; position: absolute; inset: 5px; border: 1px solid color-mix(in srgb, var(--hp-accent, #b98d4f) 30%, transparent); pointer-events: none; }
.hp-s .hp-card-title { font-size: 12.5px; letter-spacing: .1em; margin-bottom: 8px; color: #4a4238; }
.hp-s .hp-coupon-discount { font-size: 16px; color: var(--hp-accent, #b98d4f); margin-bottom: 6px; }
.hp-s .hp-card-body { font-size: 11px; color: #8a7d6a; line-height: 1.9; white-space: pre-wrap; }
.hp-s .hp-card-meta { margin-top: 10px; font-size: 9px; color: #b3a48c; letter-spacing: .1em; }

/* 新着情報だけ文字を大きく（トップの抜粋と /news ページの両方に効く。クーポン等の hp-card は据え置き） */
.hp-s .hp-sec-news .hp-card-title { font-size: 15px; }
.hp-s .hp-sec-news .hp-card-body { font-size: 13.5px; line-height: 2; }
.hp-s .hp-sec-news .hp-card-meta { font-size: 10.5px; }

.hp-s .hp-info-row { border-bottom: 1px solid #e7dcc9; }
.hp-s .hp-info-row dt { color: var(--hp-accent, #b98d4f); font-size: 10px; letter-spacing: .25em; padding-top: 3px; }
.hp-s .hp-info-row dd { color: #5d5346; }

.hp-s .hp-footer { background: #3f382e; }
.hp-s .hp-footer-name { font-size: 13px; letter-spacing: .3em; color: var(--hp-accent-soft, #d5b98a); margin-bottom: 12px; }
.hp-s .hp-footer-sub { font-size: 9px; color: #a1988a; letter-spacing: .2em; line-height: 2.4; }
.hp-s .hp-footer-sub a { color: var(--hp-accent-soft, #d5b98a); }

.hp-s .hp-cta { max-width: 1024px; }
.hp-s .hp-cta-tel { background: #fff; color: #4a4238; border-top: 1px solid var(--hp-accent-soft, #d5b98a); }
.hp-s .hp-cta-line { background: var(--hp-accent, #b98d4f); color: #fff; }

/* ══════════ 神秘的な仕上げ（2026-08-09 要望）══════════
   狙いは「静けさ・左右対称・淡い光」。装飾はCSSだけで完結させ、DOMには手を入れない。 */

/* 1) 背景は2枚の固定レイヤーで作る（スクロールしても動かず“光の中にいる”感じが続く）。
      ::before = 羽根の壁紙 / ::after = 金の光のたまり（霞）。
      どちらも position:fixed なので flex アイテムにはならず、並べ替え（order）にも影響しない。
      負の z-index が使えるのは .hp-root の isolation:isolate があるおかげ（COMMON 参照）。
      ※ background-attachment:fixed はモバイルで無視されるため、固定レイヤー方式にしている。 */
.hp-s::before {
  content: ''; position: fixed; inset: 0; z-index: -2; pointer-events: none;
  background: url('/hp-s/wallpaper.webp') center / cover no-repeat;
}
.hp-s::after {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background-image:
    radial-gradient(1200px 680px at 50% -180px, color-mix(in srgb, var(--hp-accent, #b98d4f) 15%, transparent), transparent 66%),
    radial-gradient(820px 560px at 4% 38%,   color-mix(in srgb, var(--hp-accent, #b98d4f) 7%,  transparent), transparent 70%),
    radial-gradient(820px 560px at 96% 76%,  color-mix(in srgb, var(--hp-accent, #b98d4f) 7%,  transparent), transparent 70%);
}
/* 壁紙を透かすため、セクションの地色は半透明にする（無地=薄いベール／帯=やや濃いベール）。
   文字色は #4a4238 系なので、この濃度でも可読性は保てる。 */
.hp-s .hp-sec { background: rgba(253,251,247,.30); }
.hp-s .hp-sec-alt { background: rgba(247,242,234,.70); }

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
/* 出勤・セラピストとも余白0で敷き詰めるため、写真に影や内枠は付けない
   （隙間3pxで線や影が重なると濁るため。可読性は暗いレイヤーが担う）。 */

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

/* ── ヘッダーとヒーローだけ画面幅いっぱいに（2026-08-13・タイプA/Bと同じ作り）──
   .hp-s は max-width:1024px の中央寄せなので、100vw ＋ 負のマージンで額縁を食い破る。
   横のはみ出しは /hp/layout.tsx の overflow-x:clip が受ける（hidden にすると sticky が壊れる）。
   ★★ このブロックは必ずタイプSのCSSの【いちばん最後】に置くこと。
     .hp-s の --hp-col-half（ドロワーの right の計算用）は詳細度が同じなので、
     前に置くと「後に書いた方」に負けて効かない（メディアクエリの中でも同じ）。
   ★ 壁紙（::before/::after）は position:fixed なので、額縁の外側にも画面いっぱいに広がる
     ＝タイプA/Bのような暗い額縁ではなく、壁紙が左右の余白になる（タイプSの持ち味は残る）。 */
@media (min-width: 768px) {
  .hp-s .hp-topbar, .hp-s .hp-hero { width: 100vw; margin-left: calc(50% - 50vw); margin-right: calc(50% - 50vw); }
  /* ハンバーガーが画面の右端に来るので、ドロワーも画面の右端から出す */
  .hp-s { --hp-col-half: 50vw; }
}
`;

export const TEMPLATE_CSS: Record<'s' | 'a' | 'b' | 'c', string> = {
  s: TYPE_S,
  a: TYPE_A,
  b: TYPE_B,
  c: TYPE_C,
};

// ── 配色ごとの追加CSS（2026-08-11）──────────────────
// 「地色まで変える配色」だけが持つ上書き。ひな形CSSの後ろに足して使う。
// キーは HP_COLOR_VARIANTS の rootClass（hpColorRootClass が返す値）。
//
// ★ 該当の配色のページにだけ足すこと。全ページに常に入れると、
//   使っていない店（シャンパンゴールド）のHTMLまで重くなる。
const TYPE_S_WINE = `/* ══════════ 配色2: ワインレッド（2026-08-11）══════════
   タイプSの2つめの配色。DOM・レイアウト・余白はシャンパンゴールドと【完全に同じ】で、
   色の面積だけを大きく変えて、一目で別物に見えるようにしたもの
   （アクセント1色だけ差し替える方式では見分けが付かない、という指摘への回答）。

   ・地は白のまま（#fdf8f7）＝写真が映える明るさは維持する
   ・見出し・飾り罫・価格・リンク・CTA は --hp-accent(#8e1f35)/--hp-accent-soft(#b8566a) が
     すでに効くので、ここには書かない（配色の値は hpSite.ts の HP_COLOR_VARIANTS が正）
   ・ここに書くのは「CSS変数では表せない面」だけ:
       生成りの帯 → 淡い薔薇色 / コース名 → ワインの帯に白抜き /
       出勤の日付 → ワインのバッジ / フッター → 濃いワイン /
       写真に重ねる影 → 茶からワインへ / 罫線の茶系 → 薔薇系

   ★ 付くクラスは HP_COLOR_VARIANTS.s の rootClass（hpColorRootClass → HpShell）。
   ★ シャンパンゴールドを1バイトも変えないため、上の .hp-s のルールには手を入れず、
     すべてこのブロックの上書き（.hp-s.hp-s-wine＝詳細度が1段上）で表現すること。 */
.hp-s.hp-s-wine { background: #fdf8f7; color: #4a3238; }
/* 壁紙の羽根はワイン用に色を振った別画像（無くても下の霞だけで成立する） */
.hp-s.hp-s-wine::before { background-image: url('/hp-s/wallpaper-wine.webp'); }
/* セクションの地色（壁紙を透かすベール）。無地↔薔薇色の帯で縞を作るのは金と同じ */
.hp-s.hp-s-wine .hp-sec { background: rgba(253,248,247,.34); }
.hp-s.hp-s-wine .hp-sec-alt { background: rgba(248,235,235,.78); }
.hp-s.hp-s-wine .hp-sec-diary, .hp-s.hp-s-wine .hp-sec-coupon, .hp-s.hp-s-wine .hp-sec-free { background: rgba(248,235,235,.78); }
.hp-s.hp-s-wine .hp-sec-reviews, .hp-s.hp-s-wine .hp-sec-news, .hp-s.hp-s-wine .hp-sec-info { background: rgba(253,248,247,.34); }

/* トップバー: 地そのものを濃いワインにして、ヘッダーだけで「赤のサイト」と分かるようにする
   （2026-08-11 要望。淡い地＋ワインの罫線では赤の印象が弱かった）。
   地が濃くなるので、店名・ナビ・電話・ハンバーガーはすべて白系に置き換えること。 */
.hp-s.hp-s-wine .hp-topbar { background: rgba(122,26,46,.93); border-bottom: 1px solid rgba(255,255,255,.16); }
.hp-s.hp-s-wine.hp-scrolled .hp-topbar { background: #6d1528; box-shadow: 0 2px 16px rgba(60,10,22,.32); }
.hp-s.hp-s-wine .hp-topbar-name { color: #fff; }
.hp-s.hp-s-wine .hp-topbar-nav a { color: rgba(255,255,255,.82); }
.hp-s.hp-s-wine .hp-topbar-nav a:hover { color: #fff; border-bottom-color: #fff; }
.hp-s.hp-s-wine .hp-topbar-tel, .hp-s.hp-s-wine .hp-drawer-btn { color: #fff; }
/* 文章ページ（利用規約など）の「← ホームへ」もトップバーの中なので白系に */
.hp-s.hp-s-wine .hp-doc-back { color: rgba(255,255,255,.85); }
/* ドロワー（開いた中身は明るいまま＝文字の読みやすさを優先） */
.hp-s.hp-s-wine .hp-drawer { background: rgba(253,248,247,.97); border-left: 1px solid #edd7d9; }
.hp-s.hp-s-wine .hp-drawer-list a { color: #6b5157; }
.hp-s.hp-s-wine .hp-drawer-list li + li a { border-top: 1px solid #f3e2e2; }
.hp-s.hp-s-wine .hp-drawer-foot { border-top: 1px solid #edd7d9; color: #a2828a; }
.hp-s.hp-s-wine .hp-drawer-terms, .hp-s.hp-s-wine .hp-drawer-close { color: #a2828a; }
.hp-s.hp-s-wine .hp-doc-p, .hp-s.hp-s-wine .hp-doc-list li { color: #6b5157; }
/* SPクイックナビ（ヒーロー直下の4分割）。ヘッダーより一段明るいワインの帯にして、
   ヘッダー→写真→クイックナビ で赤が上下から写真を挟む形にする。 */
.hp-s.hp-s-wine .hp-quicknav { background: var(--hp-accent, #8e1f35); border-bottom: none; }
.hp-s.hp-s-wine .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.22); }
.hp-s.hp-s-wine .hp-qn-en { color: #fff; }
.hp-s.hp-s-wine .hp-qn-jp { color: rgba(255,255,255,.75); }
.hp-s.hp-s-wine .hp-link-text { color: #6b5157; border-color: #eeddde; }

/* ヒーロー（PCのみ文字を重ねる。SPは画像だけ＝金と同じ） */
.hp-s.hp-s-wine .hp-hero-catch { color: #4a3238; text-shadow: 0 1px 12px rgba(253,248,247,.85); }
.hp-s.hp-s-wine .hp-hero-en, .hp-s.hp-s-wine .hp-hero-area { color: #a2828a; }
@media (min-width: 640px) {
  .hp-s.hp-s-wine .hp-hero::after {
    background: radial-gradient(820px 560px at 24% 52%, rgba(253,248,247,.66), rgba(253,248,247,0) 68%);
  }
}

/* 見出し・本文 */
.hp-s.hp-s-wine .hp-h2 { color: #4a1420; }
.hp-s.hp-s-wine .hp-concept-text { color: #6b5157; }
.hp-s.hp-s-wine .hp-concept-img { border-color: #eeddde; }

/* コース料金: グループ名をワインの帯に白抜き（いちばん面積が変わるところ） */
.hp-s.hp-s-wine .hp-course-name { background: var(--hp-accent, #8e1f35); color: #fff; padding: 8px 10px; margin-bottom: 10px; }
.hp-s.hp-s-wine .hp-course-row { border-bottom: 1px solid #eedcdc; }
.hp-s.hp-s-wine .hp-course-min { color: #5d464a; }

/* セラピスト・本日の出勤の写真グリッド（重ねる影を茶からワインへ） */
.hp-s.hp-s-wine .hp-th-frame, .hp-s.hp-s-wine .hp-sched-thumb { background: #f6e9e9; }
.hp-s.hp-s-wine .hp-th-noimg, .hp-s.hp-s-wine .hp-sched-noimg { background: linear-gradient(160deg, #f6e9e9, #e9d2d5); }
.hp-s.hp-s-wine .hp-th-frame::after, .hp-s.hp-s-wine .hp-sched-thumb::after {
  background: linear-gradient(to top, rgba(58,10,22,.82), rgba(58,10,22,.36) 44%, rgba(58,10,22,0));
}
/* 出勤の日付はワインのバッジ（白抜き） */
.hp-s.hp-s-wine .hp-sched-date { background: var(--hp-accent, #8e1f35); border-color: var(--hp-accent, #8e1f35); color: #fff; }
/* 写真の上に載るアクセント文字（出勤時間・本日出勤）だけは明るい薔薇色に。
   --hp-accent-soft(#b8566a) は白地の罫線用の濃さなので、暗い重ね色の上では沈んでしまう
   （Playwright の実測スクショで判明・2026-08-11）。 */
.hp-s.hp-s-wine .hp-sched-time, .hp-s.hp-s-wine .hp-th-onduty { color: #f2b8c2; }

/* カード（お知らせ・クーポン・口コミ） */
.hp-s.hp-s-wine .hp-embed { border-color: #eeddde; }
.hp-s.hp-s-wine .hp-card { border-color: #eeddde; box-shadow: 0 6px 20px rgba(120,40,55,.07); }
.hp-s.hp-s-wine .hp-card-title { color: #4a3238; }
.hp-s.hp-s-wine .hp-card-body { color: #8a6b70; }
.hp-s.hp-s-wine .hp-card-meta { color: #b3949a; }
.hp-s.hp-s-wine .hp-info-row { border-bottom: 1px solid #eedcdc; }
.hp-s.hp-s-wine .hp-info-row dd { color: #5d464a; }

/* フッター・予約CTA（濃いワインで締める）。
   店名とリンクは --hp-accent-soft のままだと濃い地に沈むので明るい薔薇色に置き換える。 */
.hp-s.hp-s-wine .hp-footer { background: #4a1420; }
.hp-s.hp-s-wine .hp-footer-name { color: #e8b4bf; }
.hp-s.hp-s-wine .hp-footer-sub { color: #c4a7ac; }
.hp-s.hp-s-wine .hp-footer-sub a { color: #e8b4bf; }
.hp-s.hp-s-wine .hp-cta-tel { color: #5c1526; }
`;

const TYPE_S_BLUE = `/* ══════════ 配色3: ロイヤルブルー（2026-08-11）══════════
   ワインレッドとまったく同じ作り方の青版。DOM・レイアウト・余白はシャンパンゴールドと同じで、
   色の面積だけを大きく変える。地は白（#f7f9fd＝わずかに青みのある白）のまま＝写真が映える明るさは維持。

   ・見出し・飾り罫・価格・リンク・CTA は --hp-accent(#2a4a9e)/--hp-accent-soft(#7089cf) が効く
   ・ここに書くのは「CSS変数では表せない面」だけ:
       生成りの帯 → 淡い青の帯 / ヘッダー・クイックナビ → 濃紺の帯（白抜き）/
       コース名 → 青の帯（白抜き）/ フッター → 濃紺 / 写真に重ねる影 → 茶から紺へ

   ★ 付くクラスは HP_COLOR_VARIANTS.s の rootClass（hp-s-blue）。
   ★ 他の配色を1バイトも変えないため、上の .hp-s のルールには手を入れないこと。 */
.hp-s.hp-s-blue { background: #f7f9fd; color: #2f3646; }
/* 壁紙の羽根は青用に色を振った別画像（無くても下の霞だけで成立する） */
.hp-s.hp-s-blue::before { background-image: url('/hp-s/wallpaper-blue.webp'); }
/* セクションの地色（壁紙を透かすベール）。無地↔淡い青の帯で縞を作る */
.hp-s.hp-s-blue .hp-sec { background: rgba(247,249,253,.34); }
.hp-s.hp-s-blue .hp-sec-alt { background: rgba(233,238,248,.78); }
.hp-s.hp-s-blue .hp-sec-diary, .hp-s.hp-s-blue .hp-sec-coupon, .hp-s.hp-s-blue .hp-sec-free { background: rgba(233,238,248,.78); }
.hp-s.hp-s-blue .hp-sec-reviews, .hp-s.hp-s-blue .hp-sec-news, .hp-s.hp-s-blue .hp-sec-info { background: rgba(247,249,253,.34); }

/* トップバー: 地そのものを濃紺にして、ヘッダーだけで「青のサイト」と分かるようにする。
   地が濃くなるので、店名・ナビ・電話・ハンバーガーはすべて白系に置き換えること。 */
.hp-s.hp-s-blue .hp-topbar { background: rgba(29,44,99,.93); border-bottom: 1px solid rgba(255,255,255,.16); }
.hp-s.hp-s-blue.hp-scrolled .hp-topbar { background: #16204a; box-shadow: 0 2px 16px rgba(12,20,48,.32); }
.hp-s.hp-s-blue .hp-topbar-name { color: #fff; }
.hp-s.hp-s-blue .hp-topbar-nav a { color: rgba(255,255,255,.82); }
.hp-s.hp-s-blue .hp-topbar-nav a:hover { color: #fff; border-bottom-color: #fff; }
.hp-s.hp-s-blue .hp-topbar-tel, .hp-s.hp-s-blue .hp-drawer-btn { color: #fff; }
.hp-s.hp-s-blue .hp-doc-back { color: rgba(255,255,255,.85); }
/* ドロワー（開いた中身は明るいまま＝文字の読みやすさを優先） */
.hp-s.hp-s-blue .hp-drawer { background: rgba(247,249,253,.97); border-left: 1px solid #dae1f0; }
.hp-s.hp-s-blue .hp-drawer-list a { color: #4a5468; }
.hp-s.hp-s-blue .hp-drawer-list li + li a { border-top: 1px solid #e6ebf6; }
.hp-s.hp-s-blue .hp-drawer-foot { border-top: 1px solid #dae1f0; color: #7b869c; }
.hp-s.hp-s-blue .hp-drawer-terms, .hp-s.hp-s-blue .hp-drawer-close { color: #7b869c; }
.hp-s.hp-s-blue .hp-doc-p, .hp-s.hp-s-blue .hp-doc-list li { color: #4a5468; }
/* SPクイックナビ（ヒーロー直下の4分割）。ヘッダーより一段明るい青の帯で写真を上下から挟む。 */
.hp-s.hp-s-blue .hp-quicknav { background: var(--hp-accent, #2a4a9e); border-bottom: none; }
.hp-s.hp-s-blue .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.22); }
.hp-s.hp-s-blue .hp-qn-en { color: #fff; }
.hp-s.hp-s-blue .hp-qn-jp { color: rgba(255,255,255,.75); }
.hp-s.hp-s-blue .hp-link-text { color: #4a5468; border-color: #dfe5f2; }

/* ヒーロー（PCのみ文字を重ねる。SPは画像だけ＝金と同じ） */
.hp-s.hp-s-blue .hp-hero-catch { color: #2f3646; text-shadow: 0 1px 12px rgba(247,249,253,.85); }
.hp-s.hp-s-blue .hp-hero-en, .hp-s.hp-s-blue .hp-hero-area { color: #7b869c; }
@media (min-width: 640px) {
  .hp-s.hp-s-blue .hp-hero::after {
    background: radial-gradient(820px 560px at 24% 52%, rgba(247,249,253,.66), rgba(247,249,253,0) 68%);
  }
}

/* 見出し・本文 */
.hp-s.hp-s-blue .hp-h2 { color: #16204a; }
.hp-s.hp-s-blue .hp-concept-text { color: #4a5468; }
.hp-s.hp-s-blue .hp-concept-img { border-color: #dfe5f2; }

/* コース料金: グループ名を青の帯に白抜き（いちばん面積が変わるところ） */
.hp-s.hp-s-blue .hp-course-name { background: var(--hp-accent, #2a4a9e); color: #fff; padding: 8px 10px; margin-bottom: 10px; }
.hp-s.hp-s-blue .hp-course-row { border-bottom: 1px solid #dde4f0; }
.hp-s.hp-s-blue .hp-course-min { color: #454f66; }

/* セラピスト・本日の出勤の写真グリッド（重ねる影を茶から紺へ） */
.hp-s.hp-s-blue .hp-th-frame, .hp-s.hp-s-blue .hp-sched-thumb { background: #e9eef8; }
.hp-s.hp-s-blue .hp-th-noimg, .hp-s.hp-s-blue .hp-sched-noimg { background: linear-gradient(160deg, #e9eef8, #d3dcef); }
.hp-s.hp-s-blue .hp-th-frame::after, .hp-s.hp-s-blue .hp-sched-thumb::after {
  background: linear-gradient(to top, rgba(12,22,52,.82), rgba(12,22,52,.36) 44%, rgba(12,22,52,0));
}
/* 出勤の日付は青のバッジ（白抜き） */
.hp-s.hp-s-blue .hp-sched-date { background: var(--hp-accent, #2a4a9e); border-color: var(--hp-accent, #2a4a9e); color: #fff; }
/* 写真の上に載るアクセント文字は、暗い重ね色に負けないよう明るい空色に */
.hp-s.hp-s-blue .hp-sched-time, .hp-s.hp-s-blue .hp-th-onduty { color: #a9c4f2; }

/* カード（お知らせ・クーポン・口コミ） */
.hp-s.hp-s-blue .hp-embed { border-color: #dfe5f2; }
.hp-s.hp-s-blue .hp-card { border-color: #dfe5f2; box-shadow: 0 6px 20px rgba(30,50,110,.07); }
.hp-s.hp-s-blue .hp-card-title { color: #2f3646; }
.hp-s.hp-s-blue .hp-card-body { color: #6a7488; }
.hp-s.hp-s-blue .hp-card-meta { color: #97a0b3; }
.hp-s.hp-s-blue .hp-info-row { border-bottom: 1px solid #dde4f0; }
.hp-s.hp-s-blue .hp-info-row dd { color: #454f66; }

/* フッター・予約CTA（濃紺で締める） */
.hp-s.hp-s-blue .hp-footer { background: #16204a; }
.hp-s.hp-s-blue .hp-footer-name { color: #b7c8ee; }
.hp-s.hp-s-blue .hp-footer-sub { color: #a2accb; }
.hp-s.hp-s-blue .hp-footer-sub a { color: #b7c8ee; }
.hp-s.hp-s-blue .hp-cta-tel { color: #1d2c63; }
`;

const TYPE_S_EMERALD = `/* ══════════ 配色4: エメラルドグリーン（2026-08-11）══════════
   ワインレッド・ロイヤルブルーとまったく同じ作り方の緑版。
   地は白（#f6fbf9＝わずかに緑みのある白）のまま＝写真が映える明るさは維持。

   ・見出し・飾り罫・価格・リンク・CTA は --hp-accent(#0e7a5f)/--hp-accent-soft(#5fb39a) が効く
   ・ここに書くのは「CSS変数では表せない面」だけ:
       生成りの帯 → 淡い翡翠の帯 / ヘッダー・クイックナビ → 深緑の帯（白抜き）/
       コース名 → 緑の帯（白抜き）/ フッター → 深緑 / 写真に重ねる影 → 茶から深緑へ

   ★ 付くクラスは HP_COLOR_VARIANTS.s の rootClass（hp-s-emerald）。
   ★ 他の配色を1バイトも変えないため、上の .hp-s のルールには手を入れないこと。 */
.hp-s.hp-s-emerald { background: #f6fbf9; color: #2c3a36; }
/* 壁紙の羽根は緑用に色を振った別画像（無くても下の霞だけで成立する） */
.hp-s.hp-s-emerald::before { background-image: url('/hp-s/wallpaper-emerald.webp'); }
/* セクションの地色（壁紙を透かすベール）。無地↔淡い翡翠の帯で縞を作る */
.hp-s.hp-s-emerald .hp-sec { background: rgba(246,251,249,.34); }
.hp-s.hp-s-emerald .hp-sec-alt { background: rgba(230,242,238,.78); }
.hp-s.hp-s-emerald .hp-sec-diary, .hp-s.hp-s-emerald .hp-sec-coupon, .hp-s.hp-s-emerald .hp-sec-free { background: rgba(230,242,238,.78); }
.hp-s.hp-s-emerald .hp-sec-reviews, .hp-s.hp-s-emerald .hp-sec-news, .hp-s.hp-s-emerald .hp-sec-info { background: rgba(246,251,249,.34); }

/* トップバー: 地そのものを深緑にして、ヘッダーだけで「緑のサイト」と分かるようにする。
   地が濃くなるので、店名・ナビ・電話・ハンバーガーはすべて白系に置き換えること。 */
.hp-s.hp-s-emerald .hp-topbar { background: rgba(13,59,49,.93); border-bottom: 1px solid rgba(255,255,255,.16); }
.hp-s.hp-s-emerald.hp-scrolled .hp-topbar { background: #0a3229; box-shadow: 0 2px 16px rgba(8,40,32,.32); }
.hp-s.hp-s-emerald .hp-topbar-name { color: #fff; }
.hp-s.hp-s-emerald .hp-topbar-nav a { color: rgba(255,255,255,.82); }
.hp-s.hp-s-emerald .hp-topbar-nav a:hover { color: #fff; border-bottom-color: #fff; }
.hp-s.hp-s-emerald .hp-topbar-tel, .hp-s.hp-s-emerald .hp-drawer-btn { color: #fff; }
.hp-s.hp-s-emerald .hp-doc-back { color: rgba(255,255,255,.85); }
/* ドロワー（開いた中身は明るいまま＝文字の読みやすさを優先） */
.hp-s.hp-s-emerald .hp-drawer { background: rgba(246,251,249,.97); border-left: 1px solid #d5e7e0; }
.hp-s.hp-s-emerald .hp-drawer-list a { color: #46564f; }
.hp-s.hp-s-emerald .hp-drawer-list li + li a { border-top: 1px solid #e2efea; }
.hp-s.hp-s-emerald .hp-drawer-foot { border-top: 1px solid #d5e7e0; color: #7a8d86; }
.hp-s.hp-s-emerald .hp-drawer-terms, .hp-s.hp-s-emerald .hp-drawer-close { color: #7a8d86; }
.hp-s.hp-s-emerald .hp-doc-p, .hp-s.hp-s-emerald .hp-doc-list li { color: #46564f; }
/* SPクイックナビ（ヒーロー直下の4分割）。ヘッダーより一段明るい緑の帯で写真を上下から挟む。 */
.hp-s.hp-s-emerald .hp-quicknav { background: var(--hp-accent, #0e7a5f); border-bottom: none; }
.hp-s.hp-s-emerald .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.22); }
.hp-s.hp-s-emerald .hp-qn-en { color: #fff; }
.hp-s.hp-s-emerald .hp-qn-jp { color: rgba(255,255,255,.75); }
.hp-s.hp-s-emerald .hp-link-text { color: #46564f; border-color: #dbeae5; }

/* ヒーロー（PCのみ文字を重ねる。SPは画像だけ＝金と同じ） */
.hp-s.hp-s-emerald .hp-hero-catch { color: #2c3a36; text-shadow: 0 1px 12px rgba(246,251,249,.85); }
.hp-s.hp-s-emerald .hp-hero-en, .hp-s.hp-s-emerald .hp-hero-area { color: #7a8d86; }
@media (min-width: 640px) {
  .hp-s.hp-s-emerald .hp-hero::after {
    background: radial-gradient(820px 560px at 24% 52%, rgba(246,251,249,.66), rgba(246,251,249,0) 68%);
  }
}

/* 見出し・本文 */
.hp-s.hp-s-emerald .hp-h2 { color: #0d3b31; }
.hp-s.hp-s-emerald .hp-concept-text { color: #46564f; }
.hp-s.hp-s-emerald .hp-concept-img { border-color: #dbeae5; }

/* コース料金: グループ名を緑の帯に白抜き（いちばん面積が変わるところ） */
.hp-s.hp-s-emerald .hp-course-name { background: var(--hp-accent, #0e7a5f); color: #fff; padding: 8px 10px; margin-bottom: 10px; }
.hp-s.hp-s-emerald .hp-course-row { border-bottom: 1px solid #d9e9e3; }
.hp-s.hp-s-emerald .hp-course-min { color: #3f524b; }

/* セラピスト・本日の出勤の写真グリッド（重ねる影を茶から深緑へ） */
.hp-s.hp-s-emerald .hp-th-frame, .hp-s.hp-s-emerald .hp-sched-thumb { background: #e6f2ee; }
.hp-s.hp-s-emerald .hp-th-noimg, .hp-s.hp-s-emerald .hp-sched-noimg { background: linear-gradient(160deg, #e6f2ee, #cfe3db); }
.hp-s.hp-s-emerald .hp-th-frame::after, .hp-s.hp-s-emerald .hp-sched-thumb::after {
  background: linear-gradient(to top, rgba(8,40,32,.82), rgba(8,40,32,.36) 44%, rgba(8,40,32,0));
}
/* 出勤の日付は緑のバッジ（白抜き） */
.hp-s.hp-s-emerald .hp-sched-date { background: var(--hp-accent, #0e7a5f); border-color: var(--hp-accent, #0e7a5f); color: #fff; }
/* 写真の上に載るアクセント文字は、暗い重ね色に負けないよう明るい翡翠色に */
.hp-s.hp-s-emerald .hp-sched-time, .hp-s.hp-s-emerald .hp-th-onduty { color: #8fd8c2; }

/* カード（お知らせ・クーポン・口コミ） */
.hp-s.hp-s-emerald .hp-embed { border-color: #dbeae5; }
.hp-s.hp-s-emerald .hp-card { border-color: #dbeae5; box-shadow: 0 6px 20px rgba(20,80,65,.07); }
.hp-s.hp-s-emerald .hp-card-title { color: #2c3a36; }
.hp-s.hp-s-emerald .hp-card-body { color: #66766f; }
.hp-s.hp-s-emerald .hp-card-meta { color: #93a49d; }
.hp-s.hp-s-emerald .hp-info-row { border-bottom: 1px solid #d9e9e3; }
.hp-s.hp-s-emerald .hp-info-row dd { color: #3f524b; }

/* フッター・予約CTA（深緑で締める） */
.hp-s.hp-s-emerald .hp-footer { background: #0d3b31; }
.hp-s.hp-s-emerald .hp-footer-name { color: #9fd7c4; }
.hp-s.hp-s-emerald .hp-footer-sub { color: #a4bab2; }
.hp-s.hp-s-emerald .hp-footer-sub a { color: #9fd7c4; }
.hp-s.hp-s-emerald .hp-cta-tel { color: #0d3b31; }
`;

const TYPE_A_MAGENTA = `/* ══════════ タイプA 配色: ディープマゼンタ（2026-08-12 全面改訂）══════════
   「文字の色だけ変わっていて見分けが付かない」を避けるため、タイプSのワインレッドと同じ考え方で
   “色の面積”そのものを赤に振った版。DOM・レイアウト・余白はアイボリーブラックと完全に同じ。

   ・地を黒（#17161a）から濃い臙脂（#2c0b1b）へ。壁紙のベールも赤に寄せるので、
     黒ジェムの壁紙がそのまま「暗い赤の宝石」に見える。
   ・ヘッダー＝濃紅、クイックナビ＝マゼンタの帯、コース名＝マゼンタの帯に白抜き、
     出勤の日付＝マゼンタのバッジ、フッター／電話CTA＝濃紅。これで赤の面積が一気に増える。
   ・暗い赤の地の上では --hp-accent(#c2477e) / --hp-accent-soft(#9c3663) は沈むので、
     小さな文字（価格・出勤時間・もっと見る等）だけ明るい薔薇色に置き換える
     （ワインレッドで実測して分かった対処と同じ）。
   ・アクセント変数そのものは hpSite.ts の HP_COLOR_VARIANTS.a が正なので、ここでは触らない。
   ★ 他の配色を1バイトも変えないため、上の .hp-a のルールには手を入れず、
     すべてこのブロックの上書き（.hp-a.hp-a-magenta ＝詳細度が1段上）で表現すること。 */
.hp-a.hp-a-magenta { background: #2c0b1b; color: #f5e3ec; }
.hp-a.hp-a-magenta .hp-sec-alt { background: #3d0f24; }
.hp-a.hp-a-magenta .hp-sec + .hp-sec:not(.hp-sec-alt) { border-top: 1px solid #551933; }
/* 壁紙（黒ジェム）を赤いベールで透かす＝ページ全体が赤みを帯びる */
.hp-a.hp-a-magenta .hp-wallpaper::after { background: rgba(44,11,27,.80); }
.hp-a.hp-a-magenta.hp-has-wallpaper .hp-sec-alt { background: rgba(61,15,36,.78); }
.hp-a.hp-a-magenta.hp-has-wallpaper .hp-card { background: rgba(66,17,39,.82); }
.hp-a.hp-a-magenta.hp-has-wallpaper .hp-topbar { background: rgba(90,13,42,.88); }

/* ヘッダー: 地そのものを濃紅にして、ヘッダーだけで「赤のサイト」と分かるようにする */
.hp-a.hp-a-magenta .hp-topbar { background: rgba(90,13,42,.94); border-bottom: 1px solid rgba(255,255,255,.14); }
.hp-a.hp-a-magenta.hp-scrolled .hp-topbar { background: #5a0d2a; box-shadow: 0 2px 18px rgba(30,4,14,.45); }
.hp-a.hp-a-magenta .hp-topbar-name { color: #fff; }
.hp-a.hp-a-magenta .hp-topbar-nav a { color: rgba(255,255,255,.82); }
.hp-a.hp-a-magenta .hp-topbar-nav a:hover { color: #fff; border-bottom-color: #fff; }
.hp-a.hp-a-magenta .hp-topbar-tel, .hp-a.hp-a-magenta .hp-drawer-btn { color: #fff; }
.hp-a.hp-a-magenta .hp-doc-back { color: rgba(255,255,255,.85); }
/* SPクイックナビ: マゼンタの帯に白抜き。ヘッダー→写真→この帯 で赤が写真を挟む */
.hp-a.hp-a-magenta .hp-quicknav { background: linear-gradient(90deg, #7d0f38, #b3305f); border-bottom: none; }
.hp-a.hp-a-magenta .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.24); }
.hp-a.hp-a-magenta .hp-qn-en { color: #fff; }
.hp-a.hp-a-magenta .hp-qn-jp { color: rgba(255,255,255,.76); }
/* ドロワー */
.hp-a.hp-a-magenta .hp-drawer { background: #3d0f24; border-left: 1px solid #6b2340; }
.hp-a.hp-a-magenta .hp-drawer-list a { color: #e7c9d7; }
.hp-a.hp-a-magenta .hp-drawer-list li + li a { border-top: 1px solid #57192f; }
.hp-a.hp-a-magenta .hp-drawer-foot { border-top: 1px solid #6b2340; color: #c093a6; }
.hp-a.hp-a-magenta .hp-drawer-tel { color: #f0a7c6; }
.hp-a.hp-a-magenta .hp-drawer-terms, .hp-a.hp-a-magenta .hp-drawer-close { color: #c093a6; }
.hp-a.hp-a-magenta .hp-doc-h { color: #f0a7c6; }
.hp-a.hp-a-magenta .hp-doc-p, .hp-a.hp-a-magenta .hp-doc-list li { color: #e7c9d7; }
.hp-a.hp-a-magenta .hp-link-text { color: #e7c9d7; border-color: #6b2340; }

/* 見出し・飾り罫・ヒーロー */
.hp-a.hp-a-magenta .hp-en, .hp-a.hp-a-magenta .hp-hero-en { color: #ef8fb8; }
.hp-a.hp-a-magenta .hp-rule { border-top-color: #d4548d; }
.hp-a.hp-a-magenta .hp-rule::after { border-top-color: rgba(212,84,141,.45); }
.hp-a.hp-a-magenta .hp-hero-catch { color: #e7c9d7; }
.hp-a.hp-a-magenta .hp-concept-text { color: #e7c9d7; }
.hp-a.hp-a-magenta .hp-concept-img { border-color: #6b2340; }

/* コース料金: グループ名をマゼンタの帯に白抜き（いちばん面積が変わるところ） */
.hp-a.hp-a-magenta .hp-course-name { background: linear-gradient(90deg, #7d0f38, #b3305f); color: #fff; padding: 8px 10px; margin-bottom: 10px; }
.hp-a.hp-a-magenta .hp-course-row { border-bottom: 1px solid #57192f; }
.hp-a.hp-a-magenta .hp-course-price { color: #ef8fb8; }

/* 出勤・セラピスト（写真に重ねる影も黒から臙脂へ） */
.hp-a.hp-a-magenta .hp-sched-thumb, .hp-a.hp-a-magenta .hp-th-frame { background: #3d0f24; }
.hp-a.hp-a-magenta .hp-sched-noimg, .hp-a.hp-a-magenta .hp-th-noimg { background: linear-gradient(160deg, #431129, #5c1a38); }
.hp-a.hp-a-magenta .hp-sched-thumb::after {
  background: linear-gradient(to top, rgba(48,5,22,.86), rgba(48,5,22,.38) 46%, rgba(48,5,22,0));
}
/* 日付はマゼンタのバッジ（白抜き） */
.hp-a.hp-a-magenta .hp-sched-date { background: #8e1244; border-color: #b3305f; color: #fff; }
/* 写真の上／暗い地に載る小さな文字は明るい薔薇色に置き換える（accent-soft では沈む） */
.hp-a.hp-a-magenta .hp-sched-time { color: #f4a9c6; }
.hp-a.hp-a-magenta .hp-th-name { color: #f5e3ec; }
.hp-a.hp-a-magenta .hp-th-age { color: #dd8fae; }
.hp-a.hp-a-magenta .hp-th-catch { color: #c093a6; }
.hp-a.hp-a-magenta .hp-th-badge { color: #e7c9d7; border-color: #7a2848; }
.hp-a.hp-a-magenta .hp-th-onduty { color: #f4a9c6; border-color: #b3305f; }
.hp-a.hp-a-magenta .hp-more { color: #f0a7c6; border-bottom-color: #b3305f; }

/* カード・店舗情報 */
.hp-a.hp-a-magenta .hp-embed { border-color: #6b2340; }
.hp-a.hp-a-magenta .hp-card { background: #3d0f24; border-color: #6b2340; }
.hp-a.hp-a-magenta .hp-coupon-discount { color: #ef8fb8; }
.hp-a.hp-a-magenta .hp-card-body { color: #c093a6; }
.hp-a.hp-a-magenta .hp-card-meta { color: #8f6577; }
.hp-a.hp-a-magenta .hp-info-row { border-bottom: 1px solid #57192f; }
.hp-a.hp-a-magenta .hp-info-row dt { color: #dd8fae; }
.hp-a.hp-a-magenta .hp-info-row dd { color: #e7c9d7; }

/* フッター・予約CTA（濃紅で締める） */
.hp-a.hp-a-magenta .hp-footer { background: #5a0d2a; }
.hp-a.hp-a-magenta .hp-footer-name { color: #f4a9c6; }
.hp-a.hp-a-magenta .hp-footer-sub { color: #c093a6; }
.hp-a.hp-a-magenta .hp-footer-sub a { color: #f4a9c6; }
.hp-a.hp-a-magenta .hp-cta-tel { background: #5a0d2a; color: #fff; border-top-color: #b3305f; }
.hp-a.hp-a-magenta .hp-cta-line { color: #ffffff; }
`;

const TYPE_A_SIENNA = `/* ══════════ タイプA 配色: ローシェンナ（2026-08-12 全面改訂）══════════
   ディープマゼンタと同じ考え方で “色の面積” ごと配色に振った版。
   DOM・レイアウト・余白はアイボリーブラックと完全に同じ。

   ・ローシェンナ＝土から採れる「黄みの茶（黄土色）」の顔料。赤ではない。
     マゼンタ＝青みの赤、アイボリーブラック＝黒＋シャンパン。この3つが並んでも別物に見えるよう、
     ここは黄土〜琥珀の帯で埋める。
   ・地を黒（#17161a）から焼けた土色（#402f14）へ。壁紙のベールも黄土に寄せる。
   ・ヘッダー＝濃い黄土、クイックナビ＝黄土〜琥珀の帯、コース名＝同じ帯に白抜き、
     出勤の日付＝黄土のバッジ、フッター／電話CTA＝濃い黄土。
   ・暗い土色の上では --hp-accent(#d9944f) / --hp-accent-soft(#b3763c) のうち soft が沈むので、
     小さな文字（年齢・出勤時間・項目名など）だけ明るい杏色に置き換える。
   ・アクセント変数そのものは hpSite.ts の HP_COLOR_VARIANTS.a が正なので、ここでは触らない。
   ★ 他の配色を1バイトも変えないため、上の .hp-a のルールには手を入れず、
     すべてこのブロックの上書き（.hp-a.hp-a-sienna ＝詳細度が1段上）で表現すること。 */
.hp-a.hp-a-sienna { background: #402f14; color: #f8ecd8; }
.hp-a.hp-a-sienna .hp-sec-alt { background: #553f1d; }
.hp-a.hp-a-sienna .hp-sec + .hp-sec:not(.hp-sec-alt) { border-top: 1px solid #6d5228; }
/* 壁紙（黒ジェム）を黄土のベールで透かす＝ページ全体が土の色に染まる */
.hp-a.hp-a-sienna .hp-wallpaper::after { background: rgba(64,47,20,.78); }
.hp-a.hp-a-sienna.hp-has-wallpaper .hp-sec-alt { background: rgba(85,63,29,.78); }
.hp-a.hp-a-sienna.hp-has-wallpaper .hp-card { background: rgba(90,67,31,.82); }
.hp-a.hp-a-sienna.hp-has-wallpaper .hp-topbar { background: rgba(106,74,28,.88); }

/* ヘッダー: 地そのものを濃い黄土にして、ヘッダーだけで「土色のサイト」と分かるようにする */
.hp-a.hp-a-sienna .hp-topbar { background: rgba(106,74,28,.94); border-bottom: 1px solid rgba(255,255,255,.14); }
.hp-a.hp-a-sienna.hp-scrolled .hp-topbar { background: #6a4a1c; box-shadow: 0 2px 18px rgba(28,20,6,.45); }
.hp-a.hp-a-sienna .hp-topbar-name { color: #fff; }
.hp-a.hp-a-sienna .hp-topbar-nav a { color: rgba(255,255,255,.82); }
.hp-a.hp-a-sienna .hp-topbar-nav a:hover { color: #fff; border-bottom-color: #fff; }
.hp-a.hp-a-sienna .hp-topbar-tel, .hp-a.hp-a-sienna .hp-drawer-btn { color: #fff; }
.hp-a.hp-a-sienna .hp-doc-back { color: rgba(255,255,255,.85); }
/* SPクイックナビ: 黄土〜琥珀の帯に白抜き */
.hp-a.hp-a-sienna .hp-quicknav { background: linear-gradient(90deg, #8a5c1c, #bf8f3f); border-bottom: none; }
.hp-a.hp-a-sienna .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.24); }
.hp-a.hp-a-sienna .hp-qn-en { color: #fff; }
.hp-a.hp-a-sienna .hp-qn-jp { color: rgba(255,255,255,.78); }
/* ドロワー */
.hp-a.hp-a-sienna .hp-drawer { background: #553f1d; border-left: 1px solid #8a6a33; }
.hp-a.hp-a-sienna .hp-drawer-list a { color: #ecd9b4; }
.hp-a.hp-a-sienna .hp-drawer-list li + li a { border-top: 1px solid #6d5228; }
.hp-a.hp-a-sienna .hp-drawer-foot { border-top: 1px solid #8a6a33; color: #c6a878; }
.hp-a.hp-a-sienna .hp-drawer-tel { color: #f2c489; }
.hp-a.hp-a-sienna .hp-drawer-terms, .hp-a.hp-a-sienna .hp-drawer-close { color: #c6a878; }
.hp-a.hp-a-sienna .hp-doc-h { color: #f2c489; }
.hp-a.hp-a-sienna .hp-doc-p, .hp-a.hp-a-sienna .hp-doc-list li { color: #ecd9b4; }
.hp-a.hp-a-sienna .hp-link-text { color: #ecd9b4; border-color: #8a6a33; }

/* 見出し・飾り罫・ヒーロー */
.hp-a.hp-a-sienna .hp-en, .hp-a.hp-a-sienna .hp-hero-en { color: #f2c489; }
.hp-a.hp-a-sienna .hp-rule { border-top-color: #e0ae55; }
.hp-a.hp-a-sienna .hp-rule::after { border-top-color: rgba(224,174,85,.45); }
.hp-a.hp-a-sienna .hp-hero-catch { color: #ecd9b4; }
.hp-a.hp-a-sienna .hp-concept-text { color: #ecd9b4; }
.hp-a.hp-a-sienna .hp-concept-img { border-color: #8a6a33; }

/* コース料金: グループ名を黄土の帯に白抜き（いちばん面積が変わるところ） */
.hp-a.hp-a-sienna .hp-course-name { background: linear-gradient(90deg, #8a5c1c, #bf8f3f); color: #fff; padding: 8px 10px; margin-bottom: 10px; }
.hp-a.hp-a-sienna .hp-course-row { border-bottom: 1px solid #6d5228; }
.hp-a.hp-a-sienna .hp-course-price { color: #f2c489; }

/* 出勤・セラピスト（写真に重ねる影も黒から焦げ茶へ） */
.hp-a.hp-a-sienna .hp-sched-thumb, .hp-a.hp-a-sienna .hp-th-frame { background: #553f1d; }
.hp-a.hp-a-sienna .hp-sched-noimg, .hp-a.hp-a-sienna .hp-th-noimg { background: linear-gradient(160deg, #4b3818, #66502a); }
.hp-a.hp-a-sienna .hp-sched-thumb::after {
  background: linear-gradient(to top, rgba(40,28,8,.86), rgba(40,28,8,.38) 46%, rgba(40,28,8,0));
}
/* 日付は黄土のバッジ（白抜き） */
.hp-a.hp-a-sienna .hp-sched-date { background: #a07a28; border-color: #bf8f3f; color: #fff; }
/* 写真の上／暗い地に載る小さな文字は明るい杏色に置き換える（accent-soft では沈む） */
.hp-a.hp-a-sienna .hp-sched-time { color: #f7d5a3; }
.hp-a.hp-a-sienna .hp-th-name { color: #f8ecd8; }
.hp-a.hp-a-sienna .hp-th-age { color: #e3bb78; }
.hp-a.hp-a-sienna .hp-th-catch { color: #c6a878; }
.hp-a.hp-a-sienna .hp-th-badge { color: #ecd9b4; border-color: #8a6c2e; }
.hp-a.hp-a-sienna .hp-th-onduty { color: #f7d5a3; border-color: #bf8f3f; }
.hp-a.hp-a-sienna .hp-more { color: #f2c489; border-bottom-color: #bf8f3f; }

/* カード・店舗情報 */
.hp-a.hp-a-sienna .hp-embed { border-color: #8a6a33; }
.hp-a.hp-a-sienna .hp-card { background: #553f1d; border-color: #8a6a33; }
.hp-a.hp-a-sienna .hp-coupon-discount { color: #f2c489; }
.hp-a.hp-a-sienna .hp-card-body { color: #c6a878; }
.hp-a.hp-a-sienna .hp-card-meta { color: #97814f; }
.hp-a.hp-a-sienna .hp-info-row { border-bottom: 1px solid #6d5228; }
.hp-a.hp-a-sienna .hp-info-row dt { color: #e3bb78; }
.hp-a.hp-a-sienna .hp-info-row dd { color: #ecd9b4; }

/* フッター・予約CTA（濃い黄土で締める） */
.hp-a.hp-a-sienna .hp-footer { background: #6a4a1c; }
.hp-a.hp-a-sienna .hp-footer-name { color: #f7d5a3; }
.hp-a.hp-a-sienna .hp-footer-sub { color: #c6a878; }
.hp-a.hp-a-sienna .hp-footer-sub a { color: #f7d5a3; }
.hp-a.hp-a-sienna .hp-cta-tel { background: #6a4a1c; color: #fff; border-top-color: #bf8f3f; }
.hp-a.hp-a-sienna .hp-cta-line { color: #402f14; }
`;

const TYPE_A_UMBER = `/* ══════════ タイプA 配色: バーントアンバー（2026-08-12 全面改訂）══════════
   ディープマゼンタ・ローシェンナと同じ考え方で “色の面積” ごと配色に振った版。
   DOM・レイアウト・余白はアイボリーブラックと完全に同じ。

   ・バーントアンバー＝アンバー（琥珀土）を焼いた「赤みの濃い焦げ茶」の顔料。
     ローシェンナが黄みの明るい土色なのに対し、こちらは一段暗く・赤茶寄り・くすんだ色。
     マゼンタ（鮮やかな青みの赤）とも彩度がまるで違うので、4色並べても取り違えない。
   ・地を黒（#17161a）から焦げ茶（#2e1b13）へ。壁紙のベールも焦げ茶に寄せる。
   ・ヘッダー＝濃い焦げ茶、クイックナビ＝アンバーの帯、コース名＝同じ帯に白抜き、
     出勤の日付＝アンバーのバッジ、フッター／電話CTA＝濃い焦げ茶。
   ・暗い焦げ茶の上では --hp-accent(#a85433) / --hp-accent-soft(#8a4227) が沈むので、
     小さな文字（価格・出勤時間・もっと見る等）だけ明るい杏茶色に置き換える。
   ・アクセント変数そのものは hpSite.ts の HP_COLOR_VARIANTS.a が正なので、ここでは触らない。
   ★ 他の配色を1バイトも変えないため、上の .hp-a のルールには手を入れず、
     すべてこのブロックの上書き（.hp-a.hp-a-umber ＝詳細度が1段上）で表現すること。 */
.hp-a.hp-a-umber { background: #2e1b13; color: #f6e3d6; }
.hp-a.hp-a-umber .hp-sec-alt { background: #3f251a; }
.hp-a.hp-a-umber .hp-sec + .hp-sec:not(.hp-sec-alt) { border-top: 1px solid #573225; }
/* 壁紙（黒ジェム）を焦げ茶のベールで透かす＝ページ全体が煤けた赤茶に染まる */
.hp-a.hp-a-umber .hp-wallpaper::after { background: rgba(46,27,19,.80); }
.hp-a.hp-a-umber.hp-has-wallpaper .hp-sec-alt { background: rgba(63,37,26,.78); }
.hp-a.hp-a-umber.hp-has-wallpaper .hp-card { background: rgba(68,40,28,.82); }
.hp-a.hp-a-umber.hp-has-wallpaper .hp-topbar { background: rgba(94,47,29,.88); }

/* ヘッダー: 地そのものを濃い焦げ茶にして、ヘッダーだけで「焦げ茶のサイト」と分かるようにする */
.hp-a.hp-a-umber .hp-topbar { background: rgba(94,47,29,.94); border-bottom: 1px solid rgba(255,255,255,.14); }
.hp-a.hp-a-umber.hp-scrolled .hp-topbar { background: #5e2f1d; box-shadow: 0 2px 18px rgba(24,12,7,.45); }
.hp-a.hp-a-umber .hp-topbar-name { color: #fff; }
.hp-a.hp-a-umber .hp-topbar-nav a { color: rgba(255,255,255,.82); }
.hp-a.hp-a-umber .hp-topbar-nav a:hover { color: #fff; border-bottom-color: #fff; }
.hp-a.hp-a-umber .hp-topbar-tel, .hp-a.hp-a-umber .hp-drawer-btn { color: #fff; }
.hp-a.hp-a-umber .hp-doc-back { color: rgba(255,255,255,.85); }
/* SPクイックナビ: アンバーの帯に白抜き */
.hp-a.hp-a-umber .hp-quicknav { background: linear-gradient(90deg, #6e3520, #a85433); border-bottom: none; }
.hp-a.hp-a-umber .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.24); }
.hp-a.hp-a-umber .hp-qn-en { color: #fff; }
.hp-a.hp-a-umber .hp-qn-jp { color: rgba(255,255,255,.78); }
/* ドロワー */
.hp-a.hp-a-umber .hp-drawer { background: #3f251a; border-left: 1px solid #6e4030; }
.hp-a.hp-a-umber .hp-drawer-list a { color: #e8c9b4; }
.hp-a.hp-a-umber .hp-drawer-list li + li a { border-top: 1px solid #573225; }
.hp-a.hp-a-umber .hp-drawer-foot { border-top: 1px solid #6e4030; color: #bf9682; }
.hp-a.hp-a-umber .hp-drawer-tel { color: #e8a882; }
.hp-a.hp-a-umber .hp-drawer-terms, .hp-a.hp-a-umber .hp-drawer-close { color: #bf9682; }
.hp-a.hp-a-umber .hp-doc-h { color: #e8a882; }
.hp-a.hp-a-umber .hp-doc-p, .hp-a.hp-a-umber .hp-doc-list li { color: #e8c9b4; }
.hp-a.hp-a-umber .hp-link-text { color: #e8c9b4; border-color: #6e4030; }

/* 見出し・飾り罫・ヒーロー */
.hp-a.hp-a-umber .hp-en, .hp-a.hp-a-umber .hp-hero-en { color: #e8a882; }
.hp-a.hp-a-umber .hp-rule { border-top-color: #c2703f; }
.hp-a.hp-a-umber .hp-rule::after { border-top-color: rgba(194,112,63,.45); }
.hp-a.hp-a-umber .hp-hero-catch { color: #e8c9b4; }
.hp-a.hp-a-umber .hp-concept-text { color: #e8c9b4; }
.hp-a.hp-a-umber .hp-concept-img { border-color: #6e4030; }

/* コース料金: グループ名をアンバーの帯に白抜き（いちばん面積が変わるところ） */
.hp-a.hp-a-umber .hp-course-name { background: linear-gradient(90deg, #6e3520, #a85433); color: #fff; padding: 8px 10px; margin-bottom: 10px; }
.hp-a.hp-a-umber .hp-course-row { border-bottom: 1px solid #573225; }
.hp-a.hp-a-umber .hp-course-price { color: #e8a882; }

/* 出勤・セラピスト（写真に重ねる影も黒から焦げ茶へ） */
.hp-a.hp-a-umber .hp-sched-thumb, .hp-a.hp-a-umber .hp-th-frame { background: #3f251a; }
.hp-a.hp-a-umber .hp-sched-noimg, .hp-a.hp-a-umber .hp-th-noimg { background: linear-gradient(160deg, #45291c, #5e3a28); }
.hp-a.hp-a-umber .hp-sched-thumb::after {
  background: linear-gradient(to top, rgba(35,17,9,.86), rgba(35,17,9,.38) 46%, rgba(35,17,9,0));
}
/* 日付はアンバーのバッジ（白抜き） */
.hp-a.hp-a-umber .hp-sched-date { background: #8a4227; border-color: #a85433; color: #fff; }
/* 写真の上／暗い地に載る小さな文字は明るい杏茶色に置き換える（accent-soft では沈む） */
.hp-a.hp-a-umber .hp-sched-time { color: #f0bc9a; }
.hp-a.hp-a-umber .hp-th-name { color: #f6e3d6; }
.hp-a.hp-a-umber .hp-th-age { color: #d99a76; }
.hp-a.hp-a-umber .hp-th-catch { color: #bf9682; }
.hp-a.hp-a-umber .hp-th-badge { color: #e8c9b4; border-color: #7d4a35; }
.hp-a.hp-a-umber .hp-th-onduty { color: #f0bc9a; border-color: #a85433; }
.hp-a.hp-a-umber .hp-more { color: #e8a882; border-bottom-color: #a85433; }

/* カード・店舗情報 */
.hp-a.hp-a-umber .hp-embed { border-color: #6e4030; }
.hp-a.hp-a-umber .hp-card { background: #3f251a; border-color: #6e4030; }
.hp-a.hp-a-umber .hp-coupon-discount { color: #e8a882; }
.hp-a.hp-a-umber .hp-card-body { color: #bf9682; }
.hp-a.hp-a-umber .hp-card-meta { color: #8f6852; }
.hp-a.hp-a-umber .hp-info-row { border-bottom: 1px solid #573225; }
.hp-a.hp-a-umber .hp-info-row dt { color: #d99a76; }
.hp-a.hp-a-umber .hp-info-row dd { color: #e8c9b4; }

/* フッター・予約CTA（濃い焦げ茶で締める） */
.hp-a.hp-a-umber .hp-footer { background: #5e2f1d; }
.hp-a.hp-a-umber .hp-footer-name { color: #f0bc9a; }
.hp-a.hp-a-umber .hp-footer-sub { color: #bf9682; }
.hp-a.hp-a-umber .hp-footer-sub a { color: #f0bc9a; }
.hp-a.hp-a-umber .hp-cta-tel { background: #5e2f1d; color: #fff; border-top-color: #a85433; }
.hp-a.hp-a-umber .hp-cta-line { color: #2e1b13; }
`;

/* ══════════ タイプB（CLEAN）の配色 ══════════
   2026-08-13: 6色（文字の色だけ変わる）→4色（地色ごと作り分け）へ整理。S・Aと同じ考え方。

   4色とも「その色のときだけ足すブロック」として書く。上の .hp-b（共通ブロック）は一切触らない
   ＝タイプB以外・タイプBの他の配色の出力は1バイトも変わらない。振る場所は4色でそろえてある:

     地色 → 交互の帯（.hp-sec-alt）→ ヘッダー → SPクイックナビの帯 → コース名の帯 →
     出勤日付のバッジ → 枠線 → フッター → 電話CTA

   ★ .hp-sec-alt・フッターの地色・クイックナビの帯はタイプBの共通CSSには無かった。
     4色ぶんここで足している（＝タイプBを選んだ店だけが受け取る）。
   ★ タイプBは白いカードに小さな文字を載せる作りなので、A（暗い地）とは逆に
     --hp-accent-deep を「白地で読める濃さ」に落としてある（値は hpSite.ts が正）。
     ここでは面積の色（帯・フッター）に、それより一段濃い色を直接置いている。 */

const TYPE_B_GREEN = `/* ── 配色: リーフグリーン（若葉を溶かした生成り地）── */
.hp-b.hp-b-green { background: #f7f9f4; color: #33382f; }
.hp-b.hp-b-green .hp-sec-alt { background: #e9f0e4; }
/* ヘッダー（すりガラスの地色ごと生成り緑に寄せる） */
.hp-b.hp-b-green .hp-topbar { background: rgba(247,249,244,.9); border-bottom: 1px solid #dde6d6; }
.hp-b.hp-b-green .hp-topbar-name, .hp-b.hp-b-green .hp-drawer-btn { color: #33382f; }
/* SPクイックナビ: 若葉の帯に白抜き。ヘッダー→写真→この帯 で色が写真を挟む */
.hp-b.hp-b-green .hp-quicknav { background: linear-gradient(90deg, #416b3e, #57804f); border-bottom: none; }
.hp-b.hp-b-green .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.32); }
.hp-b.hp-b-green .hp-qn-en { color: #fff; }
.hp-b.hp-b-green .hp-qn-jp { color: rgba(255,255,255,.8); }
/* ドロワー */
.hp-b.hp-b-green .hp-drawer { background: #f7f9f4; border-left: 1px solid #dde6d6; }
.hp-b.hp-b-green .hp-drawer-list a { color: #56604f; }
.hp-b.hp-b-green .hp-drawer-list li + li a { border-top: 1px dashed #dde6d6; }
.hp-b.hp-b-green .hp-drawer-foot { border-top: 1px solid #dde6d6; color: #97a091; }
.hp-b.hp-b-green .hp-drawer-terms, .hp-b.hp-b-green .hp-drawer-close, .hp-b.hp-b-green .hp-doc-back { color: #97a091; }
/* ヒーロー・本文 */
.hp-b.hp-b-green .hp-hero-catch, .hp-b.hp-b-green .hp-concept-text,
.hp-b.hp-b-green .hp-card-body, .hp-b.hp-b-green .hp-info-row dd,
.hp-b.hp-b-green .hp-doc-p, .hp-b.hp-b-green .hp-doc-list li,
.hp-b.hp-b-green .hp-link-text { color: #56604f; }
.hp-b.hp-b-green .hp-hero-area, .hp-b.hp-b-green .hp-th-age,
.hp-b.hp-b-green .hp-card-meta { color: #97a091; }
.hp-b.hp-b-green .hp-th-catch { color: #86907f; }
.hp-b.hp-b-green .hp-th-name { color: #33382f; }
.hp-b.hp-b-green .hp-th-badge { color: #6f7a68; }
/* コース料金: グループ名を若葉の帯に白抜き（いちばん面積が変わるところ） */
.hp-b.hp-b-green .hp-course-name { background: linear-gradient(90deg, #416b3e, #57804f); color: #fff; border-radius: 999px; padding: 8px 18px; }
/* 枠線をまとめて若葉色へ（白カード＋生成りの枠 という作りは崩さない） */
.hp-b.hp-b-green .hp-concept-text, .hp-b.hp-b-green .hp-card, .hp-b.hp-b-green .hp-info,
.hp-b.hp-b-green .hp-embed, .hp-b.hp-b-green .hp-th-frame, .hp-b.hp-b-green .hp-th-badge,
.hp-b.hp-b-green .hp-link-text, .hp-b.hp-b-green .hp-sched-time, .hp-b.hp-b-green .hp-course-row,
.hp-b.hp-b-green .hp-cta-tel { border-color: #dde6d6; }
.hp-b.hp-b-green .hp-info-row, .hp-b.hp-b-green .hp-sched-row { border-bottom-color: #dde6d6; }
.hp-b.hp-b-green .hp-th-noimg { background: linear-gradient(160deg, #e9f0e4, #dae5d4); }
/* 出勤の日付・出勤中バッジはベタ塗り（白抜きの文字が読めるよう deep 側の濃さで塗る） */
.hp-b.hp-b-green .hp-sched-date, .hp-b.hp-b-green .hp-th-onduty { background: #4e7a4a; color: #fff; }
/* フッター・予約CTA（濃い若葉で締める） */
.hp-b.hp-b-green .hp-footer { background: #4e7a4a; }
.hp-b.hp-b-green .hp-footer-name, .hp-b.hp-b-green .hp-footer-sub a { color: #fff; }
.hp-b.hp-b-green .hp-footer-sub { color: rgba(255,255,255,.84); }
.hp-b.hp-b-green .hp-cta-tel { background: #fff; color: #33382f; }
/* PCの全幅ヘッダーは不透明に（共通ブロックの注記参照） */
@media (min-width: 768px) { .hp-b.hp-b-green .hp-topbar { background: #f7f9f4; } }

/* ── 壁紙（水彩の葉・2026-08-13）──────────────────────────
   リーフグリーンだけに敷く。タイプSと同じ「固定レイヤー2枚」方式:
     ::before = 壁紙（タイル状に繰り返す） / ::after = 生成り緑のベール
   どちらも position:fixed なので flex アイテムにならず、並べ替え（order）に影響しない。
   負の z-index が使えるのは .hp-root の isolation:isolate があるおかげ（COMMON 参照）。
   ★ 地色を transparent にしないと壁紙が root の背景に隠れる。
   ★ ベールは厚め（＝うっすら）。タイプBは白いカードに小さな文字を載せる作りなので、
     柄を出しすぎると本文が読みにくくなる。濃さを変えるときは ::after の alpha だけ触る。
   ★ 2026-08-13: 他の3配色にも同じ柄を「色相だけ回した画像」で敷いた
     （生成は tools-gen-hp-b-wallpaper.py）。各配色ブロックに同じ形で書いてあるので、
     濃さ（::after の alpha）を変えるときは4か所とも見ること。
     共通の .hp-b には書かないこと（他ひな形・他配色の出力を変えないため）。 */
.hp-b.hp-b-green { background-color: transparent; }
.hp-b.hp-b-green::before {
  content: ''; position: fixed; inset: 0; z-index: -2; pointer-events: none;
  background: url('/hp-b/wallpaper-green.webp') center / 420px auto repeat;
}
@media (min-width: 768px) { .hp-b.hp-b-green::before { background-size: 640px auto; } }
.hp-b.hp-b-green::after {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: rgba(247,249,244,.80);
}
/* 帯は壁紙を透かす（無地のセクションは地色を持たないので、そのまま柄が出る） */
.hp-b.hp-b-green .hp-sec-alt { background: rgba(233,240,228,.68); }
`;

const TYPE_B_TERRA = `/* ── 配色: テラコッタ（素焼き・温かいベージュ地）── */
.hp-b.hp-b-terra { background: #fdf4ef; color: #43352c; }
.hp-b.hp-b-terra .hp-sec-alt { background: #f8e7db; }
/* ヘッダー（すりガラスの地色ごとベージュに寄せる） */
.hp-b.hp-b-terra .hp-topbar { background: rgba(253,244,239,.9); border-bottom: 1px solid #f0dbc9; }
.hp-b.hp-b-terra .hp-topbar-name, .hp-b.hp-b-terra .hp-drawer-btn { color: #43352c; }
/* SPクイックナビ: テラコッタの帯に白抜き。ヘッダー→写真→この帯 で色が写真を挟む */
.hp-b.hp-b-terra .hp-quicknav { background: linear-gradient(90deg, #a8552c, #b05f3b); border-bottom: none; }
.hp-b.hp-b-terra .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.32); }
.hp-b.hp-b-terra .hp-qn-en { color: #fff; }
.hp-b.hp-b-terra .hp-qn-jp { color: rgba(255,255,255,.8); }
/* ドロワー */
.hp-b.hp-b-terra .hp-drawer { background: #fdf4ef; border-left: 1px solid #f0dbc9; }
.hp-b.hp-b-terra .hp-drawer-list a { color: #6b5344; }
.hp-b.hp-b-terra .hp-drawer-list li + li a { border-top: 1px dashed #f0dbc9; }
.hp-b.hp-b-terra .hp-drawer-foot { border-top: 1px solid #f0dbc9; color: #a8907e; }
.hp-b.hp-b-terra .hp-drawer-terms, .hp-b.hp-b-terra .hp-drawer-close, .hp-b.hp-b-terra .hp-doc-back { color: #a8907e; }
/* ヒーロー・本文 */
.hp-b.hp-b-terra .hp-hero-catch, .hp-b.hp-b-terra .hp-concept-text,
.hp-b.hp-b-terra .hp-card-body, .hp-b.hp-b-terra .hp-info-row dd,
.hp-b.hp-b-terra .hp-doc-p, .hp-b.hp-b-terra .hp-doc-list li,
.hp-b.hp-b-terra .hp-link-text { color: #6b5344; }
.hp-b.hp-b-terra .hp-hero-area, .hp-b.hp-b-terra .hp-th-age,
.hp-b.hp-b-terra .hp-card-meta { color: #a8907e; }
.hp-b.hp-b-terra .hp-th-catch { color: #947a68; }
.hp-b.hp-b-terra .hp-th-name { color: #43352c; }
.hp-b.hp-b-terra .hp-th-badge { color: #8a6f5d; }
/* コース料金: グループ名をテラコッタの帯に白抜き（いちばん面積が変わるところ） */
.hp-b.hp-b-terra .hp-course-name { background: linear-gradient(90deg, #a8552c, #b05f3b); color: #fff; border-radius: 999px; padding: 8px 18px; }
/* 枠線をまとめてベージュへ（白カード＋生成りの枠 という作りは崩さない） */
.hp-b.hp-b-terra .hp-concept-text, .hp-b.hp-b-terra .hp-card, .hp-b.hp-b-terra .hp-info,
.hp-b.hp-b-terra .hp-embed, .hp-b.hp-b-terra .hp-th-frame, .hp-b.hp-b-terra .hp-th-badge,
.hp-b.hp-b-terra .hp-link-text, .hp-b.hp-b-terra .hp-sched-time, .hp-b.hp-b-terra .hp-course-row,
.hp-b.hp-b-terra .hp-cta-tel { border-color: #f0dbc9; }
.hp-b.hp-b-terra .hp-info-row, .hp-b.hp-b-terra .hp-sched-row { border-bottom-color: #f0dbc9; }
.hp-b.hp-b-terra .hp-th-noimg { background: linear-gradient(160deg, #f5e2d5, #ecd3c0); }
/* 出勤の日付・出勤中バッジはベタ塗り（白抜きの文字が読めるよう deep 側の濃さで塗る） */
.hp-b.hp-b-terra .hp-sched-date, .hp-b.hp-b-terra .hp-th-onduty { background: #ab5b38; color: #fff; }
/* フッター・予約CTA（濃い素焼き色で締める） */
.hp-b.hp-b-terra .hp-footer { background: #ab5b38; }
.hp-b.hp-b-terra .hp-footer-name, .hp-b.hp-b-terra .hp-footer-sub a { color: #fff; }
.hp-b.hp-b-terra .hp-footer-sub { color: rgba(255,255,255,.84); }
.hp-b.hp-b-terra .hp-cta-tel { background: #fff; color: #43352c; }
/* PCの全幅ヘッダーは不透明に（共通ブロックの注記参照） */
@media (min-width: 768px) { .hp-b.hp-b-terra .hp-topbar { background: #fdf4ef; } }

/* ── 壁紙（水彩の葉・テラコッタ）── 2026-08-13
   リーフグリーンと同じ柄を、色相だけテラコッタへ回した画像に差し替えたもの
   （生成: tools-gen-hp-b-wallpaper.py）。作りはリーフグリーンの節と完全に同じ。
   濃さを変えるときは ::after の alpha だけ触ること（4配色そろえてある）。 */
.hp-b.hp-b-terra { background-color: transparent; }
.hp-b.hp-b-terra::before {
  content: ''; position: fixed; inset: 0; z-index: -2; pointer-events: none;
  background: url('/hp-b/wallpaper-terra.webp') center / 420px auto repeat;
}
@media (min-width: 768px) { .hp-b.hp-b-terra::before { background-size: 640px auto; } }
.hp-b.hp-b-terra::after {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: rgba(253,244,239,.80);
}
/* 帯は壁紙を透かす（無地のセクションは地色を持たないので、そのまま柄が出る） */
.hp-b.hp-b-terra .hp-sec-alt { background: rgba(248,231,219,.68); }
`;

const TYPE_B_BLUE = `/* ── 配色: スモークブルー（霞んだ水色地）── */
.hp-b.hp-b-blue { background: #f3f7fb; color: #2c3742; }
.hp-b.hp-b-blue .hp-sec-alt { background: #e6eef7; }
.hp-b.hp-b-blue .hp-topbar { background: rgba(243,247,251,.9); border-bottom: 1px solid #d9e5f1; }
.hp-b.hp-b-blue .hp-topbar-name, .hp-b.hp-b-blue .hp-drawer-btn { color: #2c3742; }
.hp-b.hp-b-blue .hp-quicknav { background: linear-gradient(90deg, #2a527a, #4a7aa8); border-bottom: none; }
.hp-b.hp-b-blue .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.32); }
.hp-b.hp-b-blue .hp-qn-en { color: #fff; }
.hp-b.hp-b-blue .hp-qn-jp { color: rgba(255,255,255,.8); }
.hp-b.hp-b-blue .hp-drawer { background: #f3f7fb; border-left: 1px solid #d9e5f1; }
.hp-b.hp-b-blue .hp-drawer-list a { color: #4a5a68; }
.hp-b.hp-b-blue .hp-drawer-list li + li a { border-top: 1px dashed #d9e5f1; }
.hp-b.hp-b-blue .hp-drawer-foot { border-top: 1px solid #d9e5f1; color: #8b9aa8; }
.hp-b.hp-b-blue .hp-drawer-terms, .hp-b.hp-b-blue .hp-drawer-close, .hp-b.hp-b-blue .hp-doc-back { color: #8b9aa8; }
.hp-b.hp-b-blue .hp-hero-catch, .hp-b.hp-b-blue .hp-concept-text,
.hp-b.hp-b-blue .hp-card-body, .hp-b.hp-b-blue .hp-info-row dd,
.hp-b.hp-b-blue .hp-doc-p, .hp-b.hp-b-blue .hp-doc-list li,
.hp-b.hp-b-blue .hp-link-text { color: #4a5a68; }
.hp-b.hp-b-blue .hp-hero-area, .hp-b.hp-b-blue .hp-th-age,
.hp-b.hp-b-blue .hp-card-meta { color: #8b9aa8; }
.hp-b.hp-b-blue .hp-th-catch { color: #7b8b99; }
.hp-b.hp-b-blue .hp-th-name { color: #2c3742; }
.hp-b.hp-b-blue .hp-th-badge { color: #6f8090; }
.hp-b.hp-b-blue .hp-course-name { background: linear-gradient(90deg, #2a527a, #4a7aa8); color: #fff; border-radius: 999px; padding: 8px 18px; }
.hp-b.hp-b-blue .hp-concept-text, .hp-b.hp-b-blue .hp-card, .hp-b.hp-b-blue .hp-info,
.hp-b.hp-b-blue .hp-embed, .hp-b.hp-b-blue .hp-th-frame, .hp-b.hp-b-blue .hp-th-badge,
.hp-b.hp-b-blue .hp-link-text, .hp-b.hp-b-blue .hp-sched-time, .hp-b.hp-b-blue .hp-course-row,
.hp-b.hp-b-blue .hp-cta-tel { border-color: #d9e5f1; }
.hp-b.hp-b-blue .hp-info-row, .hp-b.hp-b-blue .hp-sched-row { border-bottom-color: #d9e5f1; }
.hp-b.hp-b-blue .hp-th-noimg { background: linear-gradient(160deg, #e4edf6, #d3e0ee); }
.hp-b.hp-b-blue .hp-sched-date, .hp-b.hp-b-blue .hp-th-onduty { background: #2f5a86; color: #fff; }
.hp-b.hp-b-blue .hp-footer { background: #2f5a86; }
.hp-b.hp-b-blue .hp-footer-name, .hp-b.hp-b-blue .hp-footer-sub a { color: #fff; }
.hp-b.hp-b-blue .hp-footer-sub { color: rgba(255,255,255,.84); }
.hp-b.hp-b-blue .hp-cta-tel { background: #fff; color: #2c3742; }
/* PCの全幅ヘッダーは不透明に（共通ブロックの注記参照） */
@media (min-width: 768px) { .hp-b.hp-b-blue .hp-topbar { background: #f3f7fb; } }

/* ── 壁紙（水彩の葉・スモークブルー）── 2026-08-13
   リーフグリーンと同じ柄を、色相だけスモークブルーへ回した画像に差し替えたもの
   （生成: tools-gen-hp-b-wallpaper.py）。作りはリーフグリーンの節と完全に同じ。
   濃さを変えるときは ::after の alpha だけ触ること（4配色そろえてある）。 */
.hp-b.hp-b-blue { background-color: transparent; }
.hp-b.hp-b-blue::before {
  content: ''; position: fixed; inset: 0; z-index: -2; pointer-events: none;
  background: url('/hp-b/wallpaper-blue.webp') center / 420px auto repeat;
}
@media (min-width: 768px) { .hp-b.hp-b-blue::before { background-size: 640px auto; } }
.hp-b.hp-b-blue::after {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: rgba(243,247,251,.80);
}
/* 帯は壁紙を透かす（無地のセクションは地色を持たないので、そのまま柄が出る） */
.hp-b.hp-b-blue .hp-sec-alt { background: rgba(230,238,247,.68); }
`;

const TYPE_B_PINK = `/* ── 配色: ロゼピンク（淡い薔薇色地）── */
.hp-b.hp-b-pink { background: #fdf3f6; color: #43303a; }
.hp-b.hp-b-pink .hp-sec-alt { background: #f9e6ed; }
.hp-b.hp-b-pink .hp-topbar { background: rgba(253,243,246,.9); border-bottom: 1px solid #f2d8e1; }
.hp-b.hp-b-pink .hp-topbar-name, .hp-b.hp-b-pink .hp-drawer-btn { color: #43303a; }
.hp-b.hp-b-pink .hp-quicknav { background: linear-gradient(90deg, #8a3253, #b0567a); border-bottom: none; }
.hp-b.hp-b-pink .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.32); }
.hp-b.hp-b-pink .hp-qn-en { color: #fff; }
.hp-b.hp-b-pink .hp-qn-jp { color: rgba(255,255,255,.8); }
.hp-b.hp-b-pink .hp-drawer { background: #fdf3f6; border-left: 1px solid #f2d8e1; }
.hp-b.hp-b-pink .hp-drawer-list a { color: #6b4f5b; }
.hp-b.hp-b-pink .hp-drawer-list li + li a { border-top: 1px dashed #f2d8e1; }
.hp-b.hp-b-pink .hp-drawer-foot { border-top: 1px solid #f2d8e1; color: #ab8d99; }
.hp-b.hp-b-pink .hp-drawer-terms, .hp-b.hp-b-pink .hp-drawer-close, .hp-b.hp-b-pink .hp-doc-back { color: #ab8d99; }
.hp-b.hp-b-pink .hp-hero-catch, .hp-b.hp-b-pink .hp-concept-text,
.hp-b.hp-b-pink .hp-card-body, .hp-b.hp-b-pink .hp-info-row dd,
.hp-b.hp-b-pink .hp-doc-p, .hp-b.hp-b-pink .hp-doc-list li,
.hp-b.hp-b-pink .hp-link-text { color: #6b4f5b; }
.hp-b.hp-b-pink .hp-hero-area, .hp-b.hp-b-pink .hp-th-age,
.hp-b.hp-b-pink .hp-card-meta { color: #ab8d99; }
.hp-b.hp-b-pink .hp-th-catch { color: #9a7c88; }
.hp-b.hp-b-pink .hp-th-name { color: #43303a; }
.hp-b.hp-b-pink .hp-th-badge { color: #8f6f7c; }
.hp-b.hp-b-pink .hp-course-name { background: linear-gradient(90deg, #8a3253, #b0567a); color: #fff; border-radius: 999px; padding: 8px 18px; }
.hp-b.hp-b-pink .hp-concept-text, .hp-b.hp-b-pink .hp-card, .hp-b.hp-b-pink .hp-info,
.hp-b.hp-b-pink .hp-embed, .hp-b.hp-b-pink .hp-th-frame, .hp-b.hp-b-pink .hp-th-badge,
.hp-b.hp-b-pink .hp-link-text, .hp-b.hp-b-pink .hp-sched-time, .hp-b.hp-b-pink .hp-course-row,
.hp-b.hp-b-pink .hp-cta-tel { border-color: #f2d8e1; }
.hp-b.hp-b-pink .hp-info-row, .hp-b.hp-b-pink .hp-sched-row { border-bottom-color: #f2d8e1; }
.hp-b.hp-b-pink .hp-th-noimg { background: linear-gradient(160deg, #f7e2ea, #eed0dc); }
.hp-b.hp-b-pink .hp-sched-date, .hp-b.hp-b-pink .hp-th-onduty { background: #97385c; color: #fff; }
.hp-b.hp-b-pink .hp-footer { background: #97385c; }
.hp-b.hp-b-pink .hp-footer-name, .hp-b.hp-b-pink .hp-footer-sub a { color: #fff; }
.hp-b.hp-b-pink .hp-footer-sub { color: rgba(255,255,255,.84); }
.hp-b.hp-b-pink .hp-cta-tel { background: #fff; color: #43303a; }
/* PCの全幅ヘッダーは不透明に（共通ブロックの注記参照） */
@media (min-width: 768px) { .hp-b.hp-b-pink .hp-topbar { background: #fdf3f6; } }

/* ── 壁紙（水彩の葉・ロゼピンク）── 2026-08-13
   リーフグリーンと同じ柄を、色相だけロゼピンクへ回した画像に差し替えたもの
   （生成: tools-gen-hp-b-wallpaper.py）。作りはリーフグリーンの節と完全に同じ。
   濃さを変えるときは ::after の alpha だけ触ること（4配色そろえてある）。 */
.hp-b.hp-b-pink { background-color: transparent; }
.hp-b.hp-b-pink::before {
  content: ''; position: fixed; inset: 0; z-index: -2; pointer-events: none;
  background: url('/hp-b/wallpaper-pink.webp') center / 420px auto repeat;
}
@media (min-width: 768px) { .hp-b.hp-b-pink::before { background-size: 640px auto; } }
.hp-b.hp-b-pink::after {
  content: ''; position: fixed; inset: 0; z-index: -1; pointer-events: none;
  background: rgba(253,243,246,.80);
}
/* 帯は壁紙を透かす（無地のセクションは地色を持たないので、そのまま柄が出る） */
.hp-b.hp-b-pink .hp-sec-alt { background: rgba(249,230,237,.68); }
`;

const TYPE_C_MONO = `/* ── 配色: オフホワイト（無彩色。MODEの素の姿＝白地に黒の太罫） ── */
/* 交互の地色（帯）。地色より一段濃いだけの控えめな面にして、太罫の強さを邪魔しない */
/* 帯は壁紙（白大理石）をうっすら透かす（2026-08-13・タイプBと同じ考え方） */
.hp-c.hp-c-mono .hp-sec-alt { background: rgba(219,211,191,.72); }
/* SPクイックナビ: ヒーロー直下の色帯。ここがいちばん面積の大きい「配色そのもの」 */
.hp-c.hp-c-mono .hp-quicknav { background: linear-gradient(90deg, #16161a, #3a3a42); border-bottom: 2px solid var(--hp-ink); }
.hp-c.hp-c-mono .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.3); }
.hp-c.hp-c-mono .hp-qn-en { color: #fff; }
.hp-c.hp-c-mono .hp-qn-jp { color: rgba(255,255,255,.78); opacity: 1; }
`;

const TYPE_C_PURPLE = `/* ── 配色: フクシャパープル（淡い藤色地に濃い葡萄色の太罫） ── */
/* 交互の地色（帯）。地色より一段濃いだけの控えめな面にして、太罫の強さを邪魔しない */
/* 帯は壁紙（白大理石）をうっすら透かす（2026-08-13・タイプBと同じ考え方）。
   地色を藤色に濃くしたのに合わせ、帯はさらに一段濃い藤色（2026-08-13） */
.hp-c.hp-c-purple .hp-sec-alt { background: rgba(226,187,233,.72); }
/* SPクイックナビ: ヒーロー直下の色帯。ここがいちばん面積の大きい「配色そのもの」 */
.hp-c.hp-c-purple .hp-quicknav { background: linear-gradient(90deg, #8a1290, #b52ab5); border-bottom: 2px solid var(--hp-ink); }
.hp-c.hp-c-purple .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.3); }
.hp-c.hp-c-purple .hp-qn-en { color: #fff; }
.hp-c.hp-c-purple .hp-qn-jp { color: rgba(255,255,255,.78); opacity: 1; }
`;

const TYPE_C_YELLOW = `/* ── 配色: ネープルイエロー（クリーム地に焦げ茶の太罫） ── */
/* 交互の地色（帯）。地色より一段濃いだけの控えめな面にして、太罫の強さを邪魔しない */
/* 帯は壁紙（白大理石）をうっすら透かす（2026-08-13・タイプBと同じ考え方） */
.hp-c.hp-c-yellow .hp-sec-alt { background: rgba(239,220,142,.72); }
/* SPクイックナビ: ヒーロー直下の色帯。ここがいちばん面積の大きい「配色そのもの」 */
.hp-c.hp-c-yellow .hp-quicknav { background: linear-gradient(90deg, #f7d95e, #f2ca3c); border-bottom: 2px solid var(--hp-ink); }
.hp-c.hp-c-yellow .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(36,28,4,.28); }
.hp-c.hp-c-yellow .hp-qn-en { color: var(--hp-ink, #241c04); }
.hp-c.hp-c-yellow .hp-qn-jp { color: rgba(36,28,4,.74); opacity: 1; }
/* ★ 黄だけの例外: 面が明るいので白抜きが読めない（実測 1.58）。
   面に載る文字だけ焦げ茶へ落とす（実測 8.35）。他の3色は白抜きのままでよい。 */
.hp-c.hp-c-yellow .hp-course-name { color: var(--hp-ink, #241c04); }
.hp-c.hp-c-yellow .hp-cta-line { color: var(--hp-ink, #241c04); }
`;

const TYPE_C_RED = `/* ── 配色: スカーレット（血色のよい生成り地に濃い緋色の太罫） ── */
/* 交互の地色（帯）。地色より一段濃いだけの控えめな面にして、太罫の強さを邪魔しない */
/* 帯は壁紙（白大理石）をうっすら透かす（2026-08-13・タイプBと同じ考え方） */
.hp-c.hp-c-red .hp-sec-alt { background: rgba(246,192,173,.72); }
/* SPクイックナビ: ヒーロー直下の色帯。ここがいちばん面積の大きい「配色そのもの」 */
.hp-c.hp-c-red .hp-quicknav { background: linear-gradient(90deg, #b41c00, #e02508); border-bottom: 2px solid var(--hp-ink); }
.hp-c.hp-c-red .hp-qn-item + .hp-qn-item { border-left: 1px solid rgba(255,255,255,.3); }
.hp-c.hp-c-red .hp-qn-en { color: #fff; }
.hp-c.hp-c-red .hp-qn-jp { color: rgba(255,255,255,.78); opacity: 1; }
`;

export const TEMPLATE_VARIANT_CSS: Record<string, string> = {
  'hp-s-wine': TYPE_S_WINE,
  'hp-s-blue': TYPE_S_BLUE,
  'hp-s-emerald': TYPE_S_EMERALD,
  'hp-a-magenta': TYPE_A_MAGENTA,
  'hp-a-sienna':  TYPE_A_SIENNA,
  'hp-a-umber':   TYPE_A_UMBER,
  'hp-b-green':   TYPE_B_GREEN,
  'hp-b-terra':   TYPE_B_TERRA,
  'hp-b-blue':    TYPE_B_BLUE,
  'hp-b-pink':    TYPE_B_PINK,
  'hp-c-mono':    TYPE_C_MONO,
  'hp-c-purple':  TYPE_C_PURPLE,
  'hp-c-yellow':  TYPE_C_YELLOW,
  'hp-c-red':     TYPE_C_RED,
};
