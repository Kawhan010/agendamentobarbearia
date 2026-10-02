const {JSDOM}=require(require('node:path').join(process.argv[2],'node_modules/jsdom'));
const fs=require('node:fs'),assert=require('node:assert/strict');
const loja={id:'10000000-0000-4000-8000-000000000001',slug:'loja-teste',nome:'Loja Teste',whatsapp:'5579999999999',logo:''};
const requests=[];
function response(data){return {ok:true,status:200,json:async()=>data};}
async function abrir(page,query='?barbearia=loja-teste'){
 const dom=new JSDOM(fs.readFileSync(page,'utf8'),{url:'https://teste.local/'+page+query,runScripts:'outside-only'});
 const w=dom.window;
 // jsdom não implementa todos os acessores por nome de HTMLFormElement.
 for(const f of w.document.forms)for(const input of f.elements)if(input.name&&!['id'].includes(input.name))Object.defineProperty(f,input.name,{get:()=>f.elements.namedItem(input.name),configurable:true});
 w.fetch=async(url,options={})=>{
  requests.push({url,options});
  if(url.includes('/auth/v1/token'))return response({access_token:'token-teste'});
  if(url.includes('/auth/v1/'))return response({});
  if(url.includes('saas_membros'))return response([{barbearia_id:loja.id}]);
  if(url.includes('saas_barbearias'))return response([loja]);
  if(url.includes('saas_profissionais'))return response([{id:'profissional-teste',nome:'Barbeiro Teste',ativo:true}]);
  if(url.includes('saas_servicos'))return response([{id:'servico-teste',nome:'Corte',preco:30,categoria:'individual',imagem:'',descricao:'',ativo:true}]);
  if(url.includes('saas_expediente'))return response(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'09:00',fim:'18:00',intervalo_inicio:null,intervalo_fim:null})));
  if(url.includes('saas_controle_agenda'))return response([{pausado:false}]);
  if(url.includes('saas_horarios_livres'))return response([{horario:'09:00'}]);
  if(url.includes('saas_bloqueios')||url.includes('saas_reservas'))return response([]);
  throw new Error('Requisição inesperada: '+url);
 };
 for(const script of w.document.querySelectorAll('script[src]'))require('node:vm').runInContext(fs.readFileSync(script.getAttribute('src'),'utf8'),dom.getInternalVMContext());
 await new Promise(r=>setTimeout(r,100));
 return dom;
}
(async()=>{
 let dom=await abrir('index.html');
 assert.equal(dom.window.document.querySelector('.cabecalho h1').textContent,loja.nome);
 assert.equal(dom.window.document.querySelectorAll('.profissional').length,2);
 assert.ok(dom.window.document.querySelector('.profissional').href.includes('barbearia=loja-teste'));
 dom.window.close();
 dom=await abrir('index.html','');
 assert.ok(dom.window.document.getElementById('instrucao-profissionais').textContent.includes('link de agendamento'));
 dom.window.close();
 dom=await abrir('agendamento.html','?barbearia=loja-teste&cabeleireiro=profissional-teste');
 assert.equal(dom.window.document.getElementById('profissional-escolhido').textContent,'Barbeiro Teste');
 assert.equal(dom.window.document.querySelectorAll('[data-servico]').length,1);
 dom.window.close();
 dom=await abrir('horarios.html','?barbearia=loja-teste&cabeleireiro=profissional-teste&servico=Corte&preco=30&servico_id=servico-teste');
 assert.equal(dom.window.document.querySelectorAll('#grade-dias input').length,15);
 assert.ok(requests.some(r=>r.url.includes('saas_horarios_livres')&&JSON.parse(r.options.body).loja===loja.id));
 dom.window.close();
 dom=await abrir('resumo.html','?barbearia=loja-teste&cabeleireiro=profissional-teste&servico=Corte&preco=30&servico_id=servico-teste');
 assert.equal(dom.window.document.getElementById('resumo-profissional').textContent,'Barbeiro Teste');
 assert.equal(dom.window.document.querySelector('#dados-cliente button').disabled,false);
 dom.window.close();
 dom=await abrir('admin.html','');
 const w=dom.window,f=w.document.getElementById('form-login');
 f.elements.email.value='dono@teste.local';f.elements.password.value='senha-teste';
 await f.onsubmit({preventDefault(){},submitter:f.querySelector('button'),target:f});
 assert.equal(w.document.getElementById('painel').hidden,false);
 assert.equal(w.document.getElementById('nome-barbearia').textContent,loja.nome);
 assert.ok(w.document.getElementById('link-agendamento').href.includes('barbearia=loja-teste'));
 assert.equal(w.document.getElementById('lista-profissionais').children.length,1);
 assert.ok(requests.some(r=>r.url.includes('saas_reservas')&&r.url.includes('barbearia_id=eq.'+loja.id)));
 await w.document.getElementById('sair').onclick();
 assert.equal(w.document.getElementById('painel').hidden,true);
 dom.window.close();
 console.log('OK: inicialização das páginas, link obrigatório, catálogo e profissionais da loja, login, painel e logout com API simulada.');
})().catch(e=>{console.error(e);process.exitCode=1;});
