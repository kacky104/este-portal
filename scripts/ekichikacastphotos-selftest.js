// 駅ちかの個人ページの写真（src/lib/ekichikaCastPhotos.ts）の自己点検（第427便）。
//   使い方:  npm run check:ekichikacastphotos
const v = require(require('path').join(__dirname, '..', '_tmpcheck', 'ekichikaCastPhotos.js'));
let fail = 0;
const eq = (name, got, want) => { const a = JSON.stringify(got), b = JSON.stringify(want); if (a !== b) { console.log('NG ' + name + '\n   got  ' + a + '\n   want ' + b); fail++; } else console.log('ok ' + name); };
const P = 'https://mensesthe-images.ranking-deli.jp/37168/';
const S3 = 'https://s3-ap-northeast-1.amazonaws.com/files.ranking-deli.jp/37168/';
const img = (g, n, ts) => '<img src="' + P + g + '/img' + n + '_' + ts + '.jpg" alt="">';

console.log('── 1. 抜く ──');
const html = '<div class="slider">' + img('5232208', 1, '20260809230626') + img('5232208', 3, '20260809230630')
  + '<img data-src="' + P + '5232208/img1s_20260809230626.jpg">' + img('5232208', 1, '20260809230626')
  + '</div><div class="osusume">' + img('5232190', 1, '20260617204936') + img('5232190', 2, '20260617204937') + '</div>';
const r = v.extractCastPhotos(html, '5232208');
eq('★ 本人の枠1・3だけ（サムネ・重複・ほかの子は拾わない）', r.map((x) => x.n), [1, 3]);
eq('★ 原寸 → 公開 の順', r[1].urls, [S3 + '5232208/img3_20260809230630.jpg', P + '5232208/img3_20260809230630.jpg']);
eq('ファイル名', r[0].name, 'img1_20260809230626.jpg');
eq('★ girlId が無ければ一番多い子', v.extractCastPhotos(html, null).map((x) => x.n), [1, 3]);
eq('★ 原寸の URL がページにあっても拾う', v.extractCastPhotos('<a href="' + S3 + '9/img2_20260101010101.png">', '9').map((x) => [x.n, x.name]), [[2, 'img2_20260101010101.png']]);
eq('写真が無い', v.extractCastPhotos('<img src="https://ranking-deli.jp/noimage2.jpg">', '1'), []);
eq('★ 別のホストは拾わない', v.extractCastPhotos('<img src="https://example.com/37168/1/img1_20260101010101.jpg">', '1'), []);

console.log('── 2. 取り込んでよい人 ──');
eq('0枚 → 取る', v.shouldImportCastPhotos({ profileImages: [], profileImageUrl: null }), true);
eq('null → 取る', v.shouldImportCastPhotos({ profileImages: null, profileImageUrl: '' }), true);
eq('★ 1枚でもある → 触らない', v.shouldImportCastPhotos({ profileImages: ['https://x/1.jpg'], profileImageUrl: 'https://x/1.jpg' }), false);
eq('★ 先頭の列だけある → 触らない', v.shouldImportCastPhotos({ profileImages: null, profileImageUrl: 'https://x/1.jpg' }), false);

console.log('── 3. 詰めて並べる・記録は本当の枠 ──');
eq('★ 枠1・3', v.planCastPhotoSave([{ n: 3, url: 'u3' }, { n: 1, url: 'u1' }]), { profileImages: ['u1', 'u3'], profileImageUrl: 'u1', records: [{ imageSlot: 1, sourceUrl: 'u1' }, { imageSlot: 3, sourceUrl: 'u3' }] });
eq('0枚', v.planCastPhotoSave([]), { profileImages: [], profileImageUrl: null, records: [] });

