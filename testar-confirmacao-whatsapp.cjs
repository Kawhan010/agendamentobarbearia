// API e janelas simuladas: nenhuma mensagem real é enviada.
const {JSDOM}=require(require('node:path').join(process.argv[2],'node_modules/jsdom'));
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const loja={id:'10000000-0000-4000-8000-000000000001',slug:'loja-teste',nome:'Barbearia São João',whatsapp:'5579999999999',logo:''};
const dia='2026-10-04';
const resposta=(data,ok=true,status=200)=>({ok,status,json:async()=>structuredClone(data)});
async function abrir(opcoes={}){
  const dom=new JSDOM(fs.readFileSync('admin.html','utf8'),{url:'https://teste.local/admin.html',runScripts:'outside-only'}),w=dom.window,d=w.document;
  for(const f of d.forms)for(const input of f.elements)if(input.name&&input.name!=='id')Object.defineProperty(f,input.name,{get:()=>f.elements.namedItem(input.name),configurable:true});
  w.crypto.randomUUID=require('node:crypto').randomUUID;
  const reserva={id:'20000000-0000-4000-8000-000000000001',barbearia_id:loja.id,profissional:'profissional-teste',cliente:'José & Silva',telefone:'(79) 99677-6478',data:dia,horario:'09:20:00',servico_nome:'Corte + barba',preco:45.5,status:'pendente',...opcoes.reserva};
  const requests=[],janelas=[];
  w.open=(url,target)=>{
    assert.equal(url,'about:blank');assert.equal(target,'_blank');
    if(opcoes.bloquearPopup)return null;
    const janela={closed:false,opener:w,document:d.implementation.createHTMLDocument(),destinos:[],close(){this.closed=true;},location:{replace(url){janela.destinos.push(url);}}};
    janelas.push(janela);return janela;
  };
  w.fetch=async(url,options={})=>{
    requests.push({url,options});const parsed=new URL(url,w.location.href),method=options.method||'GET';
    if(url.includes('/auth/v1/token'))return resposta({access_token:'token-teste'});
    if(url.includes('/auth/v1/'))return resposta({});
    if(url.includes('saas_membros'))return resposta([{barbearia_id:loja.id}]);
    if(url.includes('saas_barbearias'))return resposta([loja]);
    if(url.includes('saas_profissionais')){
      // Um cadastro arquivado ainda fornece o nome nos atendimentos existentes.
      return resposta(parsed.searchParams.has('id')?[{id:'profissional-teste',nome:'André Salles',ativo:false,excluido:true}]:[]);
    }
    if(url.includes('saas_reservas')){
      const rows=[reserva].filter(r=>[...parsed.searchParams].every(([key,value])=>!value.startsWith('eq.')||String(r[key])===value.slice(3)));
      if(method==='PATCH'){
        assert.equal(janelas[0]?.destinos.length||0,0);
        if(opcoes.aguardarPatch)await opcoes.aguardarPatch;
        if(opcoes.falharPatch)return resposta({message:'Sessão expirada'},false,401);
        if(opcoes.cancelarConcorrente){reserva.status='cancelado';return resposta([]);}
        if(opcoes.semPermissao)return resposta([]);
        rows.forEach(r=>{r.status=JSON.parse(options.body).status;});
        if(opcoes.perderResposta)throw new Error('Resposta perdida');
        if(opcoes.respostaOutraLoja)return resposta([{...reserva,barbearia_id:'10000000-0000-4000-8000-000000000002'}]);
      }
      if(opcoes.falharConsultaAposSalvar&&reserva.status==='confirmado')throw new Error('Consulta indisponível');
      return resposta(rows);
    }
    if(url.includes('saas_servicos')||url.includes('saas_bloqueios'))return resposta([]);
    if(url.includes('saas_expediente'))return resposta(Array.from({length:7},(_,id)=>({id,aberto:true,inicio:'09:00',fim:'18:00',intervalo_inicio:null,intervalo_fim:null})));
    if(url.includes('saas_controle_agenda'))return resposta([{pausado:false}]);
    throw new Error('Requisição inesperada: '+url);
  };
  for(const script of d.querySelectorAll('script[src]'))vm.runInContext(fs.readFileSync(script.getAttribute('src').split('?')[0],'utf8'),dom.getInternalVMContext());
  d.getElementById('filtro-data').value=dia;
  const login=d.getElementById('form-login');login.elements.email.value='dono@teste.local';login.elements.password.value='senha-teste';
  await login.onsubmit({preventDefault(){},target:login,submitter:login.querySelector('button')});
  return {dom,w,d,reserva,requests,janelas,opcoes};
}
const botao=(teste,nome)=>[...teste.d.querySelectorAll('#lista-agenda button')].find(b=>b.textContent===nome);
const patches=teste=>teste.requests.filter(r=>r.options.method==='PATCH'&&r.url.includes('saas_reservas'));
(async()=>{
  let liberarPatch;const aguardando=new Promise(resolve=>{liberarPatch=resolve;});
  let t=await abrir({aguardarPatch:aguardando});
  const api=t.w.ConfirmacaoWhatsApp;
  assert.equal(api.telefone('(79) 99677-6478'),'5579996776478');
  assert.equal(api.telefone('+55 79 99677-6478'),'5579996776478');
  assert.equal(api.telefone('55 99999-9999'),'5555999999999');
  assert.equal(api.telefone('79 3211-2345'),'557932112345');
  assert.throws(()=>api.telefone('123'),/telefone/);
  assert.throws(()=>api.link(t.reserva,loja),/confirmado/);
  const confirmacao=botao(t,'Confirmar').onclick();
  assert.equal(t.janelas.length,1);assert.equal(t.janelas[0].opener,null);
  assert.equal(t.janelas[0].destinos.length,0);
  assert.ok(t.janelas[0].document.body.textContent.includes('verificar a confirmação'));
  for(const id of ['limpar-agendamentos','filtro-data','atualizar','sair'])assert.equal(t.d.getElementById(id).disabled,true);
  await t.d.getElementById('limpar-agendamentos').onclick();
  assert.ok(!t.requests.some(r=>r.url.includes('rpc/saas_limpar_agendamentos')));
  liberarPatch();await confirmacao;
  assert.equal(t.reserva.status,'confirmado');assert.equal(t.janelas[0].destinos.length,1);
  const url=new URL(t.janelas[0].destinos[0]),mensagem=url.searchParams.get('text');
  assert.equal(url.origin,'https://api.whatsapp.com');assert.equal(url.searchParams.get('phone'),'5579996776478');
  for(const detalhe of ['José & Silva','Barbearia São João','04/10/2026','09:20','Corte + barba','45,50','André Salles','✅','responda a esta mensagem'])assert.ok(mensagem.includes(detalhe),detalhe);
  const patch=patches(t)[0];assert.ok(patch.url.includes('status=eq.pendente'));assert.ok(patch.url.includes('barbearia_id=eq.'+loja.id));
  assert.equal(patch.options.headers.Authorization,'Bearer token-teste');
  assert.equal(botao(t,'Confirmar'),undefined);assert.ok(botao(t,'Abrir confirmação no WhatsApp'));
  assert.ok(t.d.getElementById('aviso').textContent.includes('toque em Enviar'));
  assert.ok(!t.d.getElementById('aviso').textContent.includes('mensagem enviada'));
  await botao(t,'Abrir confirmação no WhatsApp').onclick();
  assert.equal(patches(t).length,1);assert.equal(t.janelas[1].destinos.length,1);
  // Outro painel cancelou o atendimento: não prepara nova confirmação.
  t.reserva.status='cancelado';await botao(t,'Abrir confirmação no WhatsApp').onclick();
  assert.equal(t.janelas[2].destinos.length,0);assert.equal(t.janelas[2].closed,true);
  assert.equal(t.d.querySelectorAll('#lista-agenda button').length,0);
  t.dom.window.close();
  t=await abrir({bloquearPopup:true});await botao(t,'Confirmar').onclick();
  assert.equal(t.reserva.status,'confirmado');assert.equal(t.janelas.length,0);
  const fallback=t.d.querySelector('#aviso a');assert.ok(fallback);assert.equal(fallback.target,'_blank');assert.equal(fallback.rel,'noopener noreferrer');
  assert.equal(new URL(fallback.href).searchParams.get('phone'),'5579996776478');
  assert.ok(botao(t,'Abrir confirmação no WhatsApp'));t.dom.window.close();
  for(const opcoes of [{falharPatch:true},{semPermissao:true},{cancelarConcorrente:true},{respostaOutraLoja:true}]){
    t=await abrir(opcoes);await botao(t,'Confirmar').onclick();
    assert.equal(t.janelas[0].destinos.length,0);assert.equal(t.janelas[0].closed,true);assert.equal(t.d.querySelector('#aviso a'),null);
    assert.equal(t.d.getElementById('sair').disabled,false);t.dom.window.close();
  }
  t=await abrir({perderResposta:true});await botao(t,'Confirmar').onclick();
  assert.equal(t.reserva.status,'confirmado');assert.equal(t.janelas[0].destinos.length,1);assert.equal(patches(t).length,1);t.dom.window.close();
  t=await abrir({reserva:{telefone:'123'}});await botao(t,'Confirmar').onclick();
  assert.equal(t.reserva.status,'confirmado');assert.equal(t.janelas[0].destinos.length,0);assert.equal(t.janelas[0].closed,true);
  assert.ok(t.d.getElementById('aviso').textContent.includes('Confira o telefone'));assert.ok(botao(t,'Abrir confirmação no WhatsApp'));t.dom.window.close();
  t=await abrir({reserva:{status:'confirmado'},falharConsultaAposSalvar:false});
  t.opcoes.falharConsultaAposSalvar=true;await botao(t,'Abrir confirmação no WhatsApp').onclick();
  assert.equal(t.janelas[0].destinos.length,0);assert.equal(t.janelas[0].closed,true);assert.equal(patches(t).length,0);t.dom.window.close();
  console.log('OK: telefone com DDD/país, mensagem e profissional arquivado, confirmação antes da conversa, pop-up bloqueado, falhas, resposta perdida, cancelamento concorrente, outra loja e reabertura sem nova gravação.');
})().catch(e=>{console.error(e);process.exitCode=1;});
