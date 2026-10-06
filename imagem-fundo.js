// Imagens de identidade visual, sem credenciais administrativas.
window.ImagemFundo = {
  bucket:'fundos-barbearias',limiteOriginal:5*1024*1024,limite:2*1024*1024,
  tipos:{'image/jpeg':'jpg','image/webp':'webp'},
  caminhoValido(caminho){return typeof caminho==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|webp)$/.test(caminho);},
  url(caminho){return this.caminhoValido(caminho)?window.AGENDA_CONFIG.url+'/storage/v1/object/public/'+this.bucket+'/'+caminho:'';},
  aplicar(loja={},previa='',destino=document.documentElement){
    const caminho=loja?.imagem_fundo;
    const src=/^blob:[^"\\()\s]+$/.test(previa)?previa:this.caminhoValido(caminho)&&caminho.startsWith(loja.id+'/')?this.url(caminho):'';
    if(src)destino.style.setProperty('--imagem-fundo','url('+JSON.stringify(src)+')');else destino.style.removeProperty('--imagem-fundo');
    destino.classList.toggle('com-imagem-fundo',Boolean(src));return src;
  },
  validarArquivo(arquivo){
    if(!arquivo||!['image/jpeg','image/png','image/webp'].includes(arquivo.type))throw new Error('Escolha uma imagem JPG, PNG ou WebP.');
    if(!arquivo.size||arquivo.size>this.limiteOriginal)throw new Error('Escolha uma imagem de até 5 MB.');
  },
  async preparar(arquivo){
    this.validarArquivo(arquivo);
    const url=URL.createObjectURL(arquivo);
    try{
      const imagem=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível abrir esta imagem. Escolha outra.'));img.src=url;});
      const largura=imagem.naturalWidth,altura=imagem.naturalHeight;
      if(!largura||!altura||largura*altura>40000000)throw new Error('Esta imagem é muito grande. Escolha uma versão menor.');
      const escala=Math.min(1,1920/Math.max(largura,altura)),canvas=document.createElement('canvas');
      canvas.width=Math.max(1,Math.round(largura*escala));canvas.height=Math.max(1,Math.round(altura*escala));
      const contexto=canvas.getContext('2d');if(!contexto)throw new Error('Não foi possível preparar a imagem neste navegador.');
      contexto.fillStyle='#ffffff';contexto.fillRect(0,0,canvas.width,canvas.height);contexto.drawImage(imagem,0,0,canvas.width,canvas.height);
      const converter=(tipo,qualidade)=>new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Não foi possível preparar esta imagem.')),tipo,qualidade));
      let blob=await converter('image/webp',.82);
      if(!this.tipos[blob.type])blob=await converter('image/jpeg',.82);
      for(const qualidade of [.62,.45]){if(blob.size<=this.limite)break;blob=await converter(blob.type,qualidade);}
      if(!blob.size||blob.size>this.limite||!this.tipos[blob.type])throw new Error('Escolha uma imagem menor para usar como fundo.');
      return new File([blob],'fundo.'+this.tipos[blob.type],{type:blob.type});
    }finally{URL.revokeObjectURL(url);}
  },
};
