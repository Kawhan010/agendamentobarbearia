# agendamentobarbearia

## Logo da barbearia

No painel, abra Configurações → Minha barbearia. Use **Enviar logo** para escolher um JPG, PNG ou WebP de até 5 MB e confira a prévia. Clique em **Salvar dados** para publicar. **Remover logo** também exige salvar; **Descartar alterações** restaura os dados atuais.

A imagem é ajustada para até 1024 pixels no maior lado, preservando a transparência de PNG/WebP, e enviada ao Supabase Storage. Links HTTPS continuam disponíveis. Cada envio usa uma URL nova; o arquivo anterior só é removido quando nenhuma barbearia o utiliza.

Em instalações que já possuem o schema SaaS, aplique `supabase/migrations/20261006171714_logo_barbearia.sql`. A migração cria o bucket público `logos-barbearias` com limite de 2 MB por arquivo preparado. Envio, consulta administrativa e exclusão são restritos à pasta da barbearia do usuário conectado.

Os testes `testar-logo-interface.cjs` e `testar-logo-sql.cjs` recebem como primeiro argumento uma pasta de dependências com `jsdom` e `@electric-sql/pglite`. Eles verificam o fluxo de imagem, erros de conexão, concorrência e isolamento entre barbearias.
