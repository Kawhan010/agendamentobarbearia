const $ = id => document.getElementById(id);
const config = window.AGENDA_CONFIG;
let token = '', demo = false, lojaAtual = null;
let pausado = false, intervalosProntos = false;
let servicos = [], expediente = [], bloqueios = [];
let reservasExibidas=[], dataAgendaExibida=null, versaoAgenda=0, limpandoAgenda=false, confirmandoAgenda=false, erroAgenda=false;
const aviso = mensagem => { $('aviso').textContent = mensagem; };
const semana = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
async function api(path, method = 'GET', body) {
  if(path.startsWith('/rest/v1/') && !path.startsWith('/rest/v1/rpc/')) {
    const match=path.match(/^\/rest\/v1\/([^?]+)(.*)$/);
    if(['servicos','expediente','bloqueios','reservas','controle_agenda'].includes(match[1])) {
      if(!lojaAtual)throw new Error('Selecione sua barbearia.');
      path='/rest/v1/saas_'+match[1]+match[2]+(match[2]?'&':'?')+'barbearia_id=eq.'+lojaAtual.id;
      if(method==='POST')body={...body,barbearia_id:lojaAtual.id};
    }
  }
  const response = await fetch(config.url + path, {method, headers:{apikey:config.publicKey, Authorization:'Bearer ' + token, 'Content-Type':'application/json', Prefer:'return=representation'}, ...(body ? {body:JSON.stringify(body)} : {})});
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(response.status === 401 ? 'Sessão expirada. Saia e entre novamente.' : data?.message || 'Não foi possível concluir. Confira sua conexão e a permissão do usuário.');
  return data;
}
function el(tag, text, className) { const n=document.createElement(tag); n.textContent=text; if(className)n.className=className; return n; }
function acao(text, fn){ const b=el('button',text); b.type='button'; b.onclick=async()=>{b.disabled=true;try{await fn();}catch(e){aviso(e.message);}finally{b.disabled=false;}};return b; }
function linha(nome, detalhe, botoes=[]) { const n=el('article','','linha-item'); const info=el('div','');info.append(el('strong',nome),el('p',detalhe));const a=el('div','','acoes-item');a.append(...botoes);n.append(info,a);return n; }
async function salvar(tabela, id, dados) {
  if(demo) { aviso('Demonstração: alterações apenas nesta visualização, sem salvar no banco.'); return; }
  const result=await api('/rest/v1/'+tabela+(id?'?id=eq.'+encodeURIComponent(id):''),id?'PATCH':'POST',dados);
  if(!result?.length)throw new Error('Nenhuma alteração foi salva. Verifique a autorização do barbeiro.');
  aviso('Alteração salva.');
}
async function carregar(){
  if(!demo){[servicos,expediente,bloqueios]=await Promise.all([api('/rest/v1/servicos?select=*&order=preco'),api('/rest/v1/expediente?select=*&order=id'),api('/rest/v1/bloqueios?select=*&order=data')]);}
  await carregarPausa();
  renderServicos();renderExpediente();renderBloqueios();await renderAgenda();if(!demo)await carregarProfissionais();
}
function renderServicos(){
  $('lista-servicos').replaceChildren();
  servicos.forEach(s=>{$('lista-servicos').append(linha(s.nome,Number(s.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' • '+(s.duracao_minutos??40)+' min • '+s.categoria+(s.ativo?'':' • Inativo'),[
    acao('Editar',()=>{if(window.ServicosPainel){ServicosPainel.editar(s);return;}const f=$('form-servico');for(const key of ['id','nome','descricao','preco','categoria','imagem'])f.elements[key].value=s[key]??'';$('titulo-editor').textContent='Editar serviço';f.elements.nome.focus();}),
    acao(s.ativo?'Remover do catálogo':'Reativar',async()=>{if(window.ServicosPainel?.ocupado)throw new Error('Aguarde o serviço ser salvo.');await salvar('servicos',s.id,{ativo:!s.ativo});if(demo)s.ativo=!s.ativo;await carregar();})]));const img=window.ImagensServicos?.imagem(s);if(img)$('lista-servicos').lastElementChild.firstElementChild.prepend(img);});
}
async function carregarPausa() {
  intervalosProntos = demo || expediente.every(d => 'intervalo_inicio' in d);
  if (!demo) {
    try {
      const rows = await api('/rest/v1/controle_agenda?select=pausado&id=eq.1');
      if (!rows?.length) throw new Error('Configuração ausente');
      pausado = rows[0].pausado;
    } catch {
      $('estado-pausa').textContent = 'Atualização do banco pendente. Execute o SQL de intervalos e pausa para ativar.';
      $('alternar-pausa').disabled = true;
      return;
    }
  }
  $('estado-pausa').textContent = pausado ? 'Expediente pausado. Novas reservas estão bloqueadas.' : 'Expediente ativo. Novas reservas permitidas nos horários livres.';
  $('alternar-pausa').textContent = pausado ? 'Retomar expediente' : 'Pausar expediente';
  $('alternar-pausa').disabled = false;
}
$('alternar-pausa').onclick = async () => {
  const b=$('alternar-pausa'); b.disabled=true;
  try {
    const proximo=!pausado;
    if (!demo) {
      const rows=await api('/rest/v1/controle_agenda?id=eq.1','PATCH',{pausado:proximo});
      if (!rows?.length) throw new Error('Não foi possível alterar a pausa.');
    }
    pausado=proximo;
    aviso(demo?'Pausa alterada apenas na demonstração.':pausado?'Novas reservas bloqueadas.':'Recebimento de reservas retomado.');
  } catch(e) { aviso(e.message); }
  finally { await carregarPausa(); }
};
function renderExpediente() {
  $('dias-semana').replaceChildren();
  expediente.forEach(d=>{
    const row=el('div','','dia-expediente');
    const l=el('label',semana[d.id]);
    const check=document.createElement('input');check.type='checkbox';check.name='aberto-'+d.id;check.checked=d.aberto;l.prepend(check);row.append(l);
    for(const [campo,titulo] of [['inicio','Abre às'],['fim','Fecha às'],['intervalo_inicio','Início do intervalo'],['intervalo_fim','Fim do intervalo']]) {
      const label=el('label',titulo);const i=document.createElement('input');i.type='time';i.name=campo+'-'+d.id;i.value=(d[campo]||'').slice(0,5);i.required=!campo.startsWith('intervalo');
      if(campo.startsWith('intervalo'))i.disabled=!intervalosProntos;
      label.append(i);row.append(label);
    }
    $('dias-semana').append(row);
  });
}
function renderBloqueios(){ $('lista-bloqueios').replaceChildren();bloqueios.forEach(b=>$('lista-bloqueios').append(linha(b.data.split('-').reverse().join('/')+' • '+(b.horario||'Dia inteiro'),b.motivo||'Sem motivo informado',[acao('Liberar',async()=>{if(!demo)await api('/rest/v1/bloqueios?id=eq.'+b.id,'DELETE');else bloqueios=bloqueios.filter(x=>x.id!==b.id);await carregar();})])));}
async function renderAgenda(){
  const data=$('filtro-data').value, versao=++versaoAgenda;
  reservasExibidas=[];dataAgendaExibida=null;erroAgenda=false;atualizarBotaoLimpeza();
  $('lista-agenda').replaceChildren(el('p','Carregando agendamentos…'));
  FinanceiroAgenda.estado(data,'Calculando os totais…');
  let reservas;
  let financeiro;
  try{
    const resultados=await Promise.allSettled([
      demo?Promise.resolve([]):api('/rest/v1/reservas?select='+(window.RotinaPainel?'*,saas_pagamentos(valor,forma,data),saas_profissionais(nome)':'*')+'&order=data,horario,id'+(data?'&data=eq.'+data:'')+(window.RotinaPainel?'&limit=51&offset='+RotinaPainel.offsetAgenda:'')),
      demo?Promise.resolve(FinanceiroAgenda.vazio):api('/rest/v1/rpc/saas_resumo_financeiro','POST',{loja:lojaAtual.id,dia:data||null}),
    ]);
    if(resultados[0].status==='rejected')throw resultados[0].reason;
    reservas=resultados[0].value;financeiro=resultados[1];
    if(!Array.isArray(reservas))throw new Error('Não foi possível carregar os agendamentos.');
  }catch(e){
    if(versao!==versaoAgenda)return;
    erroAgenda=true;atualizarBotaoLimpeza();
    $('lista-agenda').replaceChildren(el('p','Não foi possível carregar os agendamentos. Clique em Atualizar para tentar novamente.'));
    FinanceiroAgenda.estado(data,'Não foi possível carregar o resumo. Clique em Atualizar para tentar novamente.');
    throw e;
  }
  if(versao!==versaoAgenda)return;
  if(window.RotinaPainel){RotinaPainel.paginarAgenda(reservas.length);reservas=reservas.slice(0,50);}
  reservasExibidas=reservas;dataAgendaExibida=data;atualizarBotaoLimpeza();
  if(financeiro.status==='fulfilled')FinanceiroAgenda.renderizar(financeiro.value,data);
  else FinanceiroAgenda.estado(data,'Não foi possível carregar o resumo. Clique em Atualizar para tentar novamente.');
  $('lista-agenda').replaceChildren();
  if(!reservas.length)$('lista-agenda').append(el('p',demo?'Nenhum agendamento de demonstração.':data?'Nenhum agendamento nesta data.':'Nenhum agendamento cadastrado.'));
  reservas.forEach(r=>{
    const botoes=window.RotinaPainel?RotinaPainel.botoesReserva(r):r.status==='cancelado'?[]:[acao(r.status==='confirmado'?'Confirmar no WhatsApp':'Confirmar',()=>confirmarAgendamento(r,r.status!=='confirmado')),acao('Cancelar',async()=>{await salvar('reservas',r.id,{status:'cancelado'});await renderAgenda();})];
    const item=linha((data?'':r.data.split('-').reverse().join('/')+' • ')+r.horario.slice(0,5)+' • '+r.cliente,r.telefone+' • '+r.servico_nome+(window.RotinaPainel?'':' • '+r.status),botoes);
    if(window.RotinaPainel)RotinaPainel.decorarReserva(item,r);$('lista-agenda').append(item);
  });
  if(confirmandoAgenda||limpandoAgenda)$('lista-agenda').querySelectorAll('button').forEach(b=>b.disabled=true);
}
function janelaConfirmacao(){
  let janela=null;
  try{
    // Abre durante o clique, antes da chamada ao banco, para evitar bloqueio de pop-up.
    janela=window.open('about:blank','_blank');
    if(!janela)return null;
    janela.opener=null;
    janela.document.title='Preparando confirmação';
    const mensagem=janela.document.createElement('p');
    mensagem.textContent='Aguarde. O WhatsApp será aberto após verificar a confirmação do agendamento.';
    janela.document.body.append(mensagem);
    return janela;
  }catch{try{janela?.close();}catch{}return null;}
}
async function confirmarAgendamento(reserva,confirmar=true){
  if(confirmandoAgenda||limpandoAgenda)return;
  if(demo||!token||!lojaAtual)throw new Error('Entre na sua conta para confirmar o agendamento.');
  const loja={...lojaAtual},sessao=token;
  const janela=confirmar?null:janelaConfirmacao();
  confirmandoAgenda=true;atualizarBotaoLimpeza();
  for(const id of ['filtro-data','atualizar','sair'])$(id).disabled=true;
  $('lista-agenda').querySelectorAll('button').forEach(b=>b.disabled=true);
  let confirmado=false,aberto=false;
  try{
    let rows;
    if(confirmar){
      try{rows=await api('/rest/v1/reservas?id=eq.'+encodeURIComponent(reserva.id)+'&status=eq.pendente','PATCH',{status:'confirmado'});}
      catch(e){
        // A resposta pode se perder após salvar. Verifica o estado antes de abrir a mensagem.
        try{rows=await api('/rest/v1/reservas?select=*&id=eq.'+encodeURIComponent(reserva.id));}catch{throw e;}
        if(!rows?.some(r=>r.status==='confirmado'))throw e;
      }
    }else rows=await api('/rest/v1/reservas?select=*&id=eq.'+encodeURIComponent(reserva.id));
    const salva=rows?.find(r=>r.id===reserva.id&&r.status==='confirmado'&&r.barbearia_id===loja.id);
    if(!salva)throw new Error('O agendamento foi alterado ou não pôde ser confirmado. Atualize a lista.');
    confirmado=true;Object.assign(reserva,salva);
    if(token!==sessao||lojaAtual?.id!==loja.id)throw new Error('Entre novamente para avisar o cliente.');
    if(confirmar){
      let mensagem='Agendamento confirmado no site. Use o botão Confirmar no WhatsApp se quiser avisar o cliente.';
      try{await renderAgenda();}catch{mensagem='Agendamento confirmado no site. Atualize a lista para consultar o agendamento.';}
      aviso(mensagem);return;
    }
    const link=ConfirmacaoWhatsApp.link(salva);
    if(janela&&!janela.closed){try{janela.location.replace(link);aberto=true;}catch{}}
    if(!aberto)try{janela?.close();}catch{}
    let mensagem=aberto?'Agendamento confirmado. No WhatsApp, toque em Enviar para avisar o cliente.':'Agendamento confirmado. Abra o WhatsApp do cliente pelo link abaixo e toque em Enviar.';
    try{await renderAgenda();}catch{mensagem+=' Atualize a lista para consultar o agendamento.';}
    aviso(mensagem);
    if(!aberto){
      const abrir=el('a','Abrir WhatsApp do cliente');abrir.href=link;abrir.target='_blank';abrir.rel='noopener noreferrer';
      $('aviso').append(document.createElement('br'),abrir);
    }
  }catch(e){
    try{janela?.close();}catch{}
    try{await renderAgenda();}catch{}
    aviso((confirmado?(confirmar?'Agendamento confirmado no site. ':'Agendamento confirmado, mas a mensagem não foi aberta. '):'')+e.message);
  }finally{
    confirmandoAgenda=false;atualizarBotaoLimpeza();
    for(const id of ['filtro-data','atualizar','sair'])$(id).disabled=false;
    $('lista-agenda').querySelectorAll('button').forEach(b=>b.disabled=false);
  }
}
function atualizarBotaoLimpeza(){
  const quantidade=reservasExibidas.filter(r=>!window.RotinaPainel||RotinaPainel.podeLimpar(r)).length;
  $('limpar-agendamentos').disabled=limpandoAgenda||confirmandoAgenda||dataAgendaExibida===null||!quantidade;
  $('escopo-limpeza-agenda').textContent=erroAgenda?'Atualize a lista para carregar os agendamentos antes de limpar.':dataAgendaExibida===null?'Carregando agendamentos…':dataAgendaExibida?'Limpar lista exclui apenas os agendamentos de '+dataAgendaExibida.split('-').reverse().join('/')+'.':'Limpar lista exclui todos os agendamentos da sua barbearia exibidos abaixo.';
  if(window.RotinaPainel&&dataAgendaExibida!==null&&!erroAgenda)$('escopo-limpeza-agenda').textContent='Limpar lista remove '+quantidade+' agendamento(s) desta página. Atendimentos concluídos, faltas e pagamentos são preservados.';
}
$('limpar-agendamentos').onclick=async()=>{
  if(limpandoAgenda||confirmandoAgenda||dataAgendaExibida===null||!reservasExibidas.length)return;
  if(demo){aviso('Entre na sua conta para limpar agendamentos.');return;}
  if(!lojaAtual||!token){aviso('Entre na sua conta para limpar agendamentos.');return;}
  const ids=[...new Set(reservasExibidas.filter(r=>!window.RotinaPainel||RotinaPainel.podeLimpar(r)).map(r=>r.id))],loja=lojaAtual.id;
  if(!ids.length){aviso('Os atendimentos desta página fazem parte do histórico e não serão excluídos.');return;}
  const periodo=dataAgendaExibida?'de '+dataAgendaExibida.split('-').reverse().join('/'):'de todas as datas';
  if(!window.confirm('Excluir permanentemente '+ids.length+' agendamento'+(ids.length===1?'':'s')+' '+periodo+' exibido'+(ids.length===1?'':'s')+' nesta lista?\n\nIsso libera os horários reservados e remove os valores desses registros do resumo. Esta ação não pode ser desfeita.'))return;
  limpandoAgenda=true;atualizarBotaoLimpeza();
  for(const id of ['filtro-data','atualizar','sair'])$(id).disabled=true;
  const botoes=[...$('lista-agenda').querySelectorAll('button')];botoes.forEach(b=>b.disabled=true);
  try{
    const quantidade=await api('/rest/v1/rpc/saas_limpar_agendamentos','POST',{loja,reservas:ids});
    if(!Number.isInteger(quantidade)||quantidade<0)throw new Error('Não foi possível confirmar a limpeza. Atualize a lista antes de tentar novamente.');
    const mensagem=quantidade?quantidade+' agendamento'+(quantidade===1?' excluído.':'s excluídos.'):'Nenhum agendamento restante para excluir.';
    reservasExibidas=[];dataAgendaExibida=null;
    try{await renderAgenda();aviso(mensagem);}catch{aviso(mensagem+' Atualize o painel para consultar a lista.');}
  }catch(e){
    // Uma resposta perdida pode ocorrer após a exclusão. Reconsulta antes de permitir outra tentativa.
    try{await renderAgenda();}catch{reservasExibidas=[];dataAgendaExibida=null;}
    aviso(e.message);
  }finally{
    limpandoAgenda=false;atualizarBotaoLimpeza();
    for(const id of ['filtro-data','atualizar','sair'])$(id).disabled=false;
    botoes.forEach(b=>b.disabled=false);
  }
};
// Login e criação de barbearia são definidos em admin-saas.js.
$('demonstracao').onclick=async()=>{demo=true;try{servicos=await fetch('catalogo-inicial.json').then(r=>r.json());expediente=semana.map((_,id)=>({id,aberto:id!==1,inicio:'09:00',fim:'18:00'}));bloqueios=[];await carregar();$('login').hidden=true;$('painel').hidden=false;$('sair').hidden=false;aviso('Demonstração: dados de exemplo. Nenhuma alteração é enviada ao Supabase.');}catch{aviso('Abra o site pelo Live Server para carregar a demonstração.');}};
$('sair').onclick=()=>{token='';demo=false;++versaoAgenda;reservasExibidas=[];dataAgendaExibida=null;atualizarBotaoLimpeza();$('lista-agenda').replaceChildren();FinanceiroAgenda.limpar();$('painel').hidden=true;$('login').hidden=false;$('sair').hidden=true;aviso('Você saiu do painel.');};
for(const b of document.querySelectorAll('[data-area]')) b.onclick=()=>{document.querySelectorAll('.area').forEach(a=>a.hidden=a.id!==b.dataset.area);document.querySelectorAll('[data-area]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
$('form-expediente').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const f=e.target;const novos=expediente.map(d=>({id:d.id,aberto:f.elements['aberto-'+d.id].checked,inicio:f.elements['inicio-'+d.id].value,fim:f.elements['fim-'+d.id].value,...(intervalosProntos?{intervalo_inicio:f.elements['intervalo_inicio-'+d.id].value||null,intervalo_fim:f.elements['intervalo_fim-'+d.id].value||null}:{})}));if(novos.some(d=>d.aberto&&d.fim<=d.inicio))throw new Error('O fechamento deve ser depois da abertura.');if(novos.some(d=>(Boolean(d.intervalo_inicio)!==Boolean(d.intervalo_fim))||(d.intervalo_inicio&&(d.intervalo_inicio<d.inicio||d.intervalo_fim>d.fim||d.intervalo_fim<=d.intervalo_inicio))))throw new Error('Preencha as duas horas do intervalo, dentro do expediente e em ordem.');if(!demo)await api('/rest/v1/rpc/saas_salvar_expediente','POST',{loja:lojaAtual.id,dias:novos});expediente=novos;aviso(demo?'Expediente alterado apenas na demonstração.':'Expediente salvo.');}catch(err){aviso(err.message);}finally{b.disabled=false;}};
$('form-bloqueio').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const f=e.target;const dados={data:f.data.value,horario:f.horario.value||null,motivo:f.motivo.value};await salvar('bloqueios',null,dados);if(demo)bloqueios.push({...dados,id:crypto.randomUUID()});f.reset();await carregar();}catch(err){aviso(err.message);}finally{b.disabled=false;}};
$('atualizar').onclick=()=>{if(window.RotinaPainel)RotinaPainel.offsetAgenda=0;return renderAgenda().catch(e=>aviso(e.message));};$('filtro-data').onchange=$('atualizar').onclick;
const hoje=new Date();$('filtro-data').value=[hoje.getFullYear(),String(hoje.getMonth()+1).padStart(2,'0'),String(hoje.getDate()).padStart(2,'0')].join('-');
if(!config.publicKey)aviso('Painel em preparação. Você já pode explorar a demonstração.');


