# クーポンの背景色（カラープリセット）機能

クーポン券ごとに背景色を選べるようにして、価値を色で示唆できるようにしたい。オーナーが /mypage で色を選び、公開ページ /salon/[id]/coupon で券の背景にその色が反映される。

## カラープリセット（7種・1か所に集約定義）
以下7つを1か所（定数/マップ）に定義し、/mypage の選択UIと公開ページの描画で共通利用する。各プリセットは key・日本語ラベル・background・text(文字色) を持つ。タグ「クーポン」・破線区切り・有効期限は文字色(currentColor)を薄めて使う。
- gold（ゴールド）: background `linear-gradient(135deg,#E8C766,#C49A2C)` / text `#3A2A06`
- orange_pink（オレンジ→ピンク）: background `linear-gradient(120deg,#F59E0B,#EC4899)` / text `#FFFFFF`
- red（レッド）: background `#D8332B` / text `#FFFFFF`
- blue（ブルー）: background `#2D7FE0` / text `#FFFFFF`
- green（グリーン）: background `#1C9E63` / text `#FFFFFF`
- pink（ピンク・デフォルト）: background `#E0478F` / text `#FFFFFF`
- black（ブラック）: background `#161412` / text `#E2B85A`、薄い枠線 `#3A352A`

## DB
- coupons テーブルに color 列を追加（マイグレーションSQLファイルを作成。実行はユーザーが Supabase SQL Editor で行う）。
  - `color text not null default 'pink'`
  - 取り得る値を上記7キーに限定する CHECK 制約を付ける（gold / orange_pink / red / blue / green / pink / black）。
  - 既存行は default の 'pink' になる。

## /mypage（オーナーの色選択）
- クーポンの新規追加・編集フォームに「背景色」選択を追加。7プリセットを実際の色のスウォッチで並べ、タップで選択、選択中が分かるようにする。
- 保存時に選んだ key を color 列に保存する。
- 一覧でも各クーポンを選択中の色のミニプレビューで表示できると分かりやすい（任意）。

## 公開ページ /salon/[id]/coupon
- 各クーポン券（縦型・案A）の「背景」をその coupon.color プリセットの background に、文字を text 色にして描画する。gradient（gold / orange_pink）と black もプリセット定義どおり反映。
- 券のレイアウト（タグ・割引額・タイトル・破線・有効期限）の構造は現状のまま。色だけプリセットで切り替える。
- color が未設定/不明な値のときは pink（デフォルト）として扱い、崩れないようにする。

## スコープ/厳守
- 既存のクーポン表示・/mypage の既存機能・他ページは壊さない。color の追加と色適用のみ。
- 公開ページの期限切れ自動非表示など既存仕様は維持する。

## 進め方
作業前に、(a) 公開クーポン券の描画箇所、(b) /mypage のクーポンフォーム実装、(c) coupons の既存スキーマ/RLS、を確認してから実装すること。
完了したら feedback_auto_deploy.md に従って自動でコミット→プッシュ→デプロイまで進めてOK。color 追加のマイグレーションSQLはユーザーが Supabase の SQL Editor で実行する。
