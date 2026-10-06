window.ImagensServicos={
  bucket:'imagens-servicos',
  caminhoValido(caminho){return ImagemFundo.caminhoValido(caminho);},
  link(valor){
    if(typeof valor!=='string')return '';
    if(/^assets\/[a-zA-Z0-9_./% -]+$/.test(valor)&&!valor.includes('..'))return valor;
    try{const url=new URL(valor);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
  },
  url(servico={}){
    const caminho=servico.imagem_arquivo;
    if(this.caminhoValido(caminho)&&caminho.startsWith(servico.barbearia_id+'/'))return AGENDA_CONFIG.url+'/storage/v1/object/public/'+this.bucket+'/'+caminho;
    return this.link(servico.imagem);
  },
  imagem(servico,previa=''){
    const src=previa||this.url(servico);if(!src)return null;
    const img=document.createElement('img');img.src=src;img.alt='';img.loading='lazy';img.className='imagem-servico';
    img.onerror=()=>img.remove();return img;
  },
  preparar(arquivo){return ImagemFundo.preparar(arquivo);},
};
