// A sessão fica apenas em memória; recarregar a página exige novo login.
window.SaaS = {
  loja: null,
  async auth(path, body, token) {
    const c = window.AGENDA_CONFIG;
    if (!c?.enabled || !c?.url || !c?.publicKey) throw new Error('A conexão do sistema ainda não foi configurada.');
    const r = await fetch(c.url + '/auth/v1/' + path, {
      method: 'POST', headers: { apikey: c.publicKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify(body),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) {
      const mensagens = {
        invalid_credentials: 'E-mail ou senha incorretos.',
        email_not_confirmed: 'Confirme seu e-mail antes de entrar. Confira também a pasta de spam.',
        over_email_send_rate_limit: 'O limite de envio de e-mails foi atingido. Aguarde antes de tentar novamente.',
        email_address_not_authorized: 'O envio de e-mails ainda precisa ser configurado pelo administrador do sistema.',
        user_already_exists: 'Esta conta já existe. Entre com sua senha ou use a recuperação.',
        signup_disabled: 'O cadastro de novas contas está temporariamente indisponível.',
      };
      throw new Error(mensagens[data?.error_code || data?.code] || data?.msg || data?.message || 'Não foi possível autenticar. Confira seus dados e tente novamente.');
    }
    return data;
  },
  async request(path, body) {
    const c = window.AGENDA_CONFIG;
    if (!c?.enabled || !c?.url || !c?.publicKey) throw new Error('O agendamento ainda não foi configurado. Entre em contato com a barbearia.');
    const r = await fetch(c.url + '/rest/v1/' + path, {
      method: body ? 'POST' : 'GET', headers: { apikey: c.publicKey, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => null);
    if (!r.ok) throw new Error(data?.message || 'Não foi possível consultar a barbearia.');
    return data;
  },
  async carregar() {
    if (this.loja) return this.loja;
    if (!this.carregamento) this.carregamento = this.buscarLoja().catch(error => { this.carregamento = null; throw error; });
    return this.carregamento;
  },
  async buscarLoja() {
    const slug = new URLSearchParams(location.search).get('barbearia');
    if (!slug || !/^[a-z0-9-]{3,60}$/.test(slug)) throw new Error('Abra o link de agendamento enviado pela sua barbearia.');
    const lojas = await this.request('saas_barbearias?select=id,nome,slug,whatsapp,logo,cor_principal,cor_destaque,cor_fundo&slug=eq.' + encodeURIComponent(slug));
    if (!lojas.length) throw new Error('Barbearia não encontrada. Confira o link.');
    this.loja = lojas[0];
    Tema.aplicar(this.loja);
    document.title = this.loja.nome + ' — Agendamento';
    const titulo = document.querySelector('.cabecalho h1');
    if (titulo) titulo.textContent = this.loja.nome;
    const logo = document.querySelector('.cabecalho .logo');
    if (logo) { logo.alt = this.loja.nome; if (/^https:\/\//.test(this.loja.logo)) logo.src = this.loja.logo; else logo.hidden = true; }
    for (const link of document.querySelectorAll('a[href]')) {
      const url = new URL(link.href);
      if (url.origin === location.origin && !url.pathname.endsWith('/admin.html')) { url.searchParams.set('barbearia', slug); link.href = url.href; }
    }
    return this.loja;
  },
  async profissionais() {
    const loja = await this.carregar();
    return this.request('saas_profissionais?select=id,nome,foto&ativo=eq.true&barbearia_id=eq.' + loja.id + '&order=nome');
  },
};
