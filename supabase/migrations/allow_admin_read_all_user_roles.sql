-- Allow admins to read all rows in chat_view_user_roles.
-- Uses a security-definer function to avoid infinite recursion
-- (the policy itself queries the same table).

create or replace function public.current_user_is_admin()
returns boolean language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from public.chat_view_user_roles
    where user_id = auth.uid() and role = 'admin'
  )
$$;

drop policy if exists "Users can read own role" on public.chat_view_user_roles;
create policy "Users read own row, admins read all"
  on public.chat_view_user_roles for select
  using (auth.uid() = user_id OR public.current_user_is_admin());
