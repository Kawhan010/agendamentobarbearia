function telefoneLoja(valor) {
  let n=valor.replace(/\D/g,'');
  if(n.length===10||n.length===11)n='55'+n;
  if(!/^55\d{10,11}$/.test(n))throw new Error('Informe o WhatsApp com DDD.');
  return n;
}
async function abrirBarbearia() {
  const membros=await api('/rest/v1/saas_membros?select=barbearia_id');
  if(!membros.length){mostrarFormulario('form-barbearia');$('sair').hidden=false;aviso('Conta conectada. Cadastre sua barbearia para começar.');return;}
  const lojas=await api('/rest/v1/saas_barbearias?select=*&id=eq.'+membros[0].barbearia_id);
  if(!lojas.length)throw new Error('Barbearia não encontrada.');
  lojaAtual=lojas[0];demo=false;
  carregarPersonalizacao();
  $('nome-barbearia').textContent=lojaAtual.nome;
  document.querySelector('.admin-topo small').textContent=lojaAtual.nome;
  const link=new URL('index.html',location.href);link.searchParams.set('barbearia',lojaAtual.slug);
  $('link-agendamento').href=link.href;$('link-agendamento').textContent=link.href;
  for(const campo of ['nome','whatsapp','logo'])$('form-configuracoes').elements[campo].value=lojaAtual[campo];
  await carregar();$('login').hidden=true;$('painel').hidden=false;$('sair').hidden=false;aviso('Sua barbearia está conectada.');
}
function mostrarFormulario(id){for(const nome of ['form-login','form-cadastro','form-barbearia','form-nova-senha'])$(nome).hidden=nome!==id;$('mostrar-cadastro').hidden=!['form-login','form-cadastro'].includes(id);$('recuperar-senha').hidden=id!=='form-login';$('demonstracao').hidden=!['form-login','form-cadastro'].includes(id);}
function submitSeguro(id,fn){$(id).onsubmit=async e=>{e.preventDefault();const b=e.submitter||e.target.querySelector('button[type="submit"],button:not([type])');if(b)b.disabled=true;try{await fn(e.target);}catch(err){aviso(err.message);}finally{if(b)b.disabled=false;}};}
$('mostrar-cadastro').onclick=()=>{const cadastro=$('form-cadastro').hidden;mostrarFormulario(cadastro?'form-cadastro':'form-login');$('mostrar-cadastro').textContent=cadastro?'Já tenho uma conta':'Criar minha conta';};
submitSeguro('form-login',async f=>{
  const sessao=await SaaS.auth('token?grant_type=password',{email:f.email.value.trim(),password:f.password.value});
  token=sessao.access_token;
  try{await abrirBarbearia();f.reset();}catch(e){token='';lojaAtual=null;Tema.aplicar(Tema.padrao);throw e;}
});
submitSeguro('form-cadastro',async f=>{
  const redirect=new URL('admin.html',location.href).href;
  const sessao=await SaaS.auth('signup?redirect_to='+encodeURIComponent(redirect),{email:f.email.value.trim(),password:f.password.value});
  f.reset();
  if(sessao.access_token){token=sessao.access_token;await abrirBarbearia();}
  else{aviso('Confira seu e-mail para confirmar o cadastro. Depois entre com e-mail e senha.');mostrarFormulario('form-login');}
});
submitSeguro('form-barbearia',async f=>{
  await api('/rest/v1/rpc/saas_criar_barbearia','POST',{nome_loja:f.nome.value.trim(),slug_loja:f.slug.value.trim(),whatsapp_loja:telefoneLoja(f.whatsapp.value)});
  await abrirBarbearia();
});
$('recuperar-senha').onclick=async()=>{
  const email=$('form-login').elements.email;
  if(!email.value||!email.reportValidity()){aviso('Preencha o e-mail no formulário para recuperar a senha.');email.focus();return;}
  const b=$('recuperar-senha');b.disabled=true;
  try{await SaaS.auth('recover?redirect_to='+encodeURIComponent(new URL('admin.html',location.href).href),{email:email.value.trim()});aviso('Se houver uma conta com esse e-mail, você receberá o link para redefinir sua senha.');}catch(e){aviso(e.message);}finally{b.disabled=false;}
};
submitSeguro('form-nova-senha',async f=>{
  const r=await fetch(config.url+'/auth/v1/user',{method:'PUT',headers:{apikey:config.publicKey,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({password:f.password.value})});
  if(!r.ok)throw new Error('Não foi possível salvar a senha. Solicite um novo link.');
  f.reset();$('form-nova-senha').hidden=true;$('form-login').hidden=false;token='';aviso('Senha atualizada. Entre com sua nova senha.');
});
submitSeguro('form-configuracoes',async f=>{
  if(demo)throw new Error('Entre na sua conta para configurar a barbearia.');
  const logo=f.logo.value.trim();if(logo&&!/^https:\/\//.test(logo))throw new Error('Use uma URL HTTPS para a logo.');
  await api('/rest/v1/saas_barbearias?id=eq.'+lojaAtual.id,'PATCH',{nome:f.nome.value.trim(),whatsapp:telefoneLoja(f.whatsapp.value),logo});
  await abrirBarbearia();aviso('Dados da barbearia salvos.');
});
async function carregarProfissionais(){
  const pessoas=await api('/rest/v1/saas_profissionais?select=*&barbearia_id=eq.'+lojaAtual.id+'&order=nome');
  $('lista-profissionais').replaceChildren();
  for(const p of pessoas)$('lista-profissionais').append(linha(p.nome,p.ativo?'Disponível para agendamento':'Inativo',[
    acao(p.ativo?'Desativar':'Ativar',async()=>{await api('/rest/v1/saas_profissionais?id=eq.'+encodeURIComponent(p.id)+'&barbearia_id=eq.'+lojaAtual.id,'PATCH',{ativo:!p.ativo});await carregarProfissionais();}),
  ]));
}
submitSeguro('form-profissional',async f=>{
  if(demo)throw new Error('Entre na sua conta para cadastrar profissionais.');
  await api('/rest/v1/saas_profissionais','POST',{barbearia_id:lojaAtual.id,nome:f.nome.value.trim()});f.reset();await carregarProfissionais();aviso('Profissional cadastrado.');
});
const sairOriginal=$('sair').onclick;
$('sair').onclick=async()=>{
  const atual=token;
  sairOriginal();lojaAtual=null;
  Tema.aplicar(Tema.padrao);
  mostrarFormulario('form-login');
  document.querySelector('.admin-topo small').textContent='AGENDA BARBEARIA';
  if(atual)try{await SaaS.auth('logout',{},atual);}catch{aviso('Você saiu deste painel.');}
};
// Links de confirmação e recuperação usam o fluxo implicit do Supabase Auth.
const retorno=new URLSearchParams(location.hash.slice(1));
if(retorno.has('access_token')){
  token=retorno.get('access_token');history.replaceState(null,'',location.pathname);
  if(retorno.get('type')==='recovery'){mostrarFormulario('form-nova-senha');aviso('Defina sua nova senha.');}
  else abrirBarbearia().catch(e=>{token='';aviso(e.message);});
}
if(retorno.has('error') || retorno.has('error_description')){history.replaceState(null,'',location.pathname);mostrarFormulario('form-login');aviso('Este link expirou ou já foi usado. Solicite um novo link de recuperação ou confirme seu cadastro pelo e-mail mais recente.');}

function carregarPersonalizacao() {
  const cores=Tema.aplicar(demo?Tema.padrao:lojaAtual);
  const f=$('form-personalizacao');
  for(const campo of Tema.campos) {
    f.elements[campo].value=cores[campo];
    $(campo+'-valor').textContent=cores[campo].toUpperCase();
  }
  $('status-personalizacao').textContent='Estas cores aparecem no painel e no seu link de agendamento.';
}
function coresFormulario() {
  return Tema.validar(Object.fromEntries(Tema.campos.map(campo=>[campo,$('form-personalizacao').elements[campo].value])));
}
function preverCores() {
  const cores=Tema.aplicar(coresFormulario());
  for(const campo of Tema.campos)$(campo+'-valor').textContent=cores[campo].toUpperCase();
  $('status-personalizacao').textContent='Prévia das cores. Clique em Salvar cores para aplicar aos seus clientes.';
}
$('form-personalizacao').oninput=preverCores;
$('descartar-cores').onclick=carregarPersonalizacao;
$('restaurar-cores').onclick=()=>{
  for(const campo of Tema.campos)$('form-personalizacao').elements[campo].value=Tema.padrao[campo];
  preverCores();
};
submitSeguro('form-personalizacao',async()=>{
  if(demo){aviso('Demonstração: as cores mudam apenas nesta visualização. Entre na sua conta para salvar.');return;}
  if(!lojaAtual)throw new Error('Entre na sua conta para salvar as cores.');
  const cores=coresFormulario(), campos=$('campos-cores');
  campos.disabled=true;
  try{
    const rows=await api('/rest/v1/saas_barbearias?id=eq.'+lojaAtual.id,'PATCH',cores);
    if(!rows?.length)throw new Error('As cores não foram salvas. Confira sua conexão e tente novamente.');
    Object.assign(lojaAtual,rows[0]);
    carregarPersonalizacao();
    aviso('Cores salvas. Seu painel e seu link de agendamento usam esta personalização.');
  }finally{campos.disabled=false;}
});
const demonstracaoOriginal=$('demonstracao').onclick;
$('demonstracao').onclick=async()=>{
  await demonstracaoOriginal();
  if(!$('painel').hidden)carregarPersonalizacao();
};
