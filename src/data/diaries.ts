export interface Diary {
  id: string;
  therapistId: string;
  therapistName: string;
  salonId: string;
  salonName: string;
  title: string;
  content: string;
  date: string; // 例: "2026/06/13"
  time: string; // 例: "18:30"
  imageUrl?: string;
}

export const DIARIES: Diary[] = [
  {
    id: 'd1',
    therapistId: 't1',
    therapistName: 'えま',
    salonId: '1',
    salonName: '天空スパ 天神',
    title: 'おにゅーのルームウェア✿',
    content: '今日から新しいお部屋着にしましたコーディネート見にきてね！今日の出勤は19時から翌4時までです。まったりお話ししましょう〜♡',
    date: '2026/06/13',
    time: '18:30'
  },
  {
    id: 'd2',
    therapistId: 't2',
    therapistName: 'みあ',
    salonId: '2',
    salonName: 'アロマ優雅 博多',
    title: 'カフェ巡りしてきました☕',
    content: 'お休みの日に博多駅近くの可愛いカフェに行ってきました！あまーいスイーツ食べて充電満タンです✨明日の出勤がんばりますっ！',
    date: '2026/06/13',
    time: '15:10'
  },
  {
    id: 'd3',
    therapistId: 't3',
    therapistName: 'ひなた',
    salonId: '1',
    salonName: '天空スパ 天神',
    title: 'お香のいい香り〜✿',
    content: 'サロンに新しいお香が届きました！とってもリラックスできるお気に入りの香りです。今日もお疲れの皆様を心の底から癒やしますね。',
    date: '2026/06/12',
    time: '21:00'
  },
  {
    id: 'd4',
    therapistId: 't4',
    therapistName: 'さくら',
    salonId: '3',
    salonName: 'ロイヤル中洲',
    title: 'ネイル変えました💅',
    content: '今月は肌なじみのいい上品なピンクベージュにラメを乗せてもらいました✨マッサージ中にお客様の手が触れたときにも優しく癒やされるように、パーツは控えめにしてます✿今日お会いできるのを楽しみにしてますね！',
    date: '2026/06/13',
    time: '20:15'
  },
  {
    id: 'd5',
    therapistId: 't5',
    therapistName: 'ゆあ',
    salonId: '4',
    salonName: '小倉リラクゼーション',
    title: '最近ハマってる入浴剤せっけんの香り🧼',
    content: 'お仕事が終わったあとのバスタイムが毎日のご褒美です🛀最近はミルクハニーの入浴剤にすごく癒やされてます♡お部屋もとってもいい香りにして待機してるので、疲れをほぐされにきてくださいね〜！',
    date: '2026/06/13',
    time: '19:40'
  },
  {
    id: 'd6',
    therapistId: 't6',
    therapistName: 'ここあ',
    salonId: '5',
    salonName: '久留米アロマ 潤',
    title: 'お気に入りのヘアオイルですココナッツの香りポカポカ',
    content: '髪の毛からふんわり甘い香りがするとモチベーション上がりますよね♪今日の施術中も、癒やしのひとときを楽しんでいただけるように髪型も可愛くセットしました！今から最後の受付枠空いてます✿',
    date: '2026/06/13',
    time: '19:05'
  },
  {
    id: 'd7',
    therapistId: 't7',
    therapistName: 'りん',
    salonId: '2',
    salonName: 'アロマ優雅 博多',
    title: 'スタバの新作飲みました！🍓',
    content: 'いちごのフラペチーノ、すっごく美味しくて一瞬で飲み干しちゃいました！笑 おいしいもの食べると元気が出ますね！今日はお店も大盛況でとっても楽しい一日です♡まだまだ笑顔で頑張ります！',
    date: '2026/06/13',
    time: '17:50'
  },
  {
    id: 'd8',
    therapistId: 't8',
    therapistName: 'つむぎ',
    salonId: '6',
    salonName: '出張エステ福岡 恵み',
    title: 'ホテル出張へ行ってきます🚗',
    content: '博多区内のホテルへ今から出発します！お部屋を最高の癒やし空間に変えられるよう、お気に入りのアロマオイルとフカフカのタオルを準備しました。移動中も安全運転で行ってまいりますね✿',
    date: '2026/06/13',
    time: '16:20'
  },
  {
    id: 'd9',
    therapistId: 't9',
    therapistName: 'めい',
    salonId: '1',
    salonName: '天空スパ 天神',
    title: 'マッサージの練習がんばったよ！🌿',
    content: '先輩セラピストさんに新しい手技の講習をしてもらいました！肩周りのコリが劇的にすっきりする最高の技術を習得したので、早くお客様に試してみたいです！今日の出勤でぜひ体感しにきてくださいっ！',
    date: '2026/06/13',
    time: '14:35'
  },
  {
    id: 'd10',
    therapistId: 't10',
    therapistName: 'るな',
    salonId: '7',
    salonName: '薬院ヒーリング',
    title: '大好きな韓国コスメパステルカラー',
    content: '新しいアイシャドウパレットを買っちゃいました！キラキラのラメがすごく綺麗で、メイクするとテンション上がりますね。今日もピカピカの笑顔でお客様のご来店を心よりお待ちしております♡',
    date: '2026/06/13',
    time: '13:10'
  },
  {
    id: 'd11',
    therapistId: 't11',
    therapistName: 'あおい',
    salonId: '3',
    salonName: 'ロイヤル中洲',
    title: '雨の日だけど心は晴れ模様♪☂️',
    content: '外はちょっとジメジメしてますが、お店の中は除湿も温度管理もバッチリでとっても快適ですよ〜！リラックスできる音楽を聴きながら、極上のアロママッサージをのんびり楽しみませんか？',
    date: '2026/06/13',
    time: '12:25'
  },
  {
    id: 'd12',
    therapistId: 't12',
    therapistName: 'ほのか',
    salonId: '2',
    salonName: 'アロマ優雅 博多',
    title: '今日のおやつはプリン🍮',
    content: '店長さんが差し入れしてくれた固めのレトロプリンが美味しすぎました…！元気が出たので、午後からのロングコースのお客様も全力でとろとろに癒やしちゃいたいと思います！いってきます！',
    date: '2026/06/13',
    time: '11:40'
  },
  {
    id: 'd13',
    therapistId: 't13',
    therapistName: 'なな',
    salonId: '1',
    salonName: '天空スパ 天神',
    title: '明日の出勤時間が変わりました！⏰',
    content: '急きょ、明日の日曜日も【12:00〜21:00】で出勤することになりましたーっ！いつも平日はお仕事が忙しくて会えないお客様も、休日ののんびりしたお時間にぜひお話ししにきてくれたら嬉しいです✿',
    date: '2026/06/12',
    time: '23:15'
  }
];
