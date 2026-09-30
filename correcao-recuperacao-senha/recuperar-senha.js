// A sessão de recuperação fica somente em memória, nunca no armazenamento local.
(() => {
  const hash = new URLSearchParams(location.hash.slice(1));
  const query = new URLSearchParams(location.search);
  const recovery = hash.get('type') === 'recovery';
  const invalid = hash.has('error') || query.has('error');
  if (!recovery && !invalid && query.get('recuperar') !== '1') return;
  let accessToken = recovery ? hash.get('access_token') : null;
  history.replaceState(null, '', location.pathname + '?recuperar=1');
  const config = window.AGENDA_CONFIG;
  const element = (tag, text) => {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    return node;
  };
  for (const child of document.body.children) {
    if (child.tagName !== 'SCRIPT') child.hidden = true;
  }
  const main = element('main'); main.className = 'admin-main';
  const card = element('section'); card.className = 'admin-card login-card';
  const title = element('h1', 'Recuperar senha');
  const status = element('p'); status.setAttribute('role', 'status');
  const form = element('form');
  const back = element('a', 'Voltar ao painel'); back.href = 'admin.html';
  const backRow = element('p'); backRow.append(back);
  card.append(title, status, form, backRow); main.append(card); document.body.append(main);
  function input(labelText, type, autocomplete) {
    const label = element('label', labelText);
    const field = element('input'); field.type = type; field.autocomplete = autocomplete; field.required = true;
    label.append(field); form.append(label); return field;
  }
  function button(text) {
    const b = element('button', text); b.type = 'submit'; b.className = 'primario'; form.append(b); return b;
  }
  async function auth(path, method, body, session) {
    const headers = { apikey: config.publicKey, 'Content-Type': 'application/json' };
    if (session) headers.Authorization = 'Bearer ' + session;
    const response = await fetch(config.url + '/auth/v1/' + path, {
      method, headers, ...(body ? { body: JSON.stringify(body) } : {})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 429) throw new Error('Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.');
      if (response.status === 401 || response.status === 403) throw new Error('O link expirou. Solicite outro e-mail de recuperação.');
      if (data.code === 'same_password') throw new Error('Escolha uma senha diferente da anterior.');
      if (data.code === 'weak_password') throw new Error('Escolha uma senha mais forte, com letras, números e símbolos.');
      throw new Error('Não foi possível concluir. Confira sua conexão e tente novamente.');
    }
    return data;
  }
  function requestForm(message) {
    accessToken = null; form.replaceChildren(); title.textContent = 'Recuperar senha'; status.textContent = message;
    const email = input('E-mail de acesso', 'email', 'username');
    const send = button('Enviar link de recuperação');
    form.onsubmit = async event => {
      event.preventDefault(); send.disabled = true; status.textContent = 'Enviando…';
      try {
        // Usa a URL principal já configurada no Supabase. Ela também recebe a recuperação.
        await auth('recover', 'POST', { email: email.value.trim() });
        status.textContent = 'Se o e-mail estiver cadastrado, você receberá um link. Abra o e-mail mais recente para cadastrar a nova senha.';
      } catch (error) { status.textContent = error.message; }
      finally { send.disabled = false; }
    };
  }
  async function passwordForm() {
    status.textContent = 'Verificando seu link…';
    try { await auth('user', 'GET', null, accessToken); }
    catch { requestForm('Este link não é válido ou expirou. Solicite um novo abaixo.'); return; }
    title.textContent = 'Cadastrar nova senha'; status.textContent = 'Use pelo menos 8 caracteres.';
    const password = input('Nova senha', 'password', 'new-password'); password.minLength = 8;
    const confirmation = input('Confirmar nova senha', 'password', 'new-password'); confirmation.minLength = 8;
    const save = button('Salvar nova senha');
    form.onsubmit = async event => {
      event.preventDefault();
      if (password.value !== confirmation.value) { status.textContent = 'As senhas precisam ser iguais.'; confirmation.focus(); return; }
      save.disabled = true; status.textContent = 'Salvando…';
      try {
        await auth('user', 'PUT', { password: password.value }, accessToken);
        await auth('logout?scope=local', 'POST', null, accessToken).catch(() => {});
        accessToken = null; form.reset(); form.replaceChildren();
        title.textContent = 'Senha alterada'; status.textContent = 'Sua nova senha foi salva. Volte ao painel e entre com ela.';
        back.focus();
      } catch (error) { status.textContent = error.message; save.disabled = false; }
    };
  }
  if (accessToken) passwordForm();
  else requestForm(invalid || recovery ? 'O link expirou ou já foi usado. Solicite outro abaixo.' : 'Informe seu e-mail para receber um link e cadastrar uma nova senha.');
})();
