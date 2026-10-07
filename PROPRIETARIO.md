# Área do proprietário da plataforma

Abra `proprietario.html` pelo endereço direto ou pelo atalho salvo e entre com a conta autorizada. O acesso não aparece no painel do barbeiro nem nas páginas de agendamento. A sessão fica apenas em memória; ao recarregar a página, entre novamente.

O painel permite consultar todas as barbearias, buscar por nome/link/WhatsApp/e-mail, filtrar as ativas ou suspensas, acompanhar totais da plataforma, abrir os links de agendamento e editar o nome, o WhatsApp e o recebimento de novas reservas. As últimas 20 alterações feitas pelo proprietário ficam registradas com data, conta responsável e valores anteriores/novos.

Em **Gerenciar → Excluir esta barbearia**, digite o nome exato, incluindo maiúsculas e acentos, e confirme em **Excluir definitivamente**. Essa ação apaga os profissionais, serviços, reservas, clientes, pagamentos, despesas, bloqueios, expediente e vínculo da barbearia. A conta de acesso do barbeiro e a conta do proprietário permanecem cadastradas. A exclusão é permanente e fica registrada no histórico administrativo.

As imagens da pasta da barbearia excluída são removidas pela API de Storage, preservando arquivos reutilizados em outra barbearia. Se a remoção das imagens falhar, use **Concluir remoção das imagens**. O banco guarda um recibo da exclusão para permitir nova tentativa após perda de resposta, sem apagar outra barbearia ou duplicar o histórico.

Suspender bloqueia novas reservas e remarcações, inclusive inserções diretas no banco. Atendimentos e pagamentos existentes permanecem disponíveis no painel do barbeiro. Reativar volta a permitir agendamentos, respeitando o expediente, os bloqueios, os serviços e a pausa do próprio barbeiro.

## Instalação do banco

Depois das migrações anteriores, aplique `supabase/migrations/20261007163453_area_proprietario.sql`. As barbearias existentes permanecem ativas. A migração não autoriza contas automaticamente.

Para habilitar a exclusão confirmada, aplique também `supabase/migrations/20261007171600_excluir_barbearia.sql`. A migração instala as funções e permissões; nenhuma barbearia é excluída ao aplicá-la.

Para autorizar uma conta já cadastrada, um administrador do banco deve executar o comando abaixo no SQL Editor do Supabase, substituindo o e-mail pelo destinatário aprovado:

```sql
insert into saas_privado.proprietarios(user_id)
select id from auth.users where lower(email)=lower('EMAIL_AUTORIZADO')
on conflict (user_id) do nothing;
```

Confira que foi inserida exatamente a conta solicitada. Para revogar, remova sua linha de `saas_privado.proprietarios` por uma conexão administrativa.

## Proteção e funcionamento

- A autorização é vinculada ao ID do Supabase Auth em uma tabela privada com RLS, sem acesso direto pelos usuários. Metadados editáveis, e-mail digitado e cadastro de barbearia não concedem esse acesso.
- Os dois RPCs públicos são `SECURITY INVOKER`, com execução apenas para `authenticated`. Funções privadas verificam a autorização a cada chamada e usam `search_path` vazio. Nenhuma chave de serviço é enviada ao navegador.
- O proprietário recebe dados de contato das barbearias e contagens agregadas. Nomes, telefones dos clientes, reservas individuais e pagamentos de outras barbearias continuam protegidos pelas políticas existentes.
- A coluna `ativa` é pública para informar a disponibilidade, mas sua alteração só ocorre pelo RPC autorizado. O barbeiro não pode reativá-la pelo REST.
- Paginação por cursor, 20 barbearias por página. Totais são da plataforma inteira; busca e filtro afetam a lista. Atendimentos de hoje excluem cancelados e usam a data de São Paulo.
- Edição verifica os valores anteriores sob bloqueio de linha para evitar sobrescrever outra alteração. Repetir o mesmo pedido depois de perder a resposta confirma o resultado sem duplicar o histórico. O endereço do link permanece estável.
- A suspensão usa bloqueio de linha compartilhado nas reservas para se coordenar com a atualização do proprietário. A verificação de autorização também se coordena com uma revogação em andamento.
- O botão **Criar atalho** salva o endereço da área do proprietário, sem incluir sessão ou senha.

## Verificação

```text
node testar-proprietario-sql.cjs CAMINHO_DAS_DEPENDENCIAS
node testar-proprietario-interface.cjs CAMINHO_DAS_DEPENDENCIAS
node testar-atalho.cjs CAMINHO_DAS_DEPENDENCIAS
node testar-excluir-barbearia-sql.cjs CAMINHO_DAS_DEPENDENCIAS
node testar-excluir-barbearia-interface.cjs CAMINHO_DAS_DEPENDENCIAS
```

O caminho deve conter `node_modules` com `@electric-sql/pglite` e `jsdom`. Os testes usam banco e contas locais descartáveis; não modificam barbearias em produção.

Referência de Storage: [exclusão de arquivos pela API](https://supabase.com/docs/guides/storage/management/delete-objects). A função SQL consulta metadados de arquivos e não os apaga diretamente.
