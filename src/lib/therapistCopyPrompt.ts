// AI紹介文生成のプロンプト定義（第30便・2026-08-24）。
//
// ★ このファイルは純粋関数のみ。Supabase も React も import しない（禁則180）。
//   サーバーアクション（app/actions/therapistCopy.ts）がこれを使って Claude に投げる。
//
// ルール（第29便でオーナー確定・ロードマップ第1弾）:
//   - キャッチに年齢を入れない
//   - 掲載元の丸写し禁止（お手本は文体の参考であって、文そのものを流用しない）
//   - 字数の上限は指定しない。下限だけシステムで担保（150字未満なら作り直し・最大2回）
//   - ランク系バッジ（NO.1・プレミア等）の情報も文章に使ってよい
//   - お手本は enju の実際の紹介文（運営の書き起こし）

/** 生成に渡すセラピストの素材。空の項目は素直に落として渡す。 */
export type CopyInput = {
  name: string;
  age: string | null;
  bodyType: string | null;   // 'T157 B86(E) W54 H83'
  badges: string[];
  salonName: string | null;
  /** 既存のキャッチ・紹介文（あれば「作り直し」の参考として渡す） */
  currentCatch: string | null;
  currentText: string | null;
};

/** 生成結果。 */
export type CopyOutput = { catchphrase: string; profileText: string };

/** 紹介文の下限字数。これを下回ったら作り直す。 */
export const MIN_PROFILE_LEN = 150;
/** 作り直しの最大回数（初回＋この回数まで叩く）。無限ループ・API無駄打ちの防止。 */
export const MAX_RETRY = 2;
/** キャッチの上限字数（/mypage の input maxLength と揃える）。 */
export const MAX_CATCH_LEN = 16;

// お手本。enju（salon_id=1）の実データから、タイプが散るように6本選んだもの。
// ★ 字数ルールを与えない代わりに、この6本の分量（160〜190字）が実質の相場観になる。
//   差し替えるときは「タイプが偏らないこと」と「実在の文であること」を保つ。
const SAMPLES = `- 入力: 年齢19歳 / T154 B92(G) W56 H83 / バッジ: 未経験・女子大生・アイドル系・かわいい・癒し系・笑顔が素敵
  キャッチ: 笑うと目がなくなる120点スマイル
  紹介文: 「かわいい」をぎゅっと集めたようなアイドル系美少女。色白でもちもちの肌と、目鼻立ちのくっきりした綺麗な顔立ち、小柄ながら女性らしいスタイルは、男性が思い描く理想をそのまま形にしたよう。笑うと目がなくなるほどの笑顔がチャームポイントです。業界未経験ながら「もっと上手くなりたい」という向上心にあふれ、応援したくなる健気さも魅力。読書と抹茶が好きな現役女子大生です。
- 入力: 年齢23歳 / T164 B87(E) W54 H86 / バッジ: 経験者・キレイ・お姉さん系・ギャル・高身長・美脚
  キャッチ: 事前完売続出の華ある美女
  紹介文: 整った顔立ちと洗練された雰囲気で、写真を見た瞬間に会ってみたくなる存在感のあるセラピスト。高身長スレンダーなスタイルの良さも兼ね備え、全体のバランスが整った「いい女」という言葉がよく似合います。可愛いだけでなく上品さと華やかさもあり、リピート指名が相次ぐのも納得。事前完売が多いため、気になる方は早めの予約がおすすめです。サウナと一人旅が趣味。
- 入力: 年齢24歳 / T167 B87(D) W54 H84 / バッジ: 経験者・アイドル系・モデル系・高身長・清楚・トーク上手
  キャッチ: K-POPアイドルのような端正美女
  紹介文: 色白で高身長、モデル体型に端正な顔立ちと、まるでK-POPアイドルのような華やかさを持つセラピスト。元気で明るく礼儀正しい上に気遣いも細やかで、コミュニケーション能力はハイレベル。帰る頃には心を開き、身も心もほぐされていることでしょう。元エステティシャンのため施術の腕も確かで、清潔感のある優しい男性が好みとのこと。人気店から移籍した実力派です。
- 入力: 年齢23歳 / T153 B86(F) W54 H85 / バッジ: 清楚・キレイ・お姉さん系・低身長・癒し系・丁寧な施術
  キャッチ: 綺麗で落ち着いた大人の余裕
  紹介文: 上品さと美しさを兼ね備えた、綺麗で落ち着いた雰囲気のお姉さん系セラピスト。派手すぎないのに目を引く美貌と、大人っぽさの中にある柔らかく親しみやすい空気感で、「この人とデートしてみたい」と思わせてくれます。一緒にいると自然と力が抜けて甘えたくなるような包容力も魅力。綺麗なお姉さんに癒されたい方、落ち着いた時間を過ごしたい方に特におすすめです。
- 入力: 年齢23歳 / T157 B86(E) W54 H83 / バッジ: キレイ・かわいい・スレンダー・美脚・トーク上手・ツンデレ
  キャッチ: はんなり関西弁の爆美女
  紹介文: ぱっちりとした瞳にぷっくりセクシーな唇、色白スレンダーながら女性らしいラインを描くボディと、なかなか出会えないレベルの美貌の持ち主。柔らかな関西弁と落ち着いたテンポで、心地よい時間が静かに流れていきます。明るさと上品さを併せ持ち、愛嬌も抜群。元アパレルで料理や温泉巡りが趣味という、会話の引き出しも豊富なセラピストです。
- 入力: 年齢25歳 / T162 B82(B) W53 H82 / バッジ: お嬢様・清楚・アイドル系・童顔・スレンダー・癒し系
  キャッチ: 完全無欠の清楚系アイドル顔
  紹介文: 透明感あふれるルックスに整った小顔と優しい瞳、見た目はまさに清楚系アイドルそのもの。中身は甘え上手でリアクションも可愛らしい愛されタイプで、一緒にいるだけで自然と笑顔になれます。聞き上手で距離の詰め方も絶妙、ドアを開けた瞬間の少し照れた挨拶から、時間とともに見せる無邪気な笑顔へと、どんどん惹かれていくはず。元OLで読書とラジオが好きな、落ち着いた一面も持っています。`;

