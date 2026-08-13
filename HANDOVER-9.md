# 引き継ぎメモ 第9便（2026-08-13 深夜 時点）

対象: `este-portal`（フクエス・ポータル）の **公式HP事業**。
前便（第8便）以降にやったことと、次の担当がすぐ動けるだけの前提をまとめる。

---

## 0. まず守ること（作業ルール）

| 項目 | 決まり |
|---|---|
| コミット／プッシュ | **必ずオーナー（カッキーさん）が実行する。** AIは編集と検証まで。最後に PowerShell のコピペ用ブロックを渡すこと |
| ファイルの渡し方 | クラウド側で編集 → `SendUserFile` → デバイスブリッジで `C:\Users\joltc\Desktop\este-portal\...` に書き戻し。その後オーナーが commit |
| SQL | 必要な場合は **push より前** に実行してもらう（今回の作業では発生していない） |
| 検証の深さ | 「しっかり」＝ Playwright で DOM／実測比較、「軽め」＝ 編集＋`npx tsc --noEmit`。オーナーが指定する |
| Supabase | クラウドのサンドボックスからは **到達できない**。実データが要る検証はフィクスチャページを立てる（後述） |

### 検証用フィクスチャの作り方

`src/app/hp/zzfixture/page.tsx` を一時的に作り、偽の `HpPageData` を流して `HpTemplate` を描画する。
検証が終わったら **必ず消す**（コミットしない）。

- `_` で始まるフォルダは Next がプライベート扱いにしてルーティングしないので、`zzfixture` のような名前にすること
- Playwright は `chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })` で起動する
- 開発サーバは `npx next dev -p 3000`。`pkill -f "next dev"` は終了コード144でシェルごと落ちるので、使うなら `sleep 3` を挟んで再実行

---

## 1. この期間にやったこと（コミット順・古い順）

```
8b71923 タイプAのセラピスト表示をトップと一覧ページで出し分け
8a33f86 タイプAのセラピスト横スクロールをSPで2.2枚見える幅に
d0751c8 タイプAのブロック上下の余白を3/4に
8ce1e4e タイプAのディープマゼンタを赤基調のレイアウトに全面改訂
72a567f タイプAのローシェンナを黄土色基調のレイアウトに全面改訂
a40f566 タイプAのバーントアンバーを焦げ茶基調のレイアウトに全面改訂
b393bdd タイプAの配色別キービジュアルを4色ぶん同梱してデモとLPに配線
9732793 タイプAのキービジュアルを配色ごとの別撮り写真に差し替え
7912b6d デザイン一覧のタイプS説明文を1行に収まる長さへ
```

**タイプA（LUXE）のひな形はこれで一区切り。** 4配色すべて完成している。

---

## 2. ひな形と配色の現状

`src/app/lib/hpSite.ts` の `HP_COLOR_VARIANTS` が **正**。

| ひな形 | 名前 | 配色 |
|---|---|---|
| s | GRACE / タイプS（フラッグシップ） | シャンパンゴールド `gold` ／ ワインレッド `wine` ／ ロイヤルブルー `blue` ／ エメラルドグリーン `emerald` |
| a | LUXE / タイプA（高級・しっとり） | アイボリーブラック `gold` ／ ディープマゼンタ `magenta` ／ ローシェンナ `sienna` ／ バーントアンバー `umber` |
| b | CLEAN / タイプB | 6色（**未整理・見分けが付きにくいまま**） |
| c | タイプC | 6色（**未整理**） |

> ★ タイプAの1色目のキーは `gold` のまま（表示名だけ「アイボリーブラック」）。
> **キーを変えると既存店のデータが壊れる**ので触らないこと。

---

## 3. 配色を「地色ごと」作り分ける仕組み（いちばん大事）

一言でいうと **DOMは全ひな形・全配色で共通、違いはCSSだけ**。

1. `HP_COLOR_VARIANTS` の各色に `rootClass`（例 `hp-a-magenta`）を持たせる
2. `hpColorRootClass()` → `HpShell` がルート要素にそのクラスを付ける
3. `styles.ts` の `TEMPLATE_VARIANT_CSS[rootClass]` を、**その配色のときだけ**テンプレートCSSに追記する

