-- Migration: Enable Supabase Realtime for menu tables
-- This allows the customer menu screen to sync in real-time when items or categories are added/updated in the admin panel.

-- Ensure supabase_realtime publication exists
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end;
$$;

-- Add menu_items and menu_categories to the realtime publication
alter publication supabase_realtime add table public.menu_items;
alter publication supabase_realtime add table public.menu_categories;
