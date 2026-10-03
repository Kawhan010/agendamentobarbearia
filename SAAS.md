# Agenda para várias barbearias

Esta cópia usa tabelas `saas_*`, independentes das tabelas da agenda original. O cadastro inicial atende um proprietário por barbearia. Profissionais são cadastrados para receber reservas; convites e login de funcionários ainda não fazem parte desta etapa.

## Ativação

1. Preferencialmente crie um projeto Supabase dedicado e informe URL e chave pública em `supabase-config.js`. A cópia ainda contém a conexão do projeto original.
2. Execute `supabase-saas.sql` uma vez no SQL Editor do projeto escolhido. Não execute novamente os scripts antigos de instalação nessa base para configurar o SaaS.
3. Em Authentication, habilite cadastro por e-mail/senha. Configure Site URL e Redirect URLs incluindo o endereço completo de `admin.html`, tanto local quanto publicado. Configure o envio de e-mails para confirmação e recuperação.
4. Sirva a pasta por HTTP (por exemplo, Live Server). Abra `admin.html`, crie a conta, confirme o e-mail e entre. Cadastre nome, identificador do link e WhatsApp da barbearia.
5. Cadastre serviços e profissionais, ajuste o expediente e compartilhe o link exibido no painel.

Uma nova barbearia começa com catálogo vazio, um profissional e expediente padrão; revise as configurações antes de compartilhar. No projeto publicado, a instalação SaaS foi aplicada e a barbearia `barbearia-salles` já tem cadastro e serviço ativo. Reservas da agenda original não foram migradas.

## Acesso

O dono só pode gerenciar registros cujo `barbearia_id` corresponda ao vínculo armazenado em `saas_membros`. Os clientes consultam apenas informações públicas, catálogo ativo, profissionais ativos e disponibilidade. Telefones e nomes de clientes não têm leitura pública.

As funções públicas de reserva validam a barbearia, serviço, profissional, horário, pausa e conflitos no banco. A confirmação continua pelo painel; o WhatsApp recebe o pedido e não cancela reservas automaticamente. Atendimentos continuam com duração fixa de 40 minutos.

A sessão administrativa fica em memória. Após recarregar a página ou expirar o token, entre novamente. Não há renovação automática nesta versão.

## Personalização das cores

Execute `supabase-personalizacao.sql` após a instalação SaaS. A atualização adiciona três cores à barbearia e mantém as políticas que permitem a edição apenas pelo seu dono. Em **Personalização**, escolha cor principal, destaque e fundo, veja a prévia e salve. O painel e todas as etapas do link público carregam a mesma paleta. O modelo do site continua igual para todas as barbearias.

As cores são salvas no banco, sem depender do navegador do barbeiro. Os tons de texto, superfícies e foco são derivados automaticamente para manter a leitura. Descartar prévia recupera as cores salvas; Restaurar padrão ainda exige Salvar cores. A demonstração não salva alterações.

## Verificação antes de publicar

O script `testar-saas.cjs` verifica a instalação e as regras de acesso em PostgreSQL local com PGlite. Instale `@electric-sql/pglite@0.3.14` em uma pasta temporária e execute `node testar-saas.cjs CAMINHO_DA_PASTA`, a partir da pasta do projeto. Ele cria duas contas e verifica isolamento de leitura/escrita, privacidade, reservas, conflito de horário e pausa. Essa validação não substitui os testes de autenticação no Supabase publicado.

Para testar a inicialização das páginas e o fluxo do painel com API simulada, instale também `jsdom@26.1.0` na mesma pasta temporária e execute `node testar-interface.cjs CAMINHO_DA_PASTA`.

Crie duas contas de teste, cada uma com sua barbearia. Confira que cada dono vê somente suas reservas e consegue alterar somente seus registros, inclusive por requisições diretas à API. Confira que reservas no mesmo horário de barbearias diferentes funcionam, que duas reservas concorrentes para o mesmo profissional não ocupam o mesmo horário e que a consulta pública não retorna dados de clientes. Teste os e-mails de confirmação e recuperação no endereço publicado.

Não há alterações automáticas no Supabase pelo código local: a instalação SQL e a configuração de autenticação são necessárias para ativar o cadastro.