```ts
// styles.ts 末尾
export const TEMPLATE_VARIANT_CSS: Record<string, string> = {
  'hp-s-wine': TYPE_S_WINE,
  'hp-s-blue': TYPE_S_BLUE,
  'hp-s-emerald': TYPE_S_EMERALD,
  'hp-a-magenta': TYPE_A_MAGENTA,
  'hp-a-sienna':  TYPE_A_SIENNA,
  'hp-a-umber':   TYPE_A_UMBER,
};
```

**なぜこの形か**: 以前ワインレッドのCSSを `TEMPLATE_CSS.s` に直接足したら、無関係なシャンパンゴールドのHTMLが約13KB太った。
配色ごとに切り出して「その色のときだけ足す」ことで、**他の配色の出力は1バイトも変わらない**（Playwrightで実測確認済み）。

### 新しい配色を1つ足す手順

1. `hpSite.ts` の `HP_COLOR_VARIANTS` に1行（`key` / `label` / `css` / `rootClass`）
2. `styles.ts` に `const TYPE_X_YYY = \`...\`` を書いて `TEMPLATE_VARIANT_CSS` に登録
3. キービジュアルを用意するなら `hpSite.ts` の `HP_BUNDLED_HERO_COLORS` と `DesignThumb.tsx` の `HP_THUMB_COLORS` にもキーを足す

### 配色を作るときのコツ（今回の学び）

- **アクセント1色を差し替えるだけでは絶対に見分けが付かない。** オーナーからの最初の指摘がこれ。
  地色・帯（`.hp-sec-alt`）・ヘッダー・クイックナビ・コース名の帯・出勤日付のバッジ・フッター・電話CTA、
  この**面積の大きい所を全部その色に振る**こと
- 暗い地の上では `--hp-accent-soft` は沈む。**写真の上や暗い地に載る小さな文字だけ明るい色に置き換える**
  （価格・出勤時間・年齢・もっと見る・項目名・フッター店名 など）。Playwrightのスクショで実測して判断した
- 名前に忠実に。ローシェンナは**赤ではなく黄土色**（オーナーから訂正が入った）。バーントアンバーは赤みの焦げ茶

---

## 4. タイプA（LUXE）の仕様

### レイアウト

- PC（≥768px）: **ヘッダーとヒーローは画面全幅**。`width:100vw` ＋ `margin-left/right: calc(50% - 50vw)` で
  `max-width:1024px` の枠を食い破る。はみ出しは `/hp/layout.tsx` の `overflow-x-clip` が受ける
  （★ `overflow-x: hidden` にすると縦が `auto` になって sticky ヘッダーが壊れる。**clip 必須**）
- PC共通ヘッダーに NEWS / SYSTEM / THERAPIST / ACCESS のナビ
- SPはクイックナビ（4分割アイコン）を**ヒーロー画像の上**に置く（`HP_ORDER_QUICKNAV_ABOVE_HERO = -2`）
- ブロック（`.hp-sec`）の上下余白は **SP 36px / PC 57px**（従来の3/4）。
  バナー帯は上0、文書ページは26/35pxで、比率だけ揃えてある
- 見出し・本文・「もっと見る」は中央寄せ。コース料金とお知らせのフォントサイズはタイプSと同一
- ヒーロー下の「中洲・天神・薬院 12:00〜LAST」は非表示（`.hp-a .hp-hero-area` を視覚的に隠す。
  `display:none` ではなくスクリーンリーダー用に残してある）
- SPのヒーロー左右に出ていた白線は `.hp-a .hp-hero { overflow:hidden }` ＋ `img { transform: scale(1.008) }` で解消
  （原因は画像そのものの端の明るさ。レイアウトの隙間ではなかった）

### セラピストの見せ方

