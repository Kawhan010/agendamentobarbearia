-- Rotina do barbeiro: histórico, agenda manual, pagamentos, caixa e espera.
begin;
alter table public.saas_reservas drop constraint if exists saas_reservas_status_check;
alter table public.saas_reservas add constraint saas_reservas_status_check
 check(status in ('pendente','confirmado','cancelado','concluido','faltou'));
alter table public.saas_reservas add column if not exists atualizado_em timestamptz not null default now();
create unique index if not exists saas_reservas_loja_id on public.saas_reservas(barbearia_id,id);
create index if not exists saas_reservas_cliente_data on public.saas_reservas(barbearia_id,telefone,data desc);
create index if not exists saas_reservas_agenda_data on public.saas_reservas(barbearia_id,data,horario);

create table public.saas_clientes (
 barbearia_id uuid not null references public.saas_barbearias(id),
 telefone text not null check(telefone ~ '^[0-9]{10,11}$'),
 nome text not null check(length(trim(nome)) between 1 and 100),
 observacoes text not null default '' check(length(observacoes)<=2000),
 atualizado_em timestamptz not null default now(), primary key(barbearia_id,telefone)
);
create index saas_clientes_nome on public.saas_clientes(barbearia_id,nome);
create table public.saas_pagamentos (
 id uuid primary key default gen_random_uuid(), barbearia_id uuid not null references public.saas_barbearias(id),
 reserva_id uuid not null unique, valor numeric(10,2) not null check(valor>0),
 forma text not null check(forma in ('pix','dinheiro','cartao')), data date not null,
 atualizado_em timestamptz not null default now(),
 foreign key(barbearia_id,reserva_id) references public.saas_reservas(barbearia_id,id)
);
create index saas_pagamentos_periodo on public.saas_pagamentos(barbearia_id,data);
create table public.saas_despesas (
 id uuid primary key default gen_random_uuid(), barbearia_id uuid not null references public.saas_barbearias(id),
 descricao text not null check(length(trim(descricao)) between 1 and 200),
 valor numeric(10,2) not null check(valor>0), forma text not null check(forma in ('pix','dinheiro','cartao')),
 data date not null, criado_em timestamptz not null default now()
);
create index saas_despesas_periodo on public.saas_despesas(barbearia_id,data);
create table public.saas_espera (
 id uuid primary key default gen_random_uuid(), barbearia_id uuid not null references public.saas_barbearias(id),
 cliente text not null check(length(trim(cliente)) between 1 and 100),
 telefone text not null check(telefone ~ '^[0-9]{10,11}$'), servico_id uuid not null, profissional text,
 data date, inicio time, fim time, observacoes text not null default '' check(length(observacoes)<=500),
 status text not null default 'aguardando' check(status in ('aguardando','contatado','agendado','encerrado')),
 reserva_id uuid, criado_em timestamptz not null default now(),
 foreign key(barbearia_id,servico_id) references public.saas_servicos(barbearia_id,id),
 foreign key(barbearia_id,profissional) references public.saas_profissionais(barbearia_id,id),
 foreign key(barbearia_id,reserva_id) references public.saas_reservas(barbearia_id,id) on delete set null (reserva_id),
 check((inicio is null and fim is null) or (inicio is not null and fim is not null and fim>inicio))
);
create index saas_espera_status on public.saas_espera(barbearia_id,status,criado_em);
create index saas_espera_servico on public.saas_espera(barbearia_id,servico_id);
create index saas_espera_profissional on public.saas_espera(barbearia_id,profissional);
create index saas_espera_reserva on public.saas_espera(barbearia_id,reserva_id);

