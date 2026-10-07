window.AtalhoAgenda=(()=>{
  let pedido=null,solicitando=false,instalado=Boolean(navigator.standalone||window.matchMedia?.('(display-mode: standalone)').matches),hrefManifest='';
  const base=new URL('./',location.href);base.username='';base.password='';
  const painel=location.pathname.endsWith('/admin.html'),params=new URLSearchParams(location.search),slug=params.get('barbearia');
  const valido=painel||!params.has('barbearia')||/^[a-z0-9-]{3,60}$/.test(slug||'');
  const destino=new URL(painel?'admin.html':'index.html',base);if(!painel&&slug&&valido)destino.searchParams.set('barbearia',slug);
  const acesso=document.createElement('div');acesso.className='acesso-atalho';
  const abrir=document.createElement('button');abrir.type='button';abrir.id='criar-atalho';abrir.textContent='Criar atalho';abrir.setAttribute('aria-haspopup','dialog');acesso.append(abrir);
  (document.querySelector('main')||document.body).prepend(acesso);
  const dialog=document.createElement('dialog');dialog.id='dialog-atalho';dialog.className='dialog-atalho';dialog.setAttribute('aria-labelledby','titulo-atalho');dialog.setAttribute('aria-describedby','explicacao-atalho');
  dialog.innerHTML=`<div class="topo-atalho"><h2 id="titulo-atalho">Criar atalho</h2><button type="button" id="fechar-atalho" aria-label="Fechar instruções do atalho">Fechar</button></div>
    <p id="explicacao-atalho">Abra a agenda com um toque pela tela inicial do celular ou pela área de trabalho.</p>
    <p class="destino-atalho"><strong id="nome-atalho"></strong><br><a id="link-atalho" target="_blank" rel="noopener noreferrer"></a></p>
    <button type="button" id="instalar-atalho" class="primario-atalho" hidden>Instalar neste aparelho</button>
    <p id="status-atalho" role="status"></p>
    <label class="plataforma-atalho" for="plataforma-atalho">Onde quer criar o atalho?<select id="plataforma-atalho"><option value="android">Android</option><option value="ios">iPhone ou iPad</option><option value="computador">Computador</option></select></label>
    <section data-instrucoes="android"><h3>No Android</h3><ol><li>Abra este link no Chrome ou no navegador do celular.</li><li>Toque no menu <strong>⋮</strong> e procure <strong>Instalar aplicativo</strong> ou <strong>Adicionar à tela inicial</strong>.</li><li>Confirme o nome e toque em <strong>Instalar</strong> ou <strong>Adicionar</strong>.</li></ol></section>
    <section data-instrucoes="ios" hidden><h3>No iPhone ou iPad</h3><ol><li>Abra este link no <strong>Safari</strong>.</li><li>Toque em <strong>Compartilhar</strong> e, se necessário, em <strong>Mais</strong>.</li><li>Escolha <strong>Adicionar à Tela de Início</strong> e confirme em <strong>Adicionar</strong>.</li></ol></section>
    <section data-instrucoes="computador" hidden><h3>Na área de trabalho</h3><p>No Windows, baixe o atalho e mova o arquivo da pasta Downloads para a área de trabalho.</p><button type="button" id="baixar-atalho">Baixar atalho para Windows</button><details><summary>Instalar pelo navegador</summary><p><strong>Chrome:</strong> menu ⋮ → Transmitir, salvar e compartilhar → Instalar página como app. Depois, em chrome://apps, clique com o botão direito no aplicativo e escolha Criar atalho.</p><p><strong>Edge:</strong> menu … → Mais ferramentas → Aplicativos → Instalar este site como aplicativo. Depois, em edge://apps, abra Detalhes e escolha Criar atalho na área de trabalho.</p><p><strong>Safari no Mac:</strong> menu Arquivo → Adicionar ao Dock.</p></details></section>
    <p class="nota-atalho">O atalho abre seu link. Para consultar e atualizar agendamentos, é preciso estar conectado à internet.</p>`;
  document.body.append(dialog);
  const el=id=>document.getElementById(id),status=texto=>{el('status-atalho').textContent=texto;},botao=el('instalar-atalho');
  const ua=navigator.userAgent||'';
  const ios=/iPhone|iPad|iPod/.test(ua)||(/Mac/.test(navigator.platform||'')&&navigator.maxTouchPoints>1);
  el('plataforma-atalho').value=ios?'ios':/Android/.test(ua)?'android':'computador';
  function instrucoes(){for(const secao of dialog.querySelectorAll('[data-instrucoes]'))secao.hidden=secao.dataset.instrucoes!==el('plataforma-atalho').value;}
  function disponibilidade(){botao.hidden=instalado||!pedido||!valido;botao.disabled=solicitando;}
  function atualizar(){
    const loja=!painel&&window.SaaS?.loja?.slug===slug?SaaS.loja:null;
    const nome=painel?'Painel do barbeiro':loja?.nome||(!painel&&slug&&valido?'Agendamento · '+slug:'WK Agendamento');
    el('nome-atalho').textContent=nome;el('link-atalho').href=destino.href;el('link-atalho').textContent=destino.href;el('baixar-atalho').disabled=!valido;
    let href='';
    if(valido){
      if(!painel&&slug){
        // GitHub Pages não executa a função de manifestos por barbearia.
        // As instruções e o arquivo .url preservam o link também nesse host.
        if(!location.hostname.endsWith('.github.io')){
          const url=new URL('api/manifest',base);url.search=new URLSearchParams({barbearia:slug,nome});href=url.href;
        }
      }else href=new URL(painel?'app-painel.webmanifest':'app-agendamento.webmanifest',base).href;
    }
    if(href!==hrefManifest){
      hrefManifest=href;let link=document.querySelector('link[rel="manifest"]');
      if(href){if(!link){link=document.createElement('link');link.rel='manifest';document.head.append(link);}link.href=href;}else link?.remove();
    }
    disponibilidade();
  }
  function fechar(){if(dialog.close)dialog.close();else dialog.removeAttribute('open');abrir.focus();}
  abrir.onclick=()=>{
    atualizar();instrucoes();
    status(!valido?'Abra um link de barbearia válido para criar o atalho.':instalado?'Você já está usando ou instalou o aplicativo neste aparelho.':pedido?'A instalação está disponível. Use o botão acima ou siga as instruções abaixo.':'Se o navegador não mostrar a instalação, siga as instruções do seu aparelho abaixo.');
    if(dialog.showModal)dialog.showModal();else dialog.setAttribute('open','');
  };
  el('fechar-atalho').onclick=fechar;el('plataforma-atalho').onchange=instrucoes;
  dialog.addEventListener('click',e=>{const r=dialog.getBoundingClientRect();if(e.target===dialog&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))fechar();});
  window.addEventListener('beforeinstallprompt',e=>{if(!valido)return;e.preventDefault();pedido=e;disponibilidade();if(dialog.open&&!instalado)status('A instalação está disponível. Toque em Instalar neste aparelho.');});
  window.addEventListener('appinstalled',()=>{instalado=true;pedido=null;disponibilidade();status('Aplicativo instalado. Abra pelo ícone no seu aparelho.');});
  window.matchMedia?.('(display-mode: standalone)').addEventListener?.('change',e=>{instalado=e.matches||Boolean(navigator.standalone);disponibilidade();});
  botao.onclick=async()=>{
    if(!pedido||solicitando||instalado)return;
    const atual=pedido;pedido=null;solicitando=true;botao.disabled=true;
    try{
      await atual.prompt();const escolha=await atual.userChoice;
      status(instalado?'Aplicativo instalado. Abra pelo ícone no seu aparelho.':escolha.outcome==='accepted'?'Instalação solicitada. Conclua as etapas mostradas pelo navegador.':'Instalação cancelada. Você pode usar as instruções abaixo.');
    }catch{status('Não foi possível abrir a instalação. Use as instruções do seu aparelho abaixo.');}
    finally{solicitando=false;disponibilidade();}
  };
  el('baixar-atalho').onclick=()=>{
    if(!valido)return;
    const arquivo=new Blob(['[InternetShortcut]\r\nURL='+destino.href+'\r\n'],{type:'application/internet-shortcut'});
    const url=URL.createObjectURL(arquivo),link=document.createElement('a');
    link.href=url;link.download='WK-Agendamento-'+(painel?'Painel':slug&&valido?slug:'Inicio')+'.url';
    document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
    status('Salve o atalho na área de trabalho ou mova o arquivo da pasta Downloads quando o download terminar.');
  };
  const titulo=document.querySelector('title');if(titulo)new MutationObserver(atualizar).observe(titulo,{childList:true,subtree:true,characterData:true});
  atualizar();instrucoes();return {abrir:()=>abrir.click(),get destino(){return destino.href;}};
})();

