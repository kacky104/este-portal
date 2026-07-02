'use client';

import type { MyJob } from '@/app/actions/jobs';

// 求人フォームの共通フィールド（mypage求人タブ／admin求人管理で共用）。
// 表示専用のコントロールド・コンポーネント。保存やバリデーションは呼び出し側（サーバーアクション）が担う。

export type JobFormState = {
  title: string;
  description: string;
  employment_type: string;
  salary_text: string;
  salary_min: string;
  salary_max: string;
  work_hours: string;
  requirements: string;
  benefits: string;
  access: string;
  notify_email: string;
};

// 雇用形態の選択肢（DB値＝schema.org値。デフォルトは業務委託）。
export const EMPLOYMENT_OPTIONS: { value: string; label: string }[] = [
  { value: 'CONTRACTOR', label: '業務委託' },
  { value: 'PART_TIME', label: 'アルバイト' },
  { value: 'FULL_TIME', label: '正社員' },
  { value: 'OTHER', label: 'その他' },
];

export const EMPTY_JOB_FORM: JobFormState = {
  title: '',
  description: '',
  employment_type: 'CONTRACTOR',
  salary_text: '',
  salary_min: '',
  salary_max: '',
  work_hours: '',
  requirements: '',
  benefits: '',
  access: '',
  notify_email: '',
};

// MyJob（サーバー取得）→ フォーム状態（数値は文字列化・空欄化）。
export function jobToForm(job: MyJob): JobFormState {
  return {
    title: job.title,
    description: job.description,
    employment_type: job.employment_type || 'CONTRACTOR',
    salary_text: job.salary_text,
    salary_min: job.salary_min == null ? '' : String(job.salary_min),
    salary_max: job.salary_max == null ? '' : String(job.salary_max),
    work_hours: job.work_hours,
    requirements: job.requirements,
    benefits: job.benefits,
    access: job.access,
    notify_email: job.notify_email,
  };
}

const inputClass =
  'w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50/50 focus:outline-none focus:ring-2 focus:ring-emerald-200';

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="text-[11px] font-bold text-slate-400 block mb-1">
      {children}
      {required && <span className="text-rose-400"> *</span>}
    </label>
  );
}

export function JobFields({
  value,
  onChange,
}: {
  value: JobFormState;
  onChange: (patch: Partial<JobFormState>) => void;
}) {
  return (
    <div className="space-y-4">
      {/* タイトル（必須） */}
      <div>
        <Label required>求人タイトル</Label>
        <input
          type="text"
          className={inputClass}
          placeholder="例）未経験歓迎！アロマセラピスト募集"
          value={value.title}
          onChange={(e) => onChange({ title: e.target.value })}
        />
      </div>

      {/* 雇用形態 */}
      <div>
        <Label>雇用形態</Label>
        <select
          className={inputClass}
          value={value.employment_type}
          onChange={(e) => onChange({ employment_type: e.target.value })}
        >
          {EMPLOYMENT_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {/* 給与（表示テキスト・必須） */}
      <div>
        <Label required>給与（表示テキスト）</Label>
        <input
          type="text"
          className={inputClass}
          placeholder="例）日給20,000円〜／完全歩合"
          value={value.salary_text}
          onChange={(e) => onChange({ salary_text: e.target.value })}
        />
      </div>

      {/* 給与レンジ（任意・両方 or 両方空。構造化データ baseSalary に使用） */}
      <div>
        <Label>給与レンジ（任意・数値のみ／構造化データ用）</Label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            step={1000}
            className={`${inputClass} text-right`}
            placeholder="下限"
            value={value.salary_min}
            onChange={(e) => onChange({ salary_min: e.target.value })}
          />
          <span className="text-sm text-slate-400 flex-none">〜</span>
          <input
            type="number"
            min={0}
            step={1000}
            className={`${inputClass} text-right`}
            placeholder="上限"
            value={value.salary_max}
            onChange={(e) => onChange({ salary_max: e.target.value })}
          />
          <span className="text-xs text-slate-400 flex-none">円</span>
        </div>
        <p className="text-[10px] text-slate-400 mt-1">
          下限・上限は「両方入力」か「両方空欄」で。片方だけは保存できません（日給想定）。
        </p>
      </div>

      {/* 任意項目 */}
      <div>
        <Label>勤務時間</Label>
        <input
          type="text"
          className={inputClass}
          placeholder="例）12:00〜翌1:00の間で応相談"
          value={value.work_hours}
          onChange={(e) => onChange({ work_hours: e.target.value })}
        />
      </div>

      <div>
        <Label>応募資格</Label>
        <textarea
          className={`${inputClass} min-h-[64px] resize-y`}
          placeholder="例）18歳以上（高校生不可）・未経験歓迎"
          value={value.requirements}
          onChange={(e) => onChange({ requirements: e.target.value })}
        />
      </div>

      <div>
        <Label>待遇</Label>
        <textarea
          className={`${inputClass} min-h-[64px] resize-y`}
          placeholder="例）入店祝い金あり・寮完備・自由出勤"
          value={value.benefits}
          onChange={(e) => onChange({ benefits: e.target.value })}
        />
      </div>

      <div>
        <Label>アクセス</Label>
        <input
          type="text"
          className={inputClass}
          placeholder="例）地下鉄天神駅より徒歩3分"
          value={value.access}
          onChange={(e) => onChange({ access: e.target.value })}
        />
      </div>

      {/* 応募通知メール（任意）。空欄ならネット予約の通知先（salons.booking_email）に届く。 */}
      <div>
        <Label>応募通知メール</Label>
        <input
          type="email"
          className={inputClass}
          placeholder="空欄の場合はネット予約の通知先に届きます"
          value={value.notify_email}
          onChange={(e) => onChange({ notify_email: e.target.value })}
        />
      </div>

      {/* 仕事内容（必須） */}
      <div>
        <Label required>仕事内容</Label>
        <textarea
          className={`${inputClass} min-h-[120px] resize-y`}
          placeholder="お仕事の内容・1日の流れ・お店の雰囲気など"
          value={value.description}
          onChange={(e) => onChange({ description: e.target.value })}
        />
      </div>
    </div>
  );
}
