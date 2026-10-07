const headers={'Content-Type':'application/manifest+json; charset=utf-8','Cache-Control':'public, max-age=300, s-maxage=86400','X-Content-Type-Options':'nosniff'};
export default {
  fetch(request){
    if(!['GET','HEAD'].includes(request.method))return new Response(null,{status:405,headers:{Allow:'GET, HEAD','Cache-Control':'no-store'}});
    const params=new URL(request.url).searchParams,slug=params.get('barbearia');
    if(!slug||!/^[a-z0-9-]{3,60}$/.test(slug))return Response.json({erro:'Link de barbearia inválido.'},{status:400,headers:{'Cache-Control':'no-store'}});
    const nome=Array.from((params.get('nome')||'Agendamento '+slug).replace(/[\u0000-\u001f\u007f]/g,'').trim()).slice(0,100).join('')||'Agendamento';
    const inicio='/index.html?'+new URLSearchParams({barbearia:slug});
    const manifest={id:inicio,name:nome,short_name:Array.from(nome).slice(0,24).join(''),description:'Agende seu atendimento nesta barbearia.',lang:'pt-BR',start_url:inicio,scope:'/',display:'standalone',background_color:'#f5f3f1',theme_color:'#262878',prefer_related_applications:false,icons:[
      {src:'/assets/app-192.png',sizes:'192x192',type:'image/png',purpose:'any'},
      {src:'/assets/app-512.png',sizes:'512x512',type:'image/png',purpose:'any'},
      {src:'/assets/app-maskable-512.png',sizes:'512x512',type:'image/png',purpose:'maskable'},
    ]};
    return new Response(request.method==='HEAD'?null:JSON.stringify(manifest),{headers});
  },
};

