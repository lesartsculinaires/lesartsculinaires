-- Les Arts Culinaires — Supabase database schema
-- Run against a Supabase Postgres project (e.g. via `supabase db push`
-- or the SQL editor). Relies on the built-in `auth.users` table.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Profiles (one row per auth user)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique not null,
  full_name text,
  avatar_url text,
  bio text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Recipe categories (e.g. Dessert, Main Course, Vegan)
-- ---------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text unique not null,
  slug text unique not null
);

-- ---------------------------------------------------------------------
-- Recipes
-- ---------------------------------------------------------------------
create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid references public.categories (id) on delete set null,
  title text not null,
  slug text unique not null,
  description text,
  instructions text not null,
  prep_time_minutes integer check (prep_time_minutes >= 0),
  cook_time_minutes integer check (cook_time_minutes >= 0),
  servings integer check (servings > 0),
  image_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index recipes_author_id_idx on public.recipes (author_id);
create index recipes_category_id_idx on public.recipes (category_id);

-- ---------------------------------------------------------------------
-- Ingredients (shared catalogue, referenced by recipes via a join table)
-- ---------------------------------------------------------------------
create table public.ingredients (
  id uuid primary key default gen_random_uuid(),
  name text unique not null
);

create table public.recipe_ingredients (
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete cascade,
  quantity text,
  unit text,
  position integer not null default 0,
  primary key (recipe_id, ingredient_id)
);

-- ---------------------------------------------------------------------
-- Ratings & reviews
-- ---------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now(),
  unique (recipe_id, author_id)
);

create index reviews_recipe_id_idx on public.reviews (recipe_id);

-- ---------------------------------------------------------------------
-- Favorites
-- ---------------------------------------------------------------------
create table public.favorites (
  user_id uuid not null references public.profiles (id) on delete cascade,
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, recipe_id)
);

-- ---------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger recipes_set_updated_at
  before update on public.recipes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.recipes enable row level security;
alter table public.ingredients enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.reviews enable row level security;
alter table public.favorites enable row level security;

-- Profiles: publicly readable, only owner can modify their own row.
create policy "Profiles are viewable by everyone"
  on public.profiles for select
  using (true);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Categories & ingredients: publicly readable reference data.
create policy "Categories are viewable by everyone"
  on public.categories for select
  using (true);

create policy "Ingredients are viewable by everyone"
  on public.ingredients for select
  using (true);

-- Recipes: publicly readable, only the author can write.
create policy "Recipes are viewable by everyone"
  on public.recipes for select
  using (true);

create policy "Authors can insert their own recipes"
  on public.recipes for insert
  with check (auth.uid() = author_id);

create policy "Authors can update their own recipes"
  on public.recipes for update
  using (auth.uid() = author_id);

create policy "Authors can delete their own recipes"
  on public.recipes for delete
  using (auth.uid() = author_id);

-- Recipe ingredients: follow the parent recipe's ownership.
create policy "Recipe ingredients are viewable by everyone"
  on public.recipe_ingredients for select
  using (true);

create policy "Authors can manage their recipe ingredients"
  on public.recipe_ingredients for all
  using (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and recipes.author_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.recipes
      where recipes.id = recipe_ingredients.recipe_id
        and recipes.author_id = auth.uid()
    )
  );

-- Reviews: publicly readable, only the author can write their own.
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (true);

create policy "Users can insert their own reviews"
  on public.reviews for insert
  with check (auth.uid() = author_id);

create policy "Users can update their own reviews"
  on public.reviews for update
  using (auth.uid() = author_id);

create policy "Users can delete their own reviews"
  on public.reviews for delete
  using (auth.uid() = author_id);

-- Favorites: users can only see and manage their own favorites.
create policy "Users can view their own favorites"
  on public.favorites for select
  using (auth.uid() = user_id);

create policy "Users can insert their own favorites"
  on public.favorites for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own favorites"
  on public.favorites for delete
  using (auth.uid() = user_id);
