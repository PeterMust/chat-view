-- Add name column to chat_view_user_roles
alter table public.chat_view_user_roles
  add column if not exists name text not null default '';

-- Security-definer helper so the admin select policy can check roles
-- without causing infinite recursion on the same table.
create or replace function public.current_user_is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.chat_view_user_roles
    where user_id = auth.uid() and role = 'admin'
  )
$$;

-- Replace the existing read policy with one that lets admins read all rows.
drop policy if exists "Users can read own role" on public.chat_view_user_roles;
create policy "Users read own row, admins read all"
  on public.chat_view_user_roles for select
  using (auth.uid() = user_id OR public.current_user_is_admin());

-- Allow users to update their own name (populated on every login).
drop policy if exists "Users can update own name" on public.chat_view_user_roles;
create policy "Users can update own name"
  on public.chat_view_user_roles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
