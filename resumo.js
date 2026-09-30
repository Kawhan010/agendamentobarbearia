const parametros = new URLSearchParams(window.location.search);
const profissionais = new Map([
  ['profissional-1', 'Josuell Salles'],
  ['profissional-2', 'Profissional 2'],
  ['sem-preferencia', 'Sem preferência'],
]);
const profissional = parametros.get('cabeleireiro');
document.getElementById('resumo-profissional').textContent = profissionais.get(profissional) || 'Não selecionado';
document.getElementById('resumo-escolha').textContent = parametros.get('servico') || 'Não selecionado';
document.getElementById('resumo-preco').textContent = parametros.get('preco') || '—';
document.getElementById('voltar-servicos').href = `horarios.html?${parametros}`;
const dataEscolhida = parametros.get('data');
if (/^\d{4}-\d{2}-\d{2}$/.test(dataEscolhida || '') && parametros.get('horario')) {
  document.getElementById('resumo-horario').textContent = `${dataEscolhida.split('-').reverse().join('/')} às ${parametros.get('horario')}`;
}

const formulario = document.getElementById('dados-cliente');
const nome = document.getElementById('nome-cliente');
const telefone = document.getElementById('telefone-cliente');
const statusCliente = document.getElementById('status-cliente');

function formatarTelefone(valor) {
  let digitos = valor.replace(/\D/g, '');
  if (digitos.startsWith('55') && digitos.length > 11) digitos = digitos.slice(2);
  digitos = digitos.slice(0, 11);
  if (digitos.length <= 2) return digitos;
  const numero = digitos.slice(2);
  const separacao = numero.length > 8 ? 5 : 4;
  return `(${digitos.slice(0, 2)}) ${numero.slice(0, separacao)}${numero.length > separacao ? '-' + numero.slice(separacao) : ''}`;
}

telefone.addEventListener('input', () => {
  telefone.value = formatarTelefone(telefone.value);
});
telefone.addEventListener('paste', (evento) => {
  evento.preventDefault();
  const inicio = telefone.selectionStart ?? telefone.value.length;
  const fim = telefone.selectionEnd ?? inicio;
  telefone.value = formatarTelefone(telefone.value.slice(0, inicio) + evento.clipboardData.getData('text') + telefone.value.slice(fim));
  telefone.dispatchEvent(new Event('input', { bubbles: true }));
});

try {
  const dados = JSON.parse(sessionStorage.getItem('dados-cliente') || 'null');
  if (dados) {
    nome.value = dados.nome || '';
    telefone.value = formatarTelefone(dados.telefone || '');
  }
} catch {
  // O formulário funciona mesmo quando o armazenamento não está disponível.
}

formulario.addEventListener('input', () => {
  nome.setCustomValidity('');
  telefone.setCustomValidity('');
  statusCliente.textContent = 'O agendamento ainda não foi confirmado.';
});

