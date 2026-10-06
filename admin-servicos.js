window.ServicosPainel=(()=>{
  let editado=null,arquivo=null,previa='',removida=false,preparando=false,salvando=false,versao=0,idNovo='';
  const form=$('form-servico'),campos=$('campos-servico');
  const status=texto=>{$('status-servico').textContent=texto;};
  function liberar(){if(previa)URL.revokeObjectURL(previa);previa='';}
  function mostrar(){
    const src=previa||ImagensServicos.url({barbearia_id:lojaAtual?.id,imagem_arquivo:removida?'':editado?.imagem_arquivo,imagem:form.elements.imagem.value.trim()});
    const img=$('previa-imagem-servico');img.hidden=!src;if(src)img.src=src;else img.removeAttribute('src');
    $('sem-imagem-servico').hidden=Boolean(src);$('remover-imagem-servico').hidden=!src;form.elements.imagem.disabled=Boolean(arquivo);
  }
  function limpar(){
    if(salvando)throw new Error('Aguarde o serviço ser salvo.');
    ++versao;preparando=false;arquivo=null;editado=null;idNovo='';removida=false;liberar();form.reset();form.elements.id.value='';
    $('titulo-editor').textContent='Adicionar serviço';status('A imagem é opcional e aparece no catálogo para o cliente.');mostrar();
  }
  function editar(servico){
    limpar();editado={...servico};
    for(const campo of ['id','nome','descricao','preco','categoria','imagem','duracao_minutos'])form.elements[campo].value=servico[campo]??(campo==='duracao_minutos'?40:'');
    $('titulo-editor').textContent='Editar serviço';mostrar();form.elements.nome.focus();
  }
  form.elements.imagem.oninput=()=>{++versao;preparando=false;arquivo=null;removida=true;liberar();$('arquivo-imagem-servico').value='';mostrar();status('Salve o serviço para atualizar a imagem.');};
  $('arquivo-imagem-servico').onchange=async e=>{
    const original=e.target.files[0],atual=++versao,sessao=token,loja=lojaAtual?.id;
    preparando=false;arquivo=null;liberar();mostrar();if(!original)return;
    preparando=true;status('Preparando a imagem…');
    try{
      const pronta=await ImagensServicos.preparar(original);
      if(atual!==versao||sessao!==token||loja!==lojaAtual?.id)return;
      arquivo=pronta;previa=URL.createObjectURL(pronta);removida=false;mostrar();status('Prévia pronta. Salve o serviço para publicar a imagem.');
    }catch(e){if(atual===versao){$('arquivo-imagem-servico').value='';status(e.message);}}
    finally{if(atual===versao)preparando=false;}
  };
  $('remover-imagem-servico').onclick=()=>{++versao;preparando=false;arquivo=null;liberar();removida=true;form.elements.imagem.value='';$('arquivo-imagem-servico').value='';mostrar();status('Salve o serviço para confirmar a remoção da imagem.');};
  $('limpar-servico').onclick=limpar;
  async function excluir(caminho,loja,sessao){
    if(!ImagensServicos.caminhoValido(caminho)||!caminho.startsWith(loja+'/'))return;
    const refs=await api('/rest/v1/saas_servicos?select=id&barbearia_id=eq.'+loja+'&imagem_arquivo=eq.'+encodeURIComponent(caminho));if(refs.length)return;
    const r=await fetch(config.url+'/storage/v1/object/'+ImagensServicos.bucket,{method:'DELETE',headers:{apikey:config.publicKey,Authorization:'Bearer '+sessao,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[caminho]})});
    if(!r.ok)throw new Error('Não foi possível limpar a imagem anterior.');
  }
  form.onsubmit=async e=>{
    e.preventDefault();if(salvando)return;
    if(preparando){status('Aguarde a preparação da imagem.');return;}
    const dados={nome:form.elements.nome.value.trim(),descricao:form.elements.descricao.value.trim(),preco:Number(form.elements.preco.value),
      categoria:form.elements.categoria.value,duracao_minutos:Number(form.elements.duracao_minutos.value),
      imagem:arquivo?'':form.elements.imagem.value.trim(),imagem_arquivo:removida?'':editado?.imagem_arquivo||'',ativo:editado?.ativo??true};
    try{
      if(!dados.nome)throw new Error('Informe o nome do serviço.');
      if(!Number.isFinite(dados.preco)||dados.preco<=0)throw new Error('Informe um preço válido.');
      if(!Number.isInteger(dados.duracao_minutos)||dados.duracao_minutos<1||dados.duracao_minutos>1440)throw new Error('Informe um tempo entre 1 e 1440 minutos inteiros.');
      if(dados.imagem&&!ImagensServicos.link(dados.imagem))throw new Error('Use um caminho assets/ ou uma URL HTTPS válida.');
      if(demo){
        if(arquivo)throw new Error('Entre na sua conta para publicar a imagem.');
        const antigo=servicos.find(s=>s.id===editado?.id);if(antigo)Object.assign(antigo,dados);else servicos.push({...dados,id:crypto.randomUUID()});
        limpar();renderServicos();aviso('Demonstração: serviço alterado apenas nesta visualização.');return;
      }
      if(!token||!lojaAtual)throw new Error('Entre na sua conta para salvar o serviço.');
    }catch(e){status(e.message);aviso(e.message);return;}
    const loja=lojaAtual.id,sessao=token,anterior=editado?.imagem_arquivo||'',id=editado?.id||(idNovo||=crypto.randomUUID()),atualizar=Boolean(editado);
    let enviado='',salvo=false;salvando=true;campos.disabled=true;$('sair').disabled=true;
    try{
      if(arquivo){
        enviado=loja+'/'+crypto.randomUUID()+'.'+ImagemFundo.tipos[arquivo.type];dados.imagem_arquivo=enviado;
        const body=new FormData();body.append('cacheControl','31536000');body.append('file',arquivo);status('Enviando a imagem…');
        const r=await fetch(config.url+'/storage/v1/object/'+ImagensServicos.bucket+'/'+enviado,{method:'POST',headers:{apikey:config.publicKey,Authorization:'Bearer '+sessao},body});
        if(!r.ok)throw new Error(r.status===401?'Sessão expirada. Entre novamente.':'Não foi possível enviar a imagem. Confira sua conexão e tente novamente.');
      }
      status('Salvando o serviço…');let rows;
      const filtro='?id=eq.'+id+'&barbearia_id=eq.'+loja+'&imagem_arquivo=eq.'+encodeURIComponent(anterior)+'&imagem=eq.'+encodeURIComponent(editado?.imagem||'')+'&duracao_minutos=eq.'+(editado?.duracao_minutos??40);
      const confere=r=>r.id===id&&Object.entries(dados).every(([campo,valor])=>r[campo]===valor);
      try{rows=await api('/rest/v1/saas_servicos'+(atualizar?filtro:''),atualizar?'PATCH':'POST',atualizar?dados:{...dados,id,barbearia_id:loja});}
      catch(e){rows=await api('/rest/v1/saas_servicos?select=*&id=eq.'+id+'&barbearia_id=eq.'+loja).catch(()=>[]);if(!rows.some(confere))throw e;}
      if(!rows?.some(confere))throw new Error('O serviço mudou em outro lugar. Atualize o painel e tente novamente.');
      salvo=true;
      if(sessao!==token||loja!==lojaAtual?.id)throw new Error('Serviço salvo. Entre novamente para consultar.');
      let limpezaPendente=false;
      if(anterior&&anterior!==dados.imagem_arquivo)try{await excluir(anterior,loja,sessao);}catch{limpezaPendente=true;}
      salvando=false;limpar();salvando=true;
      let recarregou=true;try{await carregar();}catch{recarregou=false;}
      const mensagem='Serviço salvo: '+dados.duracao_minutos+' minutos.'+(limpezaPendente?' A imagem anterior não pôde ser limpa.':'')+(!recarregou?' Atualize o painel para consultar o catálogo.':'');
      status(mensagem);aviso(mensagem);
    }catch(e){
      if(enviado&&!salvo&&sessao===token&&loja===lojaAtual?.id)try{await excluir(enviado,loja,sessao);}catch{}
      status(e.message);aviso(e.message);
    }finally{salvando=false;campos.disabled=false;$('sair').disabled=false;}
  };
  $('sair').addEventListener('click',()=>{if(!salvando)limpar();});
  limpar();return {editar,limpar,get ocupado(){return salvando;}};
})();
