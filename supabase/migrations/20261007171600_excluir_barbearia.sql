begin;

-- Guarda somente o recibo da operação; os dados dos clientes serão removidos.
create table saas_privado.exclusoes_barbearias (
 pedido uuid primary key,
 barbearia_id uuid not null unique,
 nome text not null,
 autor_id uuid references auth.users(id) on delete set null,
 criado_em timestamptz not null default now()
);
alter table saas_privado.exclusoes_barbearias enable row level security;
revoke all on saas_privado.exclusoes_barbearias from public,anon,authenticated;
create index exclusoes_barbearias_autor on saas_privado.exclusoes_barbearias(autor_id);

-- O histórico administrativo deve sobreviver à remoção da barbearia.
alter table saas_privado.auditoria_proprietario alter column barbearia_id drop not null;
alter table saas_privado.auditoria_proprietario drop constraint auditoria_proprietario_barbearia_id_fkey;
alter table saas_privado.auditoria_proprietario add constraint auditoria_proprietario_barbearia_id_fkey
 foreign key(barbearia_id) references public.saas_barbearias(id) on delete set null;

create function saas_privado.proprietario_excluir(loja uuid,confirmacao text,pedido uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare usuario uuid; antiga public.saas_barbearias; recibo saas_privado.exclusoes_barbearias;
 contexto text:=current_setting('saas.exclusao_barbearia',true);
begin
 usuario:=saas_privado.exigir_proprietario();
 if loja is null or pedido is null or confirmacao is null then raise exception 'Digite o nome exato da barbearia para confirmar';end if;
 perform pg_advisory_xact_lock(hashtextextended(pedido::text,7));
 select * into recibo from saas_privado.exclusoes_barbearias e where e.pedido=proprietario_excluir.pedido;
 if found then
  if recibo.barbearia_id<>loja or recibo.nome<>confirmacao then raise exception 'A confirmação não corresponde à exclusão solicitada';end if;
  return jsonb_build_object('pedido',recibo.pedido,'nome',recibo.nome);
 end if;
 -- A reserva também bloqueia o controle antes de gravar; aguarda reservas em andamento.
 perform 1 from public.saas_controle_agenda where barbearia_id=loja for update;
 select * into antiga from public.saas_barbearias where id=loja for update;
 if not found then raise exception 'Barbearia não encontrada. Atualize a lista';end if;
 if confirmacao<>antiga.nome then raise exception 'Digite o nome exato da barbearia. Se o nome mudou, atualize a lista';end if;
 insert into saas_privado.exclusoes_barbearias(pedido,barbearia_id,nome,autor_id) values(pedido,loja,antiga.nome,usuario);
 insert into saas_privado.auditoria_proprietario(barbearia_id,autor_id,autor_email,antes,depois)
 values(loja,usuario,(select email from auth.users where id=usuario),
  jsonb_build_object('id',loja,'nome',antiga.nome,'slug',antiga.slug,'whatsapp',antiga.whatsapp,'ativa',antiga.ativa),
  jsonb_build_object('nome',antiga.nome,'excluida',true));
 perform set_config('saas.exclusao_barbearia',loja::text,true);
 delete from public.saas_espera where barbearia_id=loja;
 delete from public.saas_pagamentos where barbearia_id=loja;
 delete from public.saas_despesas where barbearia_id=loja;
 delete from public.saas_reservas where barbearia_id=loja;
 delete from public.saas_clientes where barbearia_id=loja;
 delete from public.saas_bloqueios where barbearia_id=loja;
 delete from public.saas_expediente where barbearia_id=loja;
 delete from public.saas_controle_agenda where barbearia_id=loja;
 delete from public.saas_profissionais where barbearia_id=loja;
 delete from public.saas_servicos where barbearia_id=loja;
 delete from public.saas_membros where barbearia_id=loja;
 delete from public.saas_barbearias where id=loja;
 perform set_config('saas.exclusao_barbearia',coalesce(contexto,''),true);
 return jsonb_build_object('pedido',pedido,'nome',antiga.nome);
end $$;
revoke all on function saas_privado.proprietario_excluir(uuid,text,uuid) from public,anon;
grant execute on function saas_privado.proprietario_excluir(uuid,text,uuid) to authenticated;
create function public.saas_proprietario_excluir(loja uuid,confirmacao text,pedido uuid) returns jsonb
language sql security invoker set search_path='' as $$select saas_privado.proprietario_excluir(loja,confirmacao,pedido)$$;
revoke all on function public.saas_proprietario_excluir(uuid,text,uuid) from public,anon;
grant execute on function public.saas_proprietario_excluir(uuid,text,uuid) to authenticated;

-- A Storage API remove os arquivos reais. SQL apenas consulta seus metadados.
-- Autoriza somente pastas de barbearias já excluídas, preservando imagens reutilizadas.
create function saas_privado.arquivo_exclusao_removivel(bucket text,caminho text) returns boolean
language sql stable security definer set search_path='' as $$
 select bucket in ('fotos-profissionais','imagens-servicos','fundos-barbearias','logos-barbearias')
 and exists(select 1 from saas_privado.proprietarios where user_id=(select auth.uid()))
 and exists(select 1 from saas_privado.exclusoes_barbearias e where e.barbearia_id::text=split_part(caminho,'/',1))
 and not exists(select 1 from public.saas_barbearias where id::text=split_part(caminho,'/',1))
 and not exists(select 1 from public.saas_barbearias b where
  (bucket='fundos-barbearias' and b.imagem_fundo=caminho)
  or right(split_part(split_part(b.logo,'?',1),'#',1),length('/storage/v1/object/public/'||bucket||'/'||caminho))='/storage/v1/object/public/'||bucket||'/'||caminho)
 and not exists(select 1 from public.saas_profissionais p where bucket='fotos-profissionais' and p.foto=caminho)
 and not exists(select 1 from public.saas_servicos s where (bucket='imagens-servicos' and s.imagem_arquivo=caminho)
  or right(split_part(split_part(s.imagem,'?',1),'#',1),length('/storage/v1/object/public/'||bucket||'/'||caminho))='/storage/v1/object/public/'||bucket||'/'||caminho);
$$;
revoke all on function saas_privado.arquivo_exclusao_removivel(text,text) from public,anon;
grant execute on function saas_privado.arquivo_exclusao_removivel(text,text) to authenticated;
create policy saas_exclusao_imagens_consultar on storage.objects for select to authenticated
 using(saas_privado.arquivo_exclusao_removivel(bucket_id,name));
create policy saas_exclusao_imagens_remover on storage.objects for delete to authenticated
 using(saas_privado.arquivo_exclusao_removivel(bucket_id,name));

create function saas_privado.proprietario_limpezas() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 perform saas_privado.exigir_proprietario();
 return coalesce((select jsonb_agg(to_jsonb(x)) from
  (select o.bucket_id as bucket,o.name as caminho from storage.objects o
   join saas_privado.exclusoes_barbearias e on e.barbearia_id::text=split_part(o.name,'/',1)
   where saas_privado.arquivo_exclusao_removivel(o.bucket_id,o.name)
   order by o.bucket_id,o.name limit 100) x),'[]'::jsonb);
end $$;
revoke all on function saas_privado.proprietario_limpezas() from public,anon;
grant execute on function saas_privado.proprietario_limpezas() to authenticated;
create function public.saas_proprietario_limpezas() returns jsonb
language sql security invoker set search_path='' as $$select saas_privado.proprietario_limpezas()$$;
revoke all on function public.saas_proprietario_limpezas() from public,anon;
grant execute on function public.saas_proprietario_limpezas() to authenticated;

-- Atualizações das funções existentes abaixo.

create or replace function saas_privado.proteger_atendimento() returns trigger language plpgsql security invoker set search_path='' as $$
declare pago boolean; begin
 -- Só o RPC privado autorizado pode remover todo o histórico após a confirmação.
 if tg_op='DELETE' and current_setting('saas.exclusao_barbearia',true)=old.barbearia_id::text
  and current_user=pg_catalog.pg_get_userbyid((select proowner from pg_catalog.pg_proc where oid='saas_privado.proprietario_excluir(uuid,text,uuid)'::regprocedure)) then
  perform saas_privado.exigir_proprietario();return old;
 end if;
 select exists(select 1 from public.saas_pagamentos where reserva_id=old.id and barbearia_id=old.barbearia_id) into pago;
 if tg_op='DELETE' then
  if pago or old.status in ('concluido','faltou') then raise exception 'O histórico de atendimentos e pagamentos deve ser preservado'; end if;
  return old;
 end if;
 if (pago or old.status in ('concluido','faltou')) and
  (new.barbearia_id,new.profissional,new.servico_id,new.preco,new.data,new.horario,new.duracao_minutos,new.cliente,new.telefone)
  is distinct from (old.barbearia_id,old.profissional,old.servico_id,old.preco,old.data,old.horario,old.duracao_minutos,old.cliente,old.telefone)
 then raise exception 'Atendimentos finalizados ou pagos não podem ser remarcados'; end if;
 if old.status in ('concluido','faltou') and new.status<>old.status then raise exception 'Este atendimento já foi finalizado'; end if;
 if pago and new.status in ('cancelado','faltou','pendente') then raise exception 'Este atendimento já possui pagamento registrado'; end if;
 if new.status in ('concluido','faltou') and old.status<>new.status then
  if old.status='cancelado' or new.data+new.horario>now() at time zone 'America/Sao_Paulo' then
   raise exception 'Só é possível finalizar um atendimento ativo cujo horário já começou';
  end if;
 end if;
 new.atualizado_em:=now(); return new;
end $$;

create or replace function saas_privado.proprietario_listar(busca text,situacao text,apos uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare usuario uuid; resposta jsonb; termo text:=lower(trim(coalesce(busca,'')));
begin
 usuario:=saas_privado.exigir_proprietario();
 if length(termo)>100 or situacao is null or situacao not in ('todas','ativas','suspensas') then raise exception 'Filtro inválido';end if;
 with filtradas as materialized (
  select b.*,u.email as dono_email from public.saas_barbearias b
  left join lateral (select string_agg(a.email,', ' order by a.email) as email
   from public.saas_membros m join auth.users a on a.id=m.user_id where m.barbearia_id=b.id) u on true
  where (situacao='todas' or b.ativa=(situacao='ativas'))
   and (termo='' or strpos(lower(b.nome||' '||b.slug||' '||b.whatsapp||' '||coalesce(u.email,'')),termo)>0)
 ), pagina as (
  select * from filtradas where apos is null or id>apos order by id limit 21
 ), visiveis as (
  select * from pagina order by id limit 20
 ), dados as (
  select v.id,v.nome,v.slug,v.whatsapp,v.logo,v.ativa,v.dono_email,
   (select count(*) from public.saas_profissionais p where p.barbearia_id=v.id and p.ativo and not p.excluido) as profissionais,
   (select count(*) from public.saas_servicos s where s.barbearia_id=v.id and s.ativo) as servicos,
   (select count(*) from public.saas_reservas r where r.barbearia_id=v.id and r.data=(now() at time zone 'America/Sao_Paulo')::date and r.status<>'cancelado') as agendamentos_hoje
  from visiveis v
 ), historico as (
  select a.id,a.barbearia_id,coalesce(b.nome,a.depois->>'nome',a.antes->>'nome') as barbearia,a.autor_email,a.antes,a.depois,a.criado_em
  from saas_privado.auditoria_proprietario a left join public.saas_barbearias b on b.id=a.barbearia_id
  order by a.criado_em desc,a.id limit 20
 )
 select jsonb_build_object(
  'email',(select email from auth.users where id=usuario),
  'lojas',coalesce((select jsonb_agg(to_jsonb(d) order by d.id) from dados d),'[]'::jsonb),
  'encontradas',(select count(*) from filtradas),
  'proximo',case when (select count(*) from pagina)>20 then (select id from visiveis order by id desc limit 1) else null end,
  'totais',jsonb_build_object('barbearias',(select count(*) from public.saas_barbearias),
   'ativas',(select count(*) from public.saas_barbearias where ativa),
   'suspensas',(select count(*) from public.saas_barbearias where not ativa),
   'profissionais',(select count(*) from public.saas_profissionais where ativo and not excluido),
   'agendamentos_hoje',(select count(*) from public.saas_reservas where data=(now() at time zone 'America/Sao_Paulo')::date and status<>'cancelado')),
  'limpeza_pendente',jsonb_array_length(saas_privado.proprietario_limpezas())>0,
  'auditoria',coalesce((select jsonb_agg(to_jsonb(h) order by h.criado_em desc,h.id) from historico h),'[]'::jsonb)
 ) into resposta;
 return resposta;
end $$;

notify pgrst,'reload schema';
commit;