console.log('── 4. 駅ちかの写真が変わったら取り込み直す（第1101便・カッキーさん）──');
const FU = 'https://x.supabase.co/storage/v1/object/public/therapist-photos/';
const mine = (id, n, ms) => FU + id + '-ekichika' + n + '-' + ms + '.jpg';
const rem = (n, ts) => ({ n, urls: [], name: 'img' + n + '_' + ts + '.jpg' });
const T0 = Date.UTC(2026, 8, 28, 0, 0, 0);   // 取り込んだ時刻（2026-09-28 00:00 UTC）
eq('取り込んだ写真の URL を読む', v.parseImportedPhotoUrl(mine(656, 1, 1790543646728)), { therapistId: 656, n: 1, stampMs: 1790543646728 });
eq('★★ 店舗様が入れた写真は null', [v.parseImportedPhotoUrl(FU + '50-1783480573101.jpg'), v.parseImportedPhotoUrl(null), v.parseImportedPhotoUrl('')], [null, null, null]);
eq('★ ?v= が付いていても読む', v.parseImportedPhotoUrl(mine(7, 3, 1790000000000) + '?v=2').n, 3);
eq('駅ちかの名前の時刻を読む（UTC として）', v.ekichikaPhotoTimeMs('img1_20260809230630.jpg'), Date.UTC(2026, 7, 9, 23, 6, 30));
eq('★★ 14桁でない・ありえない日付は null', [v.ekichikaPhotoTimeMs('img1_202608.jpg'), v.ekichikaPhotoTimeMs('img1_20261340250000.jpg'), v.ekichikaPhotoTimeMs('x.jpg')], [null, null, null]);
const cur1 = { profileImages: [mine(656, 1, T0)], profileImageUrl: mine(656, 1, T0) };
eq('★★★ 取り込んだあとに駅ちかで登録し直された → 取り込み直す（ゆゆさんの例）', v.planCastPhotoFollow(cur1, [rem(1, '20261001120000')], 656), { action: 'refresh', reason: 'replaced' });
eq('★★★ 変わっていなければ何もしない', v.planCastPhotoFollow(cur1, [rem(1, '20260901120000')], 656), { action: 'none', reason: 'unchanged' });
eq('★★★ 駅ちかが0枚になった → 消す', v.planCastPhotoFollow(cur1, [], 656), { action: 'clear' });
eq('★★★ 取り込みのあとに駅ちかへ増えた枠 → 取り込み直す', v.planCastPhotoFollow(cur1, [rem(1, '20260901120000'), rem(2, '20261001120000')], 656), { action: 'refresh', reason: 'added' });
eq('★★★ フクエスに無い枠でも、取り込みより古い写真は「増えた」としない（店舗様がフクエスで消した写真を毎日入れ直さない）',
   v.planCastPhotoFollow(cur1, [rem(1, '20260901120000'), rem(2, '20260901120001')], 656), { action: 'none', reason: 'unchanged' });
eq('★★★ 駅ちかで消えた枠がある → 取り込み直す',
   v.planCastPhotoFollow({ profileImages: [mine(656, 1, T0), mine(656, 2, T0)], profileImageUrl: mine(656, 1, T0) }, [rem(1, '20260901120000')], 656), { action: 'refresh', reason: 'removed' });
eq('★★★ 店舗様が入れた写真が1枚でもあれば触らない（駅ちかが変わっても・0枚になっても）',
   [v.planCastPhotoFollow({ profileImages: [mine(656, 1, T0), FU + '656-1783480573101.jpg'], profileImageUrl: mine(656, 1, T0) }, [rem(1, '20261001120000')], 656),
    v.planCastPhotoFollow({ profileImages: [FU + '656-1783480573101.jpg'], profileImageUrl: null }, [], 656)],
   [{ action: 'none', reason: 'own_photos' }, { action: 'none', reason: 'own_photos' }]);
eq('★★ ほかの人の id が付いた写真は「取り込んだ写真」とみなさない', v.planCastPhotoFollow({ profileImages: [mine(999, 1, T0)], profileImageUrl: null }, [rem(1, '20261001120000')], 656), { action: 'none', reason: 'own_photos' });
eq('★★ 時刻を読めない名前の枠は「変わっていない」', v.planCastPhotoFollow(cur1, [{ n: 1, urls: [], name: 'img1_123456.jpg' }], 656), { action: 'none', reason: 'unchanged' });
eq('0枚の人は今までどおり（写真があれば取り込む・無ければ何もしない）',
   [v.planCastPhotoFollow({ profileImages: [], profileImageUrl: null }, [rem(1, '20260901120000')], 656), v.planCastPhotoFollow({ profileImages: null, profileImageUrl: '' }, [], 656)],
   [{ action: 'import' }, { action: 'none', reason: 'no_photos' }]);
eq('★ 先頭の列（profile_image_url）だけに取り込んだ写真がある人も見分ける', v.planCastPhotoFollow({ profileImages: null, profileImageUrl: mine(656, 1, T0) }, [rem(1, '20261001120000')], 656), { action: 'refresh', reason: 'replaced' });
eq('★ 取り込み直したあとは止まる（新しい時刻で保存されるので、次の回は「変わっていない」）',
   v.planCastPhotoFollow({ profileImages: [mine(656, 1, Date.UTC(2026, 9, 2, 18, 20, 0))], profileImageUrl: null }, [rem(1, '20261001120000')], 656), { action: 'none', reason: 'unchanged' });
console.log('── 5. 消してよいか（安全弁）──');
eq('1人だけなら消す', v.allowCastPhotoClear({ imported: 8, clears: 1 }), true);
eq('★★★ 全員が0枚に見える回は消さない（駅ちかのページの作りが変わった疑い）', v.allowCastPhotoClear({ imported: 8, clears: 8 }), false);
eq('★★ 半分を超えたら消さない／半分までなら消す', [v.allowCastPhotoClear({ imported: 8, clears: 5 }), v.allowCastPhotoClear({ imported: 8, clears: 4 })], [false, true]);
eq('0人', v.allowCastPhotoClear({ imported: 0, clears: 0 }), true);

if (fail) { console.log('\n★ ' + fail + ' 件 NG'); process.exit(1); }
console.log('\nすべて ok');
