// フクエスリンクの「はじめての方へ（使い方・Q&A）」の中身（第394便・2026-09-16・カッキーさん）。
// ★ 純粋なデータ。通信もDBも触らない。
//
// ★★★ 読む人: フクエスには掲載中だが、フクエスリンクを【初めて開いた】店舗オーナー様。
//   ★ 「何ができるか」→「何から始めるか」→「よくある疑問」の順に読ませる。
// ★★ 値はすべて【いまの実際の動き】から（mediaMatrix.ts・mediaSites.ts・mediaConsent.ts）。★ 願望や予定を書かない。
//   ★ 反映の分数・サイトの対応を変えたら、ここも直すこと（★ 早見表と食い違わせない）。
// ★ 画面上の名前（左の並び・ボタン名）はそのまま引用している。★ 名前を変えたらここも直す。

export type GuideLinkKey = 'qa' | 'schedule' | 'login' | 'roster' | 'home' | 'work' | 'diary' | 'news' | 'log' | 'matrix' | 'girls' | 'announce';   // ★ 第469便: 'girls'（女性一覧）／第475便: 'announce'（フクエスお知らせ）

export const GUIDE_HREF: Record<GuideLinkKey, string> = {
  home: '/mypage/media',
  qa: '/mypage/media/qa',
  // ★ 第396便: コネックエフの週間スケジュール用。★ フクエスリンクでは出勤はマイページで入れる
  schedule: '/mypage',
  login: '/mypage/media/login',
  roster: '/mypage/media/therapists',
  work: '/mypage/media/work',
  diary: '/mypage/media/diary',
  news: '/mypage/media/news',
  log: '/mypage/media/log',
  matrix: '/mypage/media/matrix',
  // ★ 第469便: コネックエフの Q&A 用（女性一覧）。★ フクエスリンクではマイページのセラピスト
  girls: '/mypage?tab=profile',
  // ★ 第475便: フクエスリンクではマイページのお知らせタブ
  announce: '/mypage?tab=news',
};

/** いちばん上の「フクエスリンクとは」 */
/** ★ 第394便b（カッキーさん）: 相手先の事情で提供できなくなることがある、を必ず言う（ガイドの下と Q&A の2か所） */
export const GUIDE_SERVICE_NOTE =
  '連携先サイトの仕様変更・方針・障害など、相手先の事情により、一部または全部のサービスを提供できなくなることがあります。';

// ★★★ 第671便（2026-09-22・カッキーさんの決定）: フクエスリンクは【駅ちかから反映（取り込み）専用】になった。
//   ★ 出勤・プロフィール・即ヒメは ID・PW なし（駅ちかの公開ページを読む）。★ 写メ日記だけ駅ちかの ID・PW が要る（管理画面を読む）。
//   ★ 書き込み（フクエス→各サイト）・写メ日記の転送・新着情報はコネックエフ（lib/conecfGuide.ts）。★ ここに書かない。
//   ★ 時刻の言い方はホームと同じ（週間出勤は1日1回の朝6時台・写メ日記は15分ごと）。★ 変えたらホームとそろえる。
export const GUIDE_INTRO = {
  title: 'フクエスリンクとは',
  lead:
    '駅ちかに入力した出勤やプロフィールを、フクエスへ自動で反映する機能です。',
  points: [
    '駅ちかを更新するだけで、フクエスにも自動で更新されます。',
    '出勤・プロフィール・即ヒメは、IDとパスワードが無くても反映されます',
    '写メ日記もフクエスに出したい場合は、駅ちかのIDとパスワードを登録してください',
    'フクエス契約店舗様は無料でお使いいただけます',
  ],
} as const;

/** 取り込めるもの。★ 駅ちかだけ（★ 読める媒体は駅ちかだけ・mediaSites の canReadProvider） */
export const GUIDE_SITES: ReadonlyArray<{ name: string; status: 'ok' | 'limited' | 'preparing'; items: readonly string[]; note?: string }> = [
  {
    name: '駅ちか',
    status: 'ok',
    items: ['出勤（週間出勤7日分）', 'プロフィール（年齢・サイズ）', '新しく入った方', '即ヒメ（フクエスの「今すぐ」に）', '写メ日記（ID・PW登録時）'],
  },
  // ★ 第701便（2026-09-23・カッキーさん）: 反映されないものを1枠で。★ 取り込みは年齢・サイズ・出勤・即ヒメ・写メ日記だけ（ingest/ingest-list）
  {
    name: 'セラピストで反映されないもの',
    status: 'limited',
    items: ['写真', 'キャッチ・紹介文', '特徴バッジ', '名前が駅ちかと違う子（例：愛 と アイ）', '同じ名前の子が2人いるとき'],
    note: '写真・紹介文・特徴バッジはフクエスのマイページで入れてください。名前は駅ちかとフクエスで同じにしてください。',
  },
];

