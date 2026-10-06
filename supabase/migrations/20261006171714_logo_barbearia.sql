-- Logo pública por arquivo. O campo logo continua guardando uma URL HTTPS,
-- compatível com as páginas de agendamento e logos cadastradas por link.
begin;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('logos-barbearias','logos-barbearias',true,2097152,array['image/jpeg','image/png','image/webp']);
create policy saas_logos_enviar on storage.objects for insert to authenticated with check (
 bucket_id='logos-barbearias' and
 (storage.foldername(name))[1]=(select saas_privado.loja_usuario())::text and
 name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$'
);
create policy saas_logos_consultar on storage.objects for select to authenticated using (
 bucket_id='logos-barbearias' and (storage.foldername(name))[1]=(select saas_privado.loja_usuario())::text
);
create policy saas_logos_excluir on storage.objects for delete to authenticated using (
 bucket_id='logos-barbearias' and (storage.foldername(name))[1]=(select saas_privado.loja_usuario())::text and
 not exists(select 1 from public.saas_barbearias b where right(b.logo,length('/storage/v1/object/public/logos-barbearias/'||storage.objects.name))='/storage/v1/object/public/logos-barbearias/'||storage.objects.name)
);
notify pgrst,'reload schema';
commit;
