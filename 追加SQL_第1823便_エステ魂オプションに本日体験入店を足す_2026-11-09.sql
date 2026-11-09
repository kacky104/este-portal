-- 第1823便（2026-11-09）エステ魂オプションに「本日体験入店（job_now）」を足す。
-- ★ 第1799便の表の check（option_key）に job_now が入っていなかったので、/admin で ON にすると止まっていた
alter table public.conecf_esutama_options drop constraint if exists conecf_esutama_options_option_key_check;
alter table public.conecf_esutama_options add constraint conecf_esutama_options_option_key_check
  check (option_key in ('shop_boost', 'cast_appeal', 'job_appeal', 'job_now'));
