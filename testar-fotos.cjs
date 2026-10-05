// API simulada: cobre o fluxo de fotos, falhas de envio e contato nas cinco páginas.
const {JSDOM}=require(require('node:path').join(process.argv[2],'node_modules/jsdom'));
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const loja={id:'10000000-0000-4000-8000-000000000001',slug:'loja-teste',nome:'Loja Teste',whatsapp:'5579999999999',logo:''};
const fotoOriginal=loja.id+'/20000000-0000-4000-8000-000000000001.jpg';
const pessoas=[{id:'barbeiro-teste',barbearia_id:loja.id,nome:'Barbeiro Teste',ativo:true,foto:fotoOriginal}];
const requests=[],revogadas=[];
function response(data,ok=true,status=200){return {ok,status,json:async()=>data};}
async function abrir(page,query=''){
  const dom=new JSDOM(fs.readFileSync(page,'utf8'),{url:'https://teste.local/'+page+query,runScripts:'outside-only'}),w=dom.window;
  for(const f of w.document.forms)for(const input of f.elements)if(input.name&&input.name!=='id')Object.defineProperty(f,input.name,{get:()=>f.elements.namedItem(input.name),configurable:true});
  w.URL.createObjectURL=()=> 'blob:teste/'+require('node:crypto').randomUUID();
  w.URL.revokeObjectURL=url=>revogadas.push(url);
  w.crypto.randomUUID=require('node:crypto').randomUUID;
  w.Image=class {set src(value){queueMicrotask(()=>this.onload());}};
  w.fetch=async(url,options={})=>{
    requests.push({url,options});
    const parsed=new URL(url,w.location.href),method=options.method||'GET';
    if(parsed.pathname.includes('/storage/v1/object/'))return response({});
    if(url.includes('/auth/v1/token'))return response({access_token:'token-teste'});
    if(url.includes('/auth/v1/'))return response({});
    if(url.includes('saas_membros'))return response([{barbearia_id:loja.id}]);
    if(url.includes('saas_barbearias'))return response([loja]);
    if(url.includes('/saas_profissionais')){
      const id=parsed.searchParams.get('id')?.slice(3),foto=parsed.searchParams.get('foto')?.slice(3);
      const rows=pessoas.filter(p=>(!id||p.id===id)&&(foto===undefined||p.foto===foto));
      if(method==='POST'){const p={...JSON.parse(options.body),ativo:true};pessoas.push(p);return response([p]);}
      if(method==='PATCH'){rows.forEach(p=>Object.assign(p,JSON.parse(options.body)));return response(rows);}
      return response(rows.filter(p=>!parsed.searchParams.has('ativo')||p.ativo).map(p=>({...p})));
    }
    if(url.includes('saas_servicos'))return response([]);
    if(url.includes('saas_expediente'))return response(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'09:00',fim:'18:00',intervalo_inicio:null,intervalo_fim:null})));
    if(url.includes('saas_controle_agenda'))return response([{pausado:false}]);
    if(url.includes('saas_bloqueios')||url.includes('saas_reservas'))return response([]);
    throw new Error('Requisição inesperada: '+url);
  };
  for(const script of w.document.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(script.getAttribute('src').split('?')[0],'utf8'),dom.getInternalVMContext());
  await new Promise(r=>setTimeout(r,50));
  return dom;
}
(async()=>{
  for(const pagina of ['index.html','agendamento.html','horarios.html','resumo.html','admin.html']){
    const dom=new JSDOM(fs.readFileSync(pagina,'utf8'),{url:'https://teste.local'});
    const creditos=dom.window.document.querySelector('.creditos-wk');
    assert.ok(creditos.textContent.includes('Wendell Kawhan'));
    assert.ok(creditos.textContent.includes('(79) 99677-6478'));
    assert.equal(new URL(creditos.querySelector('a').href).searchParams.get('phone'),'5579996776478');
    for(const recurso of dom.window.document.querySelectorAll('script[src],link[rel="stylesheet"]'))assert.ok(fs.existsSync((recurso.getAttribute('src')||recurso.getAttribute('href')).split('?')[0]));
    dom.window.close();
  }
  let dom=await abrir('index.html','?barbearia=loja-teste');
  let imagem=dom.window.document.querySelector('.profissional img');
  assert.ok(imagem.src.endsWith(fotoOriginal));
  imagem.onload();assert.equal(imagem.hidden,false);
  imagem.onerror();assert.equal(imagem.hidden,true);assert.equal(imagem.previousElementSibling.hidden,false);
  assert.equal(dom.window.document.querySelectorAll('.profissional img').length,1);
  dom.window.close();
  dom=await abrir('agendamento.html','?barbearia=loja-teste&cabeleireiro=barbeiro-teste');
  assert.ok(dom.window.document.querySelector('#foto-profissional-escolhido img').src.endsWith(fotoOriginal));dom.window.close();
  dom=await abrir('agendamento.html','?barbearia=loja-teste&cabeleireiro=sem-preferencia');
  assert.equal(dom.window.document.querySelector('#foto-profissional-escolhido img'),null);dom.window.close();
  dom=await abrir('admin.html');const w=dom.window,d=w.document,login=d.getElementById('form-login');
  login.elements.email.value='dono@teste.local';login.elements.password.value='senha-teste';
  await login.onsubmit({preventDefault(){},target:login,submitter:login.querySelector('button')});
  const form=d.getElementById('form-profissional');
  const salvar=()=>form.onsubmit({preventDefault(){},target:form,submitter:d.getElementById('salvar-profissional')});
  const editar=()=>d.querySelector('#lista-profissionais .acoes-item button').onclick();
  const selecionar=arquivo=>d.getElementById('foto-profissional').onchange({target:{files:[arquivo]}});
  const file=()=>new w.File(['foto-valida'],'retrato.png',{type:'image/png'});
  assert.equal(w.FotosProfissionais.url('javascript:alert(1)'), '');
  assert.throws(()=>w.FotosProfissionais.validarArquivo({type:'image/svg+xml',size:20}),/JPG/);
  assert.throws(()=>w.FotosProfissionais.validarArquivo({type:'image/jpeg',size:6*1024*1024}),/5 MB/);
  await editar();
  assert.equal(form.elements.nome.value,'Barbeiro Teste');
  assert.ok(d.querySelector('#previa-foto-profissional img').src.endsWith(fotoOriginal));
  await selecionar(new w.File(['invalid'],'arquivo.svg',{type:'image/svg+xml'}));
  assert.ok(d.getElementById('status-foto-profissional').textContent.includes('JPG'));
  await selecionar(file());
  const previa=d.querySelector('#previa-foto-profissional img').src;assert.ok(previa.startsWith('blob:'));
  const antesCancelar=requests.length;d.getElementById('cancelar-profissional').onclick();
  assert.equal(requests.length,antesCancelar);assert.ok(revogadas.includes(previa));assert.equal(pessoas[0].foto,fotoOriginal);
  await editar();await selecionar(file());await salvar();
  assert.notEqual(pessoas[0].foto,fotoOriginal);assert.ok(w.FotosProfissionais.caminhoValido(pessoas[0].foto));
  const envio=requests.find(r=>r.options.method==='POST'&&r.url.includes('/storage/'));
  assert.equal(envio.options.headers.Authorization,'Bearer token-teste');
  assert.ok(envio.options.body instanceof w.FormData);assert.equal(envio.options.body.get('file').type,'image/png');
  const patch=requests.find(r=>r.options.method==='PATCH'&&r.url.includes('saas_profissionais'));
  assert.ok(patch.url.includes('barbearia_id=eq.'+loja.id));assert.equal(JSON.parse(patch.options.body).foto,pessoas[0].foto);
  assert.ok(requests.some(r=>r.options.method==='DELETE'&&r.url.includes('/storage/')&&JSON.parse(r.options.body).prefixes.includes(fotoOriginal)));
  assert.equal(d.getElementById('campos-profissional').disabled,false);
  const fotoSalva=pessoas[0].foto,fetchOriginal=w.fetch;
  await editar();await selecionar(file());
  w.fetch=async(url,options)=>url.includes('/storage/')&&options.method==='POST'?response({},false,403):fetchOriginal(url,options);
  const patchesAntes=requests.filter(r=>r.options.method==='PATCH').length;await salvar();
  assert.equal(pessoas[0].foto,fotoSalva);assert.equal(requests.filter(r=>r.options.method==='PATCH').length,patchesAntes);
  assert.ok(d.getElementById('aviso').textContent.includes('enviar a foto'));
  assert.equal(d.getElementById('campos-profissional').disabled,false);
  w.fetch=async(url,options)=>url.includes('saas_profissionais')&&options.method==='PATCH'?response([]):fetchOriginal(url,options);
  await salvar();
  assert.equal(pessoas[0].foto,fotoSalva);assert.ok(d.getElementById('aviso').textContent.includes('não foi salvo'));
  assert.ok(requests.filter(r=>r.options.method==='DELETE'&&r.url.includes('/storage/')).length>=2);
  w.fetch=fetchOriginal;d.getElementById('cancelar-profissional').onclick();
  await editar();d.getElementById('remover-foto-profissional').onclick();
  assert.equal(pessoas[0].foto,fotoSalva);assert.equal(d.querySelector('#previa-foto-profissional img'),null);
  await salvar();assert.equal(pessoas[0].foto,'');
  assert.ok(requests.some(r=>r.options.method==='DELETE'&&r.url.includes('/storage/')&&JSON.parse(r.options.body).prefixes.includes(fotoSalva)));
  form.elements.nome.value='Novo Barbeiro';await selecionar(file());await salvar();
  assert.equal(pessoas.length,2);assert.ok(w.FotosProfissionais.caminhoValido(pessoas[1].foto));
  form.elements.nome.value='Sem Foto';await salvar();assert.equal(pessoas.length,3);assert.equal(pessoas[2].foto,'');
  // Banco salvou, mas a resposta de criação se perdeu: recupera sem duplicar o cadastro.
  form.elements.nome.value='Resposta Perdida';
  w.fetch=async(url,options)=>{const resposta=await fetchOriginal(url,options);if(url.includes('saas_profissionais')&&options.method==='POST')throw new Error('Falha de conexão');return resposta;};
  await salvar();assert.equal(pessoas.length,4);assert.equal(form.elements.nome.value,'');assert.ok(d.getElementById('aviso').textContent.includes('cadastrado'));
  w.fetch=fetchOriginal;
  await editar();
  w.Image=class {set src(value){queueMicrotask(()=>this.onerror());}};
  await selecionar(file());assert.ok(d.getElementById('status-foto-profissional').textContent.includes('abrir esta foto'));
  await d.getElementById('sair').onclick();
  assert.equal(d.getElementById('lista-profissionais').children.length,0);assert.equal(form.elements.id.value,'');
  dom.window.close();
  console.log('OK: fotos públicas, sem preferência, fallback, prévia, cancelamento, envio autenticado, cadastro, troca, remoção, falhas e contato nas cinco páginas.');
})().catch(e=>{console.error(e);process.exitCode=1;});
