'use client';

import { useState } from 'react';
import type { MyJob } from '@/app/actions/jobs';
import {
  JOB_FEATURE_GROUPS,
  featureLabel,
  MAX_JOB_FEATURES,
  isValidEmailFormat,
  MAX_JOB_AREA_LEN,
  MAX_JOB_WORK_HOURS_LEN,
  MAX_JOB_BENEFITS_LEN,
  MAX_JOB_QUALIFICATIONS_LEN,
  type JobGalleryItem,
  type TherapistVoice,
} from '@/app/lib/jobs';
import { JobHeroImageField } from '@/app/components/JobHeroImageField';
import { JobGalleryField } from '@/app/components/JobGalleryField';
import { JobVoicesField } from '@/app/components/JobVoicesField';

// 求人フォームの共通フィールド（mypage求人タブ／admin求人管理で共用）。
// 表示専用のコントロールド・コンポーネント。保存やバリデーションは呼び出し側（サーバーアクション）が担う。

export type JobFormState = {
  title: string;
  description: string;
  salary_text: string;
  salary_min: string;
  salary_max: string;
  // 募集要項の4項目。area / qualifications は新カラム、work_hours / benefits は既存カラム流用。
  area: string;
  work_hours: string;
  benefits: string;
  qualifications: string;
  notify_email: string;
  // 応募用の公開連絡先（任意）。求人ページに表示する。notify_email（非公開の通知先）とは別物。
  apply_email: string;
  apply_line_url: string;
  features: string[];
  hero_image_urls: string[];
  gallery_images: JobGalleryItem[];
  therapist_voices: TherapistVoice[];
};

export const EMPTY_JOB_FORM: JobFormState = {
  title: '',
  description: '',
  salary_text: '',
  salary_min: '',
  salary_max: '',
  area: '',
  work_hours: '',
  benefits: '',
  qualifications: '',
  notify_email: '',
  apply_email: '',
  apply_line_url: '',
  features: [],
  hero_image_urls: [],
  gallery_images: [],
  therapist_voices: [],
};

