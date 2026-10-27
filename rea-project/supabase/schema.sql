-- ============================================================================
-- RANK REEL EDITOR - SUPABASE DATABASE & SECURITY SCHEMA
-- Paste this into Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ============================================================================

-- 1. User Profiles Table (links to Supabase Auth users & tracks payment status)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  plan text default 'free' check (plan in ('free', 'pro', 'lifetime')),
  payment_customer_id text,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Saved Ranking Projects Table (stores your scene JSON in the cloud)
create table if not exists public.projects (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users on delete cascade,
  name text not null default 'Untitled Ranking Reel',
  project_data jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Turn ON Row Level Security (RLS) so nobody can steal or edit another user's projects
alter table public.profiles enable row level security;
alter table public.projects enable row level security;

-- 4. Security Policies for Profiles
create policy "Users can view own profile"
  on public.profiles for select
  using ( auth.uid() = id );

create policy "Users can update own profile"
  on public.profiles for update
  using ( auth.uid() = id );

-- 5. Security Policies for Projects
create policy "Users can view own projects"
  on public.projects for select
  using ( auth.uid() = user_id );

create policy "Users can insert own projects"
  on public.projects for insert
  with check ( auth.uid() = user_id );

create policy "Users can update own projects"
  on public.projects for update
  using ( auth.uid() = user_id );

create policy "Users can delete own projects"
  on public.projects for delete
  using ( auth.uid() = user_id );