do $$ declare t text; begin
 foreach t in array array['saas_clientes','saas_pagamentos','saas_despesas','saas_espera'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select,insert,update on public.%I to authenticated',t);
  execute format('create policy rotina_dono on public.%I for all to authenticated using(barbearia_id=(select saas_privado.loja_usuario())) with check(barbearia_id=(select saas_privado.loja_usuario()))',t);
 end loop;
end $$;
grant delete on public.saas_despesas to authenticated;

-- O cadastro privado permite consultar cortes antigos sem expor clientes no site público.
insert into public.saas_clientes(barbearia_id,telefone,nome)
 select distinct on (barbearia_id,telefone) barbearia_id,telefone,trim(cliente)
 from public.saas_reservas where telefone ~ '^[0-9]{10,11}$' and length(trim(cliente)) between 1 and 100
 order by barbearia_id,telefone,criado_em desc;
create function saas_privado.sincronizar_cliente() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 insert into public.saas_clientes(barbearia_id,telefone,nome) values(new.barbearia_id,new.telefone,trim(new.cliente))
 on conflict(barbearia_id,telefone) do update set nome=excluded.nome,atualizado_em=now();
 return new;
end $$;
revoke all on function saas_privado.sincronizar_cliente() from public,anon,authenticated;
create trigger saas_reserva_cliente after insert or update of cliente,telefone on public.saas_reservas for each row execute function saas_privado.sincronizar_cliente();

create function saas_privado.proteger_atendimento() returns trigger language plpgsql security invoker set search_path='' as $$
declare pago boolean; begin
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
revoke all on function saas_privado.proteger_atendimento() from public,anon,authenticated;
create trigger saas_proteger_atendimento before update or delete on public.saas_reservas
 for each row execute function saas_privado.proteger_atendimento();

create function saas_privado.validar_pagamento() returns trigger language plpgsql security invoker set search_path='' as $$
declare r public.saas_reservas; begin
 select * into r from public.saas_reservas where id=new.reserva_id and barbearia_id=new.barbearia_id for update;
 if not found or r.status not in ('confirmado','concluido') then raise exception 'Confirme o atendimento antes de registrar o pagamento'; end if;
 if new.data>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data do recebimento não pode ser futura'; end if;
 if tg_op='UPDATE' and (new.reserva_id,new.barbearia_id) is distinct from (old.reserva_id,old.barbearia_id) then raise exception 'O pagamento pertence a outro atendimento'; end if;
 new.atualizado_em:=now(); return new;
end $$;
revoke all on function saas_privado.validar_pagamento() from public,anon,authenticated;
create trigger saas_validar_pagamento before insert or update on public.saas_pagamentos
 for each row execute function saas_privado.validar_pagamento();
create function saas_privado.validar_despesa() returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if new.data>(now() at time zone 'America/Sao_Paulo')::date then raise exception 'A data da despesa não pode ser futura'; end if;
 return new;
end $$;
revoke all on function saas_privado.validar_despesa() from public,anon,authenticated;
create trigger saas_validar_despesa before insert or update on public.saas_despesas
 for each row execute function saas_privado.validar_despesa();

-- Disponibilidade administrativa: até um ano; permite registrar encaixes de hoje.
create function public.saas_horarios_painel(loja uuid,dia date,barbeiro text,reserva uuid default null)
returns table(horario text) language plpgsql stable security invoker set search_path='' as $$
declare tempo integer; begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 select p.duracao_minutos into tempo from public.saas_profissionais p where p.id=barbeiro and p.barbearia_id=loja and p.ativo;
 if reserva is not null then
  select case when r.profissional=barbeiro then r.duracao_minutos else tempo end into tempo
   from public.saas_reservas r where r.id=reserva and r.barbearia_id=loja and r.status in ('pendente','confirmado');
 end if;
 if tempo is null or dia is null or dia not between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+365 then return; end if;
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

create function public.saas_agendar_painel(loja uuid,dia date,hora time,barbeiro text,servico uuid,nome text,telefone_cliente text,
 reserva uuid default null,nova_reserva uuid default null,espera uuid default null,versao timestamptz default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare item public.saas_servicos; p public.saas_profissionais; antiga public.saas_reservas; salva public.saas_reservas; dia_antigo date; d date;
begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 if nome is null or length(trim(nome)) not between 1 and 100 or telefone_cliente is null or telefone_cliente !~ '^[0-9]{10,11}$' then raise exception 'Informe nome e telefone com DDD'; end if;
 if dia is null or hora is null or barbeiro is null then raise exception 'Escolha profissional, data e horário'; end if;
 perform 1 from public.saas_controle_agenda where barbearia_id=loja and not pausado for share;
 if not found then raise exception 'Expediente pausado'; end if;
 if reserva is not null then
  select data into dia_antigo from public.saas_reservas where id=reserva and barbearia_id=loja;
  if not found then raise exception 'Agendamento não encontrado'; end if;
 end if;
 -- Mesma trava usada pelas reservas públicas. Datas ordenadas evitam travas cruzadas.
 for d in select distinct x from unnest(array[dia,coalesce(dia_antigo,dia)]) x order by x loop
  perform pg_advisory_xact_lock(hashtext(loja::text||d::text));
 end loop;
 if reserva is not null then
  select * into antiga from public.saas_reservas where id=reserva and barbearia_id=loja for update;
  if antiga.data<>dia_antigo or (versao is not null and antiga.atualizado_em<>versao) then raise exception 'O agendamento mudou. Atualize a agenda'; end if;
  if antiga.status not in ('pendente','confirmado') or exists(select 1 from public.saas_pagamentos where reserva_id=reserva) then raise exception 'Atendimento finalizado ou pago não pode ser remarcado'; end if;
 end if;
 select * into item from public.saas_servicos where id=servico and barbearia_id=loja and ativo for share;
 if not found then raise exception 'Serviço indisponível'; end if;
 select * into p from public.saas_profissionais where id=barbeiro and barbearia_id=loja and ativo and duracao_minutos is not null for share;
 if not found then raise exception 'Profissional indisponível ou sem tempo de atendimento'; end if;
 if espera is not null then
  perform 1 from public.saas_espera where id=espera and barbearia_id=loja and status in ('aguardando','contatado') for update;
  if not found then raise exception 'Esta solicitação saiu da lista de espera'; end if;
 end if;
 if not exists(select 1 from public.saas_horarios_painel(loja,dia,barbeiro,reserva) h where h.horario::time=hora) then raise exception 'Horário indisponível. Consulte as vagas novamente'; end if;
 if reserva is null then
  insert into public.saas_reservas(id,barbearia_id,profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario,duracao_minutos,status)
   values(coalesce(nova_reserva,gen_random_uuid()),loja,p.id,item.id,item.nome,item.preco,trim(nome),telefone_cliente,dia,hora,p.duracao_minutos,'confirmado') returning * into salva;
 else
  update public.saas_reservas set profissional=p.id,servico_id=item.id,servico_nome=item.nome,
   preco=case when antiga.servico_id=item.id then antiga.preco else item.preco end,cliente=trim(nome),telefone=telefone_cliente,data=dia,horario=hora,
   duracao_minutos=case when antiga.profissional=p.id then antiga.duracao_minutos else p.duracao_minutos end
   where id=reserva and barbearia_id=loja returning * into salva;
 end if;
 if espera is not null then update public.saas_espera set status='agendado',reserva_id=salva.id where id=espera and barbearia_id=loja; end if;
 return to_jsonb(salva);
end $$;

create function public.saas_finalizar_atendimento(loja uuid,reserva uuid,estado text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare r public.saas_reservas; begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 if estado is null or estado not in ('concluido','faltou') then raise exception 'Situação inválida'; end if;
 select * into r from public.saas_reservas where id=reserva and barbearia_id=loja for update;
 if not found then raise exception 'Agendamento não encontrado'; end if;
 if r.status=estado then return to_jsonb(r); end if;
 if r.status not in ('pendente','confirmado') then raise exception 'Este atendimento já foi finalizado'; end if;
 update public.saas_reservas set status=estado where id=reserva and barbearia_id=loja returning * into r;
 return to_jsonb(r);
end $$;
create function public.saas_registrar_pagamento(loja uuid,reserva uuid,valor_recebido numeric,forma_pagamento text,dia date)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare p public.saas_pagamentos; begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 if valor_recebido is null or valor_recebido<=0 or valor_recebido>=100000000 or valor_recebido<>round(valor_recebido,2) or dia is null then raise exception 'Informe um valor e uma data válidos'; end if;
 insert into public.saas_pagamentos(barbearia_id,reserva_id,valor,forma,data) values(loja,reserva,valor_recebido,forma_pagamento,dia)
 on conflict(reserva_id) do update set valor=excluded.valor,forma=excluded.forma,data=excluded.data
 returning * into p;
 return to_jsonb(p);
end $$;
create function public.saas_salvar_cliente(loja uuid,telefone_cliente text,nome text,notas text)
returns void language plpgsql security invoker set search_path='' as $$
begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 insert into public.saas_clientes(barbearia_id,telefone,nome,observacoes) values(loja,telefone_cliente,trim(nome),coalesce(notas,''))
 on conflict(barbearia_id,telefone) do update set nome=excluded.nome,observacoes=excluded.observacoes,atualizado_em=now();
end $$;
create function public.saas_historico_cliente(loja uuid,telefone_cliente text,deslocamento integer default 0)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare dados jsonb; begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 select jsonb_build_object('total',count(*),'concluidos',count(*) filter(where status='concluido'),
  'faltas',count(*) filter(where status='faltou'),'ultima_visita',max(data) filter(where status='concluido')) into dados
 from public.saas_reservas where barbearia_id=loja and telefone=telefone_cliente;
 return dados||jsonb_build_object('atendimentos',coalesce((select jsonb_agg(to_jsonb(x)) from
  (select r.id,r.cliente,r.data,r.horario,r.servico_nome,r.status,r.preco,p.nome as profissional,pg.valor as recebido,pg.forma
   from public.saas_reservas r join public.saas_profissionais p on p.id=r.profissional and p.barbearia_id=loja
   left join public.saas_pagamentos pg on pg.reserva_id=r.id and pg.barbearia_id=loja
   where r.barbearia_id=loja and r.telefone=telefone_cliente order by r.data desc,r.horario desc,r.id
   limit 20 offset greatest(coalesce(deslocamento,0),0)) x),'[]'::jsonb));
end $$;
create function public.saas_caixa(loja uuid,inicio date,fim date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare entradas numeric; saidas numeric; formas jsonb; begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 if inicio is null or fim is null or fim<inicio or fim-inicio>366 then raise exception 'Escolha um período de até um ano'; end if;
 select coalesce(sum(valor),0),jsonb_build_object('pix',coalesce(sum(valor) filter(where forma='pix'),0),
  'dinheiro',coalesce(sum(valor) filter(where forma='dinheiro'),0),'cartao',coalesce(sum(valor) filter(where forma='cartao'),0))
 into entradas,formas from public.saas_pagamentos where barbearia_id=loja and data between inicio and fim;
 select coalesce(sum(valor),0) into saidas from public.saas_despesas where barbearia_id=loja and data between inicio and fim;
 return jsonb_build_object('entradas',entradas,'despesas',saidas,'saldo',entradas-saidas,'formas',formas);
end $$;

-- Limpar a lista nunca apaga recebimentos, cortes concluídos ou faltas do histórico.
create or replace function public.saas_limpar_agendamentos(loja uuid,reservas uuid[])
returns integer language plpgsql security invoker set search_path='' as $$
declare quantidade integer; begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 delete from public.saas_reservas r where r.barbearia_id=loja and r.id=any(reservas) and r.status not in ('concluido','faltou')
  and not exists(select 1 from public.saas_pagamentos p where p.reserva_id=r.id and p.barbearia_id=loja);
 get diagnostics quantidade=row_count; return quantidade;
end $$;
do $$ declare f record; begin
 for f in select oid::regprocedure as assinatura from pg_proc where pronamespace='public'::regnamespace and proname in
  ('saas_horarios_painel','saas_agendar_painel','saas_finalizar_atendimento','saas_registrar_pagamento','saas_salvar_cliente','saas_historico_cliente','saas_caixa','saas_limpar_agendamentos') loop
  execute format('revoke all on function %s from public,anon',f.assinatura);
  execute format('grant execute on function %s to authenticated',f.assinatura);
 end loop;
end $$;
notify pgrst,'reload schema';
commit;
