window.LogoPainel=(()=>{
  const form=$('form-configuracoes'),campos=$('campos-logo');
  let arquivo=null,previa='',original='',versao=0,preparando=false,salvando=false;
  const status=texto=>{$('status-logo').textContent=texto;};
  function liberar(){if(previa)URL.revokeObjectURL(previa);previa='';}
  function mostrar(){
    const src=previa||ImagemLogo.link(form.elements.logo.value.trim()),img=$('previa-logo');
    img.hidden=!src;if(src)img.src=src;else img.removeAttribute('src');
    $('sem-logo').hidden=Boolean(src);$('remover-logo').hidden=!src;form.elements.logo.disabled=Boolean(arquivo);
  }
  function carregar(){
    ++versao;preparando=false;arquivo=null;liberar();form.reset();original=demo?'':lojaAtual?.logo||'';
    for(const campo of ['nome','whatsapp','logo'])form.elements[campo].value=demo?'':lojaAtual?.[campo]||'';
    status('A logo aparece na página de agendamento da sua barbearia.');mostrar();
  }
  form.elements.logo.oninput=()=>{++versao;preparando=false;arquivo=null;liberar();$('arquivo-logo').value='';mostrar();status('Clique em Salvar dados para atualizar a logo.');};
  $('arquivo-logo').onchange=async e=>{
    const imagem=e.target.files[0],atual=++versao,sessao=token,loja=lojaAtual?.id;
    preparando=false;arquivo=null;liberar();mostrar();if(!imagem)return;
    preparando=true;status('Preparando a logo…');
    try{
      const pronta=await ImagemLogo.preparar(imagem);
      if(atual!==versao||sessao!==token||loja!==lojaAtual?.id)return;
      arquivo=pronta;previa=URL.createObjectURL(pronta);mostrar();status('Prévia pronta. Clique em Salvar dados para publicar a logo.');
    }catch(e){if(atual===versao){$('arquivo-logo').value='';status(e.message);aviso(e.message);}}
    finally{if(atual===versao)preparando=false;}
  };
  $('remover-logo').onclick=()=>{++versao;preparando=false;arquivo=null;liberar();form.elements.logo.value='';$('arquivo-logo').value='';mostrar();status('Clique em Salvar dados para confirmar a remoção da logo.');};
  $('descartar-logo').onclick=carregar;
  async function excluir(logo,loja,sessao){
    const caminho=ImagemLogo.caminho(logo,loja);if(!caminho)return;
    const refs=await api('/rest/v1/saas_barbearias?select=id&logo=eq.'+encodeURIComponent(logo));if(refs.length)return;
    const r=await fetch(config.url+'/storage/v1/object/'+ImagemLogo.bucket,{method:'DELETE',headers:{apikey:config.publicKey,Authorization:'Bearer '+sessao,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[caminho]})});
    if(!r.ok)throw new Error('Não foi possível limpar o arquivo anterior.');
  }
  form.onsubmit=async e=>{
    e.preventDefault();if(salvando)return;
    let dados;
    try{
      if(demo||!lojaAtual||!token)throw new Error('Entre na sua conta para configurar a barbearia.');
      if($('sair').disabled)throw new Error('Aguarde a alteração em andamento.');
      if(preparando)throw new Error('Aguarde a preparação da logo.');
      const logo=form.elements.logo.value.trim(),nome=form.elements.nome.value.trim();
      if(!nome||nome.length>100)throw new Error('Informe o nome da barbearia, com até 100 caracteres.');
      if(!arquivo&&logo&&!ImagemLogo.link(logo))throw new Error('Use uma URL HTTPS válida para a logo.');
      dados={nome,whatsapp:telefoneLoja(form.elements.whatsapp.value),logo:arquivo?'':logo};
    }catch(e){status(e.message);aviso(e.message);return;}
    const loja=lojaAtual.id,sessao=token,anterior=original;
    const bloqueados=[campos,$('campos-cores'),$('campos-imagem-fundo'),$('campos-profissional'),$('campos-servico'),$('sair')].filter(Boolean).map(el=>({el,disabled:el.disabled}));
    salvando=true;bloqueados.forEach(({el})=>el.disabled=true);
    let enviada='',salvo=false;
    try{
      if(arquivo){
        const caminho=loja+'/'+crypto.randomUUID()+'.'+ImagemLogo.tipos[arquivo.type];enviada=ImagemLogo.url(caminho);dados.logo=enviada;
        const body=new FormData();body.append('cacheControl','31536000');body.append('file',arquivo);status('Enviando a logo…');
        const r=await fetch(config.url+'/storage/v1/object/'+ImagemLogo.bucket+'/'+caminho,{method:'POST',headers:{apikey:config.publicKey,Authorization:'Bearer '+sessao},body});
        if(!r.ok)throw new Error(r.status===401?'Sessão expirada. Entre novamente.':'Não foi possível enviar a logo. Confira sua conexão e tente novamente.');
      }
      status('Salvando os dados…');let rows;
      const confere=r=>r.id===loja&&Object.entries(dados).every(([campo,valor])=>r[campo]===valor);
      try{rows=await api('/rest/v1/saas_barbearias?id=eq.'+loja+'&logo=eq.'+encodeURIComponent(anterior),'PATCH',dados);}
      catch(e){rows=await api('/rest/v1/saas_barbearias?select=*&id=eq.'+loja).catch(()=>[]);if(!rows.some(confere))throw e;}
      if(!rows?.some(confere))throw new Error('A logo mudou em outro lugar. Atualize o painel e tente novamente.');
      salvo=true;
      if(sessao!==token||loja!==lojaAtual?.id)throw new Error('Dados salvos. Entre novamente para consultar.');
      Object.assign(lojaAtual,rows.find(confere));carregar();
      $('nome-barbearia').textContent=lojaAtual.nome;document.querySelector('.admin-topo small').textContent=lojaAtual.nome;
      let limpezaPendente=false;
      if(anterior&&anterior!==dados.logo)try{await excluir(anterior,loja,sessao);}catch{limpezaPendente=true;}
      const mensagem='Dados da barbearia salvos.'+(limpezaPendente?' O arquivo da logo anterior não pôde ser limpo.':'');
      status(mensagem);aviso(mensagem);
    }catch(e){
      if(enviada&&!salvo&&sessao===token&&loja===lojaAtual?.id)try{await excluir(enviada,loja,sessao);}catch{}
      status(e.message);aviso(e.message);
    }finally{salvando=false;bloqueados.forEach(({el,disabled})=>el.disabled=disabled);}
  };
  $('sair').addEventListener('click',()=>{if(!salvando)carregar();});
  carregar();return {carregar,get ocupado(){return salvando;}};
})();
