// Prepara a conversa. A mensagem só é enviada quando o barbeiro toca em Enviar.
(() => {
  function telefone(valor) {
    let numero=String(valor||'').replace(/\D/g,'');
    if(/^\d{10,11}$/.test(numero))numero='55'+numero;
    if(!/^55\d{10,11}$/.test(numero))throw new Error('Confira o telefone do cliente antes de abrir o WhatsApp.');
    return numero;
  }
  const texto=valor=>String(valor||'').trim().replace(/[\r\n\t]+/g,' ');
  function link(reserva,loja,profissional='') {
    if(reserva.status!=='confirmado')throw new Error('O agendamento precisa estar confirmado antes de avisar o cliente.');
    const data=String(reserva.data||''),hora=String(reserva.horario||'');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(data)||!/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(hora))throw new Error('Confira a data e o horário do agendamento.');
    const mensagem=[
      'Olá, '+texto(reserva.cliente)+'! ✂️',
      'Seu agendamento na '+texto(loja.nome)+' está confirmado. ✅',
      '',
      '📅 Data: '+data.split('-').reverse().join('/'),
      '🕒 Horário: '+hora.slice(0,5),
      ...(texto(profissional)?['💈 Profissional: '+texto(profissional)]:[]),
      '✂️ Serviço: '+texto(reserva.servico_nome),
      ...(reserva.preco!==null&&reserva.preco!==undefined&&reserva.preco!==''&&Number.isFinite(Number(reserva.preco))?['💰 Valor: '+Number(reserva.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})]:[]),
      '',
      'Se precisar alterar ou cancelar, responda a esta mensagem.',
      'Esperamos você!',
    ].join('\n');
    return 'https://api.whatsapp.com/send?phone='+telefone(reserva.telefone)+'&text='+encodeURIComponent(mensagem);
  }
  window.ConfirmacaoWhatsApp=Object.freeze({telefone,link});
})();
