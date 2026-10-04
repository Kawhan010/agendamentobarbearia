window.FinanceiroAgenda={
  moeda:new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}),
  vazio:{confirmados:0,total_confirmado:0,pendentes:0,total_pendente:0,cancelados:0,profissionais:[]},
  limpar(){document.getElementById('resumo-financeiro').replaceChildren();},
  elemento(tag,texto,classe){const e=document.createElement(tag);e.textContent=texto;if(classe)e.className=classe;return e;},
  titulo(data){return data?'Resumo do dia — '+data.split('-').reverse().join('/'):'Resumo de todas as datas';},
  estado(data,mensagem){
    const area=document.getElementById('resumo-financeiro');
    area.replaceChildren(this.elemento('h3',this.titulo(data)),this.elemento('p',mensagem));
  },
  validar(r){
    if(!r||!Array.isArray(r.profissionais))throw new Error('Resumo inválido');
    for(const item of [r,...r.profissionais]){
      for(const campo of ['confirmados','pendentes','cancelados'])if(!Number.isSafeInteger(item[campo])||item[campo]<0)throw new Error('Contagem inválida');
      for(const campo of ['total_confirmado','total_pendente'])if(!Number.isFinite(Number(item[campo]))||item[campo]===null||item[campo]===''||Number(item[campo])<0)throw new Error('Valor inválido');
    }
  },
  renderizar(r,data){
    try{this.validar(r);}catch{this.estado(data,'Não foi possível calcular os totais. Clique em Atualizar para tentar novamente.');return;}
    const area=document.getElementById('resumo-financeiro');area.replaceChildren(this.elemento('h3',this.titulo(data)));
    const cards=this.elemento('div','','totais-agenda');
    for(const [titulo,total,quantidade] of [['Total confirmado',r.total_confirmado,r.confirmados],['Pendentes (previsto)',r.total_pendente,r.pendentes]]){
      const card=this.elemento('div','','total-agenda');
      card.append(this.elemento('span',titulo),this.elemento('strong',this.moeda.format(Number(total))),this.elemento('small',quantidade+' atendimento'+(quantidade===1?'':'s')));
      cards.append(card);
    }
    area.append(cards,this.elemento('p','Confirmados entram no total. Pendentes ficam à parte e cancelados não são somados.'));
    if(!r.profissionais.length){area.append(this.elemento('p',data?'Nenhum agendamento nesta data.':'Nenhum agendamento cadastrado.'));return;}
    const container=this.elemento('div','','tabela-totais');
    const tabela=this.elemento('table');
    tabela.append(this.elemento('caption','Valores por barbeiro'));
    const head=this.elemento('thead'),cabecalho=this.elemento('tr');
    for(const titulo of ['Barbeiro','Confirmados','Pendentes (previsto)']){const th=this.elemento('th',titulo);th.scope='col';cabecalho.append(th);}
    head.append(cabecalho);tabela.append(head);
    const body=this.elemento('tbody');
    for(const p of r.profissionais){
      const row=this.elemento('tr'),nome=this.elemento('th',p.nome||'Profissional');nome.scope='row';row.append(nome);
      for(const [total,quantidade] of [[p.total_confirmado,p.confirmados],[p.total_pendente,p.pendentes]]){
        const td=this.elemento('td');td.append(this.elemento('strong',this.moeda.format(Number(total))),this.elemento('small',quantidade+' atendimento'+(quantidade===1?'':'s')));row.append(td);
      }
      body.append(row);
    }
    tabela.append(body);container.append(tabela);area.append(container);
  },
};