/** Claude に渡す system プロンプト。 */
export const SYSTEM_PROMPT = `あなたはメンズエステ情報サイト「フクエス」の編集者です。
掲載店舗のセラピスト紹介ページに載せる「キャッチフレーズ」と「詳細プロフィール（紹介文）」を書きます。

## 守ること
- キャッチフレーズに年齢や数字の年齢表現を入れない（「20歳の〜」「二十代の〜」は禁止）。
- キャッチフレーズは${MAX_CATCH_LEN}文字以内。全角で数えて${MAX_CATCH_LEN}文字を超えないこと。
- 紹介文は、下のお手本と同じくらいの分量で書く。
- お手本は文体と分量の参考。表現をそのまま流用しない。特に「爆美女」「120点スマイル」のような固有の言い回しは使い回さない。
- 性的・露骨な表現は書かない。あくまで容姿・人柄・雰囲気・施術の紹介にとどめる。
- 事実として与えられていないこと（出身地・経歴・趣味・恋人の有無など）を断定して書かない。
  写真から読み取れる印象は書いてよいが、「〜のような」「〜という印象」と断定を避ける。
- 断定できない情報を埋めるために話を作らない。素材が少ないときは短くまとまってよいが、
  容姿と雰囲気の描写を丁寧にすることで分量を確保する。

## 文体
- 客（男性）に向けた、丁寧だが硬すぎない紹介文。三人称で書く。
- 「〜です」「〜ます」を基本に、体言止めを混ぜてリズムを作る。
- セラピスト本人の一人称では書かない。

## お手本（フクエス掲載中の実例）
${SAMPLES}

## 出力形式
必ず次のJSONだけを出力する。前後に説明文やコードフェンスを付けない。
{"catchphrase":"（${MAX_CATCH_LEN}文字以内）","profileText":"（紹介文）"}`;

/** 素材から user メッセージ本文を組み立てる。写真は呼び出し側が image ブロックとして足す。 */
export function buildUserPrompt(input: CopyInput, opts?: { hasImage?: boolean; retryReason?: string }): string {
  const lines: string[] = [];
  lines.push('次のセラピストのキャッチフレーズと紹介文を書いてください。');
  lines.push('');
  lines.push('## 素材');
  lines.push(`- 源氏名: ${input.name}`);
  if (input.salonName) lines.push(`- 店舗: ${input.salonName}`);
  if (input.age) lines.push(`- 年齢: ${input.age}歳`);
  if (input.bodyType) lines.push(`- サイズ: ${input.bodyType}`);
  if (input.badges.length > 0) lines.push(`- 特徴バッジ: ${input.badges.join('・')}`);
  if (opts?.hasImage) {
    lines.push('- プロフィール写真: 添付（容姿の描写に使ってよい。写り込んだ文字・ロゴ・他店名には触れない）');
  }
  if (input.currentCatch || input.currentText) {
    lines.push('');
    lines.push('## 現在の掲載内容（参考。より良い案を出す。同じ文をそのまま返さない）');
    if (input.currentCatch) lines.push(`- キャッチ: ${input.currentCatch}`);
    if (input.currentText) lines.push(`- 紹介文: ${input.currentText}`);
  }
  if (opts?.retryReason) {
    lines.push('');
    lines.push(`## やり直しの理由\n${opts.retryReason}`);
  }
  return lines.join('\n');
}

/** モデルの返答から JSON を取り出す。コードフェンスや前後の説明が付いても拾えるようにする。 */
export function parseCopyResponse(raw: string): CopyOutput | null {
  const text = raw.trim();
  const candidates: string[] = [text];
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) candidates.unshift(fenced[1].trim());
  const braced = text.match(/\{[\s\S]*\}/);
  if (braced) candidates.push(braced[0]);

  for (const c of candidates) {
    try {
      const o = JSON.parse(c) as Record<string, unknown>;
      const cp = typeof o.catchphrase === 'string' ? o.catchphrase.trim() : '';
      const pt = typeof o.profileText === 'string' ? o.profileText.trim() : '';
      if (pt) return { catchphrase: cp.slice(0, MAX_CATCH_LEN), profileText: pt };
    } catch {
      // 次の候補へ
    }
  }
  return null;
}

/** 紹介文が下限字数を満たすか。空白・改行は数えない。 */
export function isLongEnough(profileText: string): boolean {
  return profileText.replace(/\s/g, '').length >= MIN_PROFILE_LEN;
}
