// 掲載のご案内（/listing）の料金（src/lib/listingPlan.ts）の自己点検（第1301便・2026-10-08）。
//
// ★★★ ここで見張っているのは:
//   ① 金額のつじつま（掲載料 − キャンペーンの割引 ＝ キャンペーン後／セットのオプションは税込にすると lib/setPlan.ts と同じ額）
//   ② /listing に、古い料金・予約ボード・税込の書き方が戻っていないこと（★ /listing は税別で出すと決めた）
//   ③ 金額を部品に直接書いていないこと（値は lib/listingPlan.ts の1か所）
//   ④ 古い掲載案内 PDF への入口が出ていないこと（新しい PDF ができるまで）
//
//   使い方:  npm run check:listingplan

const fs = require('fs');
const path = require('path');
const m = require(path.join(__dirname, '..', '_tmpcheck', 'listingPlan.js'));
const sp = require(path.join(__dirname, '..', '_tmpcheck', 'setPlan.js'));

let fail = 0;
const eq = (name, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) { console.log('NG ' + name + '\n   got  ' + g + '\n   want ' + w); fail++; }
  else console.log('ok ' + name);
};
const read = (...p) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');
/** 注記（// と {/* … *​/} と /* … *​/）を外した中身。★ 注記には経緯として古い金額を書いてよい */
const code = (src) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');

console.log('── 1. ★★★ 金額（カッキーさんの決定・10/8・すべて税別）──');
{
  eq('掲載料 月額120,000円', m.LISTING_FEE_YEN, 120000);
  eq('創業掲載協力キャンペーン 月額30,000円の割引', m.LISTING_CAMPAIGN_OFF_YEN, 30000);
  eq('★★★ キャンペーン後 ＝ 掲載料 − 割引 ＝ 90,000円', [m.LISTING_CAMPAIGN_FEE_YEN, m.LISTING_FEE_YEN - m.LISTING_CAMPAIGN_OFF_YEN], [90000, 90000]);
  eq('公式ホームページ 年間10,000円', m.LISTING_HP_YEARLY_YEN, 10000);
  eq('コネックエフ＋フクエスCRM 月額20,000円', m.LISTING_SET_OPTION_YEN, 20000);
  eq('★★★ セットのオプションは、税込にすると lib/setPlan.ts と同じ額（片方だけ変えていない）', Math.round(m.LISTING_SET_OPTION_YEN * 1.1), sp.SET_PLAN_PRICE_YEN);
  eq('書き方は税別', m.LISTING_TAX_LABEL, '税別');
  eq('桁区切り', [m.listingYen(120000), m.listingYen(90000), m.listingYen(0)], ['120,000', '90,000', '0']);
}

