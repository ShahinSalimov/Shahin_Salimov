-- AdScript Studio database schema.
-- Run once in Supabase: Dashboard -> SQL Editor -> paste -> Run.

-- 1. Profiles: one row per user, holds the credit balance.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  credits integer not null default 0 check (credits >= 0),
  created_at timestamptz not null default now()
);

-- 2. Generations: every ad script pack a user created.
create table if not exists public.generations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  input jsonb not null,
  output jsonb not null,
  credits_spent integer not null,
  created_at timestamptz not null default now()
);
create index if not exists generations_user_created_idx
  on public.generations (user_id, created_at desc);

-- 3. Redemptions: each Gumroad license key can be redeemed once.
create table if not exists public.redemptions (
  license_key text primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  product_id text not null,
  sale_id text,
  credits integer not null check (credits > 0),
  created_at timestamptz not null default now()
);

-- Row Level Security: users may only READ their own rows.
-- All writes go through the security-definer functions below,
-- called by the server with the service-role key.
alter table public.profiles enable row level security;
alter table public.generations enable row level security;
alter table public.redemptions enable row level security;

drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "read own generations" on public.generations;
create policy "read own generations" on public.generations
  for select using (auth.uid() = user_id);

drop policy if exists "read own redemptions" on public.redemptions;
create policy "read own redemptions" on public.redemptions
  for select using (auth.uid() = user_id);

-- New user -> profile with free signup credits (change 3 to adjust).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, credits)
  values (new.id, new.email, 3)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Atomically spend credits. Returns the new balance, or null if the balance is too low.
create or replace function public.spend_credits(p_user uuid, p_amount integer)
returns integer
language sql
security definer set search_path = public
as $$
  update public.profiles
     set credits = credits - p_amount
   where id = p_user and p_amount > 0 and credits >= p_amount
  returning credits;
$$;

-- Give credits back (used when a generation fails after spending).
create or replace function public.refund_credits(p_user uuid, p_amount integer)
returns integer
language sql
security definer set search_path = public
as $$
  update public.profiles
     set credits = credits + p_amount
   where id = p_user and p_amount > 0
  returning credits;
$$;

-- Record a license redemption and add credits in one transaction.
-- Raises unique_violation (23505) if the key was already redeemed.
create or replace function public.redeem_license(
  p_user uuid,
  p_license_key text,
  p_product_id text,
  p_sale_id text,
  p_credits integer
)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  new_balance integer;
begin
  insert into public.profiles (id) values (p_user) on conflict (id) do nothing;

  insert into public.redemptions (license_key, user_id, product_id, sale_id, credits)
  values (p_license_key, p_user, p_product_id, p_sale_id, p_credits);

  update public.profiles
     set credits = credits + p_credits
   where id = p_user
  returning credits into new_balance;

  return new_balance;
end;
$$;

-- Only the server (service role) may call the credit functions.
revoke execute on function public.spend_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_credits(uuid, integer) from public, anon, authenticated;
revoke execute on function public.redeem_license(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.spend_credits(uuid, integer) to service_role;
grant execute on function public.refund_credits(uuid, integer) to service_role;
grant execute on function public.redeem_license(uuid, text, text, text, integer) to service_role;

-- ---------------------------------------------------------------
-- Refund / chargeback handling (Gumroad webhook -> /api/gumroad/webhook)
-- ---------------------------------------------------------------
alter table public.redemptions add column if not exists revoked_at timestamptz;
create index if not exists redemptions_sale_id_idx on public.redemptions (sale_id);

-- Take back the credits of a refunded purchase (never below 0). Idempotent.
-- Returns the user's new balance, or null if nothing changed.
create or replace function public.revoke_redemption(p_license_key text)
returns integer
language plpgsql
security definer set search_path = public
as $$
declare
  r public.redemptions%rowtype;
  new_balance integer;
begin
  update public.redemptions
     set revoked_at = now()
   where license_key = p_license_key and revoked_at is null
  returning * into r;

  if not found then
    return null;
  end if;

  update public.profiles
     set credits = greatest(credits - r.credits, 0)
   where id = r.user_id
  returning credits into new_balance;

  return new_balance;
end;
$$;

revoke execute on function public.revoke_redemption(text) from public, anon, authenticated;
grant execute on function public.revoke_redemption(text) to service_role;
