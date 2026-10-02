const $ = id => document.getElementById(id);
const config = window.AGENDA_CONFIG;
let token = '', demo = false;
let pausado = false, intervalosProntos = false;
let servicos = [], expediente = [], bloqueios = [];
const aviso = mensagem => { $('aviso').textContent = mensagem; };
const semana = ['Domingo','Segunda','Terça','Quarta','Quinta','Sexta','Sábado'];
async function api(path, method = 'GET', body) {
  const response = await fetch(config.url + path, {method, headers:{apikey:config.publicKey, Authorization:'Bearer ' + token, 'Content-Type':'application/json', Prefer:'return=representation'}, ...(body ? {body:JSON.stringify(body)} : {})});
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(response.status === 401 ? 'Sessão expirada. Saia e entre novamente.' : 'Não foi possível concluir. Confira sua conexão e a permissão do usuário.');
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
  renderServicos();renderExpediente();renderBloqueios();await renderAgenda();
}
function renderServicos(){
  $('lista-servicos').replaceChildren();
  servicos.forEach(s=>{$('lista-servicos').append(linha(s.nome,Number(s.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})+' • '+s.categoria+(s.ativo?'':' • Inativo'),[
    acao('Editar',()=>{const f=$('form-servico');for(const key of ['id','nome','descricao','preco','categoria','imagem'])f.elements[key].value=s[key]??'';$('titulo-editor').textContent='Editar serviço';f.elements.nome.focus();}),
    acao(s.ativo?'Remover do catálogo':'Reativar',async()=>{await salvar('servicos',s.id,{ativo:!s.ativo});if(demo)s.ativo=!s.ativo;await carregar();})]));});
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
  const data=$('filtro-data').value;
  const reservas=demo?[]:await api('/rest/v1/reservas?select=*&order=horario'+(data?'&data=eq.'+data:''));
  $('lista-agenda').replaceChildren();
  if(!reservas.length)$('lista-agenda').append(el('p',demo?'Nenhum agendamento de demonstração.':'Nenhum agendamento nesta data.'));
  reservas.forEach(r=>$('lista-agenda').append(linha(r.horario.slice(0,5)+' • '+r.cliente,r.telefone+' • '+r.servico_nome+' • '+r.status,r.status==='cancelado'?[]:[acao('Confirmar',async()=>{await salvar('reservas',r.id,{status:'confirmado'});await renderAgenda();}),acao('Cancelar',async()=>{await salvar('reservas',r.id,{status:'cancelado'});await renderAgenda();})])));
}
$('form-login').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{
  if(!config.publicKey)throw new Error('Conexão pendente. A chave pública do Supabase ainda não foi configurada.');
  const f=e.target;const response=await fetch(config.url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:config.publicKey,'Content-Type':'application/json'},body:JSON.stringify({email:f.email.value,password:f.password.value})});
  const sessao=await response.json();if(!response.ok)throw new Error('Não foi possível entrar. Confira e-mail e senha.');token=sessao.access_token;
  const admins=await api('/rest/v1/administradores?select=user_id');if(!admins.length){token='';throw new Error('Este usuário não tem acesso ao painel.');}
  demo=false;await carregar();$('login').hidden=true;$('painel').hidden=false;$('sair').hidden=false;f.reset();aviso('Conectado ao Supabase.');
}catch(err){aviso(err.message);}finally{b.disabled=false;}};
$('demonstracao').onclick=async()=>{demo=true;try{servicos=await fetch('catalogo-inicial.json').then(r=>r.json());expediente=semana.map((_,id)=>({id,aberto:id!==1,inicio:'09:00',fim:'18:00'}));bloqueios=[];await carregar();$('login').hidden=true;$('painel').hidden=false;$('sair').hidden=false;aviso('Demonstração: dados de exemplo. Nenhuma alteração é enviada ao Supabase.');}catch{aviso('Abra o site pelo Live Server para carregar a demonstração.');}};
$('sair').onclick=()=>{token='';demo=false;$('painel').hidden=true;$('login').hidden=false;$('sair').hidden=true;aviso('Você saiu do painel.');};
for(const b of document.querySelectorAll('[data-area]')) b.onclick=()=>{document.querySelectorAll('.area').forEach(a=>a.hidden=a.id!==b.dataset.area);document.querySelectorAll('[data-area]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));};
$('form-servico').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const f=e.target;const imagem=f.imagem.value.trim();if(imagem&&!/^(assets\/[^\s]+|https:\/\/)/.test(imagem))throw new Error('Use um caminho assets/ ou uma URL HTTPS.');const dados={nome:f.nome.value.trim(),descricao:f.descricao.value.trim(),preco:Number(f.preco.value),categoria:f.categoria.value,imagem,ativo:true};if(!dados.nome)throw new Error('Informe o nome.');await salvar('servicos',f.elements.id.value,dados);if(demo){const old=servicos.find(s=>s.id===f.elements.id.value);if(old)Object.assign(old,dados);else servicos.push({...dados,id:crypto.randomUUID()});}f.reset();$('titulo-editor').textContent='Adicionar serviço';await carregar();}catch(err){aviso(err.message);}finally{b.disabled=false;}};
$('limpar-servico').onclick=()=>{$('form-servico').reset();$('form-servico').elements.id.value='';$('titulo-editor').textContent='Adicionar serviço';};
$('form-expediente').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const f=e.target;const novos=expediente.map(d=>({id:d.id,aberto:f.elements['aberto-'+d.id].checked,inicio:f.elements['inicio-'+d.id].value,fim:f.elements['fim-'+d.id].value,...(intervalosProntos?{intervalo_inicio:f.elements['intervalo_inicio-'+d.id].value||null,intervalo_fim:f.elements['intervalo_fim-'+d.id].value||null}:{})}));if(novos.some(d=>d.aberto&&d.fim<=d.inicio))throw new Error('O fechamento deve ser depois da abertura.');if(novos.some(d=>(Boolean(d.intervalo_inicio)!==Boolean(d.intervalo_fim))||(d.intervalo_inicio&&(d.intervalo_inicio<d.inicio||d.intervalo_fim>d.fim||d.intervalo_fim<=d.intervalo_inicio))))throw new Error('Preencha as duas horas do intervalo, dentro do expediente e em ordem.');if(!demo)await api('/rest/v1/rpc/salvar_expediente','POST',{dias:novos});expediente=novos;aviso(demo?'Expediente alterado apenas na demonstração.':'Expediente salvo.');}catch(err){aviso(err.message);}finally{b.disabled=false;}};
$('form-bloqueio').onsubmit=async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const f=e.target;const dados={data:f.data.value,horario:f.horario.value||null,motivo:f.motivo.value};await salvar('bloqueios',null,dados);if(demo)bloqueios.push({...dados,id:crypto.randomUUID()});f.reset();await carregar();}catch(err){aviso(err.message);}finally{b.disabled=false;}};
$('atualizar').onclick=()=>renderAgenda().catch(e=>aviso(e.message));$('filtro-data').onchange=$('atualizar').onclick;
const hoje=new Date();$('filtro-data').value=[hoje.getFullYear(),String(hoje.getMonth()+1).padStart(2,'0'),String(hoje.getDate()).padStart(2,'0')].join('-');
if(!config.publicKey)aviso('Painel em preparação. Você já pode explorar a demonstração.');


