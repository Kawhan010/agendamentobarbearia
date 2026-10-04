-- Atualização SaaS: execute após supabase-saas.sql, também em instalações novas.
begin;
alter table public.saas_profissionais add column if not exists foto text not null default '';
alter table public.saas_profissionais drop constraint if exists saas_foto_profissional_valida;
alter table public.saas_profissionais add constraint saas_foto_profissional_valida check (
  foto = '' or (
    left(foto, 37) = barbearia_id::text || '/' and
    foto ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-profissionais', 'fotos-profissionais', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Leitura das imagens pela URL pública. Envio e exclusão só pelo dono da pasta.
drop policy if exists saas_fotos_enviar on storage.objects;
create policy saas_fotos_enviar on storage.objects for insert to authenticated with check (
  bucket_id = 'fotos-profissionais' and
  (storage.foldername(name))[1] = (select saas_privado.loja_usuario())::text and
  name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
);
drop policy if exists saas_fotos_consultar on storage.objects;
create policy saas_fotos_consultar on storage.objects for select to authenticated using (
  bucket_id = 'fotos-profissionais' and (storage.foldername(name))[1] = (select saas_privado.loja_usuario())::text
);
drop policy if exists saas_fotos_excluir on storage.objects;
create policy saas_fotos_excluir on storage.objects for delete to authenticated using (
  bucket_id = 'fotos-profissionais' and (storage.foldername(name))[1] = (select saas_privado.loja_usuario())::text
);
-- Cada troca usa um caminho novo para evitar fotos antigas no cache. Sem upsert.
commit;
