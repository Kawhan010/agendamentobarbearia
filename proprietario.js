(()=>{
  'use strict';
  const $=id=>document.getElementById(id),form=$('form-editar-barbearia');
  let token='',ocupado=false,editada=null,pagina=0,cursores=[null],proximo=null,lojas=[],busca='',situacao='todas';
  let excluindo=null,pedidoExclusao='';
  const aviso=texto=>{$('aviso-proprietario').textContent=texto;};
  function el(tag,texto,classe){const e=document.createElement(tag);if(texto!=null)e.textContent=texto;if(classe)e.className=classe;return e;}
  function limpar(){token='';lojas=[];editada=null;excluindo=null;pedidoExclusao='';pagina=0;cursores=[null];proximo=null;busca='';situacao='todas';$('gestao-proprietario').hidden=true;$('acesso-proprietario').hidden=false;$('sair-proprietario').hidden=true;$('conta-proprietario').textContent='';$('limpeza-exclusoes').hidden=true;for(const id of ['lista-barbearias','totais-proprietario','auditoria-proprietario'])$(id).replaceChildren();$('busca-proprietario').reset();form.reset();$('form-excluir-barbearia').reset();for(const id of ['editar-barbearia','excluir-barbearia'])if($(id).open)$(id).close();}
  async function rpc(nome,body){
    const c=window.AGENDA_CONFIG;
    if(!token)throw new Error('Entre com a conta autorizada.');
    const r=await fetch(c.url+'/rest/v1/rpc/'+nome,{method:'POST',headers:{apikey:c.publicKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
    const data=await r.json().catch(()=>null);
    if(r.status===401||r.status===403||data?.code==='42501'){limpar();throw new Error(r.status===401?'Sua sessão expirou. Entre novamente.':'Esta conta não tem acesso à área do proprietário.');}
    if(!r.ok){const e=new Error(data?.message||'Não foi possível consultar o sistema. Tente novamente.');e.code=data?.code;throw e;}
    return data;
  }
  function bloquear(valor){ocupado=valor;for(const id of ['sair-proprietario','atualizar-proprietario','fechar-edicao','abrir-exclusao','cancelar-exclusao','concluir-limpeza'])$(id).disabled=valor;for(const e of $('busca-proprietario').elements)e.disabled=valor;$('campos-edicao').disabled=valor;$('campos-exclusao').disabled=valor;validarConfirmacao();for(const e of $('lista-barbearias').querySelectorAll('button'))e.disabled=valor;$('lojas-anterior').disabled=valor||pagina===0;$('lojas-proxima').disabled=valor||!proximo;$('lista-barbearias').setAttribute('aria-busy',String(valor));}
  function linkLoja(loja){const u=new URL('index.html',location.href);u.search=new URLSearchParams({barbearia:loja.slug});u.hash='';return u.href;}
  function desenhar(data){
    lojas=data.lojas;proximo=data.proximo;$('conta-proprietario').textContent='Conectado como '+data.email;
    $('limpeza-exclusoes').hidden=!data.limpeza_pendente;
    $('totais-proprietario').replaceChildren();
    for(const [chave,titulo] of [['barbearias','Barbearias'],['ativas','Barbearias ativas'],['suspensas','Barbearias suspensas'],['profissionais','Barbeiros ativos'],['agendamentos_hoje','Atendimentos hoje']]){const c=el('div',null,'indicador');c.append(el('span',titulo),el('strong',String(data.totais[chave])));$('totais-proprietario').append(c);}
    $('lista-barbearias').replaceChildren();
    for(const loja of lojas){
      const c=el('article',null,'loja'),topo=el('div',null,'loja-cabecalho'),letra=el('span',loja.nome.charAt(0).toUpperCase(),'avatar avatar-letra');letra.setAttribute('aria-hidden','true');
      if(/^https:\/\//.test(loja.logo||'')){const img=el('img',null,'avatar');img.src=loja.logo;img.alt='';img.loading='lazy';img.referrerPolicy='no-referrer';img.onerror=()=>img.replaceWith(letra);topo.append(img);}else topo.append(letra);
      const titulo=el('div');titulo.append(el('h4',loja.nome),el('span',loja.ativa?'Agendamentos ativos':'Agendamentos suspensos','estado'+(loja.ativa?'':' suspensa')));topo.append(titulo);c.append(topo);
      const dl=el('dl');for(const [label,valor] of [['Link',loja.slug],['Conta responsável',loja.dono_email||'Sem conta vinculada'],['WhatsApp','+'+loja.whatsapp]])dl.append(el('dt',label),el('dd',valor));c.append(dl);
      const numeros=el('div',null,'numeros-loja');for(const [label,valor] of [[loja.profissionais===1?'barbeiro':'barbeiros',loja.profissionais],[loja.servicos===1?'serviço':'serviços',loja.servicos],['hoje',loja.agendamentos_hoje]]){const n=el('span');n.append(el('strong',String(valor)),document.createTextNode(' '+label));numeros.append(n);}c.append(numeros);
      const acoes=el('div',null,'acoes-loja'),b=el('button','Gerenciar');b.type='button';b.setAttribute('aria-label','Gerenciar '+loja.nome);b.onclick=()=>abrir(loja,b);const a=el('a','Abrir agendamento');a.href=linkLoja(loja);a.target='_blank';a.rel='noopener noreferrer';acoes.append(b,a);c.append(acoes);$('lista-barbearias').append(c);
    }
    if(!lojas.length)$('lista-barbearias').append(el('p','Nenhuma barbearia encontrada. Ajuste a busca ou os filtros.','vazio'));
    $('resultado-proprietario').textContent=data.encontradas+' encontrada'+(data.encontradas===1?'':'s');$('pagina-proprietario').textContent='Página '+(pagina+1);
    $('auditoria-proprietario').replaceChildren();
    for(const item of data.auditoria){const li=el('li');li.append(el('strong',item.barbearia));const mudancas=[];if(item.depois.excluida)mudancas.push('Barbearia excluída definitivamente');else{if(item.antes.nome!==item.depois.nome)mudancas.push('Nome: '+item.antes.nome+' → '+item.depois.nome);if(item.antes.whatsapp!==item.depois.whatsapp)mudancas.push('WhatsApp: +'+item.antes.whatsapp+' → +'+item.depois.whatsapp);if(item.antes.ativa!==item.depois.ativa)mudancas.push(item.depois.ativa?'Novos agendamentos reativados':'Novos agendamentos suspensos');}li.append(el('p',mudancas.join(' · ')),el('p','Por '+item.autor_email));const time=el('time',new Date(item.criado_em).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}));time.dateTime=item.criado_em;li.append(time);$('auditoria-proprietario').append(li);}
    if(!data.auditoria.length)$('auditoria-proprietario').append(el('li','As alterações feitas aqui aparecerão neste histórico.'));
  }
  async function carregar(){const data=await rpc('saas_proprietario_listar',{busca,situacao,apos:cursores[pagina]});desenhar(data);return data;}
  async function executar(fn){if(ocupado)return;bloquear(true);try{await fn();}catch(e){aviso(e instanceof TypeError?'Não foi possível conectar. Confira sua internet e tente novamente.':e.message);}finally{bloquear(false);}}
  $('login-proprietario').onsubmit=e=>{e.preventDefault();executar(async()=>{
    const f=e.target,b=f.querySelector('button');b.disabled=true;aviso('Verificando seu acesso…');
    try{const s=await SaaS.auth('token?grant_type=password',{email:f.elements.email.value.trim(),password:f.elements.password.value});token=s.access_token;await carregar();f.reset();$('acesso-proprietario').hidden=true;$('gestao-proprietario').hidden=false;$('sair-proprietario').hidden=false;aviso('Todas as barbearias estão disponíveis para gerenciamento.');}
    catch(e){limpar();throw e;}finally{f.elements.password.value='';b.disabled=false;}
  });};
  $('sair-proprietario').onclick=()=>executar(async()=>{const atual=token;limpar();aviso('Você saiu da área do proprietário.');try{await SaaS.auth('logout',{},atual);}catch{}$('login-proprietario').elements.email.focus();});
  $('busca-proprietario').onsubmit=e=>{e.preventDefault();executar(async()=>{const anterior={busca,situacao,pagina,cursores};busca=e.target.elements.busca.value.trim();situacao=e.target.elements.situacao.value;pagina=0;cursores=[null];try{await carregar();aviso('Busca atualizada.');}catch(err){({busca,situacao,pagina,cursores}=anterior);throw err;}});};
  $('atualizar-proprietario').onclick=()=>executar(async()=>{await carregar();aviso('Dados atualizados.');});
  async function navegar(delta){const anterior=pagina;if(delta>0)cursores[pagina+1]=proximo;pagina+=delta;try{await carregar();}catch(e){pagina=anterior;throw e;}}
  $('lojas-anterior').onclick=()=>{if(pagina>0)executar(()=>navegar(-1));};$('lojas-proxima').onclick=()=>{if(proximo)executar(()=>navegar(1));};
  let origemEdicao=null;
  function abrir(loja,origem){if(ocupado)return;editada={...loja};origemEdicao=origem;form.elements.nome.value=loja.nome;form.elements.whatsapp.value=loja.whatsapp;form.elements.ativa.value=String(loja.ativa);$('identidade-edicao').textContent=loja.slug+' · '+(loja.dono_email||'Sem conta vinculada');$('aviso-edicao').textContent='';$('editar-barbearia').showModal();}
  $('fechar-edicao').onclick=()=>{if(!ocupado)$('editar-barbearia').close();};$('editar-barbearia').addEventListener('cancel',e=>{if(ocupado)e.preventDefault();});$('editar-barbearia').addEventListener('close',()=>{editada=null;origemEdicao?.focus();});
  function telefone(valor){let n=valor.replace(/\D/g,'');if(n.length===10||n.length===11)n='55'+n;if(!/^55\d{10,11}$/.test(n))throw new Error('Informe o WhatsApp com DDD.');return n;}
  form.onsubmit=e=>{e.preventDefault();executar(async()=>{
    if(!editada)return;const atual={...editada};$('aviso-edicao').textContent='';
    try{
      const nome=form.elements.nome.value.trim(),whatsapp=telefone(form.elements.whatsapp.value),ativa=form.elements.ativa.value==='true';
      if(!nome)throw new Error('Informe o nome da barbearia.');
      await rpc('saas_proprietario_salvar',{loja:atual.id,nome_novo:nome,whatsapp_novo:whatsapp,ativa_nova:ativa,nome_anterior:atual.nome,whatsapp_anterior:atual.whatsapp,ativa_anterior:atual.ativa});
      $('editar-barbearia').close();
      try{pagina=0;cursores=[null];await carregar();aviso('Barbearia atualizada. A alteração foi registrada no histórico.');}
      catch(err){if(token){$('lista-barbearias').replaceChildren(el('p','Alteração salva. Clique em Atualizar dados para consultar a lista.','vazio'));proximo=null;aviso('Alteração salva. Não foi possível atualizar a lista; use Atualizar dados.');}else throw err;}
    }catch(err){
      // Repetir o mesmo salvamento é idempotente no banco. Não presume que uma falha de conexão desfez a alteração.
      const mensagem=err instanceof TypeError?'A resposta não chegou. Tente salvar novamente para confirmar a alteração.':err.message;
      $('aviso-edicao').textContent=mensagem;aviso(mensagem);
    }
  });};
  function validarConfirmacao(){$('confirmar-exclusao').disabled=ocupado||!excluindo||$('confirmar-nome-exclusao').value!==excluindo.nome;}
  $('confirmar-nome-exclusao').oninput=validarConfirmacao;
  $('abrir-exclusao').onclick=()=>{
    if(ocupado||!editada||!token)return;excluindo={...editada};pedidoExclusao=crypto.randomUUID();$('editar-barbearia').close();
    $('form-excluir-barbearia').reset();$('nome-exclusao').textContent=excluindo.nome;$('aviso-exclusao').textContent='';validarConfirmacao();$('excluir-barbearia').showModal();$('confirmar-nome-exclusao').focus();
  };
  $('cancelar-exclusao').onclick=()=>{if(!ocupado)$('excluir-barbearia').close();};
  $('excluir-barbearia').addEventListener('cancel',e=>{if(ocupado)e.preventDefault();});
  $('excluir-barbearia').addEventListener('close',()=>{excluindo=null;pedidoExclusao='';$('form-excluir-barbearia').reset();validarConfirmacao();origemEdicao?.focus();});
  async function limparArquivosExcluidos(){
    let anterior='';
    for(;;){
      const arquivos=await rpc('saas_proprietario_limpezas',{});if(!arquivos.length){$('limpeza-exclusoes').hidden=true;return;}
      const identidade=JSON.stringify(arquivos);if(identidade===anterior)throw new Error('Algumas imagens ainda aguardam remoção. Use Concluir remoção das imagens para tentar novamente.');anterior=identidade;
      const grupos=new Map();for(const a of arquivos){if(!['fotos-profissionais','imagens-servicos','fundos-barbearias','logos-barbearias'].includes(a.bucket))throw new Error('Não foi possível concluir a remoção das imagens.');if(!grupos.has(a.bucket))grupos.set(a.bucket,[]);grupos.get(a.bucket).push(a.caminho);}
      for(const [bucket,prefixes] of grupos){const c=window.AGENDA_CONFIG,r=await fetch(c.url+'/storage/v1/object/'+bucket,{method:'DELETE',headers:{apikey:c.publicKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({prefixes})});if(!r.ok)throw new Error('Não foi possível remover todas as imagens. Use Concluir remoção das imagens para tentar novamente.');}
    }
  }
  $('concluir-limpeza').onclick=()=>executar(async()=>{await limparArquivosExcluidos();aviso('Remoção das imagens concluída.');});
  $('form-excluir-barbearia').onsubmit=e=>{e.preventDefault();if(ocupado)return;
    if(!excluindo||$('confirmar-nome-exclusao').value!==excluindo.nome){$('aviso-exclusao').textContent='Digite o nome exato da barbearia para confirmar.';return;}
    executar(async()=>{
      const loja={...excluindo},pedido=pedidoExclusao;$('aviso-exclusao').textContent='Excluindo barbearia…';
      try{await rpc('saas_proprietario_excluir',{loja:loja.id,confirmacao:$('confirmar-nome-exclusao').value,pedido});}
      catch(err){const mensagem=err instanceof TypeError?'A resposta não chegou. Confirme novamente para verificar a mesma exclusão.':err.message;$('aviso-exclusao').textContent=mensagem;aviso(mensagem);return;}
      $('excluir-barbearia').close();let pendente=false;
      try{await limparArquivosExcluidos();}catch{pendente=true;}
      if(!token){aviso('Barbearia '+loja.nome+' excluída. Entre novamente para conferir a remoção das imagens.');return;}
      try{pagina=0;cursores=[null];await carregar();}catch{if(!token){aviso('Barbearia '+loja.nome+' excluída. Entre novamente para consultar a lista.');return;}$('lista-barbearias').replaceChildren(el('p','Barbearia excluída. Use Atualizar dados para consultar a lista.','vazio'));proximo=null;}
      if(pendente)$('limpeza-exclusoes').hidden=false;
      aviso('Barbearia '+loja.nome+' excluída definitivamente.'+(pendente?' Algumas imagens aguardam remoção; use o botão Concluir remoção das imagens.':''));
    });
  };
  // Sessões da área do proprietário ficam apenas em memória e não são incluídas no atalho.
  if(location.hash){history.replaceState(null,'',location.pathname+location.search);aviso('Entre com e-mail e senha para acessar a área do proprietário.');}
  bloquear(false);
})();
