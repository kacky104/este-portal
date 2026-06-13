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
  }
];
