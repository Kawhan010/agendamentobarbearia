begin;

-- Permissões da plataforma não vêm dos metadados editáveis da conta.
create table saas_privado.proprietarios (
 user_id uuid primary key references auth.users(id) on delete cascade,
 criado_em timestamptz not null default now()
);
alter table saas_privado.proprietarios enable row level security;
revoke all on saas_privado.proprietarios from public,anon,authenticated;

alter table public.saas_barbearias add column ativa boolean not null default true;
revoke update(ativa) on public.saas_barbearias from public,anon,authenticated;

create table saas_privado.auditoria_proprietario (
 id uuid primary key default gen_random_uuid(),
 barbearia_id uuid not null references public.saas_barbearias(id),
 autor_id uuid references auth.users(id) on delete set null,
 autor_email text not null,
 antes jsonb not null,
 depois jsonb not null,
 criado_em timestamptz not null default now()
);
alter table saas_privado.auditoria_proprietario enable row level security;
revoke all on saas_privado.auditoria_proprietario from public,anon,authenticated;
create index auditoria_proprietario_recente on saas_privado.auditoria_proprietario(criado_em desc,id);
create index auditoria_proprietario_loja on saas_privado.auditoria_proprietario(barbearia_id);
create index auditoria_proprietario_autor on saas_privado.auditoria_proprietario(autor_id);
create index if not exists saas_membros_barbearia on public.saas_membros(barbearia_id);
create index saas_reservas_dia_ativas on public.saas_reservas(data) where status<>'cancelado';

create function saas_privado.exigir_proprietario() returns uuid
language plpgsql security definer set search_path='' as $$
declare usuario uuid := (select auth.uid());
begin
 perform 1 from saas_privado.proprietarios where user_id=usuario for share;
 if not found then raise exception 'Esta conta não tem acesso à área do proprietário' using errcode='42501';end if;
 return usuario;
end $$;
revoke all on function saas_privado.exigir_proprietario() from public,anon;
grant execute on function saas_privado.exigir_proprietario() to authenticated;

create function saas_privado.proprietario_listar(busca text,situacao text,apos uuid) returns jsonb
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
  select a.id,a.barbearia_id,b.nome as barbearia,a.autor_email,a.antes,a.depois,a.criado_em
  from saas_privado.auditoria_proprietario a join public.saas_barbearias b on b.id=a.barbearia_id
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
  'auditoria',coalesce((select jsonb_agg(to_jsonb(h) order by h.criado_em desc,h.id) from historico h),'[]'::jsonb)
 ) into resposta;
 return resposta;
end $$;
revoke all on function saas_privado.proprietario_listar(text,text,uuid) from public,anon;
grant execute on function saas_privado.proprietario_listar(text,text,uuid) to authenticated;

create function public.saas_proprietario_listar(busca text default '',situacao text default 'todas',apos uuid default null) returns jsonb
language sql security invoker set search_path='' as $$select saas_privado.proprietario_listar(busca,situacao,apos)$$;
revoke all on function public.saas_proprietario_listar(text,text,uuid) from public,anon;
grant execute on function public.saas_proprietario_listar(text,text,uuid) to authenticated;

