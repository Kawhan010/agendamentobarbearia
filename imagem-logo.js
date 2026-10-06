window.ImagemLogo={
  bucket:'logos-barbearias',limite:2*1024*1024,tipos:{'image/jpeg':'jpg','image/png':'png','image/webp':'webp'},
  link(valor){
    try{const url=new URL(valor);return url.protocol==='https:'&&!url.username&&!url.password?url.href:'';}catch{return '';}
  },
  url(caminho){return AGENDA_CONFIG.url+'/storage/v1/object/public/'+this.bucket+'/'+caminho;},
  caminho(logo,loja){
    const prefixo=AGENDA_CONFIG.url+'/storage/v1/object/public/'+this.bucket+'/';
    if(typeof logo!=='string'||!logo.startsWith(prefixo))return '';
    const caminho=logo.slice(prefixo.length);
    return caminho.startsWith(loja+'/')&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(caminho)?caminho:'';
  },
  async preparar(arquivo){
    ImagemFundo.validarArquivo(arquivo);
    const url=URL.createObjectURL(arquivo);
    try{
      const imagem=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('Não foi possível abrir esta logo. Escolha outra imagem.'));img.src=url;});
      const largura=imagem.naturalWidth,altura=imagem.naturalHeight;
      if(!largura||!altura||largura*altura>40000000)throw new Error('Esta imagem é muito grande. Escolha uma versão menor.');
      const canvas=document.createElement('canvas'),contexto=canvas.getContext('2d');
      if(!contexto)throw new Error('Não foi possível preparar a logo neste navegador.');
      let escala=Math.min(1,1024/Math.max(largura,altura)),blob;
      for(let tentativa=0;tentativa<4;tentativa++){
        canvas.width=Math.max(1,Math.round(largura*escala));canvas.height=Math.max(1,Math.round(altura*escala));
        // Sem preenchimento: PNG e WebP mantêm o fundo transparente.
        contexto.drawImage(imagem,0,0,canvas.width,canvas.height);
        blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Não foi possível preparar esta logo.')),'image/webp',.9));
        if(blob.size&&blob.size<=this.limite&&this.tipos[blob.type])break;
        escala*=.75;
      }
      if(!blob?.size||blob.size>this.limite||!this.tipos[blob.type])throw new Error('Escolha uma logo menor para enviar.');
      return new File([blob],'logo.'+this.tipos[blob.type],{type:blob.type});
    }finally{URL.revokeObjectURL(url);}
  },
};