/** ★ 第671便: 向きの選択は「駅ちかから反映する」だけになったので、節ごと出さない（空） */
export const GUIDE_MODES: ReadonlyArray<{ label: string; body: string; recommended?: boolean }> = [];

/** はじめの手順。★ 並びは「これが無いと次ができない」順 */
export const GUIDE_STEPS: ReadonlyArray<{
  title: string; body: string; link: GuideLinkKey; linkLabel: string; warn?: string;
}> = [
  {
    title: 'ホームで「駅ちかから反映する」を押す',
    body:
      'ホームの見出しが「駅ちかから反映中」になれば始まっています。出勤は15分ごと、週間出勤は1日1回の朝6時台に反映されます。' +
      'ボタンが出ていないときは、駅ちかのお店のページの登録が必要です。運営事務局へご連絡ください。',
    link: 'home',
    linkLabel: 'ホームを開く',
  },
  {
    title: '（写メ日記も出したい場合）駅ちかのID・PWを登録する',
    body:
      '写メ日記は駅ちかの管理画面から読むため、IDとパスワードが必要です。同意文を読んでチェックを入れ、保存してください。' +
      '登録すると、駅ちかに載った写メ日記を15分ごとにフクエスへ取り込みます。',
    link: 'login',
    linkLabel: '駅ちかのID・PWを開く',
  },
  // ★ 第710便: ステップ3「セラピストさんの反映を確かめる」は消した（セラピスト設定を並びから外したため・第694便）
];

/** 必要に応じて */
// ★ 第710便: 「連携の記録」の枠は消した（空なら節ごと出さない）
export const GUIDE_OPTIONAL: ReadonlyArray<{ title: string; body: string; link: GuideLinkKey; linkLabel: string }> = [];

export type GuideQa = { q: string; a: readonly string[]; link?: GuideLinkKey; linkLabel?: string };

