const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require(require('node:path').join(process.argv[2],'node_modules/@electric-sql/pglite'));
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 await db.exec(fs.readFileSync('supabase-saas.sql','utf8'));
 await db.exec(fs.readFileSync('supabase-exclusoes.sql','utf8'));
 await db.exec(fs.readFileSync('supabase-resumo-financeiro.sql','utf8'));
 await db.exec(fs.readFileSync('supabase-resumo-financeiro.sql','utf8'));
 const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
 await db.query('insert into auth.users values($1),($2)',[a,b]);
 async function conta(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
 await conta(a);
 const loja=(await db.query("select public.saas_criar_barbearia('Financeiro A','financeiro-a','5579999999999') id")).rows[0].id;
 const pa=(await db.query('select id from public.saas_profissionais where barbearia_id=$1',[loja])).rows[0].id;
 const pb=(await db.query("insert into public.saas_profissionais(barbearia_id,nome) values($1,'Segundo barbeiro') returning id",[loja])).rows[0].id;
 const servico=(await db.query("insert into public.saas_servicos(barbearia_id,nome,preco,categoria) values($1,'Corte',35,'individual') returning id",[loja])).rows[0].id;
 await conta(b);
 const outra=(await db.query("select public.saas_criar_barbearia('Financeiro B','financeiro-b','5579999999998') id")).rows[0].id;
 const outro=(await db.query('select id from public.saas_profissionais where barbearia_id=$1',[outra])).rows[0].id;
 const outroServico=(await db.query("insert into public.saas_servicos(barbearia_id,nome,preco,categoria) values($1,'Corte',999,'individual') returning id",[outra])).rows[0].id;
 const dia='2026-10-03';
 async function inserir(prof,preco,status,hora,data=dia,tenant=loja,item=servico){return(await db.query("insert into public.saas_reservas(barbearia_id,profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario,status) values($1,$2,$3,'Corte',$4,'Teste','79999999999',$5,$6,$7) returning id",[tenant,prof,item,preco,data,hora,status])).rows[0].id;}
 await inserir(outro,999,'confirmado','09:00',dia,outra,outroServico);
 await conta(a);
 await inserir(pa,20.10,'confirmado','09:00');
 await inserir(pa,30.20,'confirmado','09:40');
 const pendente=await inserir(pa,15.25,'pendente','10:20');
 await inserir(pa,1000,'cancelado','11:00');
 await inserir(pb,40.50,'confirmado','09:00');
 await inserir(pb,10.10,'pendente','09:40');
 await inserir(pa,100,'confirmado','09:00','2026-10-04');
 async function resumo(tenant=loja,data=dia){return(await db.query('select public.saas_resumo_financeiro($1,$2) r',[tenant,data])).rows[0].r;}
 let r=await resumo();
 assert.equal(r.total_confirmado,90.80);assert.equal(r.confirmados,3);
 assert.equal(r.total_pendente,25.35);assert.equal(r.pendentes,2);assert.equal(r.cancelados,1);
 assert.equal(r.profissionais.length,2);
 assert.equal(r.profissionais.find(p=>p.profissional===pa).total_confirmado,50.30);
 assert.equal(r.profissionais.find(p=>p.profissional===pb).total_confirmado,40.50);
 assert.equal((await resumo(loja,null)).total_confirmado,190.80);
 assert.deepEqual(await resumo(loja,'2026-01-01'),{confirmados:0,total_confirmado:0,pendentes:0,total_pendente:0,cancelados:0,profissionais:[]});
 await assert.rejects(()=>resumo(outra));await assert.rejects(()=>resumo(null));
 await db.query('update public.saas_servicos set preco=900 where id=$1',[servico]);
 assert.equal((await resumo()).total_confirmado,90.80);
 await db.query('update public.saas_profissionais set ativo=false,excluido=true where id=$1',[pb]);
 assert.equal((await resumo()).profissionais.find(p=>p.profissional===pb).total_confirmado,40.50);
 await db.query("update public.saas_reservas set status='confirmado' where id=$1",[pendente]);
 r=await resumo();assert.equal(r.total_confirmado,106.05);assert.equal(r.total_pendente,10.10);
 await db.query("update public.saas_reservas set status='cancelado' where id=$1",[pendente]);
 assert.equal((await resumo()).total_confirmado,90.80);
 await db.query('select public.saas_limpar_agendamentos($1,$2::uuid[])',[loja,[pendente]]);
 assert.equal((await resumo()).cancelados,1);
 // O resumo não depende do limite de 1000 linhas da consulta de agendamentos.
 await db.query(`insert into public.saas_reservas(barbearia_id,profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario,status)
 select $1,$2,$3,'Teste',0.10,'Teste','79999999999','2026-09-01'::date,('00:00'::time+make_interval(mins=>n))::time,'confirmado' from generate_series(0,1004) n`,[loja,pa,servico]);
 r=await resumo(loja,'2026-09-01');assert.equal(r.confirmados,1005);assert.equal(r.total_confirmado,100.50);
 await conta(b);r=await resumo(outra);assert.equal(r.total_confirmado,999);assert.equal(r.profissionais.length,1);
 await assert.rejects(()=>resumo(loja));
 await db.exec('reset role;set role anon');await assert.rejects(()=>resumo(loja));
 console.log('OK: totais exatos por dia/barbeiro, preço histórico, confirmados/pendentes/cancelados, todas as datas, profissionais arquivados, mais de 1000 reservas, limpeza, privacidade e isolamento.');
 await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
