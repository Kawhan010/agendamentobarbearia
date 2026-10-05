const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(path.join(process.argv[2],'node_modules/@electric-sql/pglite'));
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`);
 for(const arquivo of ['supabase-saas.sql','supabase-exclusoes.sql','supabase-duracao-profissionais.sql','supabase-resumo-financeiro.sql'])await db.exec(fs.readFileSync(arquivo,'utf8'));
 const a='10000000-0000-4000-8000-000000000001',b='10000000-0000-4000-8000-000000000002';
 await db.query('insert into auth.users values($1),($2)',[a,b]);
 async function conta(user){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user]);await db.exec('set role authenticated');}
 async function loja(user,slug){await conta(user);const id=(await db.query("select saas_criar_barbearia($1,$2,'5579999999999') id",[slug,slug])).rows[0].id;
  const prof=(await db.query('update saas_profissionais set duracao_minutos=20 where barbearia_id=$1 returning id',[id])).rows[0].id;
  const servico=(await db.query("insert into saas_servicos(barbearia_id,nome,preco,categoria) values($1,'Corte',30,'individual') returning id",[id])).rows[0].id;
  await db.query("update saas_expediente set aberto=true,inicio='00:00',fim='23:59' where barbearia_id=$1",[id]);return {id,prof,servico};}
 const A=await loja(a,'rotina-a'),B=await loja(b,'rotina-b');
 await db.exec('reset role');
 const datas=(await db.query("select ((now() at time zone 'America/Sao_Paulo')::date)::text hoje,((now() at time zone 'America/Sao_Paulo')::date+1)::text amanha,((now() at time zone 'America/Sao_Paulo')::date-1)::text ontem")).rows[0];
 await db.exec('set role anon');
 await db.query("select saas_reservar($1,$2,'00:00',$3,$4,'Cliente antigo','79911111111')",[A.id,datas.amanha,A.prof,A.servico]);
 await db.exec('reset role');await db.exec(fs.readFileSync('supabase/migrations/20261004171711_rotina_barbeiro.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261005021250_indice_pagamentos_reserva.sql','utf8'));
 await conta(a);
 assert.equal((await db.query('select count(*)::int n from saas_clientes')).rows[0].n,1);
 const id=()=>crypto.randomUUID();
 async function agendar(loja,dia,hora,nome='Cliente',reserva=null,espera=null,versao=null){return (await db.query('select saas_agendar_painel($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) r',
  [loja.id,dia,hora,loja.prof,loja.servico,nome,'79922222222',reserva,reserva?null:id(),espera,versao])).rows[0].r;}
 const r=await agendar(A,datas.hoje,'00:00');assert.equal(r.status,'confirmado');
 await assert.rejects(()=>agendar(A,datas.hoje,'00:00'));
 // Público e painel compartilham as mesmas reservas e os mesmos conflitos.
 await db.exec('reset role;set role anon');
 const publico=(await db.query("select saas_reservar($1,$2,'00:20',$3,$4,'Cliente público','79933333333') r",[A.id,datas.amanha,A.prof,A.servico])).rows[0].r;
 await assert.rejects(()=>db.query('select saas_horarios_painel($1,$2,$3)',[A.id,datas.amanha,A.prof]));
 for(const tabela of ['saas_clientes','saas_pagamentos','saas_despesas','saas_espera'])await assert.rejects(()=>db.query('select * from '+tabela));
 await conta(a);
 const original=(await db.query('select * from saas_reservas where id=$1',[publico.id])).rows[0];
 await assert.rejects(()=>agendar(A,datas.amanha,'00:00','Cliente',publico.id));
 assert.equal((await db.query('select horario::text h from saas_reservas where id=$1',[publico.id])).rows[0].h,'00:20:00');
 const remarcado=await agendar(A,datas.amanha,'00:40','Cliente público',publico.id,null,original.atualizado_em);
 assert.equal(remarcado.id,publico.id);assert.equal(remarcado.horario,'00:40:00');
 assert.ok((await db.query('select * from saas_horarios_painel($1,$2,$3)',[A.id,datas.amanha,A.prof])).rows.some(x=>x.horario==='00:20'));
 await assert.rejects(()=>agendar(A,datas.amanha,'01:00','Cliente',publico.id,null,original.atualizado_em));
 await assert.rejects(()=>db.query("select saas_finalizar_atendimento($1,$2,'concluido')",[A.id,publico.id]));
 await db.query("select saas_salvar_cliente($1,'79922222222','Cliente fiel','Degradê baixo, máquina 1')",[A.id]);
 await db.query("select saas_finalizar_atendimento($1,$2,'concluido')",[A.id,r.id]);
 await db.query("select saas_finalizar_atendimento($1,$2,'concluido')",[A.id,r.id]);
 await assert.rejects(()=>db.query("update saas_reservas set status='cancelado' where id=$1",[r.id]));
 await assert.rejects(()=>agendar(A,datas.hoje,'01:00','Cliente',r.id));
 for(const valor of [0,-1,20.123,null])await assert.rejects(()=>db.query("select saas_registrar_pagamento($1,$2,$3,'pix',$4)",[A.id,r.id,valor,datas.hoje]));
 await assert.rejects(()=>db.query("select saas_registrar_pagamento($1,$2,30,'pix',$3)",[A.id,r.id,datas.amanha]));
 await db.query("select saas_registrar_pagamento($1,$2,30,'pix',$3)",[A.id,r.id,datas.hoje]);
 await db.query("select saas_registrar_pagamento($1,$2,30,'pix',$3)",[A.id,r.id,datas.hoje]);
 assert.equal((await db.query('select count(*)::int n from saas_pagamentos')).rows[0].n,1);
 await db.query("select saas_registrar_pagamento($1,$2,35.50,'dinheiro',$3)",[A.id,r.id,datas.ontem]);
 const caixa=(inicio,fim)=>db.query('select saas_caixa($1,$2,$3) r',[A.id,inicio,fim]).then(x=>x.rows[0].r);
 assert.equal((await caixa(datas.hoje,datas.hoje)).entradas,0);assert.equal((await caixa(datas.ontem,datas.hoje)).entradas,35.5);
 await db.query("insert into saas_despesas(barbearia_id,descricao,valor,forma,data) values($1,'Lâminas',5.25,'pix',$2)",[A.id,datas.ontem]);
 const c=await caixa(datas.ontem,datas.hoje);assert.deepEqual(c,{entradas:35.5,despesas:5.25,saldo:30.25,formas:{pix:0,dinheiro:35.5,cartao:0}});
 await assert.rejects(()=>caixa(datas.hoje,datas.ontem));
 await assert.rejects(()=>db.query("insert into saas_despesas(barbearia_id,descricao,valor,forma,data) values($1,'Futura',5,'pix',$2)",[A.id,datas.amanha]));
 const faltou=await agendar(A,datas.hoje,'00:20','Cliente faltou');
 await db.query("select saas_finalizar_atendimento($1,$2,'faltou')",[A.id,faltou.id]);
 await assert.rejects(()=>db.query("select saas_registrar_pagamento($1,$2,30,'pix',$3)",[A.id,faltou.id,datas.hoje]));
 const limpavel=await agendar(A,datas.hoje,'00:40','Temporário');
 assert.equal((await db.query('select saas_limpar_agendamentos($1,$2) n',[A.id,[r.id,faltou.id,limpavel.id]])).rows[0].n,1);
 assert.equal((await db.query('select count(*)::int n from saas_reservas where id in ($1,$2)',[r.id,faltou.id])).rows[0].n,2);
 const h=(await db.query("select saas_historico_cliente($1,'79922222222') r",[A.id])).rows[0].r;
 assert.equal(h.concluidos,1);assert.equal(h.faltas,1);assert.equal(h.atendimentos.find(x=>x.id===r.id).recebido,35.5);
 assert.equal((await db.query("select observacoes from saas_clientes where telefone='79922222222'")).rows[0].observacoes,'Degradê baixo, máquina 1');
 const espera=(await db.query("insert into saas_espera(barbearia_id,cliente,telefone,servico_id,profissional,data,inicio,fim) values($1,'Espera','79944444444',$2,$3,$4,'01:00','02:00') returning id",[A.id,A.servico,A.prof,datas.amanha])).rows[0].id;
 await assert.rejects(()=>db.query("insert into saas_espera(barbearia_id,cliente,telefone,servico_id,inicio,fim) values($1,'Inválido','79944444444',$2,'02:00','01:00')",[A.id,A.servico]));
 const vindoEspera=await agendar(A,datas.amanha,'01:00','Espera',null,espera);
 assert.equal((await db.query('select status from saas_espera where id=$1',[espera])).rows[0].status,'agendado');
 await assert.rejects(()=>agendar(A,datas.amanha,'01:20','Espera',null,espera));
 // Cada loja mantém seu próprio caixa e seus próprios clientes.
 await conta(b);await agendar(B,datas.hoje,'00:00','Outra loja');
 assert.equal((await db.query('select count(*)::int n from saas_pagamentos')).rows[0].n,0);
 assert.equal((await db.query('select count(*)::int n from saas_espera')).rows[0].n,0);
 for(const query of ['select saas_caixa($1,$2,$2)','select saas_historico_cliente($1,\'79922222222\')','select saas_finalizar_atendimento($1,$3,\'concluido\')']){
  const params=query.includes('$3')?[A.id,datas.hoje,r.id]:query.includes('$2')?[A.id,datas.hoje]:[A.id];await assert.rejects(()=>db.query(query,params));
 }
 await assert.rejects(()=>db.query("select saas_registrar_pagamento($1,$2,30,'pix',$3)",[B.id,r.id,datas.hoje]));
 await assert.rejects(()=>db.query("insert into saas_espera(barbearia_id,cliente,telefone,servico_id) values($1,'Intruso','79944444444',$2)",[B.id,A.servico]));
 assert.equal((await db.query("update saas_clientes set observacoes='Intruso' where barbearia_id=$1 returning *",[A.id])).rows.length,0);
 await db.exec('reset role;set role anon');
 await assert.rejects(()=>db.query("select saas_caixa($1,$2,$2)",[A.id,datas.hoje]));
 await db.close();console.log('OK: conflitos, remarcação atômica, versão antiga, calendário público, conclusão, faltas, pagamento único/correção, datas de recebimento, despesas, caixa, histórico preservado, espera e isolamento entre lojas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
