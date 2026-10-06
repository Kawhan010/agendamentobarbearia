-- Fundo personalizado público; somente o dono pode enviar e alterar.
begin;
alter table public.saas_barbearias add column imagem_fundo text not null default '';
alter table public.saas_barbearias add constraint saas_imagem_fundo_valida check (
 imagem_fundo='' or (left(imagem_fundo,37)=id::text||'/' and
 imagem_fundo ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$')
);
grant select(imagem_fundo) on public.saas_barbearias to anon,authenticated;
grant update(imagem_fundo) on public.saas_barbearias to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('fundos-barbearias','fundos-barbearias',true,2097152,array['image/jpeg','image/webp']);
create policy saas_fundos_enviar on storage.objects for insert to authenticated with check (
 bucket_id='fundos-barbearias' and
 (storage.foldername(name))[1]=(select saas_privado.loja_usuario())::text and
 name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$'
);
create policy saas_fundos_consultar on storage.objects for select to authenticated using (
 bucket_id='fundos-barbearias' and (storage.foldername(name))[1]=(select saas_privado.loja_usuario())::text
);
create policy saas_fundos_excluir on storage.objects for delete to authenticated using (
 bucket_id='fundos-barbearias' and (storage.foldername(name))[1]=(select saas_privado.loja_usuario())::text and
 not exists(select 1 from public.saas_barbearias b where b.id=(select saas_privado.loja_usuario()) and b.imagem_fundo=storage.objects.name)
);
notify pgrst,'reload schema';
commit;