| 場所 | 形 |
|---|---|
| トップ | **横スクロール**。SPは `flex-basis: 41vw` ＋ 左右 `-22px` マージン/`+22px` パディングで **2.2枚見える**（スクロールできると一目で分かる） |
| トップ（PC） | 折り返して `flex-basis:176px`・`gap:5px`＝「本日の出勤」の4列と完全に同じ寸法 |
| `/therapist`（マルチページ一覧） | **グリッド**（SP2列・PC4列）。`<TherapistCards grid />` で切り替え |

額縁（`.hp-th-frame` の枠線）は写真を大きく見せるため撤去済み。

### 壁紙

`public/hp-a/wallpaper.webp`（黒ジェムの継ぎ目なしパターン）を **タイル状に繰り返す**。
`background-size: 520px auto`（PCは680px）。配色ごとに `.hp-wallpaper::after` のベール色を変えていて、
これで同じ壁紙が「暗い赤の宝石」「土の中の石」などに見える。

---

## 5. キービジュアル（写真）の管理

### 置き場所と命名

```
public/hp-s/   hero-pc{-色}.webp (2400×960) / hero-sp{-色}.webp (1080×760) / thumb-{色}.webp (640×360) / wallpaper{-色}.webp
public/hp-a/   hero-pc-{色}.webp / hero-sp-{色}.webp / thumb-{色}.webp / wallpaper.webp
```

- タイプSの `gold` だけ**接尾辞なし**（`hero-pc.webp`）。2026-08-11 の既存データを引き継ぐため
- タイプAは全色に接尾辞あり（`hero-pc-gold.webp` など）
- **元の .jpg は git に入れない**（S/Aとも同じ運用）。オーナーのローカルの `public/hp-*/` に置いたまま

### 生成スクリプト `tools-gen-hp-a-kv.py`

`public/hp-a/` に置いた4枚の元写真から、PC/SP/サムネの12枚を書き出す。

```
黒demo.jpg      → gold（アイボリーブラック）
deepmazetop.jpg → magenta
rosyennapc.jpg  → sienna
a-bantop.jpg    → umber
```

```powershell
python tools-gen-hp-a-kv.py
```

> 最初は「1枚の写真の暗部にだけ配色の色を差す」方式で4色を作ったが、
> **並べたときの差が弱い**とオーナーから指摘があり、**配色ごとに別撮りの写真**へ切り替えた。
> いまは色加工なし＝元写真そのまま。この判断は覚えておくこと。

### どの写真が出るかの優先順位（`hpHeroImages()` in `hpSite.ts`）

1. `blocks.heroByColor[hpImageSlotKey(template, color)]` … 管理画面「デザインごとの画像」で入れた写真
2. **デモ店（`slug === 'demo'`）のみ** `hpBundledHeroImages(template, color)` … 同梱の配色別写真
3. `site.hero_images` … その店の通常のトップ画像

さらに 1〜3 がどれも無い場合、`HpTemplate` が同梱の既定キービジュアルを出す（S・Aのみ）。

**画像スロットのキー**（`blocks` の jsonb・マイグレーション不要）

- S … 配色キーそのまま（`gold` / `wine` / `blue` / `emerald`）＝旧データ互換
- A … `a-{色}`（`a-gold` など）
- B/C … `tpl-{ひな形}`（配色ごとに分けない）
- 旧 `tpl-a` → `a-gold` の付け替えは `HP_LEGACY_IMAGE_SLOT_KEYS` が `sanitizeHpBlocks` で自動処理

---

## 6. デザイン一覧（LP `/hp/templates`）

- 写真サムネがあるひな形（**S と A**）は白カードで囲わず、地の上に直接大きく並べる。角は直角
- 比率は SP `aspect-video`（16:9）／ PC `aspect-[2/1]`＝「PC画面で見ているような」横長
- 切り取り基準はひな形ごとに違う（Sはモデルが右＝`object-right-top`、Aは中央＝`object-center`）。
  `hpDesignThumbObjectCls(template, 'list' | 'card')` に集約してある
- **★ Tailwind は組み立てたクラス名を拾えない**。列数（`VARIANT_GRID_CLS`）も object-position も
  必ず**ベタ書きの候補から選ぶ**こと。`sm:grid-cols-${n}` のような書き方は消える
