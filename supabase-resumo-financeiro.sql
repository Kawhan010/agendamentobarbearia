-- Resumo dos valores da agenda, disponível somente ao dono da barbearia.
begin;
create or replace function public.saas_resumo_financeiro(loja uuid,dia date)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare resumo jsonb;
begin
 if loja is null or loja is distinct from saas_privado.loja_usuario() then raise exception 'Acesso negado'; end if;
 with por_profissional as (
  select r.profissional,p.nome,
   count(*) filter(where r.status='confirmado') as confirmados,
   coalesce(sum(r.preco) filter(where r.status='confirmado'),0) as total_confirmado,
   count(*) filter(where r.status='pendente') as pendentes,
   coalesce(sum(r.preco) filter(where r.status='pendente'),0) as total_pendente,
   count(*) filter(where r.status='cancelado') as cancelados
  from public.saas_reservas r
  join public.saas_profissionais p on p.barbearia_id=r.barbearia_id and p.id=r.profissional
  where r.barbearia_id=loja and (dia is null or r.data=dia)
  group by r.profissional,p.nome
 )
 select jsonb_build_object(
  'confirmados',coalesce(sum(confirmados),0),
  'total_confirmado',coalesce(sum(total_confirmado),0),
  'pendentes',coalesce(sum(pendentes),0),
  'total_pendente',coalesce(sum(total_pendente),0),
  'cancelados',coalesce(sum(cancelados),0),
  'profissionais',coalesce(jsonb_agg(to_jsonb(por_profissional) order by nome,profissional),'[]'::jsonb)
 ) into resumo from por_profissional;
 return resumo;
end $$;
revoke all on function public.saas_resumo_financeiro(uuid,date) from public,anon;
grant execute on function public.saas_resumo_financeiro(uuid,date) to authenticated;
commit;
