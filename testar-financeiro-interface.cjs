const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require(require('node:path').join(process.argv[2],'node_modules/jsdom'));
const loja={id:'10000000-0000-4000-8000-000000000001',nome:'Loja Teste',slug:'loja-teste',whatsapp:'5579999999999',logo:''};
const dia='2026-10-03',outroDia='2026-10-04',requests=[];
const pessoas=[{id:'p-a',nome:'Barbeiro A',ativo:true,excluido:false,duracao_minutos:25},{id:'p-b',nome:'Barbeiro B <img src=x>',ativo:false,excluido:true,duracao_minutos:35}];
const ag=(id,prof,preco,status,data=dia)=>({id,barbearia_id:loja.id,profissional:prof,preco,status,data,cliente:'Cliente '+id,telefone:'79999999999',servico_nome:'Corte',horario:'09:00:00'});
let reservas=[ag('r1','p-a',20.10,'confirmado'),ag('r2','p-a',30.20,'confirmado'),ag('r3','p-a',15.25,'pendente'),ag('r4','p-b',40.50,'confirmado'),ag('r5','p-a',1000,'cancelado'),ag('r6','p-a',10.30,'confirmado',outroDia)];
const vazio={confirmados:0,total_confirmado:0,pendentes:0,total_pendente:0,cancelados:0,profissionais:[]};
const inicial={confirmados:3,total_confirmado:90.80,pendentes:1,total_pendente:15.25,cancelados:1,profissionais:[{profissional:'p-a',nome:pessoas[0].nome,confirmados:2,total_confirmado:50.30,pendentes:1,total_pendente:15.25,cancelados:1},{profissional:'p-b',nome:pessoas[1].nome,confirmados:1,total_confirmado:40.50,pendentes:0,total_pendente:0,cancelados:0}]};
const segundo={confirmados:1,total_confirmado:10.30,pendentes:0,total_pendente:0,cancelados:0,profissionais:[{profissional:'p-a',nome:pessoas[0].nome,confirmados:1,total_confirmado:10.30,pendentes:0,total_pendente:0,cancelados:0}]};
let modo='',etapa='inicial',soltar;
const resposta=(data,ok=true)=>({ok,status:ok?200:500,json:async()=>structuredClone(data)});
function resumo(data){
 if(!reservas.some(r=>!data||r.data===data))return structuredClone(vazio);
 if(data===outroDia)return structuredClone(segundo);
 const r=structuredClone(inicial);
 if(etapa==='confirmado'){r.confirmados=4;r.total_confirmado=106.05;r.pendentes=0;r.total_pendente=0;Object.assign(r.profissionais[0],{confirmados:3,total_confirmado:65.55,pendentes:0,total_pendente:0});}
 if(etapa==='cancelado'){r.confirmados=3;r.total_confirmado=85.95;r.pendentes=0;r.total_pendente=0;r.cancelados=2;Object.assign(r.profissionais[0],{confirmados:2,total_confirmado:45.45,pendentes:0,total_pendente:0,cancelados:2});}
 if(!data){r.total_confirmado+=10.30;r.confirmados++;r.profissionais[0].total_confirmado+=10.30;r.profissionais[0].confirmados++;}
 return r;
}
(async()=>{
 const dom=new JSDOM(fs.readFileSync('admin.html','utf8'),{url:'https://teste.local/admin.html',runScripts:'outside-only'}),w=dom.window,d=w.document;
 for(const f of d.forms)for(const input of f.elements)if(input.name&&input.name!=='id')Object.defineProperty(f,input.name,{get:()=>f.elements.namedItem(input.name),configurable:true});
 w.open=()=>null;w.confirm=()=>true;
 w.fetch=async(raw,options={})=>{
  requests.push({url:raw,options});const url=new URL(raw,'https://teste.local'),body=options.body?JSON.parse(options.body):{};
  if(raw.includes('/auth/v1/token'))return resposta({access_token:'token-teste'});
  if(raw.includes('/auth/v1/'))return resposta({});
  if(raw.includes('saas_membros'))return resposta([{barbearia_id:loja.id}]);
  if(raw.includes('saas_barbearias'))return resposta([loja]);
  if(raw.includes('/saas_profissionais'))return resposta(pessoas.filter(p=>url.searchParams.get('excluido')!=='eq.false'||!p.excluido));
  if(raw.includes('saas_servicos'))return resposta([]);
  if(raw.includes('saas_expediente'))return resposta(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'09:00',fim:'18:00',intervalo_inicio:null,intervalo_fim:null})));
  if(raw.includes('saas_controle_agenda'))return resposta([{pausado:false}]);
  if(raw.includes('saas_bloqueios'))return resposta([]);
  if(raw.includes('saas_resumo_financeiro')){
   assert.equal(body.loja,loja.id);assert.equal(options.headers.Authorization,'Bearer token-teste');
   if(modo==='erro-resumo')return resposta({message:'Erro de resumo'},false);
   const r=resumo(body.dia);if(modo==='atrasado'&&body.dia===dia)await new Promise(r=>{soltar=r;});
   return resposta(r);
  }
  if(raw.includes('saas_limpar_agendamentos')){const n=reservas.filter(r=>body.reservas.includes(r.id)).length;reservas=reservas.filter(r=>!body.reservas.includes(r.id));return resposta(n);}
  if(raw.includes('saas_reservas')){
   assert.equal(url.searchParams.get('barbearia_id'),'eq.'+loja.id);
   if(modo==='erro-lista')return resposta({message:'Erro de lista'},false);
   const id=url.searchParams.get('id')?.slice(3),data=url.searchParams.get('data')?.slice(3);
   let rows=reservas.filter(r=>(!id||r.id===id)&&(!data||r.data===data));
   if(options.method==='PATCH'){rows.forEach(r=>Object.assign(r,body));etapa=body.status==='confirmado'?'confirmado':'cancelado';}
   return resposta(rows);
  }
  throw new Error('Requisição inesperada: '+raw);
 };
 for(const script of d.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(script.getAttribute('src').split('?')[0],'utf8'),dom.getInternalVMContext());
 d.getElementById('filtro-data').value=dia;
 const login=d.getElementById('form-login');login.elements.email.value='dono@teste.local';login.elements.password.value='senha-teste';
 await login.onsubmit({preventDefault(){},target:login,submitter:login.querySelector('button')});
 const texto=()=>d.getElementById('resumo-financeiro').textContent.replace(/\u00a0/g,' ');
 assert.ok(texto().includes('03/10/2026'));assert.ok(texto().includes('R$ 90,80'));assert.ok(texto().includes('R$ 15,25'));
 assert.equal(d.querySelectorAll('#resumo-financeiro .total-agenda').length,2);
 assert.equal(d.querySelectorAll('#resumo-financeiro table').length,0);
 assert.equal(d.getElementById('resumo-financeiro').classList.contains('admin-card'),false);
 d.getElementById('filtro-data').value=outroDia;await d.getElementById('filtro-data').onchange();assert.ok(texto().includes('R$ 10,30'));assert.ok(!texto().includes('90,80'));
 d.getElementById('filtro-data').value='';await d.getElementById('filtro-data').onchange();assert.ok(texto().includes('todas as datas'));assert.ok(texto().includes('R$ 101,10'));
 d.getElementById('filtro-data').value='2026-01-01';await d.getElementById('filtro-data').onchange();assert.ok(texto().includes('R$ 0,00'));assert.equal(d.querySelectorAll('#resumo-financeiro .total-agenda').length,2);
 d.getElementById('filtro-data').value=dia;await d.getElementById('filtro-data').onchange();
 await [...d.querySelectorAll('#lista-agenda button')].find(b=>b.textContent==='Confirmar').onclick();assert.ok(texto().includes('R$ 106,05'));assert.ok(texto().includes('R$ 0,00'));
 await [...d.querySelectorAll('#lista-agenda button')].find(b=>b.textContent==='Cancelar').onclick();assert.ok(texto().includes('R$ 85,95'));
 modo='erro-resumo';await d.getElementById('atualizar').onclick();assert.ok(texto().includes('Não foi possível'));assert.ok(!texto().includes('R$'));assert.ok(d.querySelectorAll('#lista-agenda article').length>0);
 modo='erro-lista';await d.getElementById('atualizar').onclick();assert.ok(texto().includes('Não foi possível'));assert.ok(!texto().includes('R$'));
 modo='atrasado';const antigo=d.getElementById('atualizar').onclick();await new Promise(r=>setTimeout(r,0));
 d.getElementById('filtro-data').value=outroDia;await d.getElementById('filtro-data').onchange();soltar();await antigo;assert.ok(texto().includes('04/10/2026'));assert.ok(texto().includes('R$ 10,30'));
 modo='';d.getElementById('filtro-data').value=dia;await d.getElementById('filtro-data').onchange();await d.getElementById('limpar-agendamentos').onclick();assert.ok(texto().includes('R$ 0,00'));
 d.getElementById('filtro-data').value=outroDia;await d.getElementById('filtro-data').onchange();assert.ok(texto().includes('R$ 10,30'));
 w.FinanceiroAgenda.renderizar({...vazio,total_confirmado:null},dia);assert.ok(texto().includes('Não foi possível'));assert.ok(!texto().includes('R$'));
 await d.getElementById('sair').onclick();assert.equal(texto(),'');assert.equal(d.getElementById('painel').hidden,true);
 dom.window.close();console.log('OK: dois quadros compactos sem quadro externo, valores por data/todas as datas, dia vazio, confirmação, cancelamento, limpeza, falhas sem valores falsos, respostas fora de ordem e logout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
