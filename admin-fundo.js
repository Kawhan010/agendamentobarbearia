window.FundoPainel=(()=>{
  let arquivo=null,previa='',remover=false,versao=0,preparando=false,salvando=false;
  const status=mensagem=>{$('status-imagem-fundo').textContent=mensagem;};
  function liberar(){if(previa)URL.revokeObjectURL(previa);previa='';}
  function reaplicar(){
    const src=ImagemFundo.aplicar(remover?{}:lojaAtual||{},previa);
    const img=$('previa-imagem-fundo');img.hidden=!src;if(src)img.src=src;else img.removeAttribute('src');
    $('sem-imagem-fundo').hidden=Boolean(src);$('remover-imagem-fundo').hidden=!src;
  }
  function carregar(){
    ++versao;preparando=false;arquivo=null;remover=false;liberar();$('form-imagem-fundo').reset();reaplicar();
    status('A imagem aparece no seu painel e nas páginas de agendamento.');
  }
  $('arquivo-imagem-fundo').onchange=async e=>{
    const original=e.target.files[0],atual=++versao,sessao=token,loja=lojaAtual?.id;
    preparando=false;arquivo=null;liberar();remover=false;reaplicar();
    if(!original)return;
    preparando=true;status('Preparando a imagem…');
    try{
      const pronta=await ImagemFundo.preparar(original);
      if(atual!==versao||sessao!==token||loja!==lojaAtual?.id)return;
      arquivo=pronta;previa=URL.createObjectURL(pronta);reaplicar();status('Prévia pronta. Clique em Salvar imagem de fundo para publicar.');
    }catch(e){if(atual===versao){$('arquivo-imagem-fundo').value='';status(e.message);}}
    finally{if(atual===versao)preparando=false;}
  };
  $('remover-imagem-fundo').onclick=()=>{++versao;preparando=false;arquivo=null;liberar();remover=true;$('arquivo-imagem-fundo').value='';reaplicar();status('Clique em Salvar imagem de fundo para confirmar a remoção.');};
  $('descartar-imagem-fundo').onclick=carregar;
  async function excluir(caminho,loja,sessao){
    if(!ImagemFundo.caminhoValido(caminho)||!caminho.startsWith(loja+'/'))return;
    const refs=await api('/rest/v1/saas_barbearias?select=id&id=eq.'+loja+'&imagem_fundo=eq.'+encodeURIComponent(caminho));if(refs.length)return;
    const r=await fetch(config.url+'/storage/v1/object/'+ImagemFundo.bucket,{method:'DELETE',headers:{apikey:config.publicKey,Authorization:'Bearer '+sessao,'Content-Type':'application/json'},body:JSON.stringify({prefixes:[caminho]})});
    if(!r.ok)throw new Error('Não foi possível limpar o arquivo anterior.');
  }
  $('form-imagem-fundo').onsubmit=async e=>{
    e.preventDefault();if(salvando)return;
    if(demo||!lojaAtual||!token){status('Entre na sua conta para salvar a imagem de fundo.');return;}
    if(preparando){status('Aguarde a preparação da imagem.');return;}
    if(!arquivo&&!remover){status('Escolha uma imagem ou use Remover imagem.');return;}
    const loja=lojaAtual.id,sessao=token,anterior=lojaAtual.imagem_fundo||'',campos=$('campos-imagem-fundo');
    salvando=true;campos.disabled=true;$('campos-cores').disabled=true;$('sair').disabled=true;
    let caminho=remover?'':anterior,enviado='',salvo=false;
    try{
      if(arquivo){
        enviado=loja+'/'+crypto.randomUUID()+'.'+ImagemFundo.tipos[arquivo.type];caminho=enviado;
        const body=new FormData();body.append('cacheControl','31536000');body.append('file',arquivo);
        status('Enviando a imagem…');
        const r=await fetch(config.url+'/storage/v1/object/'+ImagemFundo.bucket+'/'+caminho,{method:'POST',headers:{apikey:config.publicKey,Authorization:'Bearer '+sessao},body});
        if(!r.ok)throw new Error(r.status===401?'Sessão expirada. Entre novamente.':'Não foi possível enviar a imagem. Confira sua conexão e tente novamente.');
      }
      status('Salvando a imagem de fundo…');
      let rows;
      try{rows=await api('/rest/v1/saas_barbearias?id=eq.'+loja+'&imagem_fundo=eq.'+encodeURIComponent(anterior),'PATCH',{imagem_fundo:caminho});}
      catch(e){rows=await api('/rest/v1/saas_barbearias?select=id,imagem_fundo&id=eq.'+loja).catch(()=>[]);if(!rows.some(r=>r.id===loja&&r.imagem_fundo===caminho))throw e;}
      if(!rows?.some(r=>r.id===loja&&r.imagem_fundo===caminho))throw new Error('A personalização mudou em outro lugar. Atualize o painel antes de salvar novamente.');
      salvo=true;
      if(sessao!==token||loja!==lojaAtual?.id)throw new Error('Imagem salva. Entre novamente para consultar.');
      lojaAtual.imagem_fundo=caminho;carregar();
      let limpezaPendente=false;
      if(anterior&&anterior!==caminho)try{await excluir(anterior,loja,sessao);}catch{limpezaPendente=true;}
      status((caminho?'Imagem de fundo salva.':'Imagem de fundo removida.')+(limpezaPendente?' O arquivo anterior não pôde ser limpo.':''));
    }catch(e){
      if(enviado&&!salvo&&sessao===token&&loja===lojaAtual?.id)try{await excluir(enviado,loja,sessao);}catch{}
      status(e.message);
    }finally{salvando=false;campos.disabled=false;$('campos-cores').disabled=false;$('sair').disabled=false;}
  };
  $('sair').addEventListener('click',()=>{++versao;preparando=false;arquivo=null;remover=false;liberar();$('form-imagem-fundo').reset();ImagemFundo.aplicar({});$('previa-imagem-fundo').hidden=true;$('previa-imagem-fundo').removeAttribute('src');$('sem-imagem-fundo').hidden=false;status('');});
  carregar();
  return {carregar,reaplicar};
})();
