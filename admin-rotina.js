// Rotina administrativa. Nenhuma mensagem é enviada automaticamente ao WhatsApp.
window.RotinaPainel = (() => {
  const moeda = valor => FinanceiroAgenda.moeda.format(Number(valor));
  const estados = {pendente:'Pendente',confirmado:'Confirmado',cancelado:'Cancelado',concluido:'Concluído',faltou:'Cliente faltou'};
  const formas = {pix:'Pix',dinheiro:'Dinheiro',cartao:'Cartão'};
  const limite = 20;
  const offsets = {clientes:0,historico:0,despesas:0,recebimentos:0,espera:0};
  const versoes = {};
  let ocupado=false, agendamento=null, finalizacao=null, pagamentoAtual=null, clienteAtual=null, esperaId=null, despesaId=null, vagasProntas=false;
  let periodo=null;
  const hoje = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
  const dataBR = dia => dia ? dia.slice(0,10).split('-').reverse().join('/') : 'Sem data definida';
  function horarioIniciado(r){
    const partes=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date());
    const agora=Object.fromEntries(partes.map(p=>[p.type,p.value]));
    return r.data+'T'+r.horario.slice(0,8)<=agora.year+'-'+agora.month+'-'+agora.day+'T'+agora.hour+':'+agora.minute+':'+agora.second;
  }
  const avisoHorario = r => 'Este atendimento está marcado para '+dataBR(r.data)+' às '+r.horario.slice(0,5)+'. Só é possível concluir ou registrar falta depois que esse horário começar.';
  const telefone = valor => {
    let n=String(valor||'').replace(/\D/g,'');
    if((n.length===12||n.length===13)&&n.startsWith('55'))n=n.slice(2);
    if(!/^\d{10,11}$/.test(n))throw new Error('Informe o telefone do cliente com DDD.');
    return n;
  };
  const dinheiro = valor => {
    const n=Number(valor);
    if(!Number.isFinite(n)||n<=0||n>=100000000||Math.abs(n*100-Math.round(n*100))>0.000001)throw new Error('Informe um valor maior que zero, com até duas casas decimais.');
    return Math.round(n*100)/100;
  };
  function acesso(){if(demo||!token||!lojaAtual)throw new Error('Entre na sua conta para usar esta função.');}
  function contexto(){return token+'|'+(lojaAtual?.id||'');}
  function consulta(area){const versao=(versoes[area]||0)+1;versoes[area]=versao;const sessao=contexto();return ()=>versoes[area]===versao&&contexto()===sessao;}
  const rpc = (nome,dados) => {acesso();return api('/rest/v1/rpc/'+nome,'POST',{loja:lojaAtual.id,...dados});};
  function abrir(id){const d=$(id);if(typeof d.showModal==='function')d.showModal();else d.setAttribute('open','');}
  function fechar(id){if(ocupado)return;const d=$(id);if(typeof d.close==='function')d.close();else d.removeAttribute('open');}
  function erroLocal(id,e){$(id).replaceChildren(el('p',e.message));}
  function pagina(area,quantidade,total=null){
    const offset=offsets[area],tamanho=limite;
    $('pagina-'+area).textContent='Página '+(offset/tamanho+1);
    $(area+'-anterior').disabled=offset===0;
    $(area+'-proxima').disabled=total===null?quantidade<=tamanho:offset+tamanho>=total;
  }
  function preencher(select,itens,rotulo,escolhido=''){
    select.replaceChildren();
    const vazio=el('option',rotulo);vazio.value='';select.append(vazio);
    for(const item of itens){const o=el('option',item.nome);o.value=item.id;select.append(o);}
    select.value=escolhido;
  }
  async function catalogos(){
    acesso();const sessao=contexto();
    const [itens,pessoas]=await Promise.all([
      api('/rest/v1/saas_servicos?select=*&ativo=eq.true&barbearia_id=eq.'+lojaAtual.id+'&order=nome'),
      api('/rest/v1/saas_profissionais?select=*&ativo=eq.true&excluido=eq.false&barbearia_id=eq.'+lojaAtual.id+'&order=nome'),
    ]);
    if(contexto()!==sessao)throw new Error('A sessão mudou. Entre novamente.');
    return {itens,pessoas};
  }
  async function salvarFormulario(form,fn){
    acesso();if(ocupado)return;
    ocupado=true;const campo=form.querySelector('fieldset'),b=form.querySelector('button[type="submit"]');
    if(campo)campo.disabled=true;else if(b)b.disabled=true;
    $('sair').disabled=true;
    document.querySelectorAll('[data-fechar]').forEach(n=>n.disabled=true);
    try{await fn();}finally{
      ocupado=false;if(campo)campo.disabled=false;else if(b)b.disabled=false;
      $('sair').disabled=false;document.querySelectorAll('[data-fechar]').forEach(n=>n.disabled=false);
    }
  }
  function submit(id,fn,erroId=null){const f=$(id);f.onsubmit=async e=>{e.preventDefault();try{await salvarFormulario(f,()=>fn(f));}catch(err){if(erroId)$(erroId).textContent=err.message;else aviso(err.message);}};}
  async function depoisDeSalvar(mensagem,dialog=null){
    if(dialog){const d=$(dialog);if(typeof d.close==='function')d.close();else d.removeAttribute('open');}
    const tarefas=[renderAgenda()];
    if(!$('clientes').hidden)tarefas.push(carregarClientes());
    if(!$('caixa').hidden)tarefas.push(carregarCaixa());
    if(!$('espera').hidden)tarefas.push(carregarEspera());
    const resultados=await Promise.allSettled(tarefas);
    aviso(mensagem+(resultados.some(r=>r.status==='rejected')?' Atualize o painel para consultar os dados salvos.':''));
  }
  function recebido(r){return Array.isArray(r.saas_pagamentos)?r.saas_pagamentos[0]:r.saas_pagamentos;}
  function linkWhatsApp(numero,mensagem,rotulo){
    const a=el('a',rotulo,'acao-whatsapp');
    a.href='https://api.whatsapp.com/send?phone=55'+telefone(numero)+'&text='+encodeURIComponent(mensagem);
    a.target='_blank';a.rel='noopener noreferrer';return a;
  }
  function lembrete(r){
    try{return linkWhatsApp(r.telefone,
      'Olá, '+r.cliente+'! Lembramos do seu atendimento na '+lojaAtual.nome+' em '+dataBR(r.data)+' às '+r.horario.slice(0,5)+', para '+r.servico_nome+'. Se precisar remarcar, fale conosco. Até lá!',
      'Lembrar no WhatsApp');}
    catch{return acao('Lembrar no WhatsApp',()=>{throw new Error('Confira o telefone do cliente antes de preparar o lembrete.');});}
  }
  function botoesReserva(r){
    const botoes=[],extras=[];
    if(['pendente','confirmado'].includes(r.status)){
      botoes.push(acao(r.status==='pendente'?'Confirmar':'Confirmar no WhatsApp',()=>confirmarAgendamento(r,r.status==='pendente')));
      botoes.push(acao('Concluir atendimento',()=>finalizar(r,'concluido')));
      extras.push(acao('Remarcar',()=>abrirAgendamento(r)),lembrete(r),acao('Cliente faltou',()=>finalizar(r,'faltou')));
      if(!recebido(r))extras.push(acao('Cancelar',async()=>{
        if(!window.confirm('Cancelar o agendamento de '+r.cliente+'?'))return;
        await salvar('reservas',r.id,{status:'cancelado'});
        await depoisDeSalvar('Agendamento cancelado. Consulte a Lista de espera para preencher a vaga.');
      }));
    }
    if(['confirmado','concluido'].includes(r.status))botoes.push(acao(recebido(r)?'Editar pagamento':'Registrar pagamento',()=>abrirPagamento(r)));
    extras.push(acao('Histórico do cliente',()=>abrirCliente({telefone:r.telefone,nome:r.cliente})));
    const detalhes=el('details','','mais-acoes');detalhes.append(el('summary','Outras ações'));
    const a=el('div','','acoes-item');a.append(...extras);detalhes.append(a);botoes.push(detalhes);return botoes;
  }
  function decorarReserva(item,r){
    item.querySelector('.acoes-item').classList.add('acoes-reserva');
    const texto=item.firstElementChild;
    const pessoa=r.saas_profissionais||modulo.profissionais.find(p=>p.id===r.profissional);
    if(pessoa)texto.append(el('p','Profissional: '+pessoa.nome));
    texto.append(el('span',estados[r.status]||r.status,'situacao-reserva'));
    if(['pendente','confirmado'].includes(r.status)&&!horarioIniciado(r))texto.append(el('p',avisoHorario(r),'ajuda-finalizacao'));
    const p=recebido(r);if(p)texto.append(el('p','Pago: '+moeda(p.valor)+' • '+formas[p.forma]+' • '+dataBR(p.data)));
  }
  async function finalizar(r,estado){
    acesso();if(ocupado)return;
    finalizacao={reserva:r,estado};
    $('titulo-finalizar').textContent=estado==='faltou'?'Registrar falta':'Concluir atendimento';
    $('resumo-finalizar').textContent=r.cliente+' • '+r.servico_nome+' • '+dataBR(r.data)+' às '+r.horario.slice(0,5);
    $('orientacao-finalizar').textContent=estado==='faltou'?'A falta ficará registrada no histórico do cliente.':'Confirme quando o atendimento tiver terminado. O pagamento é registrado separadamente.';
    const impedimento=!horarioIniciado(r)?avisoHorario(r):estado==='faltou'&&recebido(r)?'Este atendimento já possui pagamento registrado. Não é possível marcar falta.':'';
    $('aviso-finalizar').textContent=impedimento;
    const b=$('form-finalizar').querySelector('[type="submit"]');b.textContent=estado==='faltou'?'Confirmar falta':'Confirmar conclusão';b.disabled=Boolean(impedimento);
    abrir('dialog-finalizar');
  }
  submit('form-finalizar',async f=>{
    if(!finalizacao)throw new Error('Selecione o atendimento novamente.');
    const {reserva:r,estado}=finalizacao;
    if(!horarioIniciado(r))throw new Error(avisoHorario(r));
    $('aviso-finalizar').textContent='Salvando…';
    const b=f.querySelector('[type="submit"]'),rotulo=b.textContent;b.textContent='Salvando…';
    try{
      let salva;
      try{salva=await rpc('saas_finalizar_atendimento',{reserva:r.id,estado});}
      catch(e){
        const rows=await api('/rest/v1/reservas?select=id,status,barbearia_id&id=eq.'+r.id).catch(()=>[]);
        salva=rows.find(s=>s.id===r.id&&s.status===estado&&s.barbearia_id===lojaAtual.id);
        if(!salva)throw e;
      }
      if(salva?.id!==r.id||salva.status!==estado||salva.barbearia_id!==lojaAtual.id)throw new Error('Não foi possível confirmar a alteração. Atualize a agenda e tente novamente.');
      finalizacao=null;
      await depoisDeSalvar(estado==='faltou'?'Falta registrada no histórico.':'Atendimento concluído. Registre o pagamento se ainda não recebeu.','dialog-finalizar');
    }finally{b.textContent=rotulo;}
  },'aviso-finalizar');
  async function abrirAgendamento(r=null,espera=null){
    acesso();if(ocupado)return;
    const {itens,pessoas}=await catalogos();
    const f=$('form-agendamento-painel');f.reset();
    agendamento={reserva:r,nova:r?null:crypto.randomUUID(),espera:espera?.id||null};
    $('titulo-agendamento').textContent=r?'Remarcar agendamento':'Novo agendamento';
    const inicial=r||espera||{};
    f.elements.cliente.value=inicial.cliente||'';f.elements.telefone.value=inicial.telefone||'';
    preencher(f.elements.profissional,pessoas,'Escolha o profissional',inicial.profissional||'');
    preencher(f.elements.servico,itens,'Escolha o serviço',inicial.servico_id||'');
    f.elements.data.min=hoje();f.elements.data.value=inicial.data&&inicial.data>=hoje()?inicial.data:($('filtro-data').value>=hoje()?$('filtro-data').value:hoje());
    f.elements.horario.replaceChildren(el('option','Escolha o profissional, o serviço e a data'));f.elements.horario.firstElementChild.value='';
    $('aviso-vagas').textContent=itens.length&&pessoas.length?'':'Cadastre um serviço e um profissional ativo para agendar.';
    vagasProntas=false;abrir('dialog-agendamento');await carregarVagas(r?.horario?.slice(0,5)||'');
  }
  async function carregarVagas(preferido=''){
    const f=$('form-agendamento-painel'),selecionado=f.elements.horario;
    const atual=consulta('vagas');vagasProntas=false;selecionado.disabled=true;selecionado.replaceChildren();
    const b=f.querySelector('button[type="submit"]');b.disabled=true;
    if(!f.elements.profissional.value||!f.elements.data.value||!f.elements.servico.value){const msg='Escolha o profissional, o serviço e a data';selecionado.append(el('option',msg));$('aviso-vagas').textContent=msg;return;}
    $('aviso-vagas').textContent='Consultando horários…';
    try{
      const horarios=await rpc('saas_horarios_painel',{dia:f.elements.data.value,barbeiro:f.elements.profissional.value,reserva:agendamento?.reserva?.id||null,servico:f.elements.servico.value});
      if(!atual())return;
      preencher(selecionado,horarios.map(h=>({id:h.horario,nome:h.horario})),'Escolha um horário',preferido);
      selecionado.disabled=!horarios.length;vagasProntas=horarios.length>0;b.disabled=!vagasProntas;
      $('aviso-vagas').textContent=horarios.length?'':'Não há vagas nessa data. Confira o expediente, a pausa ou escolha outro profissional.';
    }catch(e){if(atual()){$('aviso-vagas').textContent=e.message;selecionado.append(el('option','Horários indisponíveis'));}}
  }
  submit('form-agendamento-painel',async f=>{
    if(!agendamento||!vagasProntas||!f.elements.horario.value)throw new Error('Consulte e escolha um horário disponível.');
    const dados={dia:f.elements.data.value,hora:f.elements.horario.value,barbeiro:f.elements.profissional.value,servico:f.elements.servico.value,
      nome:f.elements.cliente.value.trim(),telefone_cliente:telefone(f.elements.telefone.value),reserva:agendamento.reserva?.id||null,
      nova_reserva:agendamento.nova,espera:agendamento.espera,versao:agendamento.reserva?.atualizado_em||null};
    try{await rpc('saas_agendar_painel',dados);}catch(e){
      // Confere uma criação cuja resposta se perdeu, sem duplicar o agendamento.
      if(dados.reserva)throw e;
      const salvos=await api('/rest/v1/reservas?select=id,data,horario,cliente,telefone,profissional,servico_id&id=eq.'+dados.nova_reserva).catch(()=>[]);
      if(!salvos.some(r=>r.id===dados.nova_reserva&&r.data===dados.dia&&r.horario.slice(0,5)===dados.hora&&r.telefone===dados.telefone_cliente&&r.profissional===dados.barbeiro&&r.servico_id===dados.servico))throw e;
    }
    $('filtro-data').value=dados.dia;modulo.offsetAgenda=0;
    await depoisDeSalvar(dados.reserva?'Agendamento remarcado.':'Agendamento salvo e confirmado no site.','dialog-agendamento');
  });
  for(const nome of ['profissional','servico','data'])$('form-agendamento-painel').elements[nome].onchange=()=>carregarVagas();
  function abrirPagamento(r){
    acesso();pagamentoAtual=r;const p=recebido(r),f=$('form-pagamento');
    $('titulo-pagamento').textContent=p?'Corrigir pagamento':'Registrar pagamento';
    $('cliente-pagamento').textContent=r.cliente+' • '+r.servico_nome+' • Agendado para '+dataBR(r.data);
    f.elements.valor.value=String(p?.valor??r.preco);f.elements.forma.value=p?.forma||'pix';f.elements.data.value=p?.data||hoje();f.elements.data.max=hoje();abrir('dialog-pagamento');
  }
  submit('form-pagamento',async f=>{
    await rpc('saas_registrar_pagamento',{reserva:pagamentoAtual.id,valor_recebido:dinheiro(f.elements.valor.value),forma_pagamento:f.elements.forma.value,dia:f.elements.data.value});
    await depoisDeSalvar('Pagamento registrado no caixa.','dialog-pagamento');
  });

  async function carregarClientes(){
    const atual=consulta('clientes');$('lista-clientes').replaceChildren(el('p','Carregando clientes…'));
    try{
      acesso();const busca=$('buscar-clientes').elements.busca.value.trim().replace(/[^\p{L}\p{N}\s]/gu,'');
      const n=busca.replace(/\D/g,'');
      const filtros=busca?'&or='+encodeURIComponent('(nome.ilike.*'+busca+'*'+(n?',telefone.ilike.*'+n+'*':'')+')'):'';
      const rows=await api('/rest/v1/saas_clientes?select=*&barbearia_id=eq.'+lojaAtual.id+filtros+'&order=nome,telefone&limit=21&offset='+offsets.clientes);
      if(!atual())return;const lista=$('lista-clientes');lista.replaceChildren();
      for(const c of rows.slice(0,limite))lista.append(linha(c.nome,c.telefone,[acao('Ver histórico',()=>abrirCliente(c)),acao('Agendar',()=>abrirAgendamento(null,{cliente:c.nome,telefone:c.telefone}))]));
      if(!rows.length)lista.append(el('p','Nenhum cliente encontrado.'));pagina('clientes',rows.length);
    }catch(e){if(atual())erroLocal('lista-clientes',e);}
  }
  async function abrirCliente(c){
    acesso();const atual=consulta('abrir-cliente');
    const rows=await api('/rest/v1/saas_clientes?select=*&barbearia_id=eq.'+lojaAtual.id+'&telefone=eq.'+encodeURIComponent(c.telefone));
    if(!atual())return;clienteAtual=rows[0]||{...c,observacoes:''};offsets.historico=0;
    const f=$('form-cliente');f.elements.nome.value=clienteAtual.nome;f.elements.observacoes.value=clienteAtual.observacoes||'';
    $('telefone-cliente').textContent=clienteAtual.telefone;abrir('dialog-cliente');await carregarHistorico();
  }
  async function carregarHistorico(){
    const atual=consulta('historico');$('historico-cliente').replaceChildren(el('p','Carregando histórico…'));$('resumo-cliente').textContent='';
    try{
      const h=await rpc('saas_historico_cliente',{telefone_cliente:clienteAtual.telefone,deslocamento:offsets.historico});
      if(!atual())return;
      $('resumo-cliente').textContent=h.concluidos+' atendimento(s) concluído(s) • '+h.faltas+' falta(s)'+(h.ultima_visita?' • Última visita: '+dataBR(h.ultima_visita):'');
      const lista=$('historico-cliente');lista.replaceChildren();
      for(const r of h.atendimentos)lista.append(linha(dataBR(r.data)+' às '+r.horario.slice(0,5)+' • '+r.servico_nome,
        r.profissional+' • '+estados[r.status]+' • '+(r.recebido!==null?'Recebido '+moeda(r.recebido)+' em '+formas[r.forma]:'Preço '+moeda(r.preco))));
      if(!h.atendimentos.length)lista.append(el('p','Nenhum atendimento no histórico.'));pagina('historico',h.atendimentos.length,h.total);
    }catch(e){if(atual())erroLocal('historico-cliente',e);}
  }
  submit('form-cliente',async f=>{
    await rpc('saas_salvar_cliente',{telefone_cliente:clienteAtual.telefone,nome:f.elements.nome.value.trim(),notas:f.elements.observacoes.value.trim()});
    clienteAtual.nome=f.elements.nome.value.trim();aviso('Preferências do cliente salvas.');if(!$('clientes').hidden)await carregarClientes();
  });
  submit('buscar-clientes',async()=>{offsets.clientes=0;await carregarClientes();});

  function filtroPeriodo(){const f=$('filtro-caixa');const inicio=f.elements.inicio.value,fim=f.elements.fim.value;if(!inicio||!fim||fim<inicio||(Date.parse(fim)-Date.parse(inicio))/86400000>366)throw new Error('Escolha um período de até um ano, em ordem.');return {inicio,fim};}
  async function carregarCaixa(){
    const atual=consulta('caixa');const totais=$('totais-caixa');totais.replaceChildren(el('p','Consultando caixa…'));$('formas-caixa').replaceChildren();
    $('lista-despesas').replaceChildren();$('lista-recebimentos').replaceChildren();
    try{
      acesso();periodo=periodo||filtroPeriodo();const {inicio,fim}=periodo;
      const filtro='&barbearia_id=eq.'+lojaAtual.id+'&data=gte.'+inicio+'&data=lte.'+fim+'&order=data.desc,id&limit=21&offset=';
      const resultado=await Promise.allSettled([
        rpc('saas_caixa',{inicio,fim}),api('/rest/v1/saas_despesas?select=*'+filtro+offsets.despesas),
        api('/rest/v1/saas_pagamentos?select=*,saas_reservas(cliente,servico_nome)'+filtro+offsets.recebimentos),
      ]);
      if(!atual())return;
      if(resultado[0].status==='fulfilled'){
        const c=resultado[0].value;
        const valores=[c?.entradas,c?.despesas,c?.saldo,...Object.keys(formas).map(forma=>c?.formas?.[forma])];
        if(valores.some(valor=>valor===null||valor===undefined||!Number.isFinite(Number(valor))))throw new Error('Não foi possível calcular o caixa.');
        totais.replaceChildren();
        for(const [titulo,valor] of [['Recebimentos',c.entradas],['Despesas',c.despesas],['Saldo do período',c.saldo]]){
          const card=el('div','','card-caixa');card.append(el('span',titulo),el('strong',moeda(valor)));totais.append(card);
        }
        for(const [forma,rotulo] of Object.entries(formas))$('formas-caixa').append(el('span',rotulo+': '+moeda(c.formas[forma])));
      }else erroLocal('totais-caixa',resultado[0].reason);
      if(resultado[1].status==='fulfilled'){
        const rows=resultado[1].value;
        for(const d of rows.slice(0,limite))$('lista-despesas').append(linha(d.descricao,moeda(d.valor)+' • '+formas[d.forma]+' • '+dataBR(d.data),[acao('Excluir despesa',async()=>{
          if(!window.confirm('Excluir a despesa '+d.descricao+' de '+moeda(d.valor)+'?'))return;
          await api('/rest/v1/saas_despesas?barbearia_id=eq.'+lojaAtual.id+'&id=eq.'+d.id,'DELETE');await carregarCaixa();aviso('Despesa excluída.');
        })]));
        if(!rows.length)$('lista-despesas').append(el('p','Nenhuma despesa no período.'));pagina('despesas',rows.length);
      }else erroLocal('lista-despesas',resultado[1].reason);
      if(resultado[2].status==='fulfilled'){
        const rows=resultado[2].value;
        for(const p of rows.slice(0,limite))$('lista-recebimentos').append(linha(p.saas_reservas?.cliente||'Atendimento',
          moeda(p.valor)+' • '+formas[p.forma]+' • '+dataBR(p.data)+' • '+(p.saas_reservas?.servico_nome||''),[acao('Corrigir pagamento',async()=>{
            const rows=await api('/rest/v1/reservas?select=*,saas_pagamentos(valor,forma,data)&id=eq.'+p.reserva_id);
            if(!rows.length)throw new Error('Atendimento não encontrado.');abrirPagamento(rows[0]);
          })]));
        if(!rows.length)$('lista-recebimentos').append(el('p','Nenhum pagamento registrado no período.'));pagina('recebimentos',rows.length);
      }else erroLocal('lista-recebimentos',resultado[2].reason);
    }catch(e){if(atual())erroLocal('totais-caixa',e);}
  }
  submit('filtro-caixa',async()=>{periodo=filtroPeriodo();offsets.despesas=offsets.recebimentos=0;await carregarCaixa();});
  submit('form-despesa',async f=>{
    if(!despesaId)despesaId=crypto.randomUUID();
    const dados={id:despesaId,barbearia_id:lojaAtual.id,descricao:f.elements.descricao.value.trim(),valor:dinheiro(f.elements.valor.value),forma:f.elements.forma.value,data:f.elements.data.value};
    try{await api('/rest/v1/saas_despesas','POST',dados);}catch(e){const rows=await api('/rest/v1/saas_despesas?select=id&id=eq.'+despesaId+'&barbearia_id=eq.'+lojaAtual.id).catch(()=>[]);if(!rows.length)throw e;}
    despesaId=null;f.reset();f.elements.data.value=hoje();offsets.despesas=0;await carregarCaixa();aviso('Despesa registrada.');
  });
  function selecionarPeriodo(mes=false){
    const dia=hoje(),f=$('filtro-caixa');f.elements.inicio.value=mes?dia.slice(0,7)+'-01':dia;f.elements.fim.value=dia;
    periodo=filtroPeriodo();offsets.despesas=offsets.recebimentos=0;return carregarCaixa();
  }

  async function carregarEspera(){
    const atual=consulta('espera');$('lista-espera').replaceChildren(el('p','Carregando lista de espera…'));
    try{
      acesso();const estado=$('estado-espera').value;
      const filtro=estado==='abertos'?'in.(aguardando,contatado)':'eq.'+estado;
      const rows=await api('/rest/v1/saas_espera?select=*,saas_servicos(nome),saas_profissionais(nome)&barbearia_id=eq.'+lojaAtual.id+'&status='+filtro+'&order=criado_em,id&limit=21&offset='+offsets.espera);
      if(!atual())return;const lista=$('lista-espera');lista.replaceChildren();
      for(const r of rows.slice(0,limite)){
        const botoes=[];
        if(['aguardando','contatado'].includes(r.status)){
          botoes.push(linkWhatsApp(r.telefone,'Olá, '+r.cliente+'! Aqui é da '+lojaAtual.nome+'. Sobre sua solicitação na lista de espera para '+(r.saas_servicos?.nome||'atendimento')+', podemos combinar um horário? A vaga será reservada após a confirmação.','Avisar no WhatsApp'));
          if(r.status==='aguardando')botoes.push(acao('Marcar como contatado',()=>alterarEspera(r,'contatado')));
          botoes.push(acao('Agendar',()=>abrirAgendamento(null,r)),acao('Encerrar solicitação',()=>alterarEspera(r,'encerrado')));
        }
        lista.append(linha(r.cliente,r.telefone+' • '+(r.saas_servicos?.nome||'Serviço')+' • '+(r.saas_profissionais?.nome||'Qualquer profissional')+' • '+dataBR(r.data)+
          (r.inicio?' • '+r.inicio.slice(0,5)+'–'+r.fim.slice(0,5):'')+' • '+({aguardando:'Aguardando',contatado:'Contatado',agendado:'Agendado',encerrado:'Encerrado'}[r.status])+(r.observacoes?' • '+r.observacoes:''),botoes));
      }
      if(!rows.length)lista.append(el('p','Nenhum cliente nesta lista.'));pagina('espera',rows.length);
    }catch(e){if(atual())erroLocal('lista-espera',e);}
  }
  async function alterarEspera(r,status){
    acesso();if(status==='encerrado'&&!window.confirm('Encerrar a solicitação de '+r.cliente+'?'))return;
    const rows=await api('/rest/v1/saas_espera?barbearia_id=eq.'+lojaAtual.id+'&id=eq.'+r.id+'&status=in.(aguardando,contatado)','PATCH',{status});
    if(!rows.length)throw new Error('Esta solicitação mudou. Atualize a lista.');await carregarEspera();aviso(status==='contatado'?'Contato registrado.':'Solicitação encerrada.');
  }
  async function abrirEspera(){
    const {itens,pessoas}=await catalogos();const f=$('form-espera');f.reset();esperaId=crypto.randomUUID();
    preencher(f.elements.servico,itens,'Escolha o serviço');preencher(f.elements.profissional,pessoas,'Qualquer profissional');f.elements.data.min=hoje();abrir('dialog-espera');
  }
  submit('form-espera',async f=>{
    const inicio=f.elements.inicio.value,fim=f.elements.fim.value;
    if(Boolean(inicio)!==Boolean(fim)||(inicio&&fim<=inicio))throw new Error('Preencha início e fim da preferência de horário, em ordem.');
    const dados={id:esperaId,barbearia_id:lojaAtual.id,cliente:f.elements.cliente.value.trim(),telefone:telefone(f.elements.telefone.value),
      servico_id:f.elements.servico.value,profissional:f.elements.profissional.value||null,data:f.elements.data.value||null,inicio:inicio||null,fim:fim||null,observacoes:f.elements.observacoes.value.trim()};
    try{await api('/rest/v1/saas_espera','POST',dados);}catch(e){const rows=await api('/rest/v1/saas_espera?select=id&barbearia_id=eq.'+lojaAtual.id+'&id=eq.'+esperaId).catch(()=>[]);if(!rows.length)throw e;}
    esperaId=null;offsets.espera=0;await depoisDeSalvar('Cliente adicionado à lista de espera.','dialog-espera');
  });

  const modulo={offsetAgenda:0,profissionais:[],botoesReserva,decorarReserva,recebido,hoje,telefone,dinheiro,
    podeLimpar:r=>!['concluido','faltou'].includes(r.status)&&!recebido(r),
    paginarAgenda(quantidade){$('paginas-agenda').hidden=modulo.offsetAgenda===0&&quantidade<=50;$('pagina-agenda').textContent='Página '+(modulo.offsetAgenda/50+1);$('agenda-anterior').disabled=modulo.offsetAgenda===0;$('agenda-proxima').disabled=quantidade<=50;},
  };
  $('novo-agendamento').onclick=async()=>{try{await abrirAgendamento();}catch(e){aviso(e.message);}};
  $('nova-espera').onclick=async()=>{try{await abrirEspera();}catch(e){aviso(e.message);}};
  $('atualizar-espera').onclick=()=>carregarEspera();$('estado-espera').onchange=()=>{offsets.espera=0;return carregarEspera();};
  $('caixa-hoje').onclick=()=>selecionarPeriodo();$('caixa-mes').onclick=()=>selecionarPeriodo(true);
  for(const [area,carregar] of Object.entries({clientes:carregarClientes,historico:carregarHistorico,despesas:carregarCaixa,recebimentos:carregarCaixa,espera:carregarEspera})){
    for(const [direcao,passo] of [['anterior',-limite],['proxima',limite]])$(area+'-'+direcao).onclick=()=>{offsets[area]=Math.max(0,offsets[area]+passo);return carregar();};
  }
  for(const [nome,passo] of [['anterior',-50],['proxima',50]])$('agenda-'+nome).onclick=()=>{modulo.offsetAgenda=Math.max(0,modulo.offsetAgenda+passo);return renderAgenda();};
  for(const b of document.querySelectorAll('[data-area]'))b.addEventListener('click',()=>{
    const funcoes={clientes:carregarClientes,caixa:carregarCaixa,espera:carregarEspera};if(funcoes[b.dataset.area])funcoes[b.dataset.area]();
  });
  for(const b of document.querySelectorAll('[data-fechar]'))b.onclick=()=>fechar(b.dataset.fechar);
  for(const d of document.querySelectorAll('.dialog-rotina'))d.addEventListener('cancel',e=>{if(ocupado)e.preventDefault();});
  $('sair').addEventListener('click',()=>{
    for(const area of Object.keys(versoes))versoes[area]++;
    for(const d of document.querySelectorAll('.dialog-rotina'))fechar(d.id);
    for(const id of ['lista-clientes','historico-cliente','totais-caixa','formas-caixa','lista-despesas','lista-recebimentos','lista-espera'])$(id).replaceChildren();
    for(const area of Object.keys(offsets))offsets[area]=0;modulo.offsetAgenda=0;modulo.profissionais=[];
    agendamento=finalizacao=pagamentoAtual=clienteAtual=periodo=null;esperaId=despesaId=null;
    for(const id of ['form-cliente','form-agendamento-painel','form-pagamento','form-espera','form-despesa'])$(id).reset();
  });
  const f=$('filtro-caixa');f.elements.inicio.value=f.elements.fim.value=hoje();
  $('form-despesa').elements.data.value=hoje();$('form-despesa').elements.data.max=hoje();
  return modulo;
})();
