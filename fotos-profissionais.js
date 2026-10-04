// Caminhos públicos das fotos, sem credenciais administrativas.
window.FotosProfissionais = {
  bucket: 'fotos-profissionais',
  limite: 5 * 1024 * 1024,
  tipos: { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' },
  caminhoValido(caminho) {
    return typeof caminho === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(caminho);
  },
  url(caminho) {
    return this.caminhoValido(caminho) ? window.AGENDA_CONFIG.url + '/storage/v1/object/public/' + this.bucket + '/' + caminho : '';
  },
  validarArquivo(arquivo) {
    if (!arquivo || !this.tipos[arquivo.type]) throw new Error('Escolha uma foto JPG, PNG ou WebP.');
    if (!arquivo.size || arquivo.size > this.limite) throw new Error('A foto deve ter até 5 MB.');
  },
  avatar(pessoa, previa = '') {
    const avatar = document.createElement('span'); avatar.className = 'foto-profissional';
    const iniciais = document.createElement('span'); iniciais.className = 'foto-iniciais'; iniciais.setAttribute('aria-hidden', 'true');
    iniciais.textContent = pessoa.id === 'sem-preferencia' ? '✂' : (pessoa.nome || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map(n => n[0]).join('').toUpperCase() || '✂';
    avatar.append(iniciais);
    const src = previa || this.url(pessoa.foto);
    if (src) {
      const imagem = document.createElement('img'); imagem.alt = 'Foto de ' + (pessoa.nome || 'profissional'); imagem.decoding = 'async';
      imagem.hidden = true;
      imagem.onload = () => { imagem.hidden = false; iniciais.hidden = true; };
      imagem.onerror = () => { imagem.hidden = true; iniciais.hidden = false; };
      imagem.src = src; avatar.append(imagem);
    }
    return avatar;
  },
};