create function saas_privado.proprietario_salvar(loja uuid,nome_novo text,whatsapp_novo text,ativa_nova boolean,
 nome_anterior text,whatsapp_anterior text,ativa_anterior boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare usuario uuid; antiga public.saas_barbearias; nova public.saas_barbearias;
begin
 usuario:=saas_privado.exigir_proprietario();
 if nome_novo is null or length(trim(nome_novo)) not between 1 and 100 or nome_novo ~ '[[:cntrl:]]'
  or whatsapp_novo is null or whatsapp_novo !~ '^55[0-9]{10,11}$' or ativa_nova is null then raise exception 'Informe nome e WhatsApp com DDD válidos';end if;
 nome_novo:=trim(nome_novo);
 select * into antiga from public.saas_barbearias where id=loja for update;
 if not found then raise exception 'Barbearia não encontrada';end if;
 if (antiga.nome,antiga.whatsapp,antiga.ativa) is distinct from (nome_novo,whatsapp_novo,ativa_nova) then
  if (antiga.nome,antiga.whatsapp,antiga.ativa) is distinct from (nome_anterior,whatsapp_anterior,ativa_anterior) then
   raise exception 'Os dados desta barbearia mudaram. Atualize a lista antes de editar novamente' using errcode='40001';
  end if;
  update public.saas_barbearias set nome=nome_novo,whatsapp=whatsapp_novo,ativa=ativa_nova where id=loja returning * into nova;
  insert into saas_privado.auditoria_proprietario(barbearia_id,autor_id,autor_email,antes,depois)
  values(loja,usuario,(select email from auth.users where id=usuario),
   jsonb_build_object('nome',antiga.nome,'whatsapp',antiga.whatsapp,'ativa',antiga.ativa),
   jsonb_build_object('nome',nova.nome,'whatsapp',nova.whatsapp,'ativa',nova.ativa));
 else nova:=antiga;end if;
 return jsonb_build_object('id',nova.id,'nome',nova.nome,'slug',nova.slug,'whatsapp',nova.whatsapp,'ativa',nova.ativa);
end $$;
revoke all on function saas_privado.proprietario_salvar(uuid,text,text,boolean,text,text,boolean) from public,anon;
grant execute on function saas_privado.proprietario_salvar(uuid,text,text,boolean,text,text,boolean) to authenticated;

create function public.saas_proprietario_salvar(loja uuid,nome_novo text,whatsapp_novo text,ativa_nova boolean,
 nome_anterior text,whatsapp_anterior text,ativa_anterior boolean) returns jsonb
language sql security invoker set search_path='' as $$
 select saas_privado.proprietario_salvar(loja,nome_novo,whatsapp_novo,ativa_nova,nome_anterior,whatsapp_anterior,ativa_anterior)
$$;
revoke all on function public.saas_proprietario_salvar(uuid,text,text,boolean,text,text,boolean) from public,anon;
grant execute on function public.saas_proprietario_salvar(uuid,text,text,boolean,text,text,boolean) to authenticated;

-- Bloqueia também inserts diretos e remarcações, sem impedir conclusão/pagamento do histórico.
create function saas_privado.validar_barbearia_ativa() returns trigger
language plpgsql security invoker set search_path='' as $$
begin
 if tg_op='UPDATE' then
  if (new.barbearia_id,new.data,new.horario,new.profissional,new.servico_id,new.duracao_minutos)
   is not distinct from (old.barbearia_id,old.data,old.horario,old.profissional,old.servico_id,old.duracao_minutos)
   and not (old.status='cancelado' and new.status<>'cancelado') then return new;end if;
 end if;
 perform 1 from public.saas_barbearias where id=new.barbearia_id and ativa for share;
 if not found then raise exception 'Esta barbearia está com novos agendamentos suspensos';end if;
 return new;
end $$;
revoke all on function saas_privado.validar_barbearia_ativa() from public,anon,authenticated;
create trigger saas_barbearia_ativa before insert or update on public.saas_reservas
for each row execute function saas_privado.validar_barbearia_ativa();

-- As duas funções de disponibilidade são atualizadas abaixo, mantendo suas assinaturas.

create or replace function public.saas_horarios_livres(loja uuid,dia date,barbeiro text,servico uuid default null)
returns table(horario text) language sql stable security definer set search_path='' as $$
 select distinct to_char(s,'HH24:MI') as horario
 from public.saas_expediente e
 join public.saas_profissionais p on p.barbearia_id=e.barbearia_id and p.ativo
 left join public.saas_servicos item on item.id=servico and item.barbearia_id=loja and item.ativo
 cross join lateral (select case when servico is null then p.duracao_minutos else item.duracao_minutos end as minutos) tempo
 cross join lateral generate_series(dia+e.inicio,dia+e.fim-make_interval(mins=>tempo.minutos),make_interval(mins=>tempo.minutos)) s
 where exists(select 1 from public.saas_barbearias b where b.id=loja and b.ativa) and e.barbearia_id=loja and e.id=extract(dow from dia) and e.aberto and tempo.minutos is not null
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

create or replace function public.saas_horarios_painel(loja uuid,dia date,barbeiro text,reserva uuid default null,servico uuid default null)
returns table(horario text) language plpgsql stable security invoker set search_path='' as $$
declare tempo integer; antiga public.saas_reservas; begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 if not exists(select 1 from public.saas_barbearias b where b.id=loja and b.ativa) then return;end if;
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

notify pgrst,'reload schema';
commit;
