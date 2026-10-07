const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{pathToFileURL}=require('node:url');
const {JSDOM}=require(path.join(process.argv[2],'node_modules/jsdom'));
function tela(url,opcoes={}){
 const dom=new JSDOM('<!doctype html><html><head><title>Agendamento</title></head><body><main></main></body></html>',{url,runScripts:'outside-only'}),w=dom.window,d=w.document;
 Object.defineProperty(w.navigator,'userAgent',{value:opcoes.ua||'Mozilla Windows Chrome'});
 Object.defineProperty(w.navigator,'platform',{value:opcoes.platform||'Win32'});
 Object.defineProperty(w.navigator,'maxTouchPoints',{value:opcoes.toques||0});
 Object.defineProperty(w.navigator,'standalone',{value:opcoes.instalado||false});
 w.matchMedia=()=>({matches:opcoes.instalado||false,addEventListener(){}});
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;};
 const blobs=[],downloads=[];w.URL.createObjectURL=blob=>{blobs.push(blob);return 'blob:'+blobs.length;};w.URL.revokeObjectURL=()=>{};
 w.HTMLAnchorElement.prototype.click=function(){downloads.push({href:this.href,nome:this.download});};
 vm.runInContext(fs.readFileSync('atalho.js','utf8'),dom.getInternalVMContext());
 const el=id=>d.getElementById(id),evento=({outcome='dismissed',erro=false,choice=null}={})=>{
  const e=new w.Event('beforeinstallprompt',{cancelable:true});let chamadas=0;
  e.prompt=async()=>{chamadas++;if(erro)throw Error('Falha de instalação');};e.userChoice=choice||Promise.resolve({outcome});w.dispatchEvent(e);return {e,get chamadas(){return chamadas;}};
 };
 return {dom,w,d,el,blobs,downloads,evento};
}
(async()=>{
 const servidor=(await import(pathToFileURL(path.resolve('api/manifest.mjs')).href)).default;
 const get=async url=>servidor.fetch(new Request(url));
 let res=await get('https://site.test/api/manifest?barbearia=barbearia-salles&nome=Barbearia%20Salles');
 assert.equal(res.status,200);assert.match(res.headers.get('Content-Type'),/application\/manifest\+json/);assert.match(res.headers.get('Cache-Control'),/s-maxage/);
 const manifest=await res.json();assert.equal(manifest.start_url,'/index.html?barbearia=barbearia-salles');assert.equal(manifest.id,manifest.start_url);assert.equal(manifest.name,'Barbearia Salles');assert.equal(manifest.display,'standalone');
 const outra=await (await get('https://site.test/api/manifest?barbearia=outra-barbearia')).json();assert.notEqual(outra.id,manifest.id);
 const renomeada=await (await get('https://site.test/api/manifest?barbearia=barbearia-salles&nome=Novo%20nome')).json();assert.equal(renomeada.id,manifest.id);
 for(const icon of manifest.icons){const b=fs.readFileSync(icon.src.slice(1));assert.equal(b.readUInt32BE(16)+'x'+b.readUInt32BE(20),icon.sizes);}
 for(const arquivo of ['app-painel.webmanifest','app-agendamento.webmanifest','app-proprietario.webmanifest']){
  const m=JSON.parse(fs.readFileSync(arquivo,'utf8'));assert.equal(m.display,'standalone');assert.equal(m.id,m.start_url);assert.equal(m.icons.length,3);
 }
 for(const slug of ['', '../admin.html','foo%0Abar','ABC','x'])assert.equal((await get('https://site.test/api/manifest?barbearia='+encodeURIComponent(slug))).status,400);
 res=servidor.fetch(new Request('https://site.test/api/manifest?barbearia=salles',{method:'POST'}));assert.equal(res.status,405);assert.equal(res.headers.get('Allow'),'GET, HEAD');
 res=servidor.fetch(new Request('https://site.test/api/manifest?barbearia=salles',{method:'HEAD'}));assert.equal(res.status,200);assert.equal(await res.text(),'');
 const casos=[];
 let t=tela('https://site.test/resumo.html?barbearia=barbearia-salles&cliente=privado&telefone=secreto#access_token=nao-salvar');casos.push(t);
 assert.equal(t.w.AtalhoAgenda.destino,'https://site.test/index.html?barbearia=barbearia-salles');
 const href=t.d.querySelector('link[rel=manifest]').href;assert.equal(new URL(href).searchParams.get('barbearia'),'barbearia-salles');assert.ok(!href.includes('privado'));
 t.w.SaaS={loja:{slug:'barbearia-salles',nome:'Salles <script>seguro</script>'}};t.d.title='Barbearia Salles — Agendamento';await new Promise(r=>setTimeout(r,0));assert.equal(t.el('nome-atalho').textContent,t.w.SaaS.loja.nome);assert.equal(t.el('nome-atalho').children.length,0);
 t.w.AtalhoAgenda.abrir();assert.equal(t.el('dialog-atalho').open,true);t.el('fechar-atalho').click();assert.equal(t.el('dialog-atalho').open,false);assert.equal(t.d.activeElement.id,'criar-atalho');
 t.el('baixar-atalho').click();assert.equal(t.downloads[0].nome,'WK-Agendamento-barbearia-salles.url');
 const texto=await new Promise((resolve,reject)=>{const reader=new t.w.FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsText(t.blobs[0]);});
 assert.equal(texto,'[InternetShortcut]\r\nURL=https://site.test/index.html?barbearia=barbearia-salles\r\n');assert.ok(!/secreto|privado|access_token/.test(texto));
 let ev=t.evento();assert.equal(ev.e.defaultPrevented,true);assert.equal(t.el('instalar-atalho').hidden,false);await t.el('instalar-atalho').onclick();assert.equal(ev.chamadas,1);assert.match(t.el('status-atalho').textContent,/cancelada/);assert.equal(t.el('instalar-atalho').hidden,true);
 ev=t.evento({erro:true});await t.el('instalar-atalho').onclick();assert.match(t.el('status-atalho').textContent,/Não foi possível/);
 let aceitar;const choice=new Promise(resolve=>aceitar=resolve);ev=t.evento({choice});
 const nativo=t.el('instalar-atalho').onclick();await t.el('instalar-atalho').onclick();assert.equal(ev.chamadas,1);assert.equal(t.el('instalar-atalho').disabled,true);
 t.w.dispatchEvent(new t.w.Event('appinstalled'));aceitar({outcome:'accepted'});await nativo;assert.match(t.el('status-atalho').textContent,/Aplicativo instalado/);assert.equal(t.el('instalar-atalho').hidden,true);
 t=tela('https://usuario:senha@site.test/admin.html?access_token=nao-salvar#refresh_token=nao-salvar');casos.push(t);assert.equal(t.w.AtalhoAgenda.destino,'https://site.test/admin.html');assert.ok(t.d.querySelector('link[rel=manifest]').href.endsWith('/app-painel.webmanifest'));
 t=tela('https://site.test/proprietario.html?barbearia=ignorar&access_token=nao-salvar#refresh_token=nao-salvar');casos.push(t);assert.equal(t.w.AtalhoAgenda.destino,'https://site.test/proprietario.html');assert.ok(t.d.querySelector('link[rel=manifest]').href.endsWith('/app-proprietario.webmanifest'));t.el('baixar-atalho').click();assert.equal(t.downloads[0].nome,'WK-Agendamento-Proprietario.url');assert.equal(t.el('nome-atalho').textContent,'Área do proprietário');
 t=tela('https://usuario.github.io/agendamentobarbearia/index.html?barbearia=salles');casos.push(t);assert.equal(t.d.querySelector('link[rel=manifest]'),null);assert.equal(t.w.AtalhoAgenda.destino,'https://usuario.github.io/agendamentobarbearia/index.html?barbearia=salles');
 t=tela('https://site.test/index.html?barbearia=../roubo');casos.push(t);assert.equal(t.el('baixar-atalho').disabled,true);t.el('baixar-atalho').click();assert.equal(t.blobs.length,0);assert.equal(t.evento().e.defaultPrevented,false);t.w.AtalhoAgenda.abrir();assert.match(t.el('status-atalho').textContent,/válido/);
 t=tela('https://site.test/index.html?barbearia=salles',{ua:'iPad',platform:'MacIntel',toques:5});casos.push(t);assert.equal(t.el('plataforma-atalho').value,'ios');assert.equal(t.d.querySelector('[data-instrucoes=ios]').hidden,false);
 t=tela('https://site.test/index.html?barbearia=salles',{ua:'Android Chrome'});casos.push(t);assert.equal(t.el('plataforma-atalho').value,'android');
 t=tela('https://site.test/index.html',{instalado:true});casos.push(t);t.evento();assert.equal(t.el('instalar-atalho').hidden,true);t.w.AtalhoAgenda.abrir();assert.match(t.el('status-atalho').textContent,/já está/);
 for(const pagina of ['admin.html','index.html','agendamento.html','horarios.html','resumo.html','proprietario.html']){
  const d=new JSDOM(fs.readFileSync(pagina,'utf8').replace(/^\uFEFF/,'')).window.document;assert.equal(d.querySelectorAll('script[src^="atalho.js"]').length,1,pagina);assert.ok(d.head.querySelector('script[src^="atalho.js"]'),pagina);assert.ok(d.head.querySelector('link[rel="apple-touch-icon"]'),pagina);
 }
 casos.forEach(x=>x.dom.window.close());console.log('OK: manifestos e ícones, barbearias com identidade e links separados, painel sem tokens, arquivo Windows, orientação por aparelho, diálogo acessível, fluxo nativo/cancelamento/falha/duplicação e compatibilidade estática.');
})().catch(e=>{console.error(e);process.exitCode=1;});
