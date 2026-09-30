-- Execute uma vez no SQL Editor do projeto Supabase.
begin;
create table public.administradores (user_id uuid primary key references auth.users(id) on delete cascade);
alter table public.administradores enable row level security;
grant select on public.administradores to authenticated;
create policy proprio_admin on public.administradores for select to authenticated using (user_id=auth.uid());
create function public.eh_admin() returns boolean language sql stable security definer set search_path='' as $$ select exists(select 1 from public.administradores where user_id=auth.uid()); $$;
revoke all on function public.eh_admin() from public;
grant execute on function public.eh_admin() to authenticated;
create table public.servicos(id uuid primary key default gen_random_uuid(),nome text not null check(length(trim(nome)) between 1 and 100),descricao text not null default '',preco numeric(10,2) not null check(preco>0),categoria text not null check(categoria in ('individual','combo')),imagem text not null default '',ativo boolean not null default true);
create table public.expediente(id integer primary key check(id between 0 and 6),aberto boolean not null,inicio time not null,fim time not null,check(fim>inicio));
insert into public.expediente select d,d<>1,'09:00'::time,'18:00'::time from generate_series(0,6) d;
create table public.bloqueios(id uuid primary key default gen_random_uuid(),data date not null,horario time,motivo text not null default '');
create table public.reservas(id uuid primary key default gen_random_uuid(),profissional text not null check(profissional in ('profissional-1','profissional-2')),servico_id uuid references public.servicos(id),servico_nome text not null,preco numeric(10,2) not null,cliente text not null,telefone text not null,data date not null,horario time not null,status text not null default 'pendente' check(status in ('pendente','confirmado','cancelado')),criado_em timestamptz not null default now());
create unique index reserva_unica on public.reservas(profissional,data,horario) where status<>'cancelado';
alter table public.servicos enable row level security;
alter table public.expediente enable row level security;
alter table public.bloqueios enable row level security;
alter table public.reservas enable row level security;
revoke all on public.administradores from anon;
revoke insert,update,delete on public.administradores from authenticated;
revoke all on public.servicos,public.expediente,public.bloqueios,public.reservas from anon,authenticated;
grant select on public.servicos,public.expediente to anon,authenticated;
grant select,insert,update,delete on public.servicos,public.expediente,public.bloqueios,public.reservas to authenticated;
create policy catalogo_publico on public.servicos for select to anon,authenticated using(ativo);
create policy expediente_publico on public.expediente for select to anon,authenticated using(true);
create policy servicos_admin on public.servicos for all to authenticated using(public.eh_admin()) with check(public.eh_admin());
create policy expediente_admin on public.expediente for all to authenticated using(public.eh_admin()) with check(public.eh_admin());
create policy bloqueios_admin on public.bloqueios for all to authenticated using(public.eh_admin()) with check(public.eh_admin());
create policy reservas_admin on public.reservas for all to authenticated using(public.eh_admin()) with check(public.eh_admin());
create function public.salvar_expediente(dias jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not public.eh_admin() then raise exception 'Acesso negado'; end if;
 if jsonb_array_length(dias)<>7 then raise exception 'Informe sete dias';end if;
 update public.expediente e set aberto=d.aberto,inicio=d.inicio,fim=d.fim from jsonb_to_recordset(dias) as d(id int,aberto boolean,inicio time,fim time) where e.id=d.id;
end $$;
revoke all on function public.salvar_expediente(jsonb) from public;
grant execute on function public.salvar_expediente(jsonb) to authenticated;
-- A consulta pública revela somente horários, nunca dados de clientes ou motivos dos bloqueios.
create function public.horarios_livres(dia date, barbeiro text) returns table(horario text) language sql stable security definer set search_path='' as $$
 select to_char(s,'HH24:MI') from public.expediente e
 cross join lateral generate_series(dia+e.inicio,dia+e.fim-interval '40 minutes',interval '40 minutes') s
 where e.id=extract(dow from dia) and e.aberto
 and dia between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+14
 and s > now() at time zone 'America/Sao_Paulo'
 and not exists(select 1 from public.bloqueios b where b.data=dia and (b.horario is null or (b.horario<s::time+interval '40 minutes' and b.horario+interval '40 minutes'>s::time)))
 and exists(select 1 from (values ('profissional-1'),('profissional-2')) p(id) where (barbeiro='sem-preferencia' or p.id=barbeiro)
 and not exists(select 1 from public.reservas r where r.profissional=p.id and r.data=dia and r.status<>'cancelado' and r.horario<s::time+interval '40 minutes' and r.horario+interval '40 minutes'>s::time));
$$;
revoke all on function public.horarios_livres(date,text) from public;
grant execute on function public.horarios_livres(date,text) to anon,authenticated;
create function public.reservar(dia date,hora time,barbeiro text,servico uuid,nome text,telefone_cliente text) returns jsonb language plpgsql security definer set search_path='' as $$
declare escolhido text; item public.servicos; reserva public.reservas;
begin
 if length(trim(nome)) not between 1 and 100 or telefone_cliente !~ '^[0-9]{10,11}$' then raise exception 'Dados inválidos';end if;
 if barbeiro not in ('profissional-1','profissional-2','sem-preferencia') then raise exception 'Profissional inválido';end if;
 select * into item from public.servicos where id=servico and ativo;
 if not found then raise exception 'Serviço indisponível';end if;
 -- Serializa reservas da mesma data, inclusive a escolha sem preferência.
 perform pg_advisory_xact_lock(hashtext('agenda-salles-'||dia::text));
 select p.id into escolhido from (values ('profissional-1'),('profissional-2')) p(id)
 where (barbeiro='sem-preferencia' or p.id=barbeiro) and exists(select 1 from public.horarios_livres(dia,p.id) h where h.horario=to_char(dia+hora,'HH24:MI')) limit 1;
 if escolhido is null then raise exception 'Horário indisponível';end if;
 insert into public.reservas(profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario) values(escolhido,item.id,item.nome,item.preco,trim(nome),telefone_cliente,dia,hora) returning * into reserva;
 return jsonb_build_object('id',reserva.id,'profissional',escolhido,'nome',item.nome,'preco',item.preco);
end $$;
revoke all on function public.reservar(date,time,text,uuid,text,text) from public;
grant execute on function public.reservar(date,time,text,uuid,text,text) to anon,authenticated;
commit;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('a35b9068-bf9a-4610-bd82-75c14a864145','Pezinho','Contorno e acabamento do cabelo.',10,'individual','assets/pezinho.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('d61d6507-f8d1-4f8a-bb37-55a5d94c94f4','Sobrancelha','Limpeza e definição do desenho.',10,'individual','assets/sobrancelha.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('f031d3aa-760c-4328-acfb-c3ed45f78061','Barba','Desenho e acabamento da barba.',20,'individual','assets/barba.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('251d3c43-7315-4854-8142-37cffee2c58c','Corte','Um corte para o seu estilo.',30,'individual','assets/corte.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('95a98b7f-dbdc-485e-be14-036eea1e012b','Botox capilar','Cuidado e tratamento dos fios.',80,'individual','assets/botox.png',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('002f1134-db5f-4e68-aa1f-4a33e9fa71a4','Barba + sobrancelha','Desenho da barba e definição da sobrancelha.',25,'combo','assets/barba.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('25da1668-57e5-4d73-841a-828cccb2cc7f','Barba + pezinho','Desenho da barba e acabamento do cabelo.',30,'combo','assets/barba.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('b34f8252-a0b2-443f-85fc-6f10509467a2','Em dia: pezinho + barba + sobrancelha','Pezinho + barba + sobrancelha',35,'combo','assets/pezinho.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('6b83b0cd-f0af-4bf5-808d-5cfa87dd19a7','Cabelo + sobrancelha','Corte de cabelo e definição da sobrancelha.',35,'combo','assets/corte.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('74de98bb-c87f-4346-9828-aa40292d90ee','Clássico: corte + barba','Corte + barba',45,'combo','assets/corte.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('cbfe9d8a-8587-48b5-b8b9-09e11bad3442','Visual completo: corte + barba + sobrancelha','Corte + barba + sobrancelha',50,'combo','assets/corte.jpg',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('b8861fc8-2f93-410b-937f-137e33b11f76','Renovação: botox capilar + corte','Botox capilar + corte',90,'combo','assets/botox.png',true) on conflict(id) do nothing;
insert into public.servicos(id,nome,descricao,preco,categoria,imagem,ativo) values ('95162924-dfbb-411e-8bb6-0f66de590b80','Botox + corte + barba','Botox capilar, corte de cabelo e desenho da barba.',100,'combo','assets/botox.png',true) on conflict(id) do nothing;

