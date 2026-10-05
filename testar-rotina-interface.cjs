// API em memória: verifica a experiência completa sem alterar clientes reais.
const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),assert=require('node:assert/strict');
const {JSDOM}=require(path.join(process.argv[2],'node_modules/jsdom'));
const loja={id:'10000000-0000-4000-8000-000000000001',nome:'Barbearia Teste',slug:'teste',logo:'',whatsapp:'5579999999999'};
const profissional={id:'prof-a',nome:'Barbeiro A',barbearia_id:loja.id,ativo:true,excluido:false,duracao_minutos:20,foto:''};
const servico={id:'20000000-0000-4000-8000-000000000001',nome:'Corte',preco:30,categoria:'individual',ativo:true};
const dia=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Sao_Paulo'}).format(new Date());
const resposta=(data,ok=true)=>({ok,status:ok?200:500,json:async()=>structuredClone(data)});
const reservas=[],pagamentos=[],despesas=[],clientes=[],esperas=[],requests=[];
let perderCriacao=false,perderDespesa=false,erroCaixa=false,caixaMalformado=false,segurarVagas=null,erroFinalizar=false,perderFinalizacao=false,segurarFinalizacao=null;
const reserva=(id,nome='Cliente',status='confirmado')=>({id,barbearia_id:loja.id,cliente:nome,telefone:'79922222222',servico_id:servico.id,servico_nome:'Corte',preco:30,profissional:profissional.id,data:dia,horario:'00:00:00',duracao_minutos:20,status,atualizado_em:'2026-10-04T00:00:00Z'});
function filtrar(rows,url){
 return rows.filter(r=>[...url.searchParams].every(([k,v])=>v.startsWith('eq.')?String(r[k])===v.slice(3):v.startsWith('gte.')?String(r[k])>=v.slice(4):v.startsWith('lte.')?String(r[k])<=v.slice(4):v.startsWith('in.')?v.slice(4,-1).split(',').includes(r[k]):true));
}
function paginar(rows,url){return rows.slice(Number(url.searchParams.get('offset')||0),Number(url.searchParams.get('offset')||0)+Number(url.searchParams.get('limit')||1000));}
function detalhes(r){return {...r,saas_pagamentos:pagamentos.find(p=>p.reserva_id===r.id)||null,saas_profissionais:{nome:profissional.nome}};}
function perfil(r){if(!clientes.some(c=>c.telefone===r.telefone))clientes.push({barbearia_id:loja.id,telefone:r.telefone,nome:r.cliente,observacoes:''});}
reservas.push(reserva('30000000-0000-4000-8000-000000000001','José <img src=x>','pendente'));perfil(reservas[0]);
(async()=>{
 const dom=new JSDOM(fs.readFileSync('admin.html','utf8'),{url:'https://teste.local/admin.html',runScripts:'outside-only'}),w=dom.window,d=w.document;
 const DataOriginal=w.Date,agoraTeste=Date.parse(dia+'T12:00:00-03:00');
 w.Date=class extends DataOriginal{constructor(...args){super(...(args.length?args:[agoraTeste]));}static now(){return agoraTeste;}};
 for(const f of d.forms)for(const input of f.elements)if(input.name&&input.name!=='id')Object.defineProperty(f,input.name,{get:()=>f.elements.namedItem(input.name),configurable:true});
 w.crypto.randomUUID=require('node:crypto').randomUUID;w.confirm=()=>true;let aberturas=0;w.open=()=>{aberturas++;return null;};
 w.fetch=async(raw,options={})=>{
  requests.push({url:raw,options});const url=new URL(raw),t=url.pathname.split('/').pop(),method=options.method||'GET',body=options.body?JSON.parse(options.body):{};
  if(url.pathname.includes('/auth/v1/token'))return resposta({access_token:'teste-token'});
  if(url.pathname.includes('/rpc/')){
   assert.equal(body.loja,loja.id);assert.equal(options.headers.Authorization,'Bearer teste-token');
   if(t==='saas_resumo_financeiro')return resposta({confirmados:0,total_confirmado:0,pendentes:0,total_pendente:0,cancelados:0,profissionais:[]});
   if(t==='saas_horarios_painel'){if(segurarVagas){const espera=segurarVagas;segurarVagas=null;await espera;}return resposta([{horario:'00:00'},{horario:'00:20'},{horario:'00:40'}]);}
   if(t==='saas_agendar_painel'){
    let r=reservas.find(r=>r.id===body.reserva);
    if(!r){r=reserva(body.nova_reserva,body.nome);reservas.push(r);}
    Object.assign(r,{cliente:body.nome,telefone:body.telefone_cliente,data:body.dia,horario:body.hora+':00',profissional:body.barbeiro});perfil(r);
    if(body.espera){const e=esperas.find(e=>e.id===body.espera);e.status='agendado';e.reserva_id=r.id;}
    if(perderCriacao){perderCriacao=false;throw new Error('Resposta perdida');}return resposta(r);
   }
   if(t==='saas_finalizar_atendimento'){
    if(erroFinalizar)return resposta({message:'Não foi possível salvar o atendimento'},false);
    if(segurarFinalizacao){const espera=segurarFinalizacao;segurarFinalizacao=null;await espera;}
    const r=reservas.find(r=>r.id===body.reserva);r.status=body.estado;
    if(perderFinalizacao){perderFinalizacao=false;throw new Error('Resposta perdida');}return resposta(r);
   }
   if(t==='saas_registrar_pagamento'){
    let p=pagamentos.find(p=>p.reserva_id===body.reserva);if(!p){p={id:w.crypto.randomUUID(),barbearia_id:loja.id,reserva_id:body.reserva};pagamentos.push(p);}
    Object.assign(p,{valor:body.valor_recebido,forma:body.forma_pagamento,data:body.dia});return resposta(p);
   }
   if(t==='saas_salvar_cliente'){Object.assign(clientes.find(c=>c.telefone===body.telefone_cliente),{nome:body.nome,observacoes:body.notas});return resposta(null);}
   if(t==='saas_historico_cliente'){
    const rows=reservas.filter(r=>r.telefone===body.telefone_cliente);return resposta({total:rows.length,concluidos:rows.filter(r=>r.status==='concluido').length,faltas:rows.filter(r=>r.status==='faltou').length,ultima_visita:dia,
     atendimentos:rows.slice(body.deslocamento,body.deslocamento+20).map(r=>({...r,profissional:profissional.nome,recebido:pagamentos.find(p=>p.reserva_id===r.id)?.valor??null,forma:pagamentos.find(p=>p.reserva_id===r.id)?.forma||null}))});
   }
   if(t==='saas_caixa'){
    if(erroCaixa)return resposta({message:'Caixa indisponível'},false);
    if(caixaMalformado)return resposta({entradas:40,despesas:null,saldo:40,formas:{pix:40,dinheiro:0,cartao:0}});
    const p=pagamentos.filter(p=>p.data>=body.inicio&&p.data<=body.fim),desp=despesas.filter(p=>p.data>=body.inicio&&p.data<=body.fim),entradas=p.reduce((n,p)=>n+p.valor,0),saidas=desp.reduce((n,p)=>n+p.valor,0);
    return resposta({entradas,despesas:saidas,saldo:entradas-saidas,formas:Object.fromEntries(['pix','dinheiro','cartao'].map(f=>[f,p.filter(p=>p.forma===f).reduce((n,p)=>n+p.valor,0)]))});
   }
   if(t==='saas_limpar_agendamentos')return resposta(0);
   throw new Error('RPC inesperada '+t);
  }
  if(t==='saas_membros')return resposta([{barbearia_id:loja.id}]);if(t==='saas_barbearias')return resposta([loja]);
  if(t==='saas_profissionais')return resposta([profissional]);if(t==='saas_servicos')return resposta([servico]);
  if(t==='saas_expediente')return resposta(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'00:00',fim:'23:59',intervalo_inicio:null,intervalo_fim:null})));
  if(t==='saas_controle_agenda')return resposta([{pausado:false}]);if(t==='saas_bloqueios')return resposta([]);
  if(t==='saas_reservas'){
   const rows=filtrar(reservas,url);if(method==='PATCH')rows.forEach(r=>Object.assign(r,body));return resposta(paginar(rows,url).map(detalhes));
  }
  if(t==='saas_clientes')return resposta(paginar(filtrar(clientes,url),url));
  if(t==='saas_pagamentos')return resposta(paginar(filtrar(pagamentos,url),url).map(p=>({...p,saas_reservas:reservas.find(r=>r.id===p.reserva_id)})));
  if(t==='saas_despesas'){
   if(method==='POST'){despesas.push(body);if(perderDespesa){perderDespesa=false;throw new Error('Resposta perdida');}return resposta([body]);}
   if(method==='DELETE'){const index=despesas.findIndex(p=>p.id===url.searchParams.get('id').slice(3));if(index>=0)despesas.splice(index,1);return resposta([]);}
   return resposta(paginar(filtrar(despesas,url),url));
  }
  if(t==='saas_espera'){
   if(method==='POST'){esperas.push({...body,status:'aguardando'});return resposta([body]);}
   const rows=filtrar(esperas,url);if(method==='PATCH')rows.forEach(r=>Object.assign(r,body));
   return resposta(paginar(rows,url).map(r=>({...r,saas_servicos:{nome:'Corte'},saas_profissionais:{nome:profissional.nome}})));
  }
  throw new Error('Requisição inesperada '+raw);
 };
 for(const s of d.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(s.getAttribute('src').split('?')[0],'utf8'),dom.getInternalVMContext());
 const form=id=>d.getElementById(id),submit=async id=>{const f=form(id);await f.onsubmit({preventDefault(){},target:f,submitter:f.querySelector('button[type="submit"]')});};
 const botao=(nome,area='lista-agenda')=>[...form(area).querySelectorAll('button')].find(b=>b.textContent===nome);
 const tick=()=>new Promise(resolve=>setTimeout(resolve,20));
 async function area(id){d.querySelector('[data-area="'+id+'"]').click();await tick();}
 form('form-login').elements.email.value='dono@teste.local';form('form-login').elements.password.value='senha';await submit('form-login');
 assert.equal(form('painel').hidden,false);assert.equal(form('lista-agenda').querySelector('img'),null);
 const lembrete=form('lista-agenda').querySelector('a.acao-whatsapp'),link=new URL(lembrete.href);
 assert.equal(link.searchParams.get('phone'),'5579922222222');assert.ok(link.searchParams.get('text').includes('00:00'));assert.equal(aberturas,0);
 await botao('Confirmar').onclick();
 // Horário futuro fica explicado no cartão e na confirmação, sem gravar no banco.
 reservas[0].horario='23:59:00';await form('atualizar').onclick();assert.ok(form('lista-agenda').textContent.includes('Só é possível concluir'));
 w.confirm=()=>{throw new Error('A finalização não deve depender do diálogo nativo');};
 await botao('Concluir atendimento').onclick();assert.equal(form('dialog-finalizar').hasAttribute('open'),true);
 assert.equal(form('form-finalizar').querySelector('[type="submit"]').disabled,true);assert.ok(form('aviso-finalizar').textContent.includes('23:59'));
 const finais=()=>requests.filter(r=>r.url.includes('/saas_finalizar_atendimento'));
 const antes=finais().length;await submit('form-finalizar');assert.equal(finais().length,antes);
 assert.equal(reservas[0].status,'confirmado');d.querySelector('[data-fechar="dialog-finalizar"]').click();
 reservas[0].horario='00:00:00';await form('atualizar').onclick();
 await botao('Concluir atendimento').onclick();assert.equal(reservas[0].status,'confirmado');assert.equal(form('form-finalizar').querySelector('[type="submit"]').disabled,false);
 assert.equal(form('dialog-finalizar').querySelector('img'),null);d.querySelector('[data-fechar="dialog-finalizar"]').click();assert.equal(reservas[0].status,'confirmado');
 await botao('Concluir atendimento').onclick();erroFinalizar=true;await submit('form-finalizar');
 assert.ok(form('aviso-finalizar').textContent.includes('Não foi possível salvar'));assert.equal(form('dialog-finalizar').hasAttribute('open'),true);assert.equal(reservas[0].status,'confirmado');erroFinalizar=false;
 let liberarFinalizacao;segurarFinalizacao=new Promise(resolve=>{liberarFinalizacao=resolve;});perderFinalizacao=true;
 const gravacao=submit('form-finalizar');await tick();assert.equal(form('form-finalizar').querySelector('fieldset').disabled,true);assert.equal(form('sair').disabled,true);
 const enviados=finais().length;await submit('form-finalizar');assert.equal(finais().length,enviados);
 liberarFinalizacao();await gravacao;assert.equal(reservas[0].status,'concluido');assert.equal(botao('Remarcar'),undefined);assert.equal(form('dialog-finalizar').hasAttribute('open'),false);
 assert.ok(form('lista-agenda').textContent.includes('Concluído'));assert.equal(form('sair').disabled,false);w.confirm=()=>true;
 await botao('Registrar pagamento').onclick();const f=form('form-pagamento');f.elements.valor.value='35.50';f.elements.forma.value='pix';await submit('form-pagamento');
 assert.equal(pagamentos.length,1);assert.equal(pagamentos[0].valor,35.5);assert.ok(form('lista-agenda').textContent.includes('Pago:'));assert.equal(form('limpar-agendamentos').disabled,true);
 await botao('Editar pagamento').onclick();f.elements.valor.value='40';f.elements.forma.value='dinheiro';await submit('form-pagamento');assert.equal(pagamentos.length,1);assert.equal(pagamentos[0].valor,40);
 // Criação com resposta perdida é recuperada pelo ID gerado antes de salvar.
 await form('novo-agendamento').onclick();const ag=form('form-agendamento-painel');ag.elements.cliente.value='Maria';ag.elements.telefone.value='+55 (79) 93333-3333';ag.elements.profissional.value=profissional.id;ag.elements.servico.value=servico.id;
 let liberar;segurarVagas=new Promise(resolve=>{liberar=resolve;});const consulta=ag.elements.profissional.onchange();await tick();assert.equal(ag.querySelector('[type="submit"]').disabled,true);liberar();await consulta;
 ag.elements.horario.value='00:20';perderCriacao=true;await submit('form-agendamento-painel');assert.equal(reservas.length,2);assert.equal(reservas[1].telefone,'79933333333');
 await botao('Remarcar').onclick();ag.elements.horario.value='00:40';await submit('form-agendamento-painel');assert.equal(reservas.length,2);assert.equal(reservas[1].horario,'00:40:00');
 await botao('Cliente faltou').onclick();assert.equal(reservas[1].status,'confirmado');await submit('form-finalizar');assert.equal(reservas[1].status,'faltou');
 await area('clientes');assert.equal(form('lista-clientes').children.length,2);await botao('Ver histórico','lista-clientes').onclick();assert.ok(form('historico-cliente').textContent.includes('Recebido'));
 form('form-cliente').elements.observacoes.value='Degradê baixo, máquina 1';await submit('form-cliente');assert.equal(clientes[0].observacoes,'Degradê baixo, máquina 1');form('dialog-cliente').removeAttribute('open');
 await area('caixa');assert.ok(form('totais-caixa').textContent.includes('40,00'));const desp=form('form-despesa');desp.elements.descricao.value='Lâminas';desp.elements.valor.value='10';perderDespesa=true;await submit('form-despesa');assert.equal(despesas.length,1);assert.ok(form('totais-caixa').textContent.includes('30,00'));
 await botao('Excluir despesa','lista-despesas').onclick();assert.equal(despesas.length,0);assert.ok(form('totais-caixa').textContent.includes('40,00'));
 erroCaixa=true;await form('caixa-hoje').onclick();assert.ok(form('totais-caixa').textContent.includes('indisponível'));assert.ok(!form('totais-caixa').textContent.includes('R$'));erroCaixa=false;
 caixaMalformado=true;await form('caixa-hoje').onclick();assert.ok(form('totais-caixa').textContent.includes('Não foi possível calcular'));assert.ok(!form('totais-caixa').textContent.includes('R$'));assert.equal(form('formas-caixa').children.length,0);caixaMalformado=false;
 await area('espera');await form('nova-espera').onclick();const ef=form('form-espera');ef.elements.cliente.value='Pedro';ef.elements.telefone.value='79944444444';ef.elements.servico.value=servico.id;ef.elements.profissional.value=profissional.id;ef.elements.inicio.value='02:00';ef.elements.fim.value='01:00';await submit('form-espera');assert.equal(esperas.length,0);
 ef.elements.inicio.value='';ef.elements.fim.value='';await submit('form-espera');assert.equal(esperas.length,1);assert.equal(aberturas,0);
 const avisoEspera=new URL(form('lista-espera').querySelector('a').href);assert.equal(avisoEspera.searchParams.get('phone'),'5579944444444');assert.ok(avisoEspera.searchParams.get('text').includes('lista de espera'));
 await botao('Marcar como contatado','lista-espera').onclick();assert.equal(esperas[0].status,'contatado');
 await botao('Agendar','lista-espera').onclick();ag.elements.horario.value='00:20';await submit('form-agendamento-painel');assert.equal(esperas[0].status,'agendado');assert.equal(reservas.length,3);assert.ok(form('lista-espera').textContent.includes('Nenhum cliente'));
 // Paginação e respostas por página evitam carregar toda a base.
 for(let i=0;i<25;i++)clientes.push({barbearia_id:loja.id,nome:'Cliente '+i,telefone:'799'+String(i).padStart(8,'0'),observacoes:''});
 await area('clientes');assert.equal(form('lista-clientes').children.length,20);assert.equal(form('clientes-proxima').disabled,false);await form('clientes-proxima').onclick();assert.equal(form('lista-clientes').children.length,8);
 assert.ok(requests.some(r=>r.url.includes('saas_clientes')&&r.url.includes('limit=21')&&r.url.includes('offset=20')));
 await botao('Ver histórico','lista-clientes').onclick();form('sair').click();await tick();assert.equal(form('painel').hidden,true);assert.equal(form('dialog-cliente').hasAttribute('open'),false);
 for(const id of ['lista-clientes','historico-cliente','totais-caixa','lista-espera'])assert.equal(form(id).children.length,0);
 assert.equal(form('form-cliente').elements.observacoes.value,'');assert.equal(aberturas,0);
 dom.window.close();console.log('OK: concluir/pagar/corrigir, lembrete manual, agendamento e remarcação, resposta perdida, faltas, notas e histórico, caixa/despesas, erro sem totais falsos, espera/contato/agendamento, paginação, textos seguros e logout.');
})().catch(e=>{console.error(e);process.exitCode=1;});
