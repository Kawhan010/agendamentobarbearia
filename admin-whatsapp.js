// Prepara a conversa. A mensagem só é enviada quando o barbeiro toca em Enviar.
(() => {
  function telefone(valor) {
    let numero=String(valor||'').replace(/\D/g,'');
    if(/^\d{10,11}$/.test(numero))numero='55'+numero;
    if(!/^55\d{10,11}$/.test(numero))throw new Error('Confira o telefone do cliente antes de abrir o WhatsApp.');
    return numero;
  }
  function link(reserva) {
    if(reserva.status!=='confirmado')throw new Error('O agendamento precisa estar confirmado antes de avisar o cliente.');
    return 'https://api.whatsapp.com/send?phone='+telefone(reserva.telefone)+'&text='+encodeURIComponent('Agendamento confirmado');
  }
  window.ConfirmacaoWhatsApp=Object.freeze({telefone,link});
})();
