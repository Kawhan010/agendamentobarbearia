async function iniciar() {
  const grade = document.querySelector('.profissionais');
  grade.replaceChildren();
  if (!new URLSearchParams(location.search).has('barbearia')) {
    document.getElementById('titulo-profissionais').textContent = 'Sua barbearia, sua agenda';
    document.getElementById('instrucao-profissionais').textContent = 'Cadastre sua barbearia ou entre para gerenciar serviços, profissionais e agendamentos. Clientes devem usar o link enviado pela barbearia.';
    const entrar = document.createElement('a'); entrar.className = 'profissional'; entrar.href = 'admin.html'; entrar.textContent = 'Entrar ou criar minha conta'; grade.append(entrar);
    return;
  }
  try {
    await SaaS.carregar();
    const profissionais = await SaaS.profissionais();
    if (!profissionais.length) throw new Error('Esta barbearia ainda não disponibilizou profissionais.');
    for (const p of [...profissionais, { id: 'sem-preferencia', nome: 'Sem preferência' }]) {
      const a = document.createElement('a'); a.className = 'profissional';
      a.href = 'agendamento.html?' + new URLSearchParams({ barbearia: SaaS.loja.slug, cabeleireiro: p.id });
      const info = document.createElement('span'); info.className = 'profissional-info';
      const nome = document.createElement('strong'); nome.textContent = p.nome;
      info.append(nome); a.append(info); grade.append(a);
    }
  } catch (e) { document.getElementById('instrucao-profissionais').textContent = e.message; }
}
iniciar();
