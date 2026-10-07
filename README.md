# agendamentobarbearia

## Atalho no celular e computador

Use **Criar atalho** no painel ou nas páginas de agendamento. Em navegadores compatíveis, **Instalar neste aparelho** abre a confirmação nativa. No iPhone/iPad, o diálogo mostra os passos do Safari para adicionar à Tela de Início. No Windows, **Baixar atalho para Windows** gera um arquivo `.url`; salve-o ou mova-o da pasta Downloads para a área de trabalho.

O atalho do barbeiro abre `admin.html`. O do cliente abre `index.html?barbearia=...`, preservando a barbearia escolhida e omitindo dados do agendamento e tokens de recuperação de senha. A agenda precisa de internet; esse recurso não armazena respostas da API ou credenciais para uso offline.

Os manifestos do painel e da página inicial são estáticos. Na Vercel, `api/manifest.mjs` serve um manifesto público por barbearia, com identidade estável e URL inicial própria, sem consultar o banco. Em GitHub Pages, os links específicos usam as instruções manuais e o arquivo Windows. Os ícones derivam da marca WK já existente.

`testar-atalho.cjs` recebe uma pasta com `jsdom` como primeiro argumento e verifica manifestos, ícones, URLs, arquivo Windows e o fluxo de instalação com eventos de navegador simulados. A confirmação de instalação no sistema é feita pelo usuário no seu aparelho.

Referências: [instalação no Chrome](https://support.google.com/chrome/answer/9658361?co=genie.platform%3DDesktop), [atalhos no Edge](https://support.microsoft.com/en-us/edge/install-manage-or-uninstall-apps-in-microsoft-edge), [instalação de PWAs](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable).

## Logo da barbearia

No painel, abra Configurações → Minha barbearia. Use **Enviar logo** para escolher um JPG, PNG ou WebP de até 5 MB e confira a prévia. Clique em **Salvar dados** para publicar. **Remover logo** também exige salvar; **Descartar alterações** restaura os dados atuais.

A imagem é ajustada para até 1024 pixels no maior lado, preservando a transparência de PNG/WebP, e enviada ao Supabase Storage. Links HTTPS continuam disponíveis. Cada envio usa uma URL nova; o arquivo anterior só é removido quando nenhuma barbearia o utiliza.

Em instalações que já possuem o schema SaaS, aplique `supabase/migrations/20261006171714_logo_barbearia.sql`. A migração cria o bucket público `logos-barbearias` com limite de 2 MB por arquivo preparado. Envio, consulta administrativa e exclusão são restritos à pasta da barbearia do usuário conectado.

Os testes `testar-logo-interface.cjs` e `testar-logo-sql.cjs` recebem como primeiro argumento uma pasta de dependências com `jsdom` e `@electric-sql/pglite`. Eles verificam o fluxo de imagem, erros de conexão, concorrência e isolamento entre barbearias.
