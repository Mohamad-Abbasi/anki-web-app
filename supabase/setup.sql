-- ============================================================
-- AnkiWeb — راه‌اندازی کامل و خودکفا (idempotent)
-- این تنها فایلی است که باید اجرا کنی. چند بار هم اجرا کنی امن است.
-- Supabase → SQL Editor → کل محتوا را اجرا کن.
-- ============================================================

-- ---------- پروفایل‌ها ----------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text,
  display_name text,
  role         text not null default 'user',
  created_at   timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- ثبت‌نام → ساخت پروفایل؛ نفر اول ادمین؛ سقف ۱۰ کاربر.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare cnt int;
begin
  select count(*) into cnt from public.profiles;
  if cnt >= 10 then
    raise exception 'حداکثر ۱۰ کاربر مجاز است / user limit reached';
  end if;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when cnt = 0 then 'admin' else 'user' end)
  on conflict (id) do nothing;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users for each row execute function public.handle_new_user();

-- backfill: اگر کاربرانی از قبل ثبت‌نام کرده‌اند ولی پروفایل ندارند.
insert into public.profiles (id, email, role)
select id, email, 'user' from auth.users
on conflict (id) do nothing;

-- اگر هیچ ادمینی نیست، قدیمی‌ترین کاربر را ادمین کن.
update public.profiles set role = 'admin'
where id = (select id from auth.users order by created_at asc limit 1)
  and not exists (select 1 from public.profiles where role = 'admin');

-- ---------- جدول‌های مشترک ----------
create table if not exists public.models (
  mid text primary key, name text, type int default 0,
  flds jsonb default '[]', tmpls jsonb default '[]', css text default '',
  owner uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.decks (
  id uuid primary key default gen_random_uuid(), name text not null,
  scheduler text default 'fsrs', config jsonb default '{}',
  owner uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid references public.decks(id) on delete cascade,
  model_id text, fields jsonb default '[]', tags text[] default '{}', guid text,
  owner uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  note_id uuid references public.notes(id) on delete cascade,
  deck_id uuid references public.decks(id) on delete cascade,
  ord int default 0, pos int default 0,
  owner uuid references auth.users(id), created_at timestamptz not null default now()
);
create table if not exists public.progress (
  user_id uuid references auth.users(id) on delete cascade,
  card_id uuid references public.cards(id) on delete cascade,
  state int default 0, due bigint, interval real default 0,
  stability real, difficulty real, ease real default 2.5,
  reps int default 0, lapses int default 0, learning_step int default 0,
  last_review bigint, updated_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

-- ستون‌های updated_at و deleted (همگام‌سازی افزایشی + حذف نرم)
do $$ declare t text; begin
  foreach t in array array['models','decks','notes','cards'] loop
    execute format('alter table public.%1$s add column if not exists updated_at timestamptz not null default now();', t);
    execute format('alter table public.%1$s add column if not exists deleted boolean not null default false;', t);
  end loop;
end $$;

-- ---------- RLS ----------
alter table public.profiles enable row level security;
drop policy if exists "profiles read" on public.profiles;
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (true);
create policy "profiles admin update" on public.profiles for update to authenticated using (public.is_admin());

do $$ declare t text; begin
  foreach t in array array['models','decks','notes','cards'] loop
    execute format('alter table public.%1$s enable row level security;', t);
    execute format('drop policy if exists "%1$s read"   on public.%1$s;', t);
    execute format('drop policy if exists "%1$s insert" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s update" on public.%1$s;', t);
    execute format('drop policy if exists "%1$s delete" on public.%1$s;', t);
    execute format('create policy "%1$s read"   on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "%1$s insert" on public.%1$s for insert to authenticated with check (true);', t);
    execute format('create policy "%1$s update" on public.%1$s for update to authenticated using (owner = auth.uid() or public.is_admin()) with check (owner = auth.uid() or public.is_admin());', t);
    execute format('create policy "%1$s delete" on public.%1$s for delete to authenticated using (public.is_admin());', t);
  end loop;
end $$;

alter table public.progress enable row level security;
drop policy if exists "progress own" on public.progress;
create policy "progress own" on public.progress for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------- تریگر updated_at ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

do $$ declare t text; begin
  foreach t in array array['models','decks','notes','cards'] loop
    execute format('drop trigger if exists touch_%1$s on public.%1$s;', t);
    execute format('create trigger touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at();', t);
  end loop;
end $$;

-- ---------- نمایه‌ها ----------
create index if not exists idx_decks_updated on public.decks(updated_at);
create index if not exists idx_notes_updated on public.notes(updated_at);
create index if not exists idx_cards_updated on public.cards(updated_at);
create index if not exists idx_models_updated on public.models(updated_at);

-- ---------- Storage ----------
insert into storage.buckets (id, name, public) values ('media','media',true)
on conflict (id) do nothing;
drop policy if exists "media public read" on storage.objects;
drop policy if exists "media auth upload" on storage.objects;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');
create policy "media auth upload" on storage.objects for insert to authenticated with check (bucket_id = 'media');
