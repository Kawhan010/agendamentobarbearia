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

## Confirmação pelo WhatsApp

Ao clicar em **Confirmar**, o painel salva o agendamento e abre a conversa do cliente com uma mensagem pronta contendo nome da barbearia, cliente, data, horário, serviço, valor e profissional. **O barbeiro ainda precisa tocar em Enviar no WhatsApp.** O site não envia nem verifica a entrega da mensagem sozinho; o envio automático exige uma API do WhatsApp Business, ainda não configurada.

Uma janela de espera é aberta durante o clique para evitar bloqueio de pop-up, mas só recebe o link de confirmação depois que o banco confirma o estado salvo. Se a gravação falhar, a janela é fechada. Caso a resposta da gravação se perca, o painel consulta o agendamento antes de preparar a mensagem. Agendamentos já confirmados mostram **Abrir confirmação no WhatsApp**, sem gravar novamente. Se o navegador bloquear a janela, o aviso oferece o link **Abrir WhatsApp do cliente**. O painel consulta o estado atual antes de preparar a conversa, para não enviar uma confirmação de um atendimento cancelado ou removido em outra aba.

## Personalização das cores

Execute `supabase-personalizacao.sql` após a instalação SaaS. A atualização adiciona três cores à barbearia e mantém as políticas que permitem a edição apenas pelo seu dono. Em **Personalização**, escolha cor principal, destaque e fundo, veja a prévia e salve. O painel e todas as etapas do link público carregam a mesma paleta. O modelo do site continua igual para todas as barbearias.

As cores são salvas no banco, sem depender do navegador do barbeiro. Os tons de texto, superfícies e foco são derivados automaticamente para manter a leitura. Descartar prévia recupera as cores salvas; Restaurar padrão ainda exige Salvar cores. A demonstração não salva alterações.

## Fotos dos profissionais

Execute `supabase-fotos-profissionais.sql` após a instalação SaaS. No banco compartilhado em uso, esta atualização foi aplicada em 3 de outubro de 2026. Ela adiciona o caminho da foto ao cadastro e cria o bucket público `fotos-profissionais`, com limite de 5 MB e formatos JPG, PNG e WebP. Cada dono só pode enviar e excluir arquivos na pasta da sua barbearia. As imagens podem ser vistas pelos clientes pela URL pública; cadastros inativos continuam ocultos da lista pública.

Em **Barbearia e profissionais**, selecione uma foto ao cadastrar ou clique em **Editar profissional** para atualizar uma pessoa existente. A prévia é local: só **Salvar profissional** publica a alteração. **Remover foto** também exige salvar, e **Cancelar edição** descarta a prévia. Sem foto, ou se o arquivo não carregar, aparecem as iniciais. As fotos são mostradas na escolha do profissional e na etapa de serviços.

Cada envio usa um caminho novo para evitar imagem antiga em cache. Após uma troca ou remoção salva, o painel exclui o arquivo antigo se nenhum outro cadastro o estiver usando. Falhas de conexão podem deixar um arquivo sem referência; o painel preserva arquivos quando não consegue confirmar o estado salvo no banco.

O rodapé das cinco páginas principais identifica **Wendell Kawhan**, com contato **(79) 99677-6478** por WhatsApp.

## Exclusão de profissionais e limpeza da agenda

Execute `supabase-exclusoes.sql` após a instalação SaaS. **Excluir profissional**, em **Barbearia e profissionais**, pede confirmação e retira a pessoa da equipe e da seleção pública. O registro fica arquivado e inativo no banco para preservar seus agendamentos existentes e a integridade do histórico.

Em **Agendamentos**, **Limpar lista** pede confirmação e exclui permanentemente os registros exibidos. Com uma data selecionada, só alcança essa data; com o filtro vazio, alcança todas as datas exibidas. A exclusão libera os horários reservados. Agendamentos recebidos depois da consulta ficam preservados. O botão fica desabilitado enquanto a lista carrega, quando está vazia ou durante a limpeza. A função do banco exige a conta do dono e respeita o isolamento entre barbearias.

## Verificação antes de publicar

O script `testar-saas.cjs` verifica a instalação e as regras de acesso em PostgreSQL local com PGlite. Instale `@electric-sql/pglite@0.3.14` em uma pasta temporária e execute `node testar-saas.cjs CAMINHO_DA_PASTA`, a partir da pasta do projeto. Ele cria duas contas e verifica isolamento de leitura/escrita, privacidade, reservas, conflito de horário e pausa. Essa validação não substitui os testes de autenticação no Supabase publicado.

Para testar a inicialização das páginas e o fluxo do painel com API simulada, instale também `jsdom@26.1.0` na mesma pasta temporária e execute `node testar-interface.cjs CAMINHO_DA_PASTA`.

Execute também `node testar-fotos.cjs CAMINHO_DA_PASTA` para verificar fotos, prévia, cancelamento, cadastro, troca, remoção, falhas de envio e os contatos no rodapé. O teste SQL inclui as políticas do Storage com o contrato mínimo local; os formatos e tamanho dos arquivos também são limitados pelo bucket no Supabase.

Execute `node testar-exclusoes.cjs CAMINHO_DA_PASTA` para verificar as confirmações, o filtro por data, cancelamentos, falhas de conexão e a preservação de agendamentos recebidos após a consulta. O teste SQL também verifica a exclusão com histórico, o isolamento da limpeza e a liberação de horários.

Execute `node testar-confirmacao-whatsapp.cjs CAMINHO_DA_PASTA` para verificar o destinatário e o texto da mensagem, a confirmação antes da abertura, a recuperação de respostas perdidas, o bloqueio de pop-up e agendamentos alterados em outra aba. Nenhuma mensagem real é enviada nos testes.

Crie duas contas de teste, cada uma com sua barbearia. Confira que cada dono vê somente suas reservas e consegue alterar somente seus registros, inclusive por requisições diretas à API. Confira que reservas no mesmo horário de barbearias diferentes funcionam, que duas reservas concorrentes para o mesmo profissional não ocupam o mesmo horário e que a consulta pública não retorna dados de clientes. Teste os e-mails de confirmação e recuperação no endereço publicado.

Não há alterações automáticas no Supabase pelo código local: a instalação SQL e a configuração de autenticação são necessárias para ativar o cadastro.
