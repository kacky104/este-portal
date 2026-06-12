import LoginForm from "./LoginForm";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-pink-50 border border-pink-200 mb-4">
            <span className="text-pink-500 font-bold text-xl leading-none">◆</span>
          </div>
          <h1 className="text-xl font-bold text-slate-900">サロンオーナーログイン</h1>
          <p className="text-sm text-slate-500 mt-1">福岡メンズエステポータル 管理画面</p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
