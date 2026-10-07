const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(path.join(process.argv[2],'node_modules/jsdom'));
const resposta=(data,status=200)=>({ok:status<400,status,json:async()=>structuredClone(data)});
(async()=>{
 let lojas=Array.from({length:21},(_,i)=>({id:String(i).padStart(3,'0'),nome:i===0?'<img src=x onerror=alert(1)>':'Barbearia '+i,slug:'barbearia-'+i,whatsapp:'5579999999999',logo:'',ativa:true,dono_email:'barbeiro'+i+'@example.test',profissionais:2,servicos:4,agendamentos_hoje:3}));
 let auditoria=[],negado=false,erroLogin=false,erroLista=false,erroSalvar='',perderResposta=false,segurar=null;const requests=[];
 const dom=new JSDOM(fs.readFileSync('proprietario.html','utf8'),{url:'https://teste.local/proprietario.html?barbearia=ignorar#access_token=nao-usar',runScripts:'outside-only'}),w=dom.window,d=w.document;
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
 w.AGENDA_CONFIG={enabled:true,url:'https://backend.test',publicKey:'public-test'};
 w.fetch=async(url,opts)=>{const body=JSON.parse(opts.body||'{}');requests.push({url,body,headers:opts.headers});
  if(url.includes('/auth/v1/token'))return erroLogin?resposta({error_code:'invalid_credentials'},400):resposta({access_token:'sessao-teste'});
  if(url.includes('/auth/v1/logout'))return resposta({});
  if(url.includes('/saas_barbearias?'))return resposta([{id:'suspensa',nome:'Barbearia suspensa',ativa:false}]);
  assert.equal(opts.headers.Authorization,'Bearer sessao-teste');
  if(negado)return resposta({code:'42501'},403);
  if(url.endsWith('saas_proprietario_listar')){
   if(erroLista)throw new w.TypeError('network');if(segurar)await segurar;
   const filtro=lojas.filter(l=>(body.situacao==='todas'||l.ativa===(body.situacao==='ativas'))&&JSON.stringify(l).toLowerCase().includes(body.busca.toLowerCase()));const lista=filtro.filter(l=>!body.apos||l.id>body.apos);
   return resposta({email:'owner@example.test',lojas:lista.slice(0,20),proximo:lista.length>20?lista[19].id:null,encontradas:filtro.length,totais:{barbearias:lojas.length,ativas:lojas.filter(l=>l.ativa).length,suspensas:lojas.filter(l=>!l.ativa).length,profissionais:42,agendamentos_hoje:63},auditoria});
  }
  if(url.endsWith('saas_proprietario_salvar')){
   if(erroSalvar)return resposta({message:erroSalvar,code:'40001'},409);
   const l=lojas.find(x=>x.id===body.loja),antes={nome:l.nome,whatsapp:l.whatsapp,ativa:l.ativa};Object.assign(l,{nome:body.nome_novo,whatsapp:body.whatsapp_novo,ativa:body.ativa_nova});
   if(JSON.stringify(antes)!==JSON.stringify({nome:l.nome,whatsapp:l.whatsapp,ativa:l.ativa}))auditoria.unshift({barbearia:l.nome,autor_email:'owner@example.test',antes,depois:{nome:l.nome,whatsapp:l.whatsapp,ativa:l.ativa},criado_em:'2026-10-07T16:00:00Z'});
   if(perderResposta){perderResposta=false;throw new w.TypeError('connection');}return resposta(l);
  }throw Error(url);
 };
 w.eval(fs.readFileSync('saas.js','utf8'));await assert.rejects(()=>w.SaaS.buscarLoja(),/suspensos/);assert.equal(w.SaaS.loja,null);
 w.eval(fs.readFileSync('proprietario.js','utf8'));const $=id=>d.getElementById(id);
 const esperar=async()=>{for(let i=0;i<8;i++)await new Promise(r=>setImmediate(r));};
 const submit=async(id)=>{$(id).dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await esperar();};
 const login=async()=>{$('login-proprietario').elements.email.value='owner@example.test';$('login-proprietario').elements.password.value='senha-ficticia';await submit('login-proprietario');};
 assert.equal(w.location.hash,'');assert.equal($('gestao-proprietario').hidden,true);erroLogin=true;await login();assert.match($('aviso-proprietario').textContent,/incorretos/);assert.equal($('login-proprietario').elements.password.value,'');erroLogin=false;
 negado=true;await login();assert.equal($('gestao-proprietario').hidden,true);assert.equal($('lista-barbearias').children.length,0);assert.match($('aviso-proprietario').textContent,/não tem acesso/);negado=false;
 await login();assert.equal($('gestao-proprietario').hidden,false);assert.equal($('lista-barbearias').children.length,20);assert.equal(d.querySelectorAll('.loja h4 img').length,0,'Nome não pode criar HTML');assert.equal($('lojas-proxima').disabled,false);assert.equal(w.localStorage.length,0);assert.equal(w.sessionStorage.length,0);
 $('lojas-proxima').click();await esperar();assert.equal($('lista-barbearias').children.length,1);assert.equal($('pagina-proprietario').textContent,'Página 2');$('lojas-anterior').click();await esperar();
 const f=$('busca-proprietario');f.elements.busca.value='barbeiro20@';await submit('busca-proprietario');assert.equal($('lista-barbearias').children.length,1);assert.match($('lista-barbearias').textContent,/Barbearia 20/);
 f.elements.busca.value='sem resultado';await submit('busca-proprietario');assert.match($('lista-barbearias').textContent,/Nenhuma/);f.elements.busca.value='';await submit('busca-proprietario');
 d.querySelector('.loja button').click();assert.equal($('editar-barbearia').open,true);const editar=$('form-editar-barbearia');editar.elements.whatsapp.value='79';await submit('form-editar-barbearia');assert.match($('aviso-edicao').textContent,/DDD/);
 editar.elements.whatsapp.value='79 98888-8888';editar.elements.nome.value='Nova barbearia';editar.elements.ativa.value='false';erroSalvar='Os dados mudaram';await submit('form-editar-barbearia');assert.equal($('editar-barbearia').open,true);assert.match($('aviso-edicao').textContent,/mudaram/);erroSalvar='';
 perderResposta=true;await submit('form-editar-barbearia');assert.equal($('editar-barbearia').open,true);assert.match($('aviso-edicao').textContent,/resposta não chegou/);await submit('form-editar-barbearia');assert.equal($('editar-barbearia').open,false);assert.equal(auditoria.length,1);assert.match($('auditoria-proprietario').textContent,/suspensos/);assert.equal(lojas[0].whatsapp,'5579988888888');
 f.elements.situacao.value='suspensas';await submit('busca-proprietario');assert.equal($('lista-barbearias').children.length,1);d.querySelector('.loja button').click();editar.elements.ativa.value='true';await submit('form-editar-barbearia');assert.match($('lista-barbearias').textContent,/Nenhuma/);assert.equal(auditoria.length,2);
 f.elements.situacao.value='todas';await submit('busca-proprietario');erroLista=true;$('atualizar-proprietario').click();await esperar();assert.match($('aviso-proprietario').textContent,/internet/);assert.equal($('atualizar-proprietario').disabled,false);erroLista=false;
 let liberar;segurar=new Promise(r=>liberar=r);const n=requests.length;$('atualizar-proprietario').click();$('atualizar-proprietario').click();assert.equal($('sair-proprietario').disabled,true);liberar();segurar=null;await esperar();assert.equal(requests.length,n+1,'Atualização não duplica solicitações');
 negado=true;$('atualizar-proprietario').click();await esperar();assert.equal($('gestao-proprietario').hidden,true);assert.equal($('auditoria-proprietario').children.length,0);negado=false;
 await login();$('sair-proprietario').click();await esperar();assert.equal($('gestao-proprietario').hidden,true);assert.equal($('lista-barbearias').children.length,0);assert.ok(requests.some(x=>x.url.endsWith('/logout')));
 dom.window.close();console.log('OK: login restrito, paginação, busca, estados vazios, edição, conflito, perda da resposta, suspensão/reativação, auditoria, HTML seguro, falha de rede, sessão em memória, saída e revogação.');
})().catch(e=>{console.error(e);process.exitCode=1;});