/** よくある質問。★ 答えは短く、1つの段落に1つのこと */
export const GUIDE_QA: ReadonlyArray<{ group: string; items: readonly GuideQa[] }> = [
  {
    group: 'はじめる前に',
    items: [
      {
        q: '使用料金はかかりますか？',
        a: ['フクエス契約店舗様は無料です。'],
      },
      {
        q: 'IDとパスワードは必要ですか？',
        a: [
          '出勤・プロフィール・即ヒメの反映には必要ありません。写メ日記もフクエスに出したい場合は、駅ちかのIDとパスワードを登録してください。',
        ],
        link: 'login',
        linkLabel: '駅ちかのID・PWを開く',
      },
      {
        q: 'フクエスで入力した出勤を、駅ちかやエステ魂へ送れますか？',
        a: [
          'フクエスリンクは、駅ちかからの反映専用です。1か所の入力から、フクエス・駅ちか・エステ魂などへまとめて更新したい場合は、コネックエフをお使いください（フクエス契約店舗様は無料）。',
        ],
      },
      {
        q: '駅ちかとフクエス、両方で出勤を入力できますか？',
        a: [
          'フクエスリンクを使っている間は、駅ちかに入力してください。フクエスの出勤は、駅ちかの内容で上書きされます。',
        ],
      },
      {
        q: 'ベンリーなど、ほかの連携ツールと一緒に使えますか？',
        a: [
          '他の連携ツールとの同時利用はお控えください。同じ内容が二重で登録されたりの不具合が起きる可能性があります。',
        ],
      },
      {
        q: 'お預かりしたパスワードは安全ですか？',
        a: [
          'パスワードは暗号化して保管し、画面では ●●●● と表示されます。',
        ],
      },
    ],
  },
  {
    group: '反映のタイミング',
    items: [
      {
        q: '駅ちかを更新してから、どれくらいでフクエスに反映されますか？',
        a: [
          'その日の出勤と即ヒメは、15分ごとに反映します。',
          '週間出勤（7日分）は、1日1回の朝6時台に反映します。',
          '写メ日記（ID・PW登録時）は、15分ごとに取り込みます。',
        ],
      },
      {
        q: '駅ちかの即ヒメは、フクエスでどう出ますか？',
        a: ['駅ちかで即ヒメにしている方は、フクエスでは「今すぐ」として表示されます。駅ちかで即ヒメを外すと、しばらくして消えます。'],
      },
    ],
  },
  {
    group: 'セラピストさんのこと',
    items: [
      {
        q: '駅ちかに新しく入った方は、フクエスにも出ますか？',
        a: [
          '出ます。駅ちかの女の子一覧に新しい方が載ると、数分後にフクエスにも自動登録され、新人の印が付きます。',
          // ★ 第712便: 先頭の「!」は画面で赤字にする印（QaBoard）。★ 文には出ない
          '!写真は反映されないため、マイページのセラピストから写真を登録してください。また、キャッチコピー・紹介文・特徴バッジも反映されません。お手数ですが最初だけ入力をお願いします。',
          '名前が「〇〇」のような伏せ字だけの方や、フクエスに同じ名前の方が2人以上いるときは、取り違えを防ぐため自動では登録しません。',
        ],
      },
      {
        q: '一部のセラピストさんだけ反映されません',
        a: [
          '駅ちかとフクエスで名前の書き方が違うと、照らし合わせられないことがあります。「セラピスト設定」で確かめるか、運営事務局へご連絡ください。',
        ],
        link: 'roster',
        linkLabel: 'セラピスト設定を開く',
      },
      {
        q: '退店した方は、フクエスから消えますか？',
        a: ['駅ちかで削除すると、フクエスでは出勤が入らなくなります。フクエスのセラピストの一覧から消す場合は、マイページで非公開・削除にしてください。'],
      },
    ],
  },
  {
    group: '困ったとき・やめたいとき',
    items: [
      {
        q: 'ちゃんと反映されたか、どこで確かめられますか？',
        a: [
          'ホームに「最後の反映」と「次の反映」の時刻が出ます。くわしくは「連携の記録」に1件ずつ残ります。',
          '取り込みが止まっているときは、フクエスリンクの画面の上に赤いお知らせが出ます。',
        ],
        link: 'log',
        linkLabel: '連携の記録を開く',
      },
      {
        q: '反映をやめたい・元に戻したいときは？',
        a: [
          'ホームで駅ちかの行の「反映しない」を押すと止まります。「駅ちかから反映する」でいつでも戻せます。',
          '駅ちかのID・PWは、「駅ちかのID・PW」から一時停止・削除ができます（削除すると写メ日記の取り込みだけが止まります）。',
        ],
        link: 'home',
        linkLabel: 'ホームを開く',
      },
      {
        q: 'この先もずっと使えますか？',
        a: [GUIDE_SERVICE_NOTE],
      },
    ],
  },
];

// ────────────────────────────────────────────────
// ★★ まとめ（第396便・1b）。★ 同じ画面の部品を、フクエスリンクとコネックエフで中身だけ替えて使う。

export type GuideFlowBox = { caption: string; name: string };

export type GuideContent = {
  intro: { title: string; lead: string; points: readonly string[] };
  /** 流れの図（左 → 中 → 右） */
  flow: readonly [GuideFlowBox, GuideFlowBox, GuideFlowBox];
  sites: typeof GUIDE_SITES;
  /** 更新の向きの説明。★ 空なら節ごと出さない */
  modes: typeof GUIDE_MODES;
  steps: typeof GUIDE_STEPS;
  optional: typeof GUIDE_OPTIONAL;
  serviceNote: string;
  qa: typeof GUIDE_QA;
  /** Q&A から使い方へ戻るリンクの文字 */
  guideLinkLabel: string;
};

export const FUKUES_LINK_GUIDE: GuideContent = {
  intro: GUIDE_INTRO,
  flow: [
    { caption: '入力するのは', name: '駅ちか' },
    { caption: '自動で取り込み', name: 'フクエスリンク' },
    { caption: '反映先', name: 'フクエス' },
  ],
  sites: GUIDE_SITES,
  modes: GUIDE_MODES,
  steps: GUIDE_STEPS,
  optional: GUIDE_OPTIONAL,
  serviceNote: GUIDE_SERVICE_NOTE,
  qa: GUIDE_QA,
  guideLinkLabel: 'はじめての方へ（使い方）を見る',
};
