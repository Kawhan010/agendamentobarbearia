const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require(path.join(process.argv[2],'node_modules/jsdom'));
const loja={id:'10000000-0000-4000-8000-000000000001',nome:'Barbearia Teste',slug:'teste',whatsapp:'5579999999999',logo:'',imagem_fundo:'',cor_principal:'#262878',cor_destaque:'#ba2530',cor_fundo:'#f5f3f1'};
const profissional={id:'profissional',nome:'Barbeiro',ativo:true,excluido:false,duracao_minutos:30};
const requests=[],revogadas=[];let blobs=0,falharUpload=false,falharSalvar=false,perderResposta=false,segurarUpload=null;
const resposta=(data,ok=true,status=200)=>({ok,status,json:async()=>structuredClone(data)});
// A API simulada também serve à prévia local; nenhum upload real é feito.
function mockFetch(w){return async(raw,options={})=>{
 requests.push({url:raw,options});const u=new URL(raw),nome=u.pathname.split('/').pop(),method=options.method||'GET',dados=typeof options.body==='string'?JSON.parse(options.body):{};
 if(u.pathname.includes('/auth/'))return resposta({access_token:'token-teste'});
 if(u.pathname.includes('/storage/')){
  if(method==='POST'){if(segurarUpload){const esperar=segurarUpload;segurarUpload=null;await esperar;}return resposta({},!falharUpload,falharUpload?403:200);}
  return resposta({});
 }
 if(nome==='saas_membros')return resposta([{barbearia_id:loja.id}]);
 if(nome==='saas_barbearias'){
  if(method==='PATCH'){
   if(falharSalvar)return resposta([]);
   if(u.searchParams.has('imagem_fundo')&&u.searchParams.get('imagem_fundo').slice(3)!==loja.imagem_fundo)return resposta([]);
   Object.assign(loja,dados);if(perderResposta){perderResposta=false;throw new Error('Resposta perdida');}
  }
  if(method==='GET'&&u.searchParams.has('imagem_fundo')&&u.searchParams.get('imagem_fundo').slice(3)!==loja.imagem_fundo)return resposta([]);
  return resposta([loja]);
 }
 if(nome==='saas_profissionais')return resposta([profissional]);
 if(nome==='saas_controle_agenda')return resposta([{pausado:false}]);
 if(nome==='saas_expediente')return resposta(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'09:00',fim:'18:00'})));
 if(nome==='saas_resumo_financeiro')return resposta({confirmados:0,total_confirmado:0,pendentes:0,total_pendente:0,cancelados:0,profissionais:[]});
 return resposta([]);
};}
(async()=>{
 const dom=new JSDOM(fs.readFileSync('admin.html','utf8'),{url:'https://teste.local/admin.html',runScripts:'outside-only'}),w=dom.window,d=w.document;
 for(const f of d.forms)for(const n of f.elements)if(n.name&&n.name!=='id')Object.defineProperty(f,n.name,{get:()=>f.elements.namedItem(n.name),configurable:true});
 w.crypto.randomUUID=require('node:crypto').randomUUID;w.URL.createObjectURL=()=>'blob:https://teste.local/'+(++blobs);w.URL.revokeObjectURL=url=>revogadas.push(url);
 w.Image=class{naturalWidth=3200;naturalHeight=2000;set src(v){queueMicrotask(()=>this.onload());}};
 let dimensoes;w.HTMLCanvasElement.prototype.getContext=function(){dimensoes=[this.width,this.height];return {fillRect(){},drawImage(){}};};
 w.HTMLCanvasElement.prototype.toBlob=function(fn,tipo){fn(new w.Blob(['imagem-ajustada'],{type:tipo}));};w.fetch=mockFetch(w);
 for(const s of d.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(s.getAttribute('src').split('?')[0],'utf8'),dom.getInternalVMContext());
 const el=id=>d.getElementById(id),submit=async id=>{const f=el(id);await f.onsubmit({preventDefault(){},target:f,submitter:f.querySelector('button[type="submit"],button')});};
 const escolher=async(file=new w.File(['imagem'],'foto.png',{type:'image/png'}))=>el('arquivo-imagem-fundo').onchange({target:{files:[file]}});
 const input=el('form-login');input.elements.email.value='teste@teste.local';input.elements.password.value='senha';await submit('form-login');
 assert.equal(d.documentElement.classList.contains('com-imagem-fundo'),false);
 await escolher(new w.File(['svg'],'arquivo.svg',{type:'image/svg+xml'}));assert.ok(el('status-imagem-fundo').textContent.includes('JPG'));
 assert.throws(()=>w.ImagemFundo.validarArquivo({type:'image/jpeg',size:6*1024*1024}),/5 MB/);
 await escolher();assert.deepEqual(dimensoes,[1920,1200]);assert.ok(el('previa-imagem-fundo').src.startsWith('blob:'));assert.equal(loja.imagem_fundo,'');
 const previa=el('previa-imagem-fundo').src,antes=requests.length;el('descartar-imagem-fundo').onclick();assert.equal(requests.length,antes);assert.ok(revogadas.includes(previa));
 await escolher();const cores=el('form-personalizacao');cores.elements.cor_principal.value='#14532d';cores.oninput();assert.equal(d.documentElement.classList.contains('com-imagem-fundo'),true);
 let liberar;segurarUpload=new Promise(resolve=>{liberar=resolve;});const salvar=submit('form-imagem-fundo');await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(el('campos-imagem-fundo').disabled,true);assert.equal(el('campos-cores').disabled,true);assert.equal(el('sair').disabled,true);
 const uploadsAntes=requests.filter(r=>r.url.includes('/storage/')&&r.options.method==='POST').length;await submit('form-imagem-fundo');assert.equal(requests.filter(r=>r.url.includes('/storage/')&&r.options.method==='POST').length,uploadsAntes);liberar();await salvar;
 assert.ok(w.ImagemFundo.caminhoValido(loja.imagem_fundo));assert.ok(el('status-imagem-fundo').textContent.includes('salva'));assert.equal(el('campos-imagem-fundo').disabled,false);
 const upload=requests.find(r=>r.url.includes('/storage/')&&r.options.method==='POST');assert.equal(upload.options.headers.Authorization,'Bearer token-teste');assert.equal(upload.options.body.get('file').type,'image/webp');
 const original=loja.imagem_fundo;await escolher();falharUpload=true;await submit('form-imagem-fundo');assert.equal(loja.imagem_fundo,original);assert.ok(el('status-imagem-fundo').textContent.includes('enviar'));falharUpload=false;
 falharSalvar=true;await submit('form-imagem-fundo');assert.equal(loja.imagem_fundo,original);assert.ok(el('status-imagem-fundo').textContent.includes('mudou'));falharSalvar=false;
 perderResposta=true;await submit('form-imagem-fundo');assert.notEqual(loja.imagem_fundo,original);assert.ok(requests.some(r=>r.options.method==='DELETE'&&r.options.body.includes(original)));
 await submit('form-personalizacao');assert.equal(loja.cor_principal,'#14532d');assert.equal(d.documentElement.classList.contains('com-imagem-fundo'),true);
 const atual=loja.imagem_fundo;el('remover-imagem-fundo').onclick();assert.equal(loja.imagem_fundo,atual);assert.equal(d.documentElement.classList.contains('com-imagem-fundo'),false);await submit('form-imagem-fundo');assert.equal(loja.imagem_fundo,'');
 assert.ok(requests.some(r=>r.options.method==='DELETE'&&r.options.body.includes(atual)));
 assert.equal(w.ImagemFundo.url('javascript:alert(1)'), '');w.ImagemFundo.aplicar({...loja,imagem_fundo:'20000000-0000-4000-8000-000000000001/'+crypto.randomUUID()+'.webp'});assert.equal(d.documentElement.classList.contains('com-imagem-fundo'),false);
 await escolher();el('sair').click();await new Promise(resolve=>setTimeout(resolve,20));assert.equal(d.documentElement.classList.contains('com-imagem-fundo'),false);assert.equal(el('previa-imagem-fundo').hidden,true);
 dom.window.close();console.log('OK: validação e ajuste, prévia sem salvar, descarte, envio autenticado, bloqueio de duplicação, erros visíveis, resposta perdida, limpeza, cores preservadas, remoção e logout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
