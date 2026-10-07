const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const {JSDOM}=require(path.join(process.argv[2],'node_modules/jsdom'));
(async()=>{
 const dom=new JSDOM(fs.readFileSync('proprietario.html','utf8'),{url:'https://teste.local/proprietario.html',runScripts:'outside-only'}),w=dom.window,d=w.document,$=id=>d.getElementById(id);
 w.crypto.randomUUID=require('node:crypto').randomUUID;w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 const lojas=[{id:'10000000-0000-4000-8000-000000000001',nome:'Barbearia Áurea',slug:'aurea',whatsapp:'5579999999999',logo:'',ativa:true,profissionais:1,servicos:2,agendamentos_hoje:3},{id:'20000000-0000-4000-8000-000000000002',nome:'Outra barbearia',slug:'outra',whatsapp:'5579999999999',logo:'',ativa:true,profissionais:1,servicos:2,agendamentos_hoje:3}];
 const arquivos=[{bucket:'logos-barbearias',caminho:lojas[0].id+'/logo.png'},{bucket:'imagens-servicos',caminho:lojas[0].id+'/corte.webp'}],pedidos=new Map(),requests=[],auditoria=[];let perdido=true,storageFalha=true,negado=false,revogar=false,segurar=null;
 const resposta=(data,status=200)=>({ok:status<400,status,json:async()=>structuredClone(data)});
 w.AGENDA_CONFIG={enabled:true,url:'https://backend.test',publicKey:'public-test'};
 w.fetch=async(url,opts)=>{const body=JSON.parse(opts.body||'{}');requests.push({url,body,method:opts.method,headers:opts.headers});
  if(url.includes('/auth/v1/token'))return resposta({access_token:'sessao-teste'});if(url.includes('/auth/v1/logout'))return resposta({});assert.equal(opts.headers.Authorization,'Bearer sessao-teste');
  if(negado)return resposta({code:'42501'},403);
  if(url.endsWith('saas_proprietario_listar'))return resposta({email:'owner@example.test',lojas:structuredClone(lojas),encontradas:lojas.length,proximo:null,totais:{barbearias:lojas.length,ativas:lojas.length,suspensas:0,profissionais:lojas.length,agendamentos_hoje:3},auditoria,limpeza_pendente:pedidos.size>0&&arquivos.length>0});
  if(url.endsWith('saas_proprietario_excluir')){
   if(segurar)await segurar;
   if(!pedidos.has(body.pedido)){const l=lojas.find(l=>l.id===body.loja);if(body.confirmacao!==l.nome)return resposta({message:'Digite o nome exato'},400);lojas.splice(lojas.indexOf(l),1);pedidos.set(body.pedido,{pedido:body.pedido,nome:l.nome});auditoria.unshift({barbearia:l.nome,antes:{nome:l.nome,whatsapp:l.whatsapp,ativa:true},depois:{nome:l.nome,excluida:true},autor_email:'owner@example.test',criado_em:'2026-10-07T17:00:00Z'});}
   if(perdido){perdido=false;throw new w.TypeError('Resposta perdida');}if(revogar)negado=true;return resposta(pedidos.get(body.pedido));
  }
  if(url.endsWith('saas_proprietario_limpezas'))return resposta(pedidos.size?arquivos:[]);
  if(url.includes('/storage/v1/object/')){assert.equal(opts.method,'DELETE');if(storageFalha)return resposta({},500);const bucket=url.split('/').at(-1);for(let i=arquivos.length-1;i>=0;i--)if(arquivos[i].bucket===bucket&&body.prefixes.includes(arquivos[i].caminho))arquivos.splice(i,1);return resposta({});}
  throw Error(url);
 };
 w.eval(fs.readFileSync('saas.js','utf8'));w.eval(fs.readFileSync('proprietario.js','utf8'));const esperar=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
 const submit=async(id)=>{$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await esperar();};
 $('login-proprietario').elements.email.value='owner@example.test';$('login-proprietario').elements.password.value='senha-local';await submit('login-proprietario');
 const abrir=()=>{d.querySelector('.loja button').click();$('abrir-exclusao').click();};abrir();assert.equal($('editar-barbearia').open,false);assert.equal($('excluir-barbearia').open,true);assert.equal(d.activeElement.id,'confirmar-nome-exclusao');assert.equal($('confirmar-exclusao').disabled,true);
 const digitar=nome=>{$('confirmar-nome-exclusao').value=nome;$('confirmar-nome-exclusao').dispatchEvent(new w.Event('input'));};
 const antes=requests.length;for(const nome of ['','Barbearia Aurea','barbearia Áurea','Barbearia Áurea ']){digitar(nome);assert.equal($('confirmar-exclusao').disabled,true);await submit('form-excluir-barbearia');}assert.equal(requests.length,antes,'Nem submit programático ignora a confirmação');
 digitar('Barbearia Áurea');assert.equal($('confirmar-exclusao').disabled,false);$('cancelar-exclusao').click();assert.equal($('confirmar-nome-exclusao').value,'');assert.equal(pedidos.size,0);
 abrir();digitar('Barbearia Áurea');await submit('form-excluir-barbearia');assert.equal($('excluir-barbearia').open,true);assert.match($('aviso-exclusao').textContent,/resposta não chegou/);assert.equal(pedidos.size,1);
 const pedido=requests.find(r=>r.url.endsWith('saas_proprietario_excluir')).body.pedido;await submit('form-excluir-barbearia');assert.equal($('excluir-barbearia').open,false);assert.equal(auditoria.length,1);assert.equal(requests.filter(r=>r.url.endsWith('saas_proprietario_excluir')).at(-1).body.pedido,pedido);
 assert.equal($('lista-barbearias').children.length,1);assert.match($('lista-barbearias').textContent,/Outra barbearia/);assert.equal($('limpeza-exclusoes').hidden,false);assert.match($('auditoria-proprietario').textContent,/excluída definitivamente/);assert.ok(!$('auditoria-proprietario').textContent.includes('undefined'));
 storageFalha=false;$('concluir-limpeza').click();await esperar();assert.equal(arquivos.length,0);assert.equal($('limpeza-exclusoes').hidden,true);assert.ok(requests.some(r=>r.url.endsWith('/logos-barbearias')&&r.body.prefixes[0].endsWith('/logo.png')));
 abrir();digitar('Outra barbearia');let liberar;segurar=new Promise(r=>liberar=r);revogar=true;$('confirmar-exclusao').click();$('confirmar-exclusao').click();assert.equal($('cancelar-exclusao').disabled,true);assert.equal($('sair-proprietario').disabled,true);const e=new w.Event('cancel',{cancelable:true});$('excluir-barbearia').dispatchEvent(e);assert.equal(e.defaultPrevented,true);liberar();segurar=null;await esperar();assert.equal(pedidos.size,2);assert.equal($('lista-barbearias').querySelectorAll('.loja').length,0);
 assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);assert.equal($('gestao-proprietario').hidden,true);assert.equal($('excluir-barbearia').open,false);assert.match($('aviso-proprietario').textContent,/excluída.*Entre novamente/);
 dom.window.close();console.log('OK: confirmação exata, cancelar/limpar, bloqueio de submissão indevida e duplicada, resposta perdida com mesmo pedido, remoção da lista, auditoria, limpeza de imagens com nova tentativa e sessão revogada.');
})().catch(e=>{console.error(e);process.exitCode=1;});
