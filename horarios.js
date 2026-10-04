async function iniciarHorarios() {
const parametros = new URLSearchParams(window.location.search);
document.getElementById('voltar-servicos').href = `agendamento.html?${parametros}`;
const dias = document.getElementById('grade-dias');
let dataSelecionada = '';
const datasPermitidas = new Set();
const grade = document.getElementById('grade-horarios');
const statusHorario = document.getElementById('status-horarios');
const etapaDias = document.getElementById('etapa-dias');
const etapaHorarios = document.getElementById('etapa-horarios');
const resumoDia = document.getElementById('dia-escolhido');
const mudarDia = document.getElementById('mudar-dia');
const tituloHorarios = document.getElementById('titulo-horarios');
const hoje = new Date();
const remotos = new Map();
if(!AgendaDB.ativa){statusHorario.textContent='O agendamento ainda não foi configurado. Entre em contato com a barbearia.';return;}
if(AgendaDB.ativa){
 statusHorario.textContent='Consultando a agenda…';
 try{
  await Promise.all(Array.from({length:15},async(_,i)=>{
   const d=new Date(hoje.getFullYear(),hoje.getMonth(),hoje.getDate()+i,12);
   const iso=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');
   remotos.set(iso,await AgendaDB.horarios(iso,parametros.get('cabeleireiro')||'sem-preferencia'));
  }));
  document.querySelector('#etapa-horarios > p').textContent='Os horários seguem o tempo de atendimento de cada profissional. A disponibilidade será verificada novamente ao solicitar.';
  statusHorario.textContent='Selecione uma data.';
 }catch(e){statusHorario.textContent=e.message;return;}
}
for (let indice = 0; indice < 15; indice++) {
  const dia = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + indice, 12);
  const valor = `${dia.getFullYear()}-${String(dia.getMonth() + 1).padStart(2, '0')}-${String(dia.getDate()).padStart(2, '0')}`;
  const bloqueado = !remotos.get(valor)?.length;
  if (!bloqueado) datasPermitidas.add(valor);
  const label = document.createElement('label');
  label.className = 'horario dia';
  const input = document.createElement('input');
  input.type = 'radio';
  input.name = 'data';
  input.value = valor;
  input.required = true;
  input.disabled = bloqueado;
  input.setAttribute('aria-label', dia.toLocaleDateString('pt-BR', { dateStyle: 'full' }));
  const texto = document.createElement('span');
  const semana = document.createElement('small');
  semana.textContent = indice === 0 ? 'Hoje' : dia.toLocaleDateString('pt-BR', { weekday: 'short' });
  const numero = document.createElement('strong');
  numero.textContent = String(dia.getDate()).padStart(2, '0');
  const mes = document.createElement('small');
  mes.textContent = dia.toLocaleDateString('pt-BR', { month: 'short' });
  texto.append(semana, numero, mes);
  if (bloqueado) {
    label.classList.add('dia-bloqueado');
    const aviso = document.createElement('small');
    aviso.textContent = 'Indisponíveis';
    texto.append(aviso);
    input.setAttribute('aria-label', `${input.getAttribute('aria-label')} — indisponíveis`);
  }
  label.append(input, texto);
  dias.append(label);
}
document.getElementById('voltar-servicos').href = `agendamento.html?${parametros}`;
document.getElementById('escolha-atual').textContent = parametros.get('servico')
  ? `${parametros.get('servico')} • ${parametros.get('preco') || ''}`
  : 'Volte aos serviços para escolher seu atendimento.';

function renderizarHorarios() {
  grade.replaceChildren();
  if (!datasPermitidas.has(dataSelecionada)) {
    statusHorario.textContent = 'Selecione uma data válida a partir de hoje.';
    return;
  }
  const agora = new Date();
  etapaDias.hidden = true;
  etapaHorarios.hidden = false;
  resumoDia.hidden = false;
  tituloHorarios.textContent = 'Qual o melhor horário para você?';
  document.getElementById('texto-dia-escolhido').textContent = new Date(`${dataSelecionada}T12:00:00`).toLocaleDateString('pt-BR', { dateStyle: 'full' });
  const lista = remotos.get(dataSelecionada).map(h=>h.horario);
  for (const hora of lista) {
    if (new Date(`${dataSelecionada}T${hora}`) <= agora) continue;
    const botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'botao-horario';
    const relogio = document.createElement('img');
    relogio.src = 'assets/relogio.png';
    relogio.alt = '';
    relogio.className = 'relogio-horario';
    relogio.width = 40;
    relogio.height = 40;
    const textoHora = document.createElement('span');
    textoHora.textContent = hora;
    botao.append(relogio, textoHora);
    botao.addEventListener('click', () => avancar(hora));
    grade.append(botao);
  }
  statusHorario.textContent = grade.children.length
    ? 'Toque em um horário para abrir os dados do cliente.'
    : 'Não há mais horários para esta data. Escolha outro dia.';
  if (!grade.children.length) {
    datasPermitidas.delete(dataSelecionada);
    const inputDia = [...dias.querySelectorAll('input')].find(input => input.value === dataSelecionada);
    if (inputDia) {
      inputDia.disabled = true;
      inputDia.checked = false;
      inputDia.parentElement.classList.add('dia-bloqueado');
      const aviso = document.createElement('small');
      aviso.textContent = 'Indisponíveis';
      inputDia.parentElement.querySelector('span').append(aviso);
      inputDia.setAttribute('aria-label', `${inputDia.getAttribute('aria-label')} — indisponíveis`);
    }
  }
}

dias.addEventListener('change', () => {
  dataSelecionada = dias.querySelector('input:checked').value;
  renderizarHorarios();
  (grade.querySelector('button') || mudarDia).focus();
});
mudarDia.addEventListener('click', () => {
  etapaDias.hidden = false;
  etapaHorarios.hidden = true;
  resumoDia.hidden = true;
  grade.replaceChildren();
  tituloHorarios.textContent = 'Qual o melhor dia para você?';
  statusHorario.textContent = 'Selecione uma data para ver os horários.';
  const anterior = dias.querySelector('input:checked');
  if (anterior) anterior.checked = false;
  dataSelecionada = '';
  parametros.delete('data');
  parametros.delete('horario');
  (anterior && !anterior.disabled ? anterior : dias.querySelector('input:not(:disabled)'))?.focus();
});
function avancar(horario) {
  if (!datasPermitidas.has(dataSelecionada)) return;
  if (!parametros.get('servico')) {
    statusHorario.textContent = 'Volte aos serviços para escolher seu atendimento.';
    return;
  }
  if (new Date(`${dataSelecionada}T${horario}`) <= new Date()) {
    renderizarHorarios();
    return;
  }
  parametros.set('data', dataSelecionada);
  parametros.set('horario', horario);
  window.location.href = `resumo.html?${parametros}`;
}
if (datasPermitidas.has(parametros.get('data'))) {
  dataSelecionada = parametros.get('data');
  [...dias.querySelectorAll('input')].find(input => input.value === dataSelecionada).checked = true;
  renderizarHorarios();
}

}
iniciarHorarios();
