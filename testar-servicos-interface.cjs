const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require(path.join(process.argv[2],'node_modules/jsdom'));
const loja={id:'10000000-0000-4000-8000-000000000001',nome:'Barbearia Teste',slug:'teste',whatsapp:'5579999999999',logo:'',imagem_fundo:''};
const profissional={id:'prof-a',barbearia_id:loja.id,nome:'Barbeiro Teste',ativo:true,excluido:false,duracao_minutos:null,foto:''};
const servicosTeste=[{id:'20000000-0000-4000-8000-000000000001',barbearia_id:loja.id,nome:'Corte',descricao:'',preco:30,categoria:'individual',ativo:true,duracao_minutos:25,imagem:'assets/corte.jpg',imagem_arquivo:''},
 {id:'20000000-0000-4000-8000-000000000002',barbearia_id:loja.id,nome:'Corte e barba',descricao:'',preco:60,categoria:'combo',ativo:true,duracao_minutos:60,imagem:'',imagem_arquivo:''}];
let requests=[],falharUpload=false,semLinhas=false,perderResposta=false,segurarUpload=null;
const resposta=(data,ok=true,status=200)=>({ok,status,json:async()=>structuredClone(data)});
// Prévia local usa somente esta API simulada e dados de exemplo.
function mockFetch(raw,options={}){
 return (async()=>{
  const u=new URL(raw,'https://teste.local'),nome=u.pathname.split('/').pop(),method=options.method||'GET',dados=typeof options.body==='string'?JSON.parse(options.body):{};
  requests.push({url:raw,method,body:dados,options});
  if(u.pathname.includes('/auth/'))return resposta({access_token:'token-teste'});
  if(u.pathname.includes('/storage/')){
   if(method==='POST'){if(segurarUpload){const esperar=segurarUpload;segurarUpload=null;await esperar;}return resposta({},!falharUpload,falharUpload?403:200);}return resposta({});
  }
  if(nome==='saas_membros')return resposta([{barbearia_id:loja.id}]);
  if(nome==='saas_barbearias')return resposta([loja]);
  if(nome==='saas_profissionais')return resposta([profissional]);
  if(nome==='saas_servicos'){
   let rows=servicosTeste.filter(s=>[...u.searchParams].every(([k,v])=>!['id','barbearia_id','imagem_arquivo','imagem','duracao_minutos'].includes(k)||String(s[k])===v.slice(3)));
   if(method==='PATCH'){if(semLinhas)return resposta([]);rows.forEach(s=>Object.assign(s,dados));}
   if(method==='POST'){if(servicosTeste.some(s=>s.id===dados.id))return resposta({message:'ID já existe'},false,409);servicosTeste.push(dados);rows=[dados];}
   if(method!=='GET'&&perderResposta){perderResposta=false;throw new Error('Resposta perdida');}
   return resposta(rows);
  }
  if(nome==='saas_controle_agenda')return resposta([{pausado:false}]);
  if(nome==='saas_expediente')return resposta(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'09:00',fim:'18:00'})));
  if(nome==='saas_resumo_financeiro')return resposta({confirmados:0,total_confirmado:0,pendentes:0,total_pendente:0,cancelados:0,profissionais:[]});
  if(nome==='saas_horarios_livres'||nome==='saas_horarios_painel')return resposta([{horario:'09:00'},{horario:dados.servico===servicosTeste[1].id?'10:00':'09:25'}]);
  return resposta([]);
 })();
}
(async()=>{
 async function abrir(nome,query=''){
  const dom=new JSDOM(fs.readFileSync(nome,'utf8'),{url:'https://teste.local/'+nome+query,runScripts:'outside-only'}),w=dom.window;
  for(const f of w.document.forms)for(const n of f.elements)if(n.name&&n.name!=='id')Object.defineProperty(f,n.name,{get:()=>f.elements.namedItem(n.name),configurable:true});
  w.fetch=mockFetch;w.crypto.randomUUID=require('node:crypto').randomUUID;w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false};
  let blobs=0;w.URL.createObjectURL=()=>'blob:https://teste.local/'+(++blobs);w.URL.revokeObjectURL=()=>{};
  w.Image=class{naturalWidth=1600;naturalHeight=1200;set src(v){queueMicrotask(()=>this.onload());}};
  w.HTMLCanvasElement.prototype.getContext=()=>({fillRect(){},drawImage(){}});w.HTMLCanvasElement.prototype.toBlob=function(fn,tipo){fn(new w.Blob(['imagem'],{type:tipo}));};
  for(const s of w.document.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(s.getAttribute('src').split('?')[0],'utf8'),dom.getInternalVMContext());
  await new Promise(r=>setTimeout(r,40));return dom;
 }
 let dom=await abrir('admin.html'),w=dom.window,d=w.document;const el=id=>d.getElementById(id);
 const submit=async id=>{const f=el(id);await f.onsubmit({preventDefault(){},target:f,submitter:f.querySelector('button[type="submit"],button')});};
 const f=el('form-login');f.elements.email.value='teste@teste.local';f.elements.password.value='senha';await submit('form-login');
 assert.ok(el('lista-servicos').textContent.includes('25 min'));assert.ok(el('lista-servicos').textContent.includes('60 min'));
 assert.ok(el('lista-profissionais').textContent.includes('Disponível para agendamento'));assert.equal(d.getElementById('campos-duracoes'),null);
 w.ServicosPainel.editar(servicosTeste[0]);const form=el('form-servico');assert.equal(form.elements.duracao_minutos.value,'25');assert.equal(el('previa-imagem-servico').hidden,false);
 const escolher=async file=>el('arquivo-imagem-servico').onchange({target:{files:[file||new w.File(['png'],'corte.png',{type:'image/png'})]}});
 await escolher(new w.File(['svg'],'x.svg',{type:'image/svg+xml'}));assert.ok(el('status-servico').textContent.includes('JPG'));assert.equal(servicosTeste[0].imagem_arquivo,'');
 await escolher();assert.ok(el('previa-imagem-servico').src.startsWith('blob:'));assert.equal(form.elements.imagem.disabled,true);
 const antes=requests.length;w.ServicosPainel.limpar();assert.equal(requests.length,antes,'Descartar não envia a imagem');
 w.ServicosPainel.editar(servicosTeste[0]);form.elements.duracao_minutos.value='0';await submit('form-servico');assert.ok(el('status-servico').textContent.includes('1440'));assert.equal(servicosTeste[0].duracao_minutos,25);
 form.elements.duracao_minutos.value='35';await escolher();
 let liberar;segurarUpload=new Promise(r=>{liberar=r});const salvar=submit('form-servico');await new Promise(r=>setTimeout(r,20));
 assert.equal(el('campos-servico').disabled,true);assert.equal(el('sair').disabled,true);assert.throws(()=>w.ServicosPainel.editar(servicosTeste[1]),/Aguarde/);
 const uploads=requests.filter(r=>r.method==='POST'&&r.url.includes('/storage/')).length;await submit('form-servico');assert.equal(requests.filter(r=>r.method==='POST'&&r.url.includes('/storage/')).length,uploads);
 liberar();await salvar;assert.equal(servicosTeste[0].duracao_minutos,35);assert.ok(w.ImagensServicos.caminhoValido(servicosTeste[0].imagem_arquivo));assert.equal(servicosTeste[0].imagem,'');
 const upload=requests.find(r=>r.url.includes('/storage/')&&r.method==='POST');assert.equal(upload.options.headers.Authorization,'Bearer token-teste');assert.equal(upload.options.body.get('file').type,'image/webp');
 const foto=servicosTeste[0].imagem_arquivo;w.ServicosPainel.editar(servicosTeste[0]);await escolher();falharUpload=true;await submit('form-servico');assert.equal(servicosTeste[0].imagem_arquivo,foto);assert.ok(el('status-servico').textContent.includes('enviar'));falharUpload=false;
 semLinhas=true;await submit('form-servico');assert.equal(servicosTeste[0].imagem_arquivo,foto);assert.ok(el('status-servico').textContent.includes('mudou'));semLinhas=false;
 perderResposta=true;await submit('form-servico');assert.notEqual(servicosTeste[0].imagem_arquivo,foto);assert.ok(requests.some(r=>r.method==='DELETE'&&r.body.prefixes?.includes(foto)));
 w.ServicosPainel.editar(servicosTeste[0]);const imagem=servicosTeste[0].imagem_arquivo;el('remover-imagem-servico').onclick();assert.equal(servicosTeste[0].imagem_arquivo,imagem);await submit('form-servico');assert.equal(servicosTeste[0].imagem_arquivo,'');
 w.ServicosPainel.editar(servicosTeste[0]);form.elements.imagem.value='https://exemplo.local/corte.jpg';form.elements.imagem.oninput();await submit('form-servico');assert.equal(servicosTeste[0].imagem,'https://exemplo.local/corte.jpg');
 w.ServicosPainel.limpar();form.elements.nome.value='Novo';form.elements.preco.value='20';form.elements.duracao_minutos.value='15';perderResposta=true;await submit('form-servico');assert.equal(servicosTeste.filter(s=>s.nome==='Novo').length,1);
 assert.equal(w.ImagensServicos.link('javascript:alert(1)'), '');assert.equal(w.ImagensServicos.url({barbearia_id:loja.id,imagem_arquivo:crypto.randomUUID()+'/'+crypto.randomUUID()+'.webp'}),'');
 el('novo-agendamento').click();await new Promise(r=>setTimeout(r,40));const agenda=el('form-agendamento-painel');
 agenda.elements.profissional.value=profissional.id;agenda.elements.servico.value=servicosTeste[0].id;await agenda.elements.servico.onchange();
 assert.ok(requests.some(r=>r.url.includes('saas_horarios_painel')&&r.body.servico===servicosTeste[0].id));
 agenda.elements.servico.value=servicosTeste[1].id;await agenda.elements.servico.onchange();assert.ok([...agenda.elements.horario.options].some(o=>o.value==='10:00'));
 agenda.elements.servico.value='';await agenda.elements.servico.onchange();assert.equal(agenda.querySelector('button[type="submit"]').disabled,true);
 await escolher();el('sair').click();await new Promise(r=>setTimeout(r,20));assert.equal(el('previa-imagem-servico').hidden,true);dom.window.close();
 dom=await abrir('agendamento.html','?barbearia=teste&cabeleireiro='+profissional.id);assert.ok(dom.window.document.querySelector('.grade-servicos').textContent.includes('35 minutos'));assert.ok(dom.window.document.querySelector('img.imagem-servico'));dom.window.close();
 const qtd=requests.length;dom=await abrir('horarios.html','?barbearia=teste&cabeleireiro='+profissional.id+'&servico=Corte&servico_id='+servicosTeste[0].id+'&preco=30');
 assert.ok(requests.slice(qtd).some(r=>r.url.includes('saas_horarios_livres')&&r.body.servico===servicosTeste[0].id));dom.window.close();
 console.log('OK: edição de tempo e imagem, prévia/descarte, URL e arquivo, erros, duplicação, resposta perdida, remoção/limpeza, logout e duração na consulta pública.');
})().catch(e=>{console.error(e);process.exitCode=1;});