- 説明文（`HP_TEMPLATE_NOTES`）は**1行に収まる長さ**を保つ。目安は66文字以下（タイプAの長さ）

---

## 7. 触ると壊れる所（危険地帯）

1. **`HpShell` の中にラッパー `<div>` を足さない。**
   `.hp-ordered` の flex order、`#hp-drawer ~ .hp-drawer`、`#hp-drawer + .hp-topbar` の
   兄弟セレクタが全部死ぬ
2. **`/hp/layout.tsx` は `overflow-x-clip`。** `hidden` にすると sticky ヘッダーが効かなくなる
3. **ISR**: `export const revalidate = 600` を書くなら、Next 16 では**空の `generateStaticParams()` が必須**
4. **配色キーの改名禁止**（`gold` など）。表示ラベルだけ変えること
5. **既存配色のCSSを共通ブロックに書かない。** 必ず `TEMPLATE_VARIANT_CSS` の自分のブロックに書く
6. `git reset --hard origin/main` の前に **`git log origin/main` を必ず確認**。
   未pushの編集を2回消してしまった事故あり

---

## 8. 主なファイル

| ファイル | 役割 |
|---|---|
| `src/app/lib/hpSite.ts` (783行) | 配色・ブロック・画像スロットの**正**。`HP_COLOR_VARIANTS` / `hpImageSlotKey` / `hpHeroImages` / `hpBundledHeroImages` / `hpDemoImageSlots` / `hpColorRootClass` |
| `src/app/hp/_templates/styles.ts` (1377行) | 全テンプレートCSS。`TEMPLATE_CSS`（s/a/b/c）と `TEMPLATE_VARIANT_CSS`（配色別） |
| `src/app/hp/_templates/HpShell.tsx` | 共通の外側。order定数・ルートクラス・CSS注入 |
| `src/app/hp/_templates/HpTemplate.tsx` (363行) | トップページ本体。ヒーローのフォールバック、セクション順 |
| `src/app/hp/_templates/subpages.tsx` (405行) | マルチページの下層（therapist / system / news / diary / voice / info / terms） |
| `src/app/hp/_templates/parts.tsx` | `QuickNav` / `TherapistCards`（`grid` フラグ）/ `SecHead` / `CourseGroups` |
| `src/app/hp/_templates/DesignThumb.tsx` (151行) | サムネと説明文。`HP_TEMPLATE_NOTES` / `hpDesignThumbSrc` / `hpDesignThumbObjectCls` |
| `src/app/hp/templates/page.tsx` | 公開のデザイン一覧LP |
| `src/app/hp/[slug]/admin/HpEditor.tsx` | 管理画面。デモ限定の「デザインごとの画像」入力欄 |
| `src/app/hp/[slug]/preview/[template]/[color]/…` | 実物プレビュー。`data.basePath` を差し替えて下層まで同じ配色を保つ |
| `src/app/hp/_lib/data.ts` | ページデータの組み立て。壁紙・セラピスト写真の上書き |
| `tools-gen-hp-a-kv.py` | タイプAのキービジュアル書き出し |

---

## 9. 次にやる候補

1. **タイプB・Cの整理** — いまも「文字色だけ変わる6色」のまま。
   タイプS・Aと同じ考え方で4色に絞り、地色ごと作り分けるのが自然な次の一手
2. **タイプB・Cのキービジュアル** — 実写サムネがないので、LPでは簡易モックのまま
3. デモ店の各色プレビューの最終確認（オーナー側で `/hp/templates` から4×4を一巡）

---

## 10. 直近のやり取りで分かったオーナーの好み

- 「見分けが付かない」を何より嫌う。**並べて明確に違う**ことが合格ライン
- 名前（配色名）と実際の色が一致していることを重視する
- スクリーンショットで確認して、ずれていればその場で細かく指示してくる。
  こちらは**実測（`getBoundingClientRect` / 計算スタイル）で裏を取ってから**「できました」と言うこと
- 作業は1件ずつ。1つ終わるたびに push してもらい、確認を挟んで次へ進む