let enviando = false;
formulario.addEventListener('submit', async (evento) => {
  evento.preventDefault();
  if (enviando) return;
  const cancelar = evento.submitter?.value === 'cancelar';
  nome.setCustomValidity(nome.value.trim() ? '' : 'Informe seu nome.');
  const digitos = telefone.value.replace(/\D/g, '');
  const numeroLocal = digitos.startsWith('55') && digitos.length > 11 ? digitos.slice(2) : digitos;
  telefone.setCustomValidity(/^\d{10,11}$/.test(numeroLocal) ? '' : 'Informe um telefone com DDD e 10 ou 11 dígitos.');
  if (!formulario.reportValidity()) return;
  const horarioEscolhido = parametros.get('horario');
  const instante = new Date(`${dataEscolhida}T${horarioEscolhido}`);
  if (!profissionais.has(profissional) || !parametros.get('servico') || !parametros.get('preco') ||
      !/^\d{4}-\d{2}-\d{2}$/.test(dataEscolhida || '') ||
      !/^\d{2}:\d{2}$/.test(horarioEscolhido || '') ||
      Number.isNaN(instante.getTime()) || (!cancelar && (instante <= new Date() || (!AgendaDB.ativa && instante.getDay() === 1)))) {
    statusCliente.textContent = 'Revise o serviço e escolha uma data e um horário válidos antes de solicitar.';
    return;
  }
  try {
    sessionStorage.setItem('dados-cliente', JSON.stringify({ nome: nome.value.trim(), telefone: telefone.value.trim() }));
  } catch {
    // A abertura do WhatsApp não depende do armazenamento local.
  }
  const mensagemCancelamento = [
    '❌ *SOLICITAÇÃO DE CANCELAMENTO*',
    `👥 CLIENTE: *${nome.value.trim()}*`,
    `📞 TELEFONE: ${telefone.value.replace(/\D/g, '')}`,
    '=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=',
    `📌 DIA ${dataEscolhida.split('-').reverse().join('-')}`,
    `⌚ HORÁRIO ${horarioEscolhido}:00`,
    '',
    '💇🏽‍♂️ *PROFISSIONAL*',
    profissionais.get(profissional),
    '',
    '✂️ *SERVIÇO*',
    `${parametros.get('servico')} - ${parametros.get('preco')}`,
    '',
    'Gostaria de cancelar este atendimento. Pode confirmar o cancelamento?',
  ].join('\n');
  const linkCancelamento = `https://wa.me/557998815390?text=${encodeURIComponent(mensagemCancelamento)}`;
  if (cancelar) {
    statusCliente.textContent = 'Envie o pedido no WhatsApp e aguarde a confirmação do cancelamento.';
    window.location.href = linkCancelamento;
    return;
  }
  let profissionalFinal = profissionais.get(profissional);
  if (AgendaDB.ativa) {
    enviando = true;
    const botoes = formulario.querySelectorAll('button');
    botoes.forEach(b=>b.disabled=true);
    statusCliente.textContent = 'Verificando e reservando o horário…';
    try {
      const reserva = await AgendaDB.request('rpc/reservar', {
        dia: dataEscolhida, hora: horarioEscolhido, barbeiro: profissional,
        servico: parametros.get('servico_id'), nome: nome.value.trim(), telefone_cliente: numeroLocal,
      });
      profissionalFinal = profissionais.get(reserva.profissional);
      parametros.set('servico', reserva.nome);
      parametros.set('preco', Number(reserva.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}));
      document.getElementById('resumo-profissional').textContent = profissionalFinal;
      document.getElementById('resumo-preco').textContent = parametros.get('preco');
    } catch (erro) {
      statusCliente.textContent = erro.message;
      return;
    } finally {
      enviando=false;
      botoes.forEach(b=>b.disabled=false);
    }
  }
  const mensagem = [
    '📆 *MEU AGENDAMENTO*',
    `👥 CLIENTE: *${nome.value.trim()}*`,
    `📞 TELEFONE: ${telefone.value.replace(/\D/g, '')}`,
    '=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=',
    `📌 DIA ${dataEscolhida.split('-').reverse().join('-')}`,
    `⌚ HORÁRIO ${horarioEscolhido}:00`,
    '',
    '💇🏽‍♂️ *PROFISSIONAL*',
    profissionalFinal,
    '',
    '✂️ *SERVIÇO*',
    `${parametros.get('servico')} - ${parametros.get('preco')}`,
    '',
    '=-=-=-=-=-=-=-=-=-=-=-=-=-==-=-=',
    '',
    '*CASO DESEJE CANCELAR O AGENDAMENTO*',
    '❌ Abra o link abaixo e envie o pedido de cancelamento:',
    'https://wa.me/5579996776478?text=Quero%20cancelar%20meu%20agendamento',
    '',
    '*SOLICITAÇÃO DE AGENDAMENTO*',
    'Aguardando confirmação do barbeiro.',
  ].join('\n');
  statusCliente.textContent = 'Envie a mensagem no WhatsApp e aguarde a confirmação do barbeiro.';
  window.location.href = `https://wa.me/557998815390?text=${encodeURIComponent(mensagem)}`;
});
