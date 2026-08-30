alter table public.public_profiles
  add column if not exists trainer_name text,
  add column if not exists headline text,
  add column if not exists presentation_mode text not null default 'mixed',
  add column if not exists card_format text not null default 'post',
  add column if not exists card_template text not null default 'balanced',
  add column if not exists photo_position_y smallint not null default 50;

alter table public.public_profiles
  drop constraint if exists public_profiles_presentation_mode_check,
  add constraint public_profiles_presentation_mode_check
    check (presentation_mode in ('photo', 'logo', 'mixed')),
  drop constraint if exists public_profiles_card_format_check,
  add constraint public_profiles_card_format_check
    check (card_format in ('post', 'story')),
  drop constraint if exists public_profiles_card_template_check,
  add constraint public_profiles_card_template_check
    check (card_template in ('personal', 'brand', 'balanced')),
  drop constraint if exists public_profiles_photo_position_y_check,
  add constraint public_profiles_photo_position_y_check
    check (photo_position_y between 0 and 100);

update public.public_profiles
set trainer_name = coalesce(nullif(trainer_name, ''), nullif(brand_name, ''), professional_title)
where trainer_name is null or trainer_name = '';