// MyJob（サーバー取得）→ フォーム状態（数値は文字列化・空欄化）。
export function jobToForm(job: MyJob): JobFormState {
  return {
    title: job.title,
    description: job.description,
    salary_text: job.salary_text,
    salary_min: job.salary_min == null ? '' : String(job.salary_min),
    salary_max: job.salary_max == null ? '' : String(job.salary_max),
    area: job.area,
    work_hours: job.work_hours,
    benefits: job.benefits,
    qualifications: job.qualifications,
    notify_email: job.notify_email,
    apply_email: job.apply_email ?? '',
    apply_line_url: job.apply_line_url ?? '',
    features: [...job.features],
    hero_image_urls: [...job.hero_image_urls],
    gallery_images: job.gallery_images.map((g) => ({ ...g })),
    therapist_voices: job.therapist_voices.map((v) => ({ ...v })),
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

// 募集要項フィールド用のラベル＋字数カウンター付きラッパー。超過時はカウンターを赤くする
// （サーバーではクランプするため保存自体は通るが、切り詰められる旨を視覚で伝える）。
function FieldWithCount({
  label,
  count,
  max,
  children,
}: {
  label: string;
  count: number;
  max: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <Label>{label}</Label>
        <span className={`text-[10px] ${count > max ? 'text-rose-500 font-bold' : 'text-slate-400'}`}>
          {count}/{max}
        </span>
      </div>
      {children}
    </div>
  );
}

export function JobFields({
  value,
  onChange,
  salonId,
}: {
  value: JobFormState;
  onChange: (patch: Partial<JobFormState>) => void;
  // 求人バナー画像のアップロード先フォルダ（={salon_id}）。未指定/未選択（代理作成でサロン未選択）では
  // アップロード欄を無効化する。
  salonId?: number | null;
}) {
  // 最大数に達した状態で未選択タグを押したときの警告（クライアント側）。
  const [featureWarn, setFeatureWarn] = useState(false);
  const atMax = value.features.length >= MAX_JOB_FEATURES;

  const toggleFeature = (slug: string) => {
    if (value.features.includes(slug)) {
      setFeatureWarn(false);
      onChange({ features: value.features.filter((s) => s !== slug) });
    } else {
      if (atMax) {
        setFeatureWarn(true);
        return;
      }
      setFeatureWarn(false);
      onChange({ features: [...value.features, slug] });
    }
  };

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
          下限・上限は「両方入力」か「両方空欄」で。片方だけは保存できません（日給想定）。サイトには表示されませんが、入力するとGoogle検索で貴店の求人が表示されやすくなります。
        </p>
      </div>

      {/* 募集要項（任意・4項目）。求人詳細の「募集要項」表にそのまま並ぶ。上限字数はサーバーで
          クランプするが、UI にも字数カウンターを出して超過に気付けるようにする。 */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-3.5 space-y-3">
        <p className="text-[11px] font-bold text-emerald-700">募集要項（任意）</p>

        <FieldWithCount label="エリア" count={value.area.length} max={MAX_JOB_AREA_LEN}>
          <input
            type="text"
            className={inputClass}
            placeholder="例: 博多・中洲エリア／博多駅から徒歩5分"
            value={value.area}
            onChange={(e) => onChange({ area: e.target.value })}
          />
        </FieldWithCount>

        <FieldWithCount label="勤務時間" count={value.work_hours.length} max={MAX_JOB_WORK_HOURS_LEN}>
          <input
            type="text"
            className={inputClass}
            placeholder="例: 10:00〜LAST／自由出勤・週1日〜OK"
            value={value.work_hours}
            onChange={(e) => onChange({ work_hours: e.target.value })}
          />
        </FieldWithCount>

        <FieldWithCount label="待遇" count={value.benefits.length} max={MAX_JOB_BENEFITS_LEN}>
          <textarea
            className={`${inputClass} min-h-[64px] resize-y`}
            placeholder="例: 日払いOK・完全個室待機・講習無料・ノルマなし"
            value={value.benefits}
            onChange={(e) => onChange({ benefits: e.target.value })}
          />
        </FieldWithCount>

        <FieldWithCount label="応募資格" count={value.qualifications.length} max={MAX_JOB_QUALIFICATIONS_LEN}>
          <textarea
            className={`${inputClass} min-h-[64px] resize-y`}
            placeholder="例: 18歳以上（高校生不可）・未経験歓迎"
            value={value.qualifications}
            onChange={(e) => onChange({ qualifications: e.target.value })}
          />
        </FieldWithCount>
      </div>

      {/* 特徴タグ（任意・最大6個）。選んだタグの絞り込みページ /jobs/tag/[slug] に掲載される。 */}
      <div>
        <Label>特徴タグ（任意・最大{MAX_JOB_FEATURES}個）</Label>
        <p className="text-[10px] text-slate-400 mb-2">
          選んだタグの絞り込みページに掲載されます。現在 {value.features.length}/{MAX_JOB_FEATURES} 個
        </p>
        <div className="space-y-3">
          {JOB_FEATURE_GROUPS.map((g) => (
            <div key={g.title}>
              <p className="text-[11px] font-bold text-slate-500 mb-1.5">{g.title}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1.5">
                {g.slugs.map((slug) => {
                  const checked = value.features.includes(slug);
                  const disabled = !checked && atMax; // 上限到達時は未選択を不可
                  return (
                    <label
                      key={slug}
                      className={`inline-flex items-center gap-1 text-xs select-none ${
                        disabled ? 'text-slate-300 cursor-not-allowed' : 'text-slate-600 cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="accent-emerald-500 w-3.5 h-3.5"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleFeature(slug)}
                      />
                      {featureLabel(slug)}
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {featureWarn && (
          <p className="text-[10px] text-rose-500 mt-2">特徴タグは最大{MAX_JOB_FEATURES}個までです。</p>
        )}
      </div>

      {/* 応募通知メール（必須）。応募があるとこのアドレスに通知が届く。 */}
      <div>
        <Label required>応募通知メール</Label>
        <input
          type="email"
          className={inputClass}
          placeholder="例）owner@example.com"
          value={value.notify_email}
          onChange={(e) => onChange({ notify_email: e.target.value })}
        />
        {value.notify_email.trim() !== '' && !isValidEmailFormat(value.notify_email) && (
          <p className="text-[10px] text-rose-500 mt-1">メールアドレスの形式が正しくありません。</p>
        )}
      </div>

      {/* 応募用の公開連絡先（任意）。求人ページの応募セクションに表示される。未入力の手段は非表示。
          notify_email（非公開の応募通知先）とは別物であることを注記で明示する。 */}
      <div>
        <Label>応募用メールアドレス（任意・公開）</Label>
        <input
          type="email"
          className={inputClass}
          placeholder="recruit@example.com"
          value={value.apply_email}
          onChange={(e) => onChange({ apply_email: e.target.value })}
        />
        <p className="text-[10px] text-slate-400 mt-1">求人ページに公開されます。応募通知メールとは別の設定です。</p>
        {value.apply_email.trim() !== '' && !isValidEmailFormat(value.apply_email) && (
          <p className="text-[10px] text-rose-500 mt-1">メールアドレスの形式が正しくありません。</p>
        )}
      </div>

      <div>
        <Label>応募用LINE URL（任意・公開）</Label>
        <input
          type="url"
          className={inputClass}
          placeholder="https://lin.ee/xxxxx"
          value={value.apply_line_url}
          onChange={(e) => onChange({ apply_line_url: e.target.value })}
        />
        <p className="text-[10px] text-slate-400 mt-1">LINE公式アカウントや友だち追加のURL（https://〜）。</p>
      </div>

      {/* 求人バナー画像（16:9・最大3枚・任意）。先頭が一覧・SNSシェア・「注目の求人」バナーで使われる。 */}
      <JobHeroImageField
        salonId={salonId ?? null}
        value={value.hero_image_urls}
        onChange={(urls) => onChange({ hero_image_urls: urls })}
      />

      {/* お店の雰囲気ギャラリー（正方形・最大6枚・任意・各画像にキャプション）。求人詳細に掲載。 */}
      <JobGalleryField
        salonId={salonId ?? null}
        value={value.gallery_images}
        onChange={(items) => onChange({ gallery_images: items })}
      />

      {/* 在籍セラピストの声（インタビュー形式・最大3件・任意）。求人詳細に掲載。 */}
      <JobVoicesField
        value={value.therapist_voices}
        onChange={(voices) => onChange({ therapist_voices: voices })}
      />

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
