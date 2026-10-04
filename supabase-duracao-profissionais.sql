-- Execute após supabase-saas.sql e as demais atualizações SaaS.
-- Reservas existentes continuam com os 40 minutos usados antes desta atualização.
begin;
alter table public.saas_profissionais
 add column if not exists duracao_minutos integer not null default 40
 constraint saas_profissional_duracao_valida check (duracao_minutos between 1 and 1440);
-- O valor inicial só preserva o funcionamento dos profissionais já cadastrados.
-- Novos cadastros exigem que seu tempo seja escolhido no painel.
alter table public.saas_profissionais alter column duracao_minutos drop default;
alter table public.saas_profissionais alter column duracao_minutos drop not null;
alter table public.saas_reservas
 add column if not exists duracao_minutos integer not null default 40
 constraint saas_reserva_duracao_valida check (duracao_minutos between 1 and 1440);
comment on column public.saas_profissionais.duracao_minutos is 'Tempo em minutos escolhido pelo profissional para cada novo atendimento.';
comment on column public.saas_reservas.duracao_minutos is 'Duração registrada ao reservar; preserva o tempo dos agendamentos existentes.';

create or replace function public.saas_horarios_livres(loja uuid,dia date,barbeiro text)
returns table(horario text) language sql stable security definer set search_path='' as $$
 select distinct to_char(s,'HH24:MI') as horario
 from public.saas_expediente e
 join public.saas_profissionais p on p.barbearia_id=e.barbearia_id and p.ativo and p.duracao_minutos is not null
 cross join lateral generate_series(
  dia+e.inicio, dia+e.fim-make_interval(mins=>p.duracao_minutos),
  make_interval(mins=>p.duracao_minutos)
 ) s
 where e.barbearia_id=loja and e.id=extract(dow from dia) and e.aberto
 and (barbeiro='sem-preferencia' or p.id=barbeiro)
 and exists(select 1 from public.saas_controle_agenda where barbearia_id=loja and not pausado)
 and (e.intervalo_inicio is null or s+make_interval(mins=>p.duracao_minutos)<=dia+e.intervalo_inicio or s>=dia+e.intervalo_fim)
 and dia between (now() at time zone 'America/Sao_Paulo')::date and (now() at time zone 'America/Sao_Paulo')::date+14
 and s>now() at time zone 'America/Sao_Paulo'
 -- Um bloqueio de horário mantém sua duração original de 40 minutos.
 and not exists(select 1 from public.saas_bloqueios b where b.barbearia_id=loja and b.data=dia
  and (b.horario is null or (dia+b.horario<s+make_interval(mins=>p.duracao_minutos) and dia+b.horario+interval '40 minutes'>s)))
 and not exists(select 1 from public.saas_reservas r where r.barbearia_id=loja and r.profissional=p.id and r.data=dia
  and r.status<>'cancelado' and dia+r.horario<s+make_interval(mins=>p.duracao_minutos)
  and dia+r.horario+make_interval(mins=>r.duracao_minutos)>s)
 order by horario;
$$;
revoke all on function public.saas_horarios_livres(uuid,date,text) from public;
grant execute on function public.saas_horarios_livres(uuid,date,text) to anon,authenticated;

create or replace function public.saas_reservar(loja uuid,dia date,hora time,barbeiro text,servico uuid,nome text,telefone_cliente text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare candidato public.saas_profissionais; escolhido public.saas_profissionais;
 item public.saas_servicos; reserva public.saas_reservas;
begin
 if nome is null or telefone_cliente is null or length(trim(nome)) not between 1 and 100 or telefone_cliente !~ '^[0-9]{10,11}$' then raise exception 'Dados inválidos'; end if;
 perform 1 from public.saas_controle_agenda where barbearia_id=loja and not pausado for share;
 if not found then raise exception 'Expediente pausado'; end if;
 select * into item from public.saas_servicos where barbearia_id=loja and id=servico and ativo;
 if not found then raise exception 'Serviço indisponível'; end if;
 perform pg_advisory_xact_lock(hashtext(loja::text||dia::text));
 -- Trava a configuração do profissional antes de conferir a vaga e registrar o tempo.
 for candidato in select p.* from public.saas_profissionais p
  where p.barbearia_id=loja and p.ativo and p.duracao_minutos is not null and (barbeiro='sem-preferencia' or p.id=barbeiro)
  order by p.id for share
 loop
  if exists(select 1 from public.saas_horarios_livres(loja,dia,candidato.id) h where h.horario::time=hora) then
   escolhido:=candidato; exit;
  end if;
 end loop;
 if escolhido.id is null then raise exception 'Horário indisponível'; end if;
 insert into public.saas_reservas(barbearia_id,profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario,duracao_minutos)
 values(loja,escolhido.id,item.id,item.nome,item.preco,trim(nome),telefone_cliente,dia,hora,escolhido.duracao_minutos)
 returning * into reserva;
 return jsonb_build_object('id',reserva.id,'profissional',escolhido.id,'nome',item.nome,'preco',item.preco,'duracao_minutos',reserva.duracao_minutos);
end $$;
revoke all on function public.saas_reservar(uuid,date,time,text,uuid,text,text) from public;
grant execute on function public.saas_reservar(uuid,date,time,text,uuid,text,text) to anon,authenticated;
commit;
