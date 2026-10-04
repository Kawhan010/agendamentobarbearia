const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require(require('node:path').join(process.argv[2],'node_modules/jsdom'));
const loja={id:'10000000-0000-4000-8000-000000000001',nome:'Loja Teste',slug:'loja-teste',whatsapp:'5579999999999',logo:''};
const pessoas=[{id:'p-a',barbearia_id:loja.id,nome:'Barbeiro A',ativo:true,excluido:false,foto:'',duracao_minutos:20},{id:'p-b',barbearia_id:loja.id,nome:'Barbeiro B',ativo:false,excluido:false,foto:'',duracao_minutos:35}];
const requests=[];let falha='',resolverPatch;
const response=data=>({ok:true,status:200,json:async()=>data});
async function abrir(page,query=''){
 const dom=new JSDOM(fs.readFileSync(page,'utf8'),{url:'https://teste.local/'+page+query,runScripts:'outside-only'});
 const w=dom.window;
 for(const f of w.document.forms)for(const input of f.elements)if(input.name&&input.name!=='id')Object.defineProperty(f,input.name,{get:()=>f.elements.namedItem(input.name),configurable:true});
 w.fetch=async(url,options={})=>{
  requests.push({url,options});
  if(url.includes('/auth/v1/token'))return response({access_token:'token-teste'});
  if(url.includes('/auth/v1/'))return response({});
  if(url.includes('saas_membros'))return response([{barbearia_id:loja.id}]);
  if(url.includes('saas_barbearias'))return response([{...loja}]);
  if(url.includes('saas_profissionais')){
   const filtro=new URL(url).searchParams;const id=filtro.get('id')?.slice(3);
   if(options.method==='PATCH'){
    const body=JSON.parse(options.body),p=pessoas.find(p=>p.id===id);
    assert.equal(filtro.get('barbearia_id'),'eq.'+loja.id);assert.equal(filtro.get('excluido'),'eq.false');
    assert.deepEqual(Object.keys(body),['duracao_minutos']);
    if(falha==='vazio')return response([]);
    if(falha==='outra-loja')return response([{...p,barbearia_id:'outra',duracao_minutos:body.duracao_minutos}]);
    if(falha==='erro')throw new Error('Falha de conexão');
    if(falha==='pendente')await new Promise(r=>{resolverPatch=r;});
    Object.assign(p,body);
    if(falha==='resposta-perdida')throw new Error('Resposta perdida');
    return response([{...p}]);
   }
   return response(pessoas.filter(p=>(!id||p.id===id)&&!p.excluido).map(p=>({...p})));
  }
  if(url.includes('saas_servicos'))return response([]);
  if(url.includes('saas_expediente'))return response(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'09:00',fim:'18:00',intervalo_inicio:null,intervalo_fim:null})));
  if(url.includes('saas_controle_agenda'))return response([{pausado:false}]);
  if(url.includes('saas_horarios_livres'))return response([{horario:'09:00'},{horario:'09:25'},{horario:'09:50'}]);
  if(url.includes('saas_bloqueios')||url.includes('saas_reservas'))return response([]);
  if(url==='catalogo-inicial.json')return response([]);
  throw new Error('Requisição inesperada: '+url);
 };
 for(const script of w.document.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(script.getAttribute('src').split('?')[0],'utf8'),dom.getInternalVMContext());
 await new Promise(r=>setTimeout(r,40));return dom;
}
(async()=>{
 const dom=await abrir('admin.html'),w=dom.window,d=w.document;
 const login=d.getElementById('form-login');login.elements.email.value='dono@teste.local';login.elements.password.value='senha-teste';
 await login.onsubmit({preventDefault(){},submitter:login.querySelector('button'),target:login});
 d.querySelector('[data-area="horarios"]').onclick();assert.equal(d.getElementById('horarios').hidden,false);
 assert.equal(d.querySelectorAll('#lista-duracoes form').length,2);
 const formulario=()=>d.querySelector('#lista-duracoes form');
 const input=()=>formulario().elements.duracao;
 const enviar=async valor=>{input().value=String(valor);await formulario().onsubmit({preventDefault(){}});};
 assert.equal(input().type,'number');assert.equal(input().value,'20');
 assert.ok(d.querySelector('#lista-duracoes').textContent.includes('Inativo'));
 for(const minutos of [20,30,40,25,35,55]){
  await enviar(minutos);assert.equal(pessoas[0].duracao_minutos,minutos);assert.equal(input().value,String(minutos));
  assert.ok(d.getElementById('aviso').textContent.includes(minutos+' minutos'));
 }
 const antes=requests.filter(r=>r.options.method==='PATCH').length;
 for(const invalido of ['',0,-1,25.5,1441]){await enviar(invalido);assert.ok(d.getElementById('aviso').textContent.includes('minutos inteiros'));}
 assert.equal(requests.filter(r=>r.options.method==='PATCH').length,antes);
 for(const tipo of ['vazio','erro','outra-loja']){
  falha=tipo;await enviar(65);assert.equal(pessoas[0].duracao_minutos,55);
  assert.ok(!d.getElementById('aviso').textContent.includes('Tempo de Barbeiro A salvo'));
  assert.equal(d.getElementById('campos-duracoes').disabled,false);assert.equal(d.getElementById('campos-profissional').disabled,false);assert.equal(d.getElementById('sair').disabled,false);
 }
 falha='resposta-perdida';await enviar(65);assert.equal(pessoas[0].duracao_minutos,65);
 assert.ok(d.getElementById('aviso').textContent.includes('salvo: 65 minutos'));
 assert.ok(requests.some(r=>r.options.method==='GET'&&r.url.includes('select=id,barbearia_id,duracao_minutos')&&r.url.includes('id=eq.p-a')&&r.url.includes('barbearia_id=eq.'+loja.id)));
 falha='pendente';input().value='35';const salvando=formulario().onsubmit({preventDefault(){}});
 await new Promise(r=>setTimeout(r,0));
 assert.equal(d.getElementById('campos-duracoes').disabled,true);assert.equal(d.getElementById('campos-profissional').disabled,true);assert.equal(d.getElementById('sair').disabled,true);
 resolverPatch();await salvando;falha='';assert.equal(input().value,'35');
 pessoas[1].excluido=true;await w.carregarProfissionais();assert.equal(d.querySelectorAll('#lista-duracoes form').length,1);
 pessoas.push({id:'p-c',barbearia_id:loja.id,nome:'Novo profissional',ativo:true,excluido:false,foto:'',duracao_minutos:null});
 await w.carregarProfissionais();
 assert.equal(d.querySelectorAll('#lista-duracoes input')[1].value,'');
 assert.ok(d.getElementById('lista-duracoes').textContent.includes('Informe o tempo para liberar'));
 await d.getElementById('sair').onclick();assert.equal(d.getElementById('lista-duracoes').children.length,0);
 await d.getElementById('demonstracao').onclick();assert.equal(d.querySelectorAll('#lista-duracoes form').length,0);assert.ok(d.getElementById('lista-duracoes').textContent.includes('Entre na sua conta'));
 dom.window.close();
 const publico=await abrir('horarios.html','?barbearia=loja-teste&cabeleireiro=p-a&servico=Corte&servico_id=servico-teste');
 const pd=publico.window.document;assert.equal(pd.querySelectorAll('#grade-dias input').length,15);
 const data=pd.querySelectorAll('#grade-dias input')[1];data.checked=true;data.dispatchEvent(new publico.window.Event('change',{bubbles:true}));
 assert.deepEqual([...pd.querySelectorAll('.botao-horario span')].map(e=>e.textContent),['09:00','09:25','09:50']);
 assert.ok(!pd.querySelector('#etapa-horarios > p').textContent.includes('40 minutos'));
 assert.ok(requests.some(r=>r.url.includes('saas_horarios_livres')&&JSON.parse(r.options.body).barbeiro==='p-a'));
 publico.window.close();
 console.log('OK: campo livre por barbeiro, salvamento isolado, duração personalizada, validação, falhas, resposta perdida, bloqueio durante gravação, atualização da equipe, logout e grade pública.');
})().catch(e=>{console.error(e);process.exitCode=1;});
