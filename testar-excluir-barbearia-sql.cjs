const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {PGlite}=require(path.join(process.argv[2],'node_modules/@electric-sql/pglite'));
(async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key,email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`);
 for(const f of ['supabase-saas.sql','supabase-exclusoes.sql','supabase-duracao-profissionais.sql','supabase/migrations/20261004171711_rotina_barbeiro.sql'])await db.exec(fs.readFileSync(f,'utf8'));
 await db.exec(`create schema storage;grant usage on schema storage to anon,authenticated;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid default gen_random_uuid(),bucket_id text references storage.buckets(id),name text not null);
 create function storage.foldername(name text) returns text[] language sql immutable as $$select (string_to_array(name,'/'))[1:1]$$;
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to anon,authenticated;`);
 for(const f of ['supabase/migrations/20261006153818_servicos_tempo_imagem.sql','supabase-fotos-profissionais.sql','supabase/migrations/20261006001151_fundo_barbearia.sql','supabase/migrations/20261006171714_logo_barbearia.sql','supabase/migrations/20261007163453_area_proprietario.sql','supabase/migrations/20261007171600_excluir_barbearia.sql'])await db.exec(fs.readFileSync(f,'utf8'));
 const owner=crypto.randomUUID(),a=crypto.randomUUID(),b=crypto.randomUUID();await db.query("insert into auth.users values($1,'owner@example.test'),($2,'a@example.test'),($3,'b@example.test')",[owner,a,b]);await db.query('insert into saas_privado.proprietarios(user_id) values($1)',[owner]);
 async function conta(id,role='authenticated'){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);}
 async function criar(user,nome,slug){await conta(user);const loja=(await db.query("select saas_criar_barbearia($1,$2,'5579999999999') id",[nome,slug])).rows[0].id;
 const prof=(await db.query('select id from saas_profissionais where barbearia_id=$1',[loja])).rows[0].id;
 const servico=(await db.query("insert into saas_servicos(barbearia_id,nome,preco,categoria,duracao_minutos) values($1,'Corte',30,'individual',30) returning id",[loja])).rows[0].id;
 const reserva=(await db.query("insert into saas_reservas(barbearia_id,profissional,servico_id,servico_nome,preco,cliente,telefone,data,horario,duracao_minutos,status) values($1,$2,$3,'Corte',30,'Cliente sigiloso','79999999999',(now() at time zone 'America/Sao_Paulo')::date-1,'09:00',30,'confirmado') returning id",[loja,prof,servico])).rows[0].id;
 await db.query("select saas_finalizar_atendimento($1,$2,'concluido')",[loja,reserva]);await db.query("select saas_registrar_pagamento($1,$2,30,'pix',(now() at time zone 'America/Sao_Paulo')::date)",[loja,reserva]);
 await db.query("insert into saas_espera(barbearia_id,cliente,telefone,servico_id,profissional,reserva_id) values($1,'Espera','79988888888',$2,$3,$4)",[loja,servico,prof,reserva]);
 await db.query("insert into saas_despesas(barbearia_id,descricao,valor,forma,data) values($1,'Produtos',5,'pix',(now() at time zone 'America/Sao_Paulo')::date)",[loja]);
 await db.query("insert into saas_bloqueios(barbearia_id,data) values($1,(now() at time zone 'America/Sao_Paulo')::date)",[loja]);return {loja,prof,servico,reserva};}
 const A=await criar(a,'Barbearia Áurea','aurea'),B=await criar(b,'Barbearia B','barbearia-b'),pedido=crypto.randomUUID();
 const excluir=async(nome='Barbearia Áurea',id=A.loja,req=pedido)=>(await db.query('select saas_proprietario_excluir($1,$2,$3) r',[id,nome,req])).rows[0].r;
 const lista=async()=>(await db.query('select saas_proprietario_listar() r')).rows[0].r;
 const limpezas=async()=>(await db.query('select saas_proprietario_limpezas() r')).rows[0].r;
 await conta(null,'anon');await assert.rejects(()=>excluir());await assert.rejects(()=>limpezas());
 await conta(a);await assert.rejects(()=>excluir(),/não tem acesso/);await db.query("select set_config('saas.exclusao_barbearia',$1,false)",[A.loja]);await assert.rejects(()=>db.query('delete from saas_reservas where id=$1',[A.reserva]),/preservado/);
 await assert.rejects(()=>db.query('insert into saas_privado.exclusoes_barbearias(pedido,barbearia_id,nome) values($1,$2,$3)',[pedido,A.loja,'Barbearia Áurea']));
 await conta(owner);for(const nome of [null,'','Barbearia Aurea','barbearia Áurea','Barbearia Áurea ','Outro'])await assert.rejects(()=>excluir(nome),/nome exato/);
 assert.equal((await lista()).totais.barbearias,2);assert.equal((await lista()).auditoria.length,0);
 await db.exec('reset role');const arquivo=A.loja+'/'+crypto.randomUUID()+'.webp',reutilizada=A.loja+'/'+crypto.randomUUID()+'.png',outro=B.loja+'/'+crypto.randomUUID()+'.webp';
 for(const bucket of ['fundos-barbearias','fotos-profissionais','imagens-servicos','logos-barbearias'])await db.query('insert into storage.objects(bucket_id,name) values($1,$2)',[bucket,arquivo]);
 await db.query("insert into storage.objects(bucket_id,name) values('logos-barbearias',$1),('logos-barbearias',$2)",[reutilizada,outro]);
 await db.query("update saas_barbearias set logo='https://test.supabase.co/storage/v1/object/public/logos-barbearias/'||$1||'?v=1#logo' where id=$2",[reutilizada,B.loja]);
 await conta(owner);assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[arquivo])).rows.length,0,'Owner não pode remover imagens antes de confirmar exclusão');
 await excluir();assert.equal((await lista()).totais.barbearias,1);assert.equal((await lista()).lojas[0].id,B.loja);assert.equal((await lista()).limpeza_pendente,true);
 const audit=(await lista()).auditoria[0];assert.equal(audit.barbearia,'Barbearia Áurea');assert.equal(audit.depois.excluida,true);assert.equal(audit.barbearia_id,null);assert.ok(!JSON.stringify(audit).includes('Cliente sigiloso'));
 const arquivos=await limpezas();assert.equal(arquivos.length,4);assert.ok(arquivos.every(f=>f.caminho===arquivo));assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[reutilizada])).rows.length,0,'Logo reutilizada permanece');assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[outro])).rows.length,0,'Outra barbearia permanece protegida');
 await excluir();assert.equal((await lista()).auditoria.length,1,'Resposta perdida repete o recibo');await assert.rejects(()=>excluir('Outra',A.loja,pedido));await assert.rejects(()=>excluir('Barbearia B',B.loja,pedido));
 await conta(a);assert.equal((await db.query('select * from saas_membros')).rows.length,0);await assert.rejects(()=>limpezas());assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[arquivo])).rows.length,0);
 await conta(owner);assert.equal((await db.query('delete from storage.objects where name=$1 returning id',[arquivo])).rows.length,4,'Simula a remoção pela API de Storage na fixture local');assert.deepEqual(await limpezas(),[]);assert.equal((await lista()).limpeza_pendente,false);
 await db.exec('reset role');for(const tabela of ['saas_membros','saas_profissionais','saas_servicos','saas_expediente','saas_controle_agenda','saas_bloqueios','saas_reservas','saas_clientes','saas_pagamentos','saas_despesas','saas_espera']){
  assert.equal(Number((await db.query('select count(*) n from '+tabela+' where barbearia_id=$1',[A.loja])).rows[0].n),0,tabela);assert.ok(Number((await db.query('select count(*) n from '+tabela+' where barbearia_id=$1',[B.loja])).rows[0].n)>0,tabela+' da outra loja');}
 assert.equal(Number((await db.query('select count(*) n from auth.users')).rows[0].n),3,'Contas e acesso do proprietário permanecem');
 await db.exec('create table dependente_futuro(loja uuid references public.saas_barbearias(id))');await db.query('insert into dependente_futuro values($1)',[B.loja]);await conta(owner);
 await assert.rejects(()=>excluir('Barbearia B',B.loja,crypto.randomUUID()),/foreign key/);assert.equal((await lista()).auditoria.length,1,'Uma falha reverte toda a exclusão');assert.equal((await lista()).lojas[0].id,B.loja);
 await db.exec('reset role');assert.equal(Number((await db.query('select count(*) n from saas_pagamentos where barbearia_id=$1',[B.loja])).rows[0].n),1);assert.equal(Number((await db.query('select count(*) n from saas_privado.exclusoes_barbearias')).rows[0].n),1);
 await conta(b);await assert.rejects(()=>db.query('delete from saas_reservas where id=$1',[B.reserva]),/preservado/);
 await db.exec('reset role');await db.query('delete from saas_privado.proprietarios where user_id=$1',[owner]);await conta(owner);await assert.rejects(()=>excluir(),/não tem acesso/);
 await db.close();console.log('OK: nome exato obrigatório no banco, acesso restrito, remoção dos dados vinculados, histórico preservado nas outras lojas, auditoria permanente, idempotência, Storage limitado/reutilização protegida e contas mantidas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
