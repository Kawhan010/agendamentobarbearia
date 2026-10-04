-- Atualização SaaS: preserva o histórico ao retirar profissionais da equipe.
begin;
alter table public.saas_profissionais add column if not exists excluido boolean not null default false;
alter table public.saas_profissionais drop constraint if exists saas_profissional_excluido_inativo;
alter table public.saas_profissionais add constraint saas_profissional_excluido_inativo check (not excluido or not ativo);

-- Exclui somente os IDs que estavam visíveis quando o dono confirmou a limpeza.
-- Reservas recebidas depois da consulta não entram na exclusão.
create or replace function public.saas_limpar_agendamentos(loja uuid, reservas uuid[])
returns integer language plpgsql security invoker set search_path='' as $$
declare quantidade integer;
begin
  if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
  if reservas is null or cardinality(reservas)=0 then return 0; end if;
  delete from public.saas_reservas where barbearia_id=loja and id=any(reservas);
  get diagnostics quantidade=row_count;
  return quantidade;
end $$;
revoke all on function public.saas_limpar_agendamentos(uuid,uuid[]) from public,anon;
grant execute on function public.saas_limpar_agendamentos(uuid,uuid[]) to authenticated;
commit;
