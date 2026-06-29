-- ============================================================
-- AnkiWeb — طرح‌واره‌ی Supabase (کتابخانه‌ی مشترک + پیشرفت شخصی)
-- این فایل را در Supabase → SQL Editor اجرا کن (یک‌بار).
-- ============================================================

-- ---------- پروفایل‌ها ----------
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  display_name text,
  role        text not null default 'user',         -- 'admin' | 'user'
  created_at  timestamptz not null default now()
);

-- تابع کمکی: آیا کاربر فعلی ادمین است؟
create or replace function public.is_admin()
returns boolean language sql security definer stable as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

-- هنگام ثبت‌نام، پروفایل ساخته می‌شود؛ نفر اول ادمین، و سقف ۱۰ کاربر.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
declare
  cnt int;
begin
  select count(*) into cnt from public.profiles;
  if cnt >= 10 then
    raise exception 'حداکثر ۱۰ کاربر مجاز است / user limit reached';
  end if;
  insert into public.profiles (id, email, role)
  values (new.id, new.email, case when cnt = 0 then 'admin' else 'user' end);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- محتوای مشترک ----------
create table if not exists public.models (
  mid        text primary key,
  name       text,
  type       int default 0,
  flds       jsonb default '[]',
  tmpls      jsonb default '[]',
  css        text default '',
  owner      uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.decks (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  scheduler  text default 'fsrs',
  config     jsonb default '{}',
  owner      uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.notes (
  id         uuid primary key default gen_random_uuid(),
  deck_id    uuid references public.decks(id) on delete cascade,
  model_id   text,
  fields     jsonb default '[]',
  tags       text[] default '{}',
  guid       text,
  owner      uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id         uuid primary key default gen_random_uuid(),
  note_id    uuid references public.notes(id) on delete cascade,
  deck_id    uuid references public.decks(id) on delete cascade,
  ord        int default 0,
  pos        int default 0,
  owner      uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ---------- پیشرفت شخصی (هر کاربر) ----------
create table if not exists public.progress (
  user_id       uuid references auth.users(id) on delete cascade,
  card_id       uuid references public.cards(id) on delete cascade,
  state         int default 0,
  due           bigint,
  interval      real default 0,
  stability     real,
  difficulty    real,
  ease          real default 2.5,
  reps          int default 0,
  lapses        int default 0,
  learning_step int default 0,
  last_review   bigint,
  updated_at    timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table if not exists public.revlog (
  id          bigint generated always as identity primary key,
  user_id     uuid references auth.users(id) on delete cascade,
  card_id     uuid references public.cards(id) on delete cascade,
  rating      int,
  state       int,
  interval    real,
  reviewed_at bigint
);

-- ============================================================
-- RLS
-- ============================================================
alter table public.profiles enable row level security;
alter table public.models   enable row level security;
alter table public.decks    enable row level security;
alter table public.notes    enable row level security;
alter table public.cards    enable row level security;
alter table public.progress enable row level security;
alter table public.revlog   enable row level security;

-- profiles: همه می‌توانند بخوانند؛ فقط ادمین تغییر می‌دهد.
create policy "profiles read"   on public.profiles for select to authenticated using (true);
create policy "profiles admin update" on public.profiles for update to authenticated using (public.is_admin());

-- محتوای مشترک: همه می‌خوانند و اضافه/ویرایش می‌کنند؛ حذف فقط ادمین.
do $$
declare t text;
begin
  foreach t in array array['models','decks','notes','cards'] loop
    execute format('create policy "%1$s read"   on public.%1$s for select to authenticated using (true);', t);
    execute format('create policy "%1$s insert" on public.%1$s for insert to authenticated with check (true);', t);
    execute format('create policy "%1$s update" on public.%1$s for update to authenticated using (true);', t);
    execute format('create policy "%1$s delete" on public.%1$s for delete to authenticated using (public.is_admin());', t);
  end loop;
end $$;

-- پیشرفت و لاگ: هر کاربر فقط ردیف‌های خودش.
create policy "progress own" on public.progress for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "revlog own" on public.revlog for all to authenticated
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ============================================================
-- Storage: یک باکِت عمومی به نام media برای تصویر/صوت
-- ============================================================
insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

create policy "media public read" on storage.objects for select
  using (bucket_id = 'media');
create policy "media auth upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'media');
