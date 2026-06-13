export type Therapist = {
  id: number;
  name: string;
  salonId: number;
  salonName: string;
  workHours: string;
  area: string;
  comment: string;
};

export const THERAPISTS: Therapist[] = [
  // ── 極楽の宙 博多店（salonId: 1）── 3名
  {
    id: 1,
    name: "さくら",
    salonId: 1,
    salonName: "極楽の宙 博多店",
    workHours: "12:00〜21:00",
    area: "博多・住吉",
    comment: "丁寧なカウンセリングが得意です♪ご遠慮なくご相談ください",
  },
  {
    id: 9,
    name: "ひなた",
    salonId: 1,
    salonName: "極楽の宙 博多店",
    workHours: "11:00〜19:00",
    area: "博多・住吉",
    comment: "明るい笑顔でお迎えします！初めての方もお気軽にどうぞ♪",
  },
  {
    id: 10,
    name: "つばき",
    salonId: 1,
    salonName: "極楽の宙 博多店",
    workHours: "16:00〜翌0:00",
    area: "博多・住吉",
    comment: "アロマの香りに包まれた至福のひとときをご提供します♡",
  },

  // ── 天空スパ 天神（salonId: 2）── 3名
  {
    id: 2,
    name: "ゆい",
    salonId: 2,
    salonName: "天空スパ 天神",
    workHours: "14:00〜22:00",
    area: "中洲・天神・薬院",
    comment: "リンパを丁寧に流してお体をスッキリさせます！",
  },
  {
    id: 11,
    name: "ののか",
    salonId: 2,
    salonName: "天空スパ 天神",
    workHours: "12:00〜21:00",
    area: "中洲・天神・薬院",
    comment: "ゆったりとした空間で心も体もほぐれてください♡",
  },
  {
    id: 12,
    name: "えま",
    salonId: 2,
    salonName: "天空スパ 天神",
    workHours: "19:00〜翌4:00",
    area: "中洲・天神・薬院",
    comment: "夜のお時間もお任せください♪疲れをしっかり取りますね！",
  },

  // ── 静寂の森 中洲川端（salonId: 3）── 3名
  {
    id: 3,
    name: "みれい",
    salonId: 3,
    salonName: "静寂の森 中洲川端",
    workHours: "18:00〜翌3:00",
    area: "中洲・天神・薬院",
    comment: "深夜のお疲れもしっかり癒します。お気軽にどうぞ☆",
  },
  {
    id: 13,
    name: "しおり",
    salonId: 3,
    salonName: "静寂の森 中洲川端",
    workHours: "14:00〜23:00",
    area: "中洲・天神・薬院",
    comment: "和の雰囲気の中でゆっくりお過ごしください。癒しをお届けします",
  },
  {
    id: 14,
    name: "あやか",
    salonId: 3,
    salonName: "静寂の森 中洲川端",
    workHours: "21:00〜翌5:00",
    area: "中洲・天神・薬院",
    comment: "深夜帯メインで出勤中！夜の疲れ、全部持っていきます☆",
  },

  // ── 蒼天スパ 西新（salonId: 4）── 3名
  {
    id: 4,
    name: "あかり",
    salonId: 4,
    salonName: "蒼天スパ 西新",
    workHours: "13:00〜22:00",
    area: "博多・住吉",
    comment: "肩こりや腰の疲れが気になる方、ぜひお任せください",
  },
  {
    id: 15,
    name: "ゆあ",
    salonId: 4,
    salonName: "蒼天スパ 西新",
    workHours: "11:00〜20:00",
    area: "博多・住吉",
    comment: "リンパケアが得意です！体の流れを整えてスッキリしましょう♪",
  },
  {
    id: 16,
    name: "みお",
    salonId: 4,
    salonName: "蒼天スパ 西新",
    workHours: "16:00〜翌0:00",
    area: "博多・住吉",
    comment: "丁寧なカウンセリングでお体のお悩みをしっかり聞かせてください",
  },

  // ── 黄金の刻 大橋（salonId: 5）── 3名
  {
    id: 17,
    name: "はな",
    salonId: 5,
    salonName: "黄金の刻 大橋",
    workHours: "13:00〜22:00",
    area: "福岡県その他",
    comment: "車でお越しの方も安心。駐車場完備でゆっくりどうぞ♪",
  },
  {
    id: 18,
    name: "せな",
    salonId: 5,
    salonName: "黄金の刻 大橋",
    workHours: "15:00〜24:00",
    area: "福岡県その他",
    comment: "初回割引もあります！ぜひ遊びに来てください☆",
  },
  {
    id: 19,
    name: "ももか",
    salonId: 5,
    salonName: "黄金の刻 大橋",
    workHours: "11:00〜20:00",
    area: "福岡県その他",
    comment: "笑顔でお待ちしています。お体の疲れ、まるっとお任せを！",
  },

  // ── アロマ庵 薬院（salonId: 6）── 3名
  {
    id: 5,
    name: "りな",
    salonId: 6,
    salonName: "アロマ庵 薬院",
    workHours: "15:00〜翌1:00",
    area: "中洲・天神・薬院",
    comment: "和の空間でゆったりとした時間をご提供します",
  },
  {
    id: 20,
    name: "ことね",
    salonId: 6,
    salonName: "アロマ庵 薬院",
    workHours: "12:00〜21:00",
    area: "中洲・天神・薬院",
    comment: "和アロマの香りで心がほぐれていくのを感じてください♡",
  },
  {
    id: 21,
    name: "いろは",
    salonId: 6,
    salonName: "アロマ庵 薬院",
    workHours: "17:00〜翌2:00",
    area: "中洲・天神・薬院",
    comment: "指名料無料なので気軽にご指名ください♪お待ちしています",
  },

  // ── La Mer Blanc 出張専門（salonId: 7）── 2名
  {
    id: 22,
    name: "みゆ",
    salonId: 7,
    salonName: "La Mer Blanc 出張専門",
    workHours: "10:00〜22:00",
    area: "出張",
    comment: "ホテルやご自宅へ伺います。プライベートな空間でご堪能ください♪",
  },
  {
    id: 23,
    name: "しずく",
    salonId: 7,
    salonName: "La Mer Blanc 出張専門",
    workHours: "14:00〜翌2:00",
    area: "出張",
    comment: "フランス式の施術でとびきりの癒しをお届けします。ご予約お待ちしています",
  },

  // ── 凜 -Rin- 北九州（salonId: 8）── 3名
  {
    id: 7,
    name: "なお",
    salonId: 8,
    salonName: "凜 -Rin- 北九州",
    workHours: "14:00〜23:00",
    area: "北九州・小倉",
    comment: "地元北九州のお客様に寄り添ったケアを心がけています",
  },
  {
    id: 24,
    name: "すず",
    salonId: 8,
    salonName: "凜 -Rin- 北九州",
    workHours: "11:00〜20:00",
    area: "北九州・小倉",
    comment: "北九州出身です♪地元の方も遠方からの方も大歓迎！",
  },
  {
    id: 25,
    name: "ちなつ",
    salonId: 8,
    salonName: "凜 -Rin- 北九州",
    workHours: "16:00〜翌0:00",
    area: "北九州・小倉",
    comment: "リンパマッサージでお体の隅々まで丁寧にケアします★",
  },

  // ── 翠月 -Suigetsu- 久留米（salonId: 9）── 3名
  {
    id: 8,
    name: "まなか",
    salonId: 9,
    salonName: "翠月 -Suigetsu- 久留米",
    workHours: "13:00〜22:00",
    area: "久留米",
    comment: "初回の方も安心してお越しください。丁寧にご案内します",
  },
  {
    id: 26,
    name: "ゆずは",
    salonId: 9,
    salonName: "翠月 -Suigetsu- 久留米",
    workHours: "11:00〜20:00",
    area: "久留米",
    comment: "久留米一の癒しをお届け！初回50%OFFもぜひご利用ください♪",
  },
  {
    id: 27,
    name: "のあ",
    salonId: 9,
    salonName: "翠月 -Suigetsu- 久留米",
    workHours: "16:00〜翌0:00",
    area: "久留米",
    comment: "和の空間で日常の疲れをリセットしましょう♡",
  },

  // ── Spa Maison 六本松（salonId: 10）── 3名
  {
    id: 6,
    name: "こはる",
    salonId: 10,
    salonName: "Spa Maison 六本松",
    workHours: "12:00〜20:00",
    area: "福岡県その他",
    comment: "欧州式ケアで全身すっきり♪初めての方も大歓迎です",
  },
  {
    id: 28,
    name: "まりん",
    salonId: 10,
    salonName: "Spa Maison 六本松",
    workHours: "14:00〜22:00",
    area: "福岡県その他",
    comment: "スウェーデン式マッサージで深部からしっかり疲れを取ります★",
  },
  {
    id: 29,
    name: "るな",
    salonId: 10,
    salonName: "Spa Maison 六本松",
    workHours: "18:00〜翌4:00",
    area: "福岡県その他",
    comment: "夜のご予約も歓迎。六本松の隠れ家でお待ちしています♡",
  },
];
