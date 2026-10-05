// Fluxos de exclusão com API simulada: não altera dados do Supabase publicado.
const {JSDOM}=require(require('node:path').join(process.argv[2],'node_modules/jsdom'));
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const loja={id:'10000000-0000-4000-8000-000000000001',slug:'loja-teste',nome:'Loja Teste',whatsapp:'5579999999999',logo:''};
const outraLoja='10000000-0000-4000-8000-000000000002',dia='2026-10-03',outroDia='2026-10-04';
const requests=[],confirmacoes=[];
const pessoas=[{id:'profissional-a',barbearia_id:loja.id,nome:'Barbeiro A',ativo:true,excluido:false,foto:''},{id:'profissional-b',barbearia_id:loja.id,nome:'Barbeiro B',ativo:false,excluido:false,foto:''}];
const reserva=(id,data=dia,tenant=loja.id)=>({id,barbearia_id:tenant,data,horario:'09:00:00',profissional:'profissional-a',cliente:'Cliente '+id,telefone:'79999999999',servico_nome:'Corte',status:'pendente'});
let reservas=[reserva('r1'),{...reserva('r2'),status:'cancelado'},reserva('r3',outroDia),reserva('r4',dia,outraLoja)];
let negarProfissional=false,perderProfissional=false,negarLimpeza=false,perderLimpeza=false,falharConsulta=false;
let duranteLimpeza=()=>{};
const resposta=(data,ok=true,status=200)=>({ok,status,json:async()=>structuredClone(data)});
function filtrar(rows,url){
  return rows.filter(row=>[...url.searchParams].every(([key,value])=>!value.startsWith('eq.')||String(row[key])===value.slice(3)));
}
(async()=>{
  const dom=new JSDOM(fs.readFileSync('admin.html','utf8'),{url:'https://teste.local/admin.html',runScripts:'outside-only'}),w=dom.window,d=w.document;
  for(const f of d.forms)for(const input of f.elements)if(input.name&&input.name!=='id')Object.defineProperty(f,input.name,{get:()=>f.elements.namedItem(input.name),configurable:true});
  w.crypto.randomUUID=require('node:crypto').randomUUID;
  w.fetch=async(url,options={})=>{
    requests.push({url,options});
    const parsed=new URL(url,w.location.href),method=options.method||'GET';
    if(url.includes('/auth/v1/token'))return resposta({access_token:'token-teste'});
    if(url.includes('/auth/v1/'))return resposta({});
    if(url.includes('saas_membros'))return resposta([{barbearia_id:loja.id}]);
    if(url.includes('saas_barbearias'))return resposta([loja]);
    if(url.includes('/saas_profissionais')){
      const rows=filtrar(pessoas,parsed);
      if(method==='PATCH'){
        if(negarProfissional)return resposta({message:'Sem permissão para excluir.'},false,403);
        rows.forEach(p=>Object.assign(p,JSON.parse(options.body)));
        if(perderProfissional)throw new Error('Resposta perdida');
      }
      return resposta(rows);
    }
    if(url.includes('rpc/saas_limpar_agendamentos')){
      duranteLimpeza();
      if(negarLimpeza)return resposta({message:'Limpeza não autorizada.'},false,403);
      const body=JSON.parse(options.body),antes=reservas.length;
      reservas=reservas.filter(r=>r.barbearia_id!==body.loja||!body.reservas.includes(r.id));
      if(perderLimpeza)throw new Error('Conexão interrompida');
      return resposta(antes-reservas.length);
    }
    if(url.includes('saas_reservas')){
      if(falharConsulta)throw new Error('Consulta indisponível');
      return resposta(filtrar(reservas,parsed));
    }
    if(url.includes('saas_servicos')||url.includes('saas_bloqueios'))return resposta([]);
    if(url.includes('saas_expediente'))return resposta(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'09:00',fim:'18:00',intervalo_inicio:null,intervalo_fim:null})));
    if(url.includes('saas_controle_agenda'))return resposta([{pausado:false}]);
    throw new Error('Requisição inesperada: '+url);
  };
  w.confirm=message=>{confirmacoes.push(message);return false;};
  for(const script of d.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(script.getAttribute('src').split('?')[0],'utf8'),dom.getInternalVMContext());
  const filtro=d.getElementById('filtro-data'),limpar=d.getElementById('limpar-agendamentos');
  const login=d.getElementById('form-login');filtro.value=dia;
  login.elements.email.value='dono@teste.local';login.elements.password.value='senha-teste';
  await login.onsubmit({preventDefault(){},target:login,submitter:login.querySelector('button')});
  assert.equal(d.getElementById('painel').hidden,false);
  assert.equal(d.querySelectorAll('#lista-agenda .linha-item').length,2);
  assert.equal(limpar.disabled,false);
  const botaoProfissional=(nome,texto)=>[...d.querySelectorAll('#lista-profissionais .linha-item')].find(row=>row.textContent.includes(nome)).querySelectorAll('button')[texto==='Editar'?0:2];
  const patches=()=>requests.filter(r=>r.options.method==='PATCH').length;
  const limpezas=()=>requests.filter(r=>r.url.includes('rpc/saas_limpar_agendamentos'));
  const antes=patches();await botaoProfissional('Barbeiro A','Excluir').onclick();
  assert.equal(patches(),antes);assert.equal(pessoas[0].excluido,false);
  assert.ok(confirmacoes.at(-1).includes('atendimentos já cadastrados serão mantidos'));
  await botaoProfissional('Barbeiro A','Editar').onclick();
  assert.equal(d.getElementById('form-profissional').elements.id.value,'profissional-a');
  w.confirm=message=>{confirmacoes.push(message);return true;};
  await botaoProfissional('Barbeiro A','Excluir').onclick();
  assert.equal(pessoas[0].excluido,true);assert.equal(pessoas[0].ativo,false);
  assert.equal(reservas.length,4);assert.equal(d.querySelectorAll('#lista-profissionais .linha-item').length,1);
  assert.equal(d.getElementById('form-profissional').elements.id.value,'');
  const exclusao=requests.find(r=>r.options.method==='PATCH'&&JSON.parse(r.options.body).excluido);
  assert.ok(exclusao.url.includes('barbearia_id=eq.'+loja.id));
  assert.deepEqual(JSON.parse(exclusao.options.body),{excluido:true,ativo:false});
  negarProfissional=true;await botaoProfissional('Barbeiro B','Excluir').onclick();
  assert.equal(pessoas[1].excluido,false);assert.ok(d.getElementById('aviso').textContent.includes('Sem permissão'));
  assert.equal(d.getElementById('campos-profissional').disabled,false);
  negarProfissional=false;perderProfissional=true;await botaoProfissional('Barbeiro B','Excluir').onclick();
  assert.equal(pessoas[1].excluido,true);assert.equal(d.querySelectorAll('#lista-profissionais .linha-item').length,0);
  assert.ok(d.getElementById('aviso').textContent.includes('agendamentos existentes foram mantidos'));
  // Cancelar a confirmação não dispara o RPC.
  w.confirm=message=>{confirmacoes.push(message);return false;};
  await limpar.onclick();assert.equal(limpezas().length,0);assert.equal(reservas.length,4);
  assert.ok(confirmacoes.at(-1).includes('2 agendamentos de 03/10/2026'));
  assert.ok(confirmacoes.at(-1).includes('não pode ser desfeita'));
  // Uma reserva que chegou depois da consulta não faz parte da lista confirmada.
  w.confirm=message=>{confirmacoes.push(message);reservas.push(reserva('nova'));return true;};
  duranteLimpeza=()=>{
    assert.equal(limpar.disabled,true);
    for(const id of ['filtro-data','atualizar','sair'])assert.equal(d.getElementById(id).disabled,true);
    for(const button of d.querySelectorAll('#lista-agenda button'))assert.equal(button.disabled,true);
  };
  await limpar.onclick();
  assert.deepEqual(JSON.parse(limpezas()[0].options.body),{loja:loja.id,reservas:['r1','r2']});
  assert.deepEqual(reservas.map(r=>r.id).sort(),['nova','r3','r4']);
  assert.equal(d.querySelectorAll('#lista-agenda .linha-item').length,1);
  assert.equal(limpar.disabled,false);assert.equal(filtro.disabled,false);
  assert.ok(d.getElementById('aviso').textContent.includes('2 agendamentos excluídos'));
  w.confirm=message=>{confirmacoes.push(message);return true;};
  filtro.value='';await filtro.onchange();
  assert.equal(d.querySelectorAll('#lista-agenda .linha-item').length,2);
  assert.ok(d.getElementById('lista-agenda').textContent.includes('04/10/2026'));
  assert.ok(d.getElementById('escopo-limpeza-agenda').textContent.includes('desta página'));
  assert.ok(d.getElementById('escopo-limpeza-agenda').textContent.includes('preservados'));
  await limpar.onclick();
  assert.ok(confirmacoes.at(-1).includes('de todas as datas'));
  assert.deepEqual(JSON.parse(limpezas()[1].options.body).reservas.sort(),['nova','r3']);
  assert.deepEqual(reservas.map(r=>r.id),['r4']);assert.equal(limpar.disabled,true);
  const semReservas=limpezas().length;await limpar.onclick();assert.equal(limpezas().length,semReservas);
  // Falha na consulta não permite limpar a lista antiga.
  reservas.push(reserva('falha'));falharConsulta=true;await d.getElementById('atualizar').onclick();
  assert.equal(limpar.disabled,true);assert.equal(d.querySelectorAll('#lista-agenda .linha-item').length,0);
  assert.ok(d.getElementById('escopo-limpeza-agenda').textContent.includes('Atualize a lista'));
  falharConsulta=false;await d.getElementById('atualizar').onclick();
  negarLimpeza=true;await limpar.onclick();
  assert.ok(reservas.some(r=>r.id==='falha'));assert.equal(limpar.disabled,false);
  assert.ok(d.getElementById('aviso').textContent.includes('não autorizada'));
  negarLimpeza=false;perderLimpeza=true;await limpar.onclick();
  assert.ok(!reservas.some(r=>r.id==='falha'));assert.equal(limpar.disabled,true);
  assert.ok(d.getElementById('aviso').textContent.includes('Conexão interrompida'));
  // Respostas fora de ordem não substituem o último filtro selecionado.
  perderLimpeza=false;reservas.push(reserva('hoje'),reserva('amanha',outroDia));
  const fetchOriginal=w.fetch;let concluirAntiga;
  w.fetch=(url,options)=>url.includes('saas_reservas')&&url.includes('data=eq.'+dia)?new Promise(resolve=>{concluirAntiga=()=>resolve(resposta([reserva('antiga')]));}):fetchOriginal(url,options);
  filtro.value=dia;const consultaAntiga=filtro.onchange();assert.equal(limpar.disabled,true);
  filtro.value=outroDia;await filtro.onchange();
  concluirAntiga();await consultaAntiga;
  assert.ok(d.getElementById('lista-agenda').textContent.includes('amanha'));
  assert.ok(!d.getElementById('lista-agenda').textContent.includes('antiga'));
  w.fetch=fetchOriginal;await limpar.onclick();
  assert.deepEqual(JSON.parse(limpezas().at(-1).options.body).reservas,['amanha']);
  await d.getElementById('sair').onclick();
  assert.equal(limpar.disabled,true);assert.equal(d.getElementById('lista-agenda').children.length,0);
  assert.equal(d.getElementById('lista-profissionais').children.length,0);
  dom.window.close();
  console.log('OK: exclusão com histórico, confirmação e cancelamento, filtro por data/todas, limpeza por IDs, reservas novas preservadas, falhas, controles desabilitados, respostas fora de ordem e logout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
