-- Atualização de cores; preserva os dados e as políticas de acesso existentes.
-- Execute após supabase-saas.sql em novas instalações.
alter table public.saas_barbearias
  add column if not exists cor_principal text not null default '#262878' check (cor_principal ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists cor_destaque text not null default '#ba2530' check (cor_destaque ~ '^#[0-9a-fA-F]{6}$'),
  add column if not exists cor_fundo text not null default '#f5f3f1' check (cor_fundo ~ '^#[0-9a-fA-F]{6}$');

-- As políticas existentes continuam limitando a edição à barbearia do dono.
grant update (cor_principal, cor_destaque, cor_fundo)
  on public.saas_barbearias to authenticated;
