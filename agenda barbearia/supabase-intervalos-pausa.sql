-- Atualização de banco existente. Execute todo o arquivo no SQL Editor.
begin;
alter table public.expediente add column if not exists intervalo_inicio time;
alter table public.expediente add column if not exists intervalo_fim time;
alter table public.expediente drop constraint if exists intervalo_valido;
alter table public.expediente add constraint intervalo_valido check (
 (intervalo_inicio is null and intervalo_fim is null) or
 (intervalo_inicio is not null and intervalo_fim is not null and intervalo_inicio>=inicio and intervalo_fim<=fim and intervalo_fim>intervalo_inicio)
);
create table if not exists public.controle_agenda (id integer primary key check(id=1),pausado boolean not null default false);
insert into public.controle_agenda values(1,false) on conflict(id) do nothing;
alter table public.controle_agenda enable row level security;
revoke all on public.controle_agenda from anon,authenticated;
grant select,update on public.controle_agenda to authenticated;
drop policy if exists controle_admin on public.controle_agenda;
create policy controle_admin on public.controle_agenda for all to authenticated using(public.eh_admin()) with check(public.eh_admin());

create or replace function public.salvar_expediente(dias jsonb) returns void language plpgsql security invoker set search_path='' as $$
begin
 if not public.eh_admin() then raise exception 'Acesso negado'; end if;
 if jsonb_array_length(dias)<>7 or (select count(distinct (x->>'id')::int) from jsonb_array_elements(dias) x where (x->>'id')::int between 0 and 6)<>7 then raise exception 'Informe sete dias distintos';end if;
 -- Serializa alterações de expediente com reservas em andamento.
 perform 1 from public.controle_agenda where id=1 for update;
 update public.expediente e set aberto=d.aberto,inicio=d.inicio,fim=d.fim,intervalo_inicio=d.intervalo_inicio,intervalo_fim=d.intervalo_fim from jsonb_to_recordset(dias) as d(id int,aberto boolean,inicio time,fim time,intervalo_inicio time,intervalo_fim time) where e.id=d.id;
end $$;

create or replace function public.horarios_livres(dia date, barbeiro text) returns table(horario text) language sql stable security definer set search_path='' as $$
 select to_char(s,'HH24:MI') from public.expediente e
 cross join lateral generate_series(dia+e.inicio,dia+e.fim-interval '40 minutes',interval '40 minutes') s
 where e.id=extract(dow from dia) and e.aberto
 and exists(select 1 from public.controle_agenda where id=1 and not pausado)
 and (e.intervalo_inicio is null or s+interval '40 minutes'<=dia+e.intervalo_inicio or s>=dia+e.intervalo_fim)
 and dia between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+14
 and s > now() at time zone 'America/Sao_Paulo'
 and not exists(select 1 from public.bloqueios b where b.data=dia and (b.horario is null or (b.horario<s::time+interval '40 minutes' and b.horario+interval '40 minutes'>s::time)))
 and exists(select 1 from (values ('profissional-1'),('profissional-2')) p(id) where (barbeiro='sem-preferencia' or p.id=barbeiro)
 and not exists(select 1 from public.reservas r where r.profissional=p.id and r.data=dia and r.status<>'cancelado' and r.horario<s::time+interval '40 minutes' and r.horario+interval '40 minutes'>s::time));
$$;
create or replace function public.reservar(dia date,hora time,barbeiro text,servico uuid,nome text,telefone_cliente text) returns jsonb language plpgsql security definer set search_path='' as $$
declare escolhido text; item public.servicos; reserva public.reservas;
begin
 perform 1 from public.controle_agenda where id=1 for share;
 if not found or exists(select 1 from public.controle_agenda where id=1 and pausado) then raise exception 'Expediente pausado';end if;
 if length(trim(nome)) not between 1 and 100 or telefone_cliente !~ '^[0-9]{10,11}$' then raise exception 'Dados inválidos';end if;
 if barbeiro not in ('profissional-1','profissional-2','sem-preferencia') then raise exception 'Profissional inválido';end if;
 select * into item from public.servicos where id=servico and ativo;
 if not found then raise exception 'Serviço indisponível';end if;
 -- Serializa reservas da mesma data, inclusive a escolha sem preferência.
 perform pg_advisory_xact_lock(hashtext('agenda-salles-'||dia::text));
 select p.id into escolhido from (values ('profissional-1'),('profissional-2')) p(id)
 where (barbeiro='sem-preferencia' or p.id=barbeiro) and exists(select 1 from public.horarios_livres(dia,p.id) h where h.horario::time=hora) limit 1;
 if escolhido is null then raise exception 'Horário indisponível';end if;
 insert into public.reservas(profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario) values(escolhido,item.id,item.nome,item.preco,trim(nome),telefone_cliente,dia,hora) returning * into reserva;
 return jsonb_build_object('id',reserva.id,'profissional',escolhido,'nome',item.nome,'preco',item.preco);
end $$;
revoke all on function public.reservar(date,time,text,uuid,text,text) from public;
grant execute on function public.reservar(date,time,text,uuid,text,text) to anon,authenticated;

commit;
