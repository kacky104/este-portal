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
    id: 2,
    name: "ゆい",
    salonId: 2,
    salonName: "天空スパ 天神",
    workHours: "14:00〜22:00",
    area: "中洲・天神・薬院",
    comment: "リンパを丁寧に流してお体をスッキリさせます！",
  },
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
    id: 4,
    name: "あかり",
    salonId: 4,
    salonName: "蒼天スパ 西新",
    workHours: "13:00〜22:00",
    area: "博多・住吉",
    comment: "肩こりや腰の疲れが気になる方、ぜひお任せください",
  },
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
    id: 6,
    name: "こはる",
    salonId: 10,
    salonName: "Spa Maison 六本松",
    workHours: "12:00〜20:00",
    area: "福岡県その他",
    comment: "欧州式ケアで全身すっきり♪初めての方も大歓迎です",
  },
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
    id: 8,
    name: "まなか",
    salonId: 9,
    salonName: "翠月 -Suigetsu- 久留米",
    workHours: "13:00〜22:00",
    area: "久留米",
    comment: "初回の方も安心してお越しください。丁寧にご案内します",
  },
];
