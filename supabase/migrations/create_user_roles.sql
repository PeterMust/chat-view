-- User roles table: tracks whether each authenticated user is 'user' or 'admin'
create table user_roles (
  id          bigint generated always as identity primary key,
  user_id     uuid   not null references auth.users(id) on delete cascade unique,
  role        text   not null check (role in ('user', 'admin')) default 'user',
  email       text   not null,
  created_at  timestamptz not null default now()
);

-- Enable RLS: users may only read their own row (anon key access)
alter table user_roles enable row level security;

create policy "Users can read own role"
  on user_roles for select
  using (auth.uid() = user_id);

-- Trigger: auto-assign 'user' role when a new auth.users row is created
-- (covers both new Google OAuth sign-ins and accepted invitations)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.user_roles (user_id, role, email)
  values (new.id, 'user', coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
