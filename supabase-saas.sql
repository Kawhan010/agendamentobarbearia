-- Instalação SaaS: tabelas independentes, sem alterar a agenda original.
-- Execute uma vez, em projeto Supabase dedicado de preferência.
begin;
create schema if not exists saas_privado;
revoke all on schema saas_privado from public, anon, authenticated;
grant usage on schema saas_privado to authenticated;
create table public.saas_barbearias (
 id uuid primary key default gen_random_uuid(), nome text not null check(length(trim(nome)) between 1 and 100),
 slug text not null unique check(slug ~ '^[a-z0-9-]{3,60}$'),
 whatsapp text not null check(whatsapp ~ '^55[0-9]{10,11}$'), logo text not null default '' check(logo='' or logo like 'https://%')
);
create table public.saas_membros (
 user_id uuid primary key references auth.users(id) on delete cascade,
 barbearia_id uuid not null references public.saas_barbearias(id), papel text not null default 'dono' check(papel='dono')
);
create function saas_privado.loja_usuario() returns uuid language sql stable security definer set search_path='' as $$
 select barbearia_id from public.saas_membros where user_id=(select auth.uid())
$$;
revoke all on function saas_privado.loja_usuario() from public,anon;
grant execute on function saas_privado.loja_usuario() to authenticated;
create table public.saas_profissionais (
 id text primary key default gen_random_uuid()::text, barbearia_id uuid not null references public.saas_barbearias(id),
 nome text not null check(length(trim(nome)) between 1 and 100), ativo boolean not null default true, unique(barbearia_id,id)
);
create table public.saas_servicos (
 id uuid primary key default gen_random_uuid(), barbearia_id uuid not null references public.saas_barbearias(id),
 nome text not null check(length(trim(nome)) between 1 and 100), descricao text not null default '', preco numeric(10,2) not null check(preco>0),
 categoria text not null check(categoria in ('individual','combo')), imagem text not null default '', ativo boolean not null default true, unique(barbearia_id,id)
);
create table public.saas_expediente (
 barbearia_id uuid not null references public.saas_barbearias(id), id int not null check(id between 0 and 6),
 aberto boolean not null default true, inicio time not null, fim time not null check(fim>inicio), intervalo_inicio time, intervalo_fim time,
 primary key(barbearia_id,id), check((intervalo_inicio is null and intervalo_fim is null) or
 (intervalo_inicio is not null and intervalo_fim is not null and intervalo_inicio>=inicio and intervalo_fim<=fim and intervalo_fim>intervalo_inicio))
);
create table public.saas_controle_agenda (
 barbearia_id uuid primary key references public.saas_barbearias(id), id int not null default 1 check(id=1), pausado boolean not null default false
);
create table public.saas_bloqueios (
 id uuid primary key default gen_random_uuid(), barbearia_id uuid not null references public.saas_barbearias(id), data date not null, horario time, motivo text not null default ''
);
create table public.saas_reservas (
 id uuid primary key default gen_random_uuid(), barbearia_id uuid not null references public.saas_barbearias(id), profissional text not null,
 servico_id uuid not null, servico_nome text not null, preco numeric(10,2) not null, cliente text not null, telefone text not null,
 data date not null, horario time not null, status text not null default 'pendente' check(status in ('pendente','confirmado','cancelado')), criado_em timestamptz not null default now(),
 foreign key(barbearia_id,profissional) references public.saas_profissionais(barbearia_id,id),
 foreign key(barbearia_id,servico_id) references public.saas_servicos(barbearia_id,id)
);
create unique index saas_reserva_unica on public.saas_reservas(barbearia_id,profissional,data,horario) where status<>'cancelado';
alter table public.saas_barbearias enable row level security;
alter table public.saas_membros enable row level security;
revoke all on public.saas_barbearias,public.saas_membros from anon,authenticated;
grant select on public.saas_barbearias to anon,authenticated;
grant update(nome,whatsapp,logo) on public.saas_barbearias to authenticated;
grant select on public.saas_membros to authenticated;
create policy saas_loja_publica on public.saas_barbearias for select to anon,authenticated using(true);
create policy saas_loja_editar on public.saas_barbearias for update to authenticated using(id=(select saas_privado.loja_usuario())) with check(id=(select saas_privado.loja_usuario()));
create policy saas_membro_proprio on public.saas_membros for select to authenticated using(user_id=(select auth.uid()));
do $$ declare t text; begin
 foreach t in array array['saas_profissionais','saas_servicos','saas_expediente','saas_controle_agenda','saas_bloqueios','saas_reservas'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon,authenticated',t);
 execute format('grant select,insert,update,delete on public.%I to authenticated',t);
 execute format('create policy saas_dono on public.%I for all to authenticated using(barbearia_id=(select saas_privado.loja_usuario())) with check(barbearia_id=(select saas_privado.loja_usuario()))',t);
 execute format('create index on public.%I(barbearia_id)',t);
 end loop;
end $$;
grant select on public.saas_profissionais,public.saas_servicos to anon;
create policy saas_profissionais_publicos on public.saas_profissionais for select to anon,authenticated using(ativo);
create policy saas_servicos_publicos on public.saas_servicos for select to anon,authenticated using(ativo);

create function public.saas_criar_barbearia(nome_loja text,slug_loja text,whatsapp_loja text) returns uuid language plpgsql security definer set search_path='' as $$
declare loja uuid; begin
 if auth.uid() is null then raise exception 'Entre na sua conta para criar a barbearia'; end if;
 perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
 if exists(select 1 from public.saas_membros where user_id=auth.uid()) then raise exception 'Sua conta já possui uma barbearia'; end if;
 insert into public.saas_barbearias(nome,slug,whatsapp) values(trim(nome_loja),slug_loja,whatsapp_loja) returning id into loja;
 insert into public.saas_membros(user_id,barbearia_id) values(auth.uid(),loja);
 insert into public.saas_expediente(barbearia_id,id,aberto,inicio,fim) select loja,d,d<>0,'09:00'::time,'18:00'::time from generate_series(0,6) d;
 insert into public.saas_controle_agenda(barbearia_id) values(loja);
 insert into public.saas_profissionais(barbearia_id,nome) values(loja,'Profissional 1');
 return loja;
end $$;
revoke all on function public.saas_criar_barbearia(text,text,text) from public,anon;
grant execute on function public.saas_criar_barbearia(text,text,text) to authenticated;

create function public.saas_salvar_expediente(loja uuid,dias jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 if jsonb_array_length(dias)<>7 or (select count(distinct (x->>'id')::int) from jsonb_array_elements(dias) x where (x->>'id')::int between 0 and 6)<>7 then raise exception 'Informe sete dias distintos'; end if;
 perform 1 from public.saas_controle_agenda where barbearia_id=loja for update;
 update public.saas_expediente e set aberto=d.aberto,inicio=d.inicio,fim=d.fim,intervalo_inicio=d.intervalo_inicio,intervalo_fim=d.intervalo_fim
 from jsonb_to_recordset(dias) as d(id int,aberto boolean,inicio time,fim time,intervalo_inicio time,intervalo_fim time) where e.barbearia_id=loja and e.id=d.id;
end $$;
revoke all on function public.saas_salvar_expediente(uuid,jsonb) from public,anon;
grant execute on function public.saas_salvar_expediente(uuid,jsonb) to authenticated;

-- Endpoints públicos: expõem somente disponibilidade e criam reserva validada.
create function public.saas_horarios_livres(loja uuid,dia date,barbeiro text) returns table(horario text) language sql stable security definer set search_path='' as $$
 select to_char(s,'HH24:MI') from public.saas_expediente e
 cross join lateral generate_series(dia+e.inicio,dia+e.fim-interval '40 minutes',interval '40 minutes') s
 where e.barbearia_id=loja and e.id=extract(dow from dia) and e.aberto
 and exists(select 1 from public.saas_controle_agenda where barbearia_id=loja and not pausado)
 and (e.intervalo_inicio is null or s+interval '40 minutes'<=dia+e.intervalo_inicio or s>=dia+e.intervalo_fim)
 and dia between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+14
 and s>now() at time zone 'America/Sao_Paulo'
 and not exists(select 1 from public.saas_bloqueios b where b.barbearia_id=loja and b.data=dia and (b.horario is null or (dia+b.horario<s+interval '40 minutes' and dia+b.horario+interval '40 minutes'>s)))
 and exists(select 1 from public.saas_profissionais p where p.barbearia_id=loja and p.ativo and (barbeiro='sem-preferencia' or p.id=barbeiro)
 and not exists(select 1 from public.saas_reservas r where r.barbearia_id=loja and r.profissional=p.id and r.data=dia and r.status<>'cancelado' and dia+r.horario<s+interval '40 minutes' and dia+r.horario+interval '40 minutes'>s));
$$;
revoke all on function public.saas_horarios_livres(uuid,date,text) from public;
grant execute on function public.saas_horarios_livres(uuid,date,text) to anon,authenticated;
create function public.saas_reservar(loja uuid,dia date,hora time,barbeiro text,servico uuid,nome text,telefone_cliente text) returns jsonb language plpgsql security definer set search_path='' as $$
declare escolhido text; item public.saas_servicos; reserva public.saas_reservas; begin
 if nome is null or telefone_cliente is null or length(trim(nome)) not between 1 and 100 or telefone_cliente !~ '^[0-9]{10,11}$' then raise exception 'Dados inválidos'; end if;
 perform 1 from public.saas_controle_agenda where barbearia_id=loja and not pausado for share;
 if not found then raise exception 'Expediente pausado'; end if;
 select * into item from public.saas_servicos where barbearia_id=loja and id=servico and ativo;
 if not found then raise exception 'Serviço indisponível'; end if;
 perform pg_advisory_xact_lock(hashtext(loja::text||dia::text));
 select p.id into escolhido from public.saas_profissionais p where p.barbearia_id=loja and p.ativo and (barbeiro='sem-preferencia' or p.id=barbeiro)
 and exists(select 1 from public.saas_horarios_livres(loja,dia,p.id) h where h.horario::time=hora) order by p.id limit 1;
 if escolhido is null then raise exception 'Horário indisponível'; end if;
 insert into public.saas_reservas(barbearia_id,profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario)
 values(loja,escolhido,item.id,item.nome,item.preco,trim(nome),telefone_cliente,dia,hora) returning * into reserva;
 return jsonb_build_object('id',reserva.id,'profissional',escolhido,'nome',item.nome,'preco',item.preco);
end $$;
revoke all on function public.saas_reservar(uuid,date,time,text,uuid,text,text) from public;
grant execute on function public.saas_reservar(uuid,date,time,text,uuid,text,text) to anon,authenticated;
commit;
