// ★ 第1792便（カッキーさん・2026-11-08）: 公式HPに入れる計測の小さなスクリプト（HpShell が全ページに置く）。
//   ★ 送るのは: ページを見た／電話・LINE を押した／お問い合わせを送った、の4つだけ。名前・電話番号などは送らない。
//   ★ 第1940便: 駅ちか（ranking-deli.jp）へのリンクを押したことも送る（写メ日記・出勤・口コミ・セラピストのどれか）。
//     写メ日記・口コミの埋め込み（iframe・同じホストの /embed）の中で押した分は、埋め込みが postMessage で知らせてくる（同じ origin だけ受け取る）
//   ★ 人の数え方（端末の中だけで覚える・Cookie は使わない）:
//       localStorage fk_hp_first … その端末が最初に来た流入元（はじめての人の判定にも使う）
//       localStorage fk_hp_day   … 最後に見た日（日本時間）＝ その日はじめてなら「人数」に1
//       sessionStorage fk_hp_src … このタブで最初に来た流入元（＝訪問の始まり）
//   ★ 流入元の決まりは src/lib/hpStats.ts の normalizeHpSource と同じ（サーバーでもう一度そろえる）。
//   ★ プレビュー（/preview/）では送らない。送り先は同じホストの /api/hp/track（独自ドメインでも /api はフクエス本体のまま）。

export function hpTrackScript(siteKey: string): string {
  const k = JSON.stringify(siteKey);
  return `(function(){try{
if(/\\/preview\\//.test(location.pathname))return;
var K=${k};var ls=window.localStorage,ss=window.sessionStorage;
var day=new Date(Date.now()+324e5).toISOString().slice(0,10);
function src(){var q=new URLSearchParams(location.search);var u=q.get('utm_source');if(u)return u.slice(0,80);
var r=document.referrer;if(!r)return '(direct)';try{var h=new URL(r).hostname;if(h===location.hostname)return '(direct)';return h}catch(e){return '(direct)'}}
var nu=!ls.getItem('fk_hp_first');var ns=!ss.getItem('fk_hp_src');
if(ns){ss.setItem('fk_hp_src',src())}
var S=ss.getItem('fk_hp_src')||'(direct)';
if(nu){ls.setItem('fk_hp_first',S)}
var F=ls.getItem('fk_hp_first')||S;
var u=ls.getItem('fk_hp_day')!==day;if(u){ls.setItem('fk_hp_day',day)}
var D=/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)?'sp':'pc';
function send(t,x){var b=JSON.stringify(Object.assign({k:K,t:t,p:location.pathname,s:S,f:F,d:D},x||{}));
try{if(navigator.sendBeacon&&navigator.sendBeacon('/api/hp/track',new Blob([b],{type:'text/plain'})))return}catch(e){}
try{fetch('/api/hp/track',{method:'POST',body:b,keepalive:true,headers:{'content-type':'text/plain'}})}catch(e){}}
send('pv',{ns:ns?1:0,nu:nu?1:0,u:u?1:0});
document.addEventListener('click',function(e){var a=e.target&&e.target.closest?e.target.closest('a'):null;if(!a)return;var h=a.getAttribute('href')||'';
if(/^tel:/i.test(h))send('tel');else if(a.getAttribute('data-hp-ev')==='book')send('book');else if(a.getAttribute('data-hp-ev')==='line'||/(^|\\/\\/)(line\\.me|lin\\.ee)\\//i.test(h))send('line');else ek(h)},true);
function ek(h){var m=/^https:\\/\\/ranking-deli\\.jp(\\/[^?#]*)/i.exec(h||'');if(!m)return;var p=m[1];
if(/\\/maildiary\\//.test(p))send('ek_diary');else if(/\\/schedule\\//.test(p))send('ek_schedule');else if(/\\/review\\//.test(p))send('ek_review');else if(/\\/\\d+\\/\\d+\\/?$/.test(p))send('ek_therapist')}
window.addEventListener('message',function(e){if(e.origin!==location.origin||!e.data||typeof e.data.fkHpEk!=='string')return;ek(e.data.fkHpEk)});
window.__fkHpTrack=function(t){if(t==='contact')send('contact')};
}catch(e){}})();`;
}
