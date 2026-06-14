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
];
