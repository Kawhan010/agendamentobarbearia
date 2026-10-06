begin;
alter table public.saas_servicos add column duracao_minutos integer;
-- Preserva o tempo utilizado nas lojas atuais; a reserva mantém sua própria duração.
update public.saas_servicos s set duracao_minutos=coalesce(
 (select min(p.duracao_minutos) from public.saas_profissionais p where p.barbearia_id=s.barbearia_id and p.ativo
  having min(p.duracao_minutos)=max(p.duracao_minutos)),40);
alter table public.saas_servicos alter column duracao_minutos set not null;
alter table public.saas_servicos alter column duracao_minutos set default 40;
alter table public.saas_servicos add constraint saas_servico_duracao_valida check(duracao_minutos between 1 and 1440);
alter table public.saas_servicos add column imagem_arquivo text not null default '';
alter table public.saas_servicos add constraint saas_servico_imagem_valida check(
 imagem_arquivo='' or (left(imagem_arquivo,37)=barbearia_id::text||'/' and
 imagem_arquivo ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$'));
comment on column public.saas_servicos.duracao_minutos is 'Duração das novas reservas deste serviço; reservas anteriores preservam sua duração.';

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('imagens-servicos','imagens-servicos',true,2097152,array['image/jpeg','image/webp']);
create policy saas_servico_imagens_enviar on storage.objects for insert to authenticated with check(
 bucket_id='imagens-servicos' and (storage.foldername(name))[1]=(select saas_privado.loja_usuario())::text and
 name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$');
create policy saas_servico_imagens_consultar on storage.objects for select to authenticated using(
 bucket_id='imagens-servicos' and (storage.foldername(name))[1]=(select saas_privado.loja_usuario())::text);
create policy saas_servico_imagens_excluir on storage.objects for delete to authenticated using(
 bucket_id='imagens-servicos' and (storage.foldername(name))[1]=(select saas_privado.loja_usuario())::text and
 not exists(select 1 from public.saas_servicos s where s.barbearia_id=(select saas_privado.loja_usuario()) and s.imagem_arquivo=storage.objects.name));

-- O quarto argumento opcional mantém as chamadas de versões anteriores do site.
drop function public.saas_horarios_livres(uuid,date,text);
create function public.saas_horarios_livres(loja uuid,dia date,barbeiro text,servico uuid default null)
returns table(horario text) language sql stable security definer set search_path='' as $$
 select distinct to_char(s,'HH24:MI') as horario
 from public.saas_expediente e
 join public.saas_profissionais p on p.barbearia_id=e.barbearia_id and p.ativo
 left join public.saas_servicos item on item.id=servico and item.barbearia_id=loja and item.ativo
 cross join lateral (select case when servico is null then p.duracao_minutos else item.duracao_minutos end as minutos) tempo
 cross join lateral generate_series(dia+e.inicio,dia+e.fim-make_interval(mins=>tempo.minutos),make_interval(mins=>tempo.minutos)) s
 where e.barbearia_id=loja and e.id=extract(dow from dia) and e.aberto and tempo.minutos is not null
 and (barbeiro='sem-preferencia' or p.id=barbeiro)
 and exists(select 1 from public.saas_controle_agenda where barbearia_id=loja and not pausado)
 and (e.intervalo_inicio is null or s+make_interval(mins=>tempo.minutos)<=dia+e.intervalo_inicio or s>=dia+e.intervalo_fim)
 and dia between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+14
 and s>now() at time zone 'America/Sao_Paulo'
 and not exists(select 1 from public.saas_bloqueios b where b.barbearia_id=loja and b.data=dia
  and (b.horario is null or (dia+b.horario<s+make_interval(mins=>tempo.minutos) and dia+b.horario+interval '40 minutes'>s)))
 and not exists(select 1 from public.saas_reservas r where r.barbearia_id=loja and r.profissional=p.id and r.data=dia
  and r.status<>'cancelado' and dia+r.horario<s+make_interval(mins=>tempo.minutos)
  and dia+r.horario+make_interval(mins=>r.duracao_minutos)>s)
 order by horario;
$$;
revoke all on function public.saas_horarios_livres(uuid,date,text,uuid) from public;
grant execute on function public.saas_horarios_livres(uuid,date,text,uuid) to anon,authenticated;

create or replace function public.saas_reservar(loja uuid,dia date,hora time,barbeiro text,servico uuid,nome text,telefone_cliente text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidato public.saas_profissionais; escolhido public.saas_profissionais;
 item public.saas_servicos; reserva public.saas_reservas;
begin
 if nome is null or telefone_cliente is null or length(trim(nome)) not between 1 and 100 or telefone_cliente !~ '^[0-9]{10,11}$' then raise exception 'Dados inválidos'; end if;
 perform 1 from public.saas_controle_agenda where barbearia_id=loja and not pausado for share;
 if not found then raise exception 'Expediente pausado'; end if;
 perform pg_advisory_xact_lock(hashtext(loja::text||dia::text));
 select * into item from public.saas_servicos where barbearia_id=loja and id=servico and ativo for share;
 if not found then raise exception 'Serviço indisponível'; end if;
 for candidato in select p.* from public.saas_profissionais p
  where p.barbearia_id=loja and p.ativo and (barbeiro='sem-preferencia' or p.id=barbeiro) order by p.id for share
 loop
  if exists(select 1 from public.saas_horarios_livres(loja,dia,candidato.id,item.id) h where h.horario::time=hora) then
   escolhido:=candidato;exit;
  end if;
 end loop;
 if escolhido.id is null then raise exception 'Horário indisponível'; end if;
 insert into public.saas_reservas(barbearia_id,profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario,duracao_minutos)
 values(loja,escolhido.id,item.id,item.nome,item.preco,trim(nome),telefone_cliente,dia,hora,item.duracao_minutos)
 returning * into reserva;
 return jsonb_build_object('id',reserva.id,'profissional',escolhido.id,'nome',item.nome,'preco',item.preco,'duracao_minutos',reserva.duracao_minutos);
end $$;

drop function public.saas_horarios_painel(uuid,date,text,uuid);
create function public.saas_horarios_painel(loja uuid,dia date,barbeiro text,reserva uuid default null,servico uuid default null)
returns table(horario text) language plpgsql stable security invoker set search_path='' as $$
declare tempo integer; antiga public.saas_reservas; begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 perform 1 from public.saas_profissionais p where p.id=barbeiro and p.barbearia_id=loja and p.ativo;
 if not found then return;end if;
 if servico is null then
  select p.duracao_minutos into tempo from public.saas_profissionais p where p.id=barbeiro and p.barbearia_id=loja;
 else
  select item.duracao_minutos into tempo from public.saas_servicos item where item.id=servico and item.barbearia_id=loja and item.ativo;
 end if;
 if reserva is not null then
  select * into antiga from public.saas_reservas r where r.id=reserva and r.barbearia_id=loja and r.status in ('pendente','confirmado');
  if not found then return;end if;
  if servico is null or antiga.servico_id=servico then tempo:=antiga.duracao_minutos;end if;
 end if;
 if tempo is null or dia is null or dia not between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+365 then return;end if;
 return query select to_char(s,'HH24:MI') from public.saas_expediente e
 cross join lateral generate_series(dia+e.inicio,dia+e.fim-make_interval(mins=>tempo),make_interval(mins=>tempo)) s
 where e.barbearia_id=loja and e.id=extract(dow from dia) and e.aberto
 and exists(select 1 from public.saas_controle_agenda where barbearia_id=loja and not pausado)
 and (e.intervalo_inicio is null or s+make_interval(mins=>tempo)<=dia+e.intervalo_inicio or s>=dia+e.intervalo_fim)
 and not exists(select 1 from public.saas_bloqueios b where b.barbearia_id=loja and b.data=dia
  and (b.horario is null or (dia+b.horario<s+make_interval(mins=>tempo) and dia+b.horario+interval '40 minutes'>s)))
 and not exists(select 1 from public.saas_reservas r where r.barbearia_id=loja and r.profissional=barbeiro and r.data=dia
  and r.id is distinct from reserva and r.status<>'cancelado' and dia+r.horario<s+make_interval(mins=>tempo)
  and dia+r.horario+make_interval(mins=>r.duracao_minutos)>s) order by s;
end $$;
revoke all on function public.saas_horarios_painel(uuid,date,text,uuid,uuid) from public,anon;
grant execute on function public.saas_horarios_painel(uuid,date,text,uuid,uuid) to authenticated;

create or replace function public.saas_agendar_painel(loja uuid,dia date,hora time,barbeiro text,servico uuid,nome text,telefone_cliente text,
 reserva uuid default null,nova_reserva uuid default null,espera uuid default null,versao timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.saas_servicos; p public.saas_profissionais; antiga public.saas_reservas; salva public.saas_reservas; dia_antigo date; d date; tempo integer;
begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado';end if;
 if nome is null or length(trim(nome)) not between 1 and 100 or telefone_cliente is null or telefone_cliente !~ '^[0-9]{10,11}$' then raise exception 'Informe nome e telefone com DDD';end if;
 if dia is null or hora is null or barbeiro is null then raise exception 'Escolha profissional, data e horário';end if;
 perform 1 from public.saas_controle_agenda where barbearia_id=loja and not pausado for share;
 if not found then raise exception 'Expediente pausado';end if;
 if reserva is not null then
  select data into dia_antigo from public.saas_reservas where id=reserva and barbearia_id=loja;
  if not found then raise exception 'Agendamento não encontrado';end if;
 end if;
 for d in select distinct x from unnest(array[dia,coalesce(dia_antigo,dia)]) x order by x loop
  perform pg_advisory_xact_lock(hashtext(loja::text||d::text));
 end loop;
 if reserva is not null then
  select * into antiga from public.saas_reservas where id=reserva and barbearia_id=loja for update;
  if antiga.data<>dia_antigo or (versao is not null and antiga.atualizado_em<>versao) then raise exception 'O agendamento mudou. Atualize a agenda';end if;
  if antiga.status not in ('pendente','confirmado') or exists(select 1 from public.saas_pagamentos where reserva_id=reserva) then raise exception 'Atendimento finalizado ou pago não pode ser remarcado';end if;
 end if;
 select * into item from public.saas_servicos where id=servico and barbearia_id=loja and ativo for share;
 if not found then raise exception 'Serviço indisponível';end if;
 select * into p from public.saas_profissionais where id=barbeiro and barbearia_id=loja and ativo for share;
 if not found then raise exception 'Profissional indisponível';end if;
 tempo:=case when reserva is not null and antiga.servico_id=item.id then antiga.duracao_minutos else item.duracao_minutos end;
 if espera is not null then
  perform 1 from public.saas_espera where id=espera and barbearia_id=loja and status in ('aguardando','contatado') for update;
  if not found then raise exception 'Esta solicitação saiu da lista de espera';end if;
 end if;
 if not exists(select 1 from public.saas_horarios_painel(loja,dia,barbeiro,reserva,item.id) h where h.horario::time=hora) then raise exception 'Horário indisponível. Consulte as vagas novamente';end if;
 if reserva is null then
  insert into public.saas_reservas(id,barbearia_id,profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario,duracao_minutos,status)
  values(coalesce(nova_reserva,gen_random_uuid()),loja,p.id,item.id,item.nome,item.preco,trim(nome),telefone_cliente,dia,hora,tempo,'confirmado') returning * into salva;
 else
  update public.saas_reservas set profissional=p.id,servico_id=item.id,servico_nome=item.nome,
   preco=case when antiga.servico_id=item.id then antiga.preco else item.preco end,cliente=trim(nome),telefone=telefone_cliente,data=dia,horario=hora,duracao_minutos=tempo
   where id=reserva and barbearia_id=loja returning * into salva;
 end if;
 if espera is not null then update public.saas_espera set status='agendado',reserva_id=salva.id where id=espera and barbearia_id=loja;end if;
 return to_jsonb(salva);
end $$;
notify pgrst,'reload schema';
commit;
