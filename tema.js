// Apenas três cores são configuráveis; contraste e tons de apoio são derivados.
(() => {
  const padrao = Object.freeze({cor_principal: '#262878', cor_destaque: '#ba2530', cor_fundo: '#f5f3f1'});
  const campos = Object.keys(padrao);
  const hex = /^#[0-9a-f]{6}$/i;
  function normalizar(valor = {}) {
    return Object.fromEntries(campos.map(campo => [campo, hex.test(valor?.[campo]) ? valor[campo].toLowerCase() : padrao[campo]]));
  }
  function validar(valor) {
    if (!valor || campos.some(campo => !hex.test(valor[campo]))) throw new Error('Escolha uma cor válida em cada um dos três campos.');
    return normalizar(valor);
  }
  function rgb(cor) { return [1, 3, 5].map(i => parseInt(cor.slice(i, i + 2), 16)); }
  function misturar(a, b, peso) {
    const destino = rgb(b);
    return '#' + rgb(a).map((v, i) => Math.round(v * (1 - peso) + destino[i] * peso).toString(16).padStart(2, '0')).join('');
  }
  function luminancia(cor) {
    const [r, g, b] = rgb(cor).map(v => {v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;});
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function contraste(a, b) {
    const x = luminancia(a), y = luminancia(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  function legivel(cor, fundos, minimo = 4.5) {
    const nota = c => Math.min(...fundos.map(f => contraste(c, f)));
    if (nota(cor) >= minimo) return cor;
    const destino = nota('#000000') >= nota('#ffffff') ? '#000000' : '#ffffff';
    for (let passo = 1; passo <= 40; passo++) {
      const candidato = misturar(cor, destino, passo / 40);
      if (nota(candidato) >= minimo) return candidato;
    }
    return destino;
  }
  function aplicar(valor, destino = document.documentElement) {
    const cores = normalizar(valor);
    const principal = cores.cor_principal, destaque = cores.cor_destaque, fundo = cores.cor_fundo;
    const escuro = luminancia(fundo) < 0.179;
    const superficie = escuro ? misturar(fundo, '#000000', 0.08) : '#ffffff';
    const suave = misturar(fundo, escuro ? '#000000' : '#ffffff', escuro ? 0.16 : 0.4);
    const hover = misturar(superficie, principal, escuro ? 0.03 : 0.07);
    const fundos = [fundo, superficie, suave, hover];
    const texto = legivel(escuro ? '#f5f5f5' : '#202020', fundos);
    const variaveis = {
      '--azul': principal, '--vermelho': destaque, '--fundo': fundo, '--texto': texto,
      '--superficie': superficie, '--superficie-suave': suave,
      '--texto-secundario': legivel(misturar(texto, fundo, 0.3), fundos),
      '--link-tema': legivel(principal, fundos),
      '--destaque-legivel': legivel(destaque, fundos),
      '--texto-principal': legivel('#ffffff', [principal]),
      '--texto-destaque': legivel('#ffffff', [destaque]),
      '--borda-tema': legivel(misturar(texto, fundo, 0.6), fundos, 3),
      '--borda-suave': misturar(texto, fundo, 0.82),
      '--hover-tema': hover,
      '--brilho-tema': principal + '08',
      '--sombra-tema': texto + '18',
      '--foco-tema': legivel(principal, fundos, 3),
    };
    for (const [nome, cor] of Object.entries(variaveis)) destino.style.setProperty(nome, cor);
    destino.style.colorScheme = escuro ? 'dark' : 'light';
    return cores;
  }
  window.Tema = {padrao, campos: Object.freeze(campos), normalizar, validar, aplicar, contraste};
})();
