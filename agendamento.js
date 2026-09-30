const profissionais = new Map([
  ['profissional-1', 'Josuell Salles'],
  ['profissional-2', 'Profissional 2'],
  ['sem-preferencia', 'Sem preferência'],
]);

const escolha = new URLSearchParams(window.location.search).get('cabeleireiro');

if (profissionais.has(escolha)) {
  document.getElementById('profissional-escolhido').textContent = profissionais.get(escolha);
}

function conectarCartoes() {
const cartoes = document.querySelectorAll('[data-servico]');
cartoes.forEach((cartao) => {
  cartao.removeAttribute('aria-pressed');
  cartao.addEventListener('click', () => {
    const parametros = new URLSearchParams({
      cabeleireiro: escolha || '',
      servico: cartao.dataset.servico,
      preco: cartao.querySelector('.preco-servico').textContent,
      servico_id: cartao.dataset.id || '',
    });
    window.location.href = `horarios.html?${parametros}`;
  });
});
}
async function iniciarCatalogo(){
 if(!AgendaDB.ativa){conectarCartoes();return;}
 const grades=document.querySelectorAll('.grade-servicos');
 grades.forEach(g=>g.replaceChildren());
 try{
  const itens=await AgendaDB.request('servicos?select=*&ativo=eq.true&order=preco');
  for(const s of itens){
   const b=document.createElement('button');b.type='button';b.className='servico'+(s.categoria==='combo'?' combo':'');b.dataset.id=s.id;b.dataset.servico=s.nome;
   if(/^(assets\/|https:\/\/)/.test(s.imagem)){const img=document.createElement('img');img.src=s.imagem;img.alt='';img.className='imagem-servico';b.append(img);}
   const n=document.createElement('strong');n.textContent=s.nome;const p=document.createElement('span');p.className='preco-servico';p.textContent=Number(s.preco).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});const d=document.createElement('span');d.textContent=s.descricao;b.append(n,p,d);grades[s.categoria==='combo'?1:0].append(b);
  }
  grades.forEach(g=>{if(!g.children.length)g.textContent='Nenhum serviço disponível nesta categoria.';});conectarCartoes();
 }catch(e){grades[0].textContent=e.message;}
}
iniciarCatalogo();
