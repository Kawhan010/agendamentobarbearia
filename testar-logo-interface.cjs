const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {JSDOM}=require(path.join(process.argv[2],'node_modules/jsdom'));
const loja={id:'10000000-0000-4000-8000-000000000001',nome:'Barbearia Teste',slug:'teste',whatsapp:'5579999999999',logo:'https://exemplo.com/logo-antiga.png',imagem_fundo:'',cor_principal:'#262878',cor_destaque:'#ba2530',cor_fundo:'#f5f3f1'};
const requests=[],revogadas=[];let blobs=0,falharUpload=false,falharSalvar=false,perderResposta=false,segurarUpload=null,tipoExport='image/webp',preparo=null;
const resposta=(data,ok=true,status=200)=>({ok,status,json:async()=>structuredClone(data)});
(async()=>{
 const dom=new JSDOM(fs.readFileSync('admin.html','utf8'),{url:'https://teste.local/admin.html',runScripts:'outside-only'}),w=dom.window,d=w.document;
 for(const f of d.forms)for(const n of f.elements)if(n.name&&n.name!=='id')Object.defineProperty(f,n.name,{get:()=>f.elements.namedItem(n.name),configurable:true});
 w.crypto.randomUUID=require('node:crypto').randomUUID;w.URL.createObjectURL=()=>'blob:https://teste.local/'+(++blobs);w.URL.revokeObjectURL=url=>revogadas.push(url);
 w.Image=class{naturalWidth=2000;naturalHeight=1000;set src(v){const aguardar=preparo;preparo=null;Promise.resolve(aguardar).then(()=>this.onload());}};
 let dimensoes;w.HTMLCanvasElement.prototype.getContext=function(){const canvas=this;return {fillRect(){throw Error('Transparência não deve ser preenchida');},drawImage(){dimensoes=[canvas.width,canvas.height];}};};
 w.HTMLCanvasElement.prototype.toBlob=function(fn){fn(new w.Blob(['logo-ajustada'],{type:tipoExport}));};
 w.fetch=async(raw,options={})=>{
  requests.push({url:raw,options});const u=new URL(raw),nome=u.pathname.split('/').pop(),method=options.method||'GET',dados=typeof options.body==='string'?JSON.parse(options.body):{};
  if(u.pathname.includes('/auth/'))return resposta({access_token:'token-teste'});
  if(u.pathname.includes('/storage/')){
   if(method==='POST'){if(segurarUpload){const esperar=segurarUpload;segurarUpload=null;await esperar;}return resposta({},!falharUpload,falharUpload?403:200);}
   return resposta({});
  }
  if(nome==='saas_membros')return resposta([{barbearia_id:loja.id}]);
  if(nome==='saas_barbearias'){
   if(u.searchParams.has('logo')&&u.searchParams.get('logo').slice(3)!==loja.logo)return resposta([]);
   if(method==='PATCH'){if(falharSalvar)return resposta([]);Object.assign(loja,dados);if(perderResposta){perderResposta=false;throw Error('Resposta perdida');}}
   return resposta([loja]);
  }
  if(nome==='saas_profissionais')return resposta([]);
  if(nome==='saas_controle_agenda')return resposta([{pausado:false}]);
  if(nome==='saas_expediente')return resposta(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'09:00',fim:'18:00'})));
  if(nome==='saas_resumo_financeiro')return resposta({confirmados:0,total_confirmado:0,pendentes:0,total_pendente:0,cancelados:0,profissionais:[]});
  return resposta([]);
 };
 for(const s of d.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(s.getAttribute('src').split('?')[0],'utf8'),dom.getInternalVMContext());
 const el=id=>d.getElementById(id),submit=async id=>{const f=el(id);await f.onsubmit({preventDefault(){},target:f,submitter:f.querySelector('button[type="submit"],button')});};
 const escolher=async(file=new w.File(['logo'],'logo.png',{type:'image/png'}))=>el('arquivo-logo').onchange({target:{files:[file]}});
 const login=el('form-login');login.elements.email.value='teste@teste.local';login.elements.password.value='senha';await submit('form-login');
 assert.equal(el('previa-logo').src,loja.logo);assert.equal(el('remover-logo').hidden,false);
 await escolher(new w.File(['svg'],'arquivo.svg',{type:'image/svg+xml'}));assert.ok(el('status-logo').textContent.includes('JPG'));
 await escolher(new w.File([new Uint8Array(6*1024*1024)],'grande.png',{type:'image/png'}));assert.ok(el('status-logo').textContent.includes('5 MB'));
 const original=loja.logo;await escolher();assert.deepEqual(dimensoes,[1024,512]);assert.ok(el('previa-logo').src.startsWith('blob:'));assert.equal(loja.logo,original);
 const previa=el('previa-logo').src,antes=requests.length;el('descartar-logo').onclick();assert.equal(requests.length,antes);assert.ok(revogadas.includes(previa));assert.equal(el('previa-logo').src,original);
 await escolher();let liberar;segurarUpload=new Promise(resolve=>liberar=resolve);const salvar=submit('form-configuracoes');await new Promise(resolve=>setTimeout(resolve,20));
 assert.equal(el('campos-logo').disabled,true);assert.equal(el('sair').disabled,true);assert.equal(el('campos-imagem-fundo').disabled,true);
 const uploadsAntes=requests.filter(r=>r.url.includes('/storage/')&&r.options.method==='POST').length;await submit('form-configuracoes');assert.equal(requests.filter(r=>r.url.includes('/storage/')&&r.options.method==='POST').length,uploadsAntes);liberar();await salvar;
 assert.ok(w.ImagemLogo.caminho(loja.logo,loja.id));assert.ok(el('status-logo').textContent.includes('salvos'));assert.equal(el('campos-logo').disabled,false);assert.equal(el('form-configuracoes').elements.logo.disabled,false);
 const upload=requests.find(r=>r.url.includes('/storage/')&&r.options.method==='POST');assert.equal(upload.options.headers.Authorization,'Bearer token-teste');assert.equal(upload.options.body.get('file').type,'image/webp');
 const salva=loja.logo;await escolher();falharUpload=true;await submit('form-configuracoes');assert.equal(loja.logo,salva);assert.ok(el('status-logo').textContent.includes('enviar'));falharUpload=false;
 falharSalvar=true;await submit('form-configuracoes');assert.equal(loja.logo,salva);assert.ok(el('status-logo').textContent.includes('mudou'));falharSalvar=false;
 perderResposta=true;await submit('form-configuracoes');assert.notEqual(loja.logo,salva);assert.ok(requests.some(r=>r.options.method==='DELETE'&&r.options.body.includes(w.ImagemLogo.caminho(salva,loja.id))));
 tipoExport='image/png';await escolher();await submit('form-configuracoes');assert.ok(loja.logo.endsWith('.png'),'Fallback PNG preserva a transparência');
 const atual=loja.logo;el('remover-logo').onclick();assert.equal(loja.logo,atual);assert.equal(el('previa-logo').hidden,true);await submit('form-configuracoes');assert.equal(loja.logo,'');
 assert.ok(requests.some(r=>r.options.method==='DELETE'&&r.options.body.includes(w.ImagemLogo.caminho(atual,loja.id))));
 const campo=el('form-configuracoes').elements.logo;campo.value='https://exemplo.com/nova-logo.png';campo.oninput();await submit('form-configuracoes');assert.equal(loja.logo,campo.value);
 campo.value='javascript:alert(1)';campo.oninput();await submit('form-configuracoes');assert.ok(el('status-logo').textContent.includes('HTTPS'));
 el('descartar-logo').onclick();campo.value='https://exemplo.com/concorrente.png';campo.oninput();loja.logo='https://exemplo.com/outro-painel.png';await submit('form-configuracoes');assert.equal(loja.logo,'https://exemplo.com/outro-painel.png');assert.ok(el('status-logo').textContent.includes('mudou'));
 assert.equal(w.ImagemLogo.caminho('https://exemplo.com/logo.png',loja.id),'');assert.equal(w.ImagemLogo.caminho(atual,'20000000-0000-4000-8000-000000000001'),'');
 let fim;preparo=new Promise(resolve=>fim=resolve);const escolherPendente=escolher();el('sair').click();fim();await escolherPendente;
 assert.equal(el('previa-logo').hidden,true);assert.equal(el('form-configuracoes').elements.nome.value,'');
 dom.window.close();console.log('OK: validação e ajuste sem preencher transparência, prévia/descarte, upload autenticado, bloqueio de duplicação, falhas, resposta perdida, PNG fallback, remoção, URL, concorrência e logout durante preparo.');
})().catch(e=>{console.error(e);process.exitCode=1;});
