export interface Diary {
  id: string;
  therapistId: string;
  therapistName: string;
  salonId: string;
  salonName: string;
  title: string;
  content: string;
  date: string;
  time: string;
  imageUrl: string;
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
    date: '2026/06/14',
    time: '18:30',
    imageUrl: '/images/emma1.png'
  },
  {
    id: 'd1_add1',
    therapistId: 't1',
    therapistName: 'えま',
    salonId: '1',
    salonName: '天空スパ 天神',
    title: '新しいアロマオイルが入荷しました🌿',
    content: '天空スパに新しいシトラスミントのオイルが仲間入りしました！すっごく爽やかでリフレッシュにぴったりです。ジメジメしたお天気を吹き飛ばすくらい、すっきり癒やされにきてくださいね✿',
    date: '2026/06/14',
    time: '12:15',
    imageUrl: '/images/emma2.jpg'
  },
  {
    id: 'd1_add2',
    therapistId: 't1',
    therapistName: 'えま',
    salonId: '1',
    salonName: '天空スパ 天神',
    title: 'お休みの日は天神でショッピングミニバッグ',
    content: '昨日はお休みだったので天神駅の近くをぶらぶらお買い物してきました♪ずっと欲しかったピンクのチークを買えて大満足です！今日さっそくメイクに使っているので、ぜひ見にきてくださいね〜♡',
    date: '2026/06/13',
    time: '22:40',
    imageUrl: '/images/emma3.jpg'
  },
  {
    id: 'd1_add3',
    therapistId: 't1',
    therapistName: 'えま',
    salonId: '1',
    salonName: '天空スパ 天神',
    title: '美味しいチョコの差し入れをいただきましたチョコ',
    content: '優しいお客様から大好きな高級チョコレートの差し入れをいただいちゃいました…！嬉しすぎてお仕事の疲れが一気に吹き飛びました♡いつも温かいお言葉を本当にありがとうございます。お返しに今日も全力でとろとろにマッサージします！',
    date: '2026/06/12',
    time: '20:10',
    imageUrl: '/images/emma4.jpg'
  },
  {
    id: 'd2',
    therapistId: 't2',
    therapistName: 'みあ',
    salonId: '2',
    salonName: 'アロマ優雅 博多',
    title: 'カフェ巡りしてきました☕',
    content: 'お休みの日に博多駅近くの可愛いカフェに行ってきました！あまーいスイーツ食べて充電満タンです✨明日の出勤がんばりますっ！',
    date: '2026/06/14',
    time: '15:10',
    imageUrl: '/images/mia1.jpg'
  },
  {
    id: 'd3',
    therapistId: 't3',
    therapistName: 'ひなた',
    salonId: '1',
    salonName: '天空スパ 天神',
    title: 'お香のいい香り〜✿',
    content: 'サロンに新しいお香が届きました！とってもリラックスできるお気に入りの香りです。今日もお疲れの皆様を心の底から癒やしますね。',
    date: '2026/06/13',
    time: '21:00',
    imageUrl: '/images/hinata1.jpg'
  },
  {
    id: 'd4',
    therapistId: 't4',
    therapistName: 'さくら',
    salonId: '3',
    salonName: 'ロイヤル中洲',
    title: 'ネイル変えました💅',
    content: '今月は肌なじみのいい上品なピンクベージュにラメを乗せてもらいました✨マッサージ中にお客様の手が触れたときにも優しく癒やされるように、パーツは控えめにしてます✿今日お会いできるのを楽しみにしてますね！',
    date: '2026/06/14',
    time: '20:15',
    imageUrl: '/images/sakura1.jpg'
  },
  {
    id: 'd5',
    therapistId: 't5',
    therapistName: 'ゆあ',
    salonId: '4',
    salonName: '小倉リラクゼーション',
    title: '最近ハマってる入浴剤せっけんの香り🧼',
    content: 'お仕事が終わったあ後のバスタイムが毎日のご褒美です🛀最近はミルクハニーの入浴剤にすごく癒やされてます♡お部屋もとってもいい香りにして待機してるので、疲れをほぐされにきてくださいね〜！',
    date: '2026/06/14',
    time: '19:40',
    imageUrl: '/images/yua1.jpg'
  },
  {
    id: 'd6',
    therapistId: 't6',
    therapistName: 'ここあ',
    salonId: '5',
    salonName: '久留米アロマ 潤',
    title: 'お気に入りのヘアオイルですココナッツの香りポカポカ',
    content: '髪の毛からふんわり甘い香りがするとモチベーション上がりますよね♪今日の施術中も、癒やしのひとときを楽しんでいただけるように髪型も可愛くセットしました！今から最後の受付枠空いてます✿',
    date: '2026/06/14',
    time: '19:05',
    imageUrl: '/images/cocoa1.jpg'
  },
  {
    id: 'd7',
    therapistId: 't7',
    therapistName: 'りん',
    salonId: '2',
    salonName: 'アロマ優雅 博多',
    title: 'スタバの新作飲みました！🍓',
    content: 'いちごのフラペチーノ、すっごく美味しくて一瞬で飲み干しちゃいました！笑 おいしいもの食べると元気が出ますね！今日はお店も大盛況でとっても楽しい一日です♡まだまだ笑顔で頑張ります！',
    date: '2026/06/14',
    time: '17:50',
    imageUrl: '/images/rin1.jpg'
  },
  {
    id: 'd8',
    therapistId: 't8',
    therapistName: 'つむぎ',
    salonId: '6',
    salonName: '出張エステ福岡 恵み',
    title: 'ホテル出張へ行ってきます🚗',
    content: '博多区内のホテルへ今から出発します！お部屋を最高の癒やし空間に変えられるよう、お気に入りのアロマオイルとフカフカのタオルを準備しました。移動中も安全運転で行ってまいりますね✿',
    date: '2026/06/14',
    time: '16:20',
    imageUrl: '/images/tsumugi1.jpg'
  },
  {
    id: 'd9',
    therapistId: 't9',
    therapistName: 'めい',
    salonId: '1',
    salonName: '天空スパ 天神',
    title: 'マッサージの練習がんばったよ！🌿',
    content: '先輩セラピストさんに新しい手技の講習をしてもらいました！肩周りのコリが劇的にすっきりする最高の技術を習得したので、早くお客様に試してみたいです！今日の出勤でぜひ体感しにきてくださいっ！',
    date: '2026/06/14',
    time: '14:35',
    imageUrl: '/images/mei1.jpg'
  },
  {
    id: 'd10',
    therapistId: 't10',
    therapistName: 'るな',
    salonId: '7',
    salonName: '薬院ヒーリング',
    title: '大好きな韓国コスメパステルカラー',
    content: '新しいアイシャドウパレットを買っちゃいました！キラキラのラメがすごく綺麗で、メイクするとテンション上がりますね。今日もピカピカの笑顔でお客様のご来店を心よりお待ちしております♡',
    date: '2026/06/14',
    time: '13:10',
    imageUrl: '/images/runa1.jpg'
  }
];
