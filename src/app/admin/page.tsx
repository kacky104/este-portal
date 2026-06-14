'use client';

import { useState } from 'react';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState<'info' | 'therapists' | 'diary'>('info');

  const [salonName, setSalonName] = useState('天空スパ 天神');
  const [salonHours, setSalonHours] = useState('12:00〜翌4:00');
  const [diaryTitle, setDiaryTitle] = useState('');
  const [diaryContent, setDiaryContent] = useState('');

  const [therapists, setTherapists] = useState([
    { id: 't1', name: 'えま', hours: '19:00〜翌4:00', status: 'ON' },
    { id: 't3', name: 'ひなた', hours: '12:00〜21:00', status: 'OFF' },
    { id: 't9', name: 'めい', hours: '14:00〜23:00', status: 'END' },
  ]);

  const toggleStatus = (id: string, current: string) => {
    const nextMap: Record<string, string> = { ON: 'END', END: 'OFF', OFF: 'ON' };
    setTherapists(therapists.map(t => t.id === id ? { ...t, status: nextMap[current] } : t));
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col pb-12">
      <header className="bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white p-4 shadow-md flex justify-between items-center flex-shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xl">⚙️</span>
          <div>
            <h1 className="text-xs font-black tracking-wider opacity-85">SALON BOARD</h1>
            <p className="text-sm font-bold">{salonName} 管理画面</p>
          </div>
        </div>
        <button type="button" className="text-[10px] font-bold bg-white/20 px-3 py-1.5 rounded-xl hover:bg-white/30 transition-colors">ログアウト</button>
      </header>

      <div className="bg-white border-b border-pink-100 flex text-center text-xs font-bold text-slate-500 flex-shrink-0">
        <button onClick={() => setActiveTab('info')} className={`flex-1 py-3.5 border-b-2 transition-colors ${activeTab === 'info' ? 'border-pink-500 text-pink-600 bg-pink-50/10' : 'border-transparent text-slate-400'}`}>店舗情報</button>
        <button onClick={() => setActiveTab('therapists')} className={`flex-1 py-3.5 border-b-2 transition-colors ${activeTab === 'therapists' ? 'border-pink-500 text-pink-600 bg-pink-50/10' : 'border-transparent text-slate-400'}`}>出勤管理</button>
        <button onClick={() => setActiveTab('diary')} className={`flex-1 py-3.5 border-b-2 transition-colors ${activeTab === 'diary' ? 'border-pink-500 text-pink-600 bg-pink-50/10' : 'border-transparent text-slate-400'}`}>日記投稿</button>
      </div>

      <main className="p-4 max-w-md mx-auto w-full flex-1">

        {activeTab === 'info' && (
          <div className="bg-white rounded-3xl p-5 border border-pink-100/60 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b border-pink-50 pb-2"><span>🏠</span> 店舗基本情報の変更</h3>
            <div className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-400 block px-0.5">サロン名</label>
                <input type="text" value={salonName} onChange={(e) => setSalonName(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-pink-400 focus:outline-hidden bg-slate-50/30" />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-400 block px-0.5">営業時間</label>
                <input type="text" value={salonHours} onChange={(e) => setSalonHours(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-pink-400 focus:outline-hidden bg-slate-50/30" />
              </div>
              <button onClick={() => alert('店舗情報を保存しました！')} className="w-full py-3 rounded-xl bg-pink-500 text-white font-bold shadow-xs hover:bg-pink-600 transition-colors mt-2">設定を保存する ✨</button>
            </div>
          </div>
        )}

        {activeTab === 'therapists' && (
          <div className="bg-white rounded-3xl p-5 border border-pink-100/60 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b border-pink-50 pb-2"><span>⏰</span> 本日の出勤ステータス</h3>
            <p className="text-[10px] text-slate-400 leading-tight">ボタンを押すだけで「本日出勤 ↔ 受付終了 ↔ 休日」が瞬時に切り替わります。</p>
            <div className="space-y-2.5">
              {therapists.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-2xl bg-slate-50/30 text-xs">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{t.name} さん</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">登録時間: {t.hours}</p>
                  </div>
                  <button onClick={() => toggleStatus(t.id, t.status)} type="button" className={`px-4 py-2 rounded-xl font-bold text-[11px] shadow-xs min-w-[84px] text-center transition-all ${t.status === 'ON' ? 'bg-emerald-500 text-white' : t.status === 'END' ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-500'}`}>
                    {t.status === 'ON' ? '本日出勤' : t.status === 'END' ? '受付終了' : '休日'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'diary' && (
          <div className="bg-white rounded-3xl p-5 border border-pink-100/60 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-1.5 border-b border-pink-50 pb-2"><span>📷</span> 最新の写メ日記を投稿</h3>
            <div className="space-y-3.5 text-xs">
              <div className="space-y-1">
                <label className="font-bold text-slate-400 block px-0.5">日記のタイトル</label>
                <input type="text" placeholder="例：おにゅーのルームウェア✿" value={diaryTitle} onChange={(e) => setDiaryTitle(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-pink-400 focus:outline-hidden bg-slate-50/30" />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-400 block px-0.5">日記の本文</label>
                <textarea rows={5} placeholder="例：今日から新しいお部屋着にしました♡ 会いにきてね！" value={diaryContent} onChange={(e) => setDiaryContent(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-pink-400 focus:outline-hidden bg-slate-50/30 resize-none leading-relaxed" />
              </div>
              <div className="space-y-1">
                <label className="font-bold text-slate-400 block px-0.5">写メ画像をアップロード</label>
                <div className="border-2 border-dashed border-pink-100 rounded-xl p-4 text-center bg-pink-50/10 hover:bg-pink-50/30 transition-colors relative cursor-pointer">
                  <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={() => alert('画像が選択されました（Bパターンの画像保存に連動します）')} />
                  <span className="text-xl">📸</span>
                  <p className="text-[10px] text-pink-500 font-bold mt-1">写真ファイルを選択する</p>
                  <p className="text-[9px] text-slate-400 mt-0.5">※スマホのカメラ写真もそのままOK</p>
                </div>
              </div>
              <button onClick={() => { alert('日記をポータルサイトに投稿しました！'); setDiaryTitle(''); setDiaryContent(''); }} className="w-full py-3 rounded-xl bg-gradient-to-r from-pink-500 to-fuchsia-500 text-white font-bold shadow-md mt-2">この内容で日記を公開する 🚀</button>
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
