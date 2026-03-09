-- The chat_view_user_roles table already exists.
-- This migration only enables RLS, adds the select policy,
-- and creates the trigger to auto-assign 'user' role on new sign-ups.

-- Ensure user_id is unique (required for ON CONFLICT in the trigger below)
create unique index if not exists chat_view_user_roles_user_id_key
  on chat_view_user_roles (user_id);

-- Enable RLS: users may only read their own row (anon key access)
alter table chat_view_user_roles enable row level security;

drop policy if exists "Users can read own role" on chat_view_user_roles;
create policy "Users can read own role"
  on chat_view_user_roles for select
  using (auth.uid() = user_id);

-- Trigger: auto-assign 'user' role when a new auth.users row is created
-- (covers both new Google OAuth sign-ins and accepted invitations)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.chat_view_user_roles (user_id, role, email)
  values (new.id, 'user', coalesce(new.email, ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