console.log('\n── 2. 機能一覧・含まれるもの ──');
{
  eq('機能は10（見出しの「10の機能」と合う）', m.LISTING_FEATURES.length, 10);
  eq('番号は 01〜10 の順', m.LISTING_FEATURES.map((f) => f.no), ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10']);
  eq('★★★ 有料オプションの札が付くのは 09（コネックエフ＋フクエスCRM）だけ',
    m.LISTING_FEATURES.filter((f) => f.option === true).map((f) => f.no + ' ' + f.name), ['09 コネックエフ＋フクエスCRM']);
  const all = JSON.stringify([m.LISTING_FEATURES, m.LISTING_INCLUDED]);
  eq('★★★ 予約ボードを載せていない', /予約ボード/.test(all), false);
  eq('掲載料に含まれるもの: フクエス・フクエスワーク・fukuX', m.LISTING_INCLUDED.map((x) => x.name), ['フクエス 店舗掲載', 'フクエスワーク 求人掲載', 'fukuX（フクエックス）']);
  eq('★★ 掲載料に含まれるものに、有料オプション（コネックエフ・CRM）を入れていない', /コネックエフ|CRM/.test(JSON.stringify(m.LISTING_INCLUDED)), false);
}

console.log('\n── 3. ★★★ /listing の部品（注記を外した中身）──');
{
  const dir = path.join(__dirname, '..', 'src', 'app', 'listing');
  // いま画面に出している部品（ListingGuidePdfLink は出していない）
  const shown = ['page.tsx', 'ListingAbout.tsx', 'ListingFeatures.tsx', 'ListingPricePlans.tsx', 'ListingHpPromo.tsx', 'ListingContactHeading.tsx'];
  const body = Object.fromEntries(shown.map((f) => [f, code(fs.readFileSync(path.join(dir, f), 'utf8'))]));
  const has = (re) => shown.filter((f) => re.test(body[f]));
  eq('★★★ 予約ボードを書いていない', has(/予約ボード/), []);
  eq('★★★ 古い料金（66,000・33,000・165,000・11,000）を書いていない', has(/66,000|33,000|165,000|11,000/), []);
  eq('★★★ 税込と書いていない（/listing は税別）', has(/税込/), []);
  eq('★★ 金額を部品に直接書いていない（lib/listingPlan.ts の値を使う）', has(/120,000|90,000|30,000|20,000|10,000/), []);
  eq('★★ 部品は画像を読んでいない（いまは文字で組んでいる。画像に戻したら、この行と sr-only を一緒に直す）',
    shown.filter((f) => f !== 'page.tsx' && /\/listing\/[a-z-]+\.webp/.test(body[f])), []);
  eq('★★★ 古い掲載案内 PDF への入口を出していない', /<ListingGuidePdfLink\b|fukues-listing-guide\.pdf/.test(body['page.tsx']), false);
  eq('料金プランは、キャンペーンの名前と3つの金額を lib から出している',
    ['LISTING_CAMPAIGN_NAME', 'LISTING_FEE_YEN', 'LISTING_CAMPAIGN_FEE_YEN', 'LISTING_CAMPAIGN_OFF_YEN', 'LISTING_SET_OPTION_YEN'].filter((k) => !body['ListingPricePlans.tsx'].includes(k)), []);
  eq('★★ 期限を書いていない（カッキーさんの決定: 期限は書かない）', has(/まで(の|に)ご契約|先着|月末まで|期間限定/), []);
  // ページ下の「無料掲載について」が名前で指している見出し
  eq('★ 見出し「掲載店舗様でできること」が見える形で在る', />\s*掲載店舗様でできること\s*</.test(body['ListingAbout.tsx']) && !/sr-only">\s*掲載店舗様でできること/.test(body['ListingAbout.tsx']), true);
}

console.log('\n── 4. ★★★ 公式ホームページ制作（/hp/templates・lib/hpPlan.ts・税別にそろえた・第1303便）──');
{
  const hp = require(path.join(__dirname, '..', '_tmpcheck', 'hpPlan.js'));
  eq('★ 定価は残す（カッキーさんの決定）: 制作料150,000円・月額10,000円・ドメイン更新料 年10,000円（税別）',
    [hp.HP_LIST_SETUP_YEN, hp.HP_LIST_MONTHLY_YEN, hp.HP_LIST_DOMAIN_YEN, hp.HP_TAX_LABEL], [150000, 10000, 10000, '税別']);
  eq('★ 税込のときの額（165,000・11,000・11,000・3,300）の1.1分の1', [hp.HP_LIST_SETUP_YEN * 1.1, hp.HP_LIST_MONTHLY_YEN * 1.1, hp.HP_LIST_DOMAIN_YEN * 1.1, hp.HP_WORK_FEE_YEN * 1.1].map(Math.round), [165000, 11000, 11000, 3300]);
  eq('★★★ 掲載店さまの年間の維持費は、/listing と同じ値（10,000円・税別）', [hp.HP_MEMBER_YEARLY_YEN, m.LISTING_HP_YEARLY_YEN], [10000, 10000]);
  const page = code(read('src', 'app', 'hp', 'templates', 'page.tsx'));
  const price = code(read('src', 'app', 'hp', 'templates', 'HpPrice.tsx'));
  eq('★★★ 「フクエスワークにも掲載なら」の条件を書いていない', [/フクエスワークにも/.test(page), /フクエスワークにも/.test(price)], [false, false]);
  eq('★★ 料金は文字の部品（HpPrice）で出している（古い料金の画像を読んでいない）', [page.includes('<HpPrice />'), /hp-lp\/price-(pc|sp)\.webp/.test(page)], [true, false]);
  eq('★★ 構造化データの定価は lib の値から作り、税抜きと明示している', [/HP_LIST_SETUP_YEN\]/.test(page) || page.includes("['制作料（初回のみ）', HP_LIST_SETUP_YEN]"), page.includes('valueAddedTaxIncluded: false')], [true, true]);
  eq('★★★ 税込の額・書き方が残っていない（/hp/templates も税別）', [page, price].map((t) => /税込|165,000|11,000|3,300|'165000'|'11000'/.test(t)), [false, false]);
}

console.log(fail === 0 ? '\n全部 ok' : '\nNG ' + fail + ' 件');
process.exit(fail === 0 ? 0 : 1);
