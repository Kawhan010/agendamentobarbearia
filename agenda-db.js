window.AgendaDB = {
  get ativa() { return Boolean(window.AGENDA_CONFIG?.enabled && window.AGENDA_CONFIG?.publicKey); },
  async request(path, body) {
    const c=window.AGENDA_CONFIG;
    const r=await fetch(c.url+'/rest/v1/'+path,{method:body?'POST':'GET',headers:{apikey:c.publicKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
    const result=await r.json().catch(()=>null);
    if(!r.ok)throw new Error(result?.message==='Expediente pausado'?'A barbearia pausou os agendamentos. Tente novamente quando o expediente for retomado.':result?.message==='Horário indisponível'?'Este horário não está mais disponível. Escolha outro horário.':'Não foi possível consultar ou salvar na agenda. Tente novamente.');
    return result;
  },
  horarios(data, profissional) {return this.request('rpc/horarios_livres',{dia:data,barbeiro:profissional});}
};
