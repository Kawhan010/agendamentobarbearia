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

As funções públicas de reserva validam a barbearia, serviço, profissional, horário, pausa e conflitos no banco. A confirmação continua pelo painel; o WhatsApp recebe o pedido e não cancela reservas automaticamente. O tempo de cada novo atendimento segue a duração em minutos escolhida pelo profissional.

A sessão administrativa fica em memória. Após recarregar a página ou expirar o token, entre novamente. Não há renovação automática nesta versão.

## Confirmação pelo WhatsApp

Ao clicar em **Confirmar**, o painel salva o agendamento somente no site e recalcula o resumo do dia. Nenhuma conversa ou mensagem do WhatsApp é aberta nesse clique. Após confirmar, o agendamento mostra o botão **Confirmar no WhatsApp**.

O barbeiro pode clicar nesse segundo botão quando quiser avisar o cliente. O painel confere que o agendamento continua confirmado e abre a conversa com a mensagem **Olá, [nome do cliente]. Recebi seu agendamento e aguardo você no horário agendado. Obrigado pela preferência.** O nome vem do cadastro atual do agendamento; espaços extras são removidos. A redação usa linguagem formal e pontuação adequada à mensagem. **O barbeiro ainda precisa tocar em Enviar no WhatsApp.** O site não envia nem verifica a entrega sozinho; o envio automático exige uma API do WhatsApp Business, ainda não configurada.

Somente o clique em **Confirmar no WhatsApp** abre uma janela de espera para evitar bloqueio de pop-up. Se a consulta falhar ou o agendamento tiver sido cancelado ou removido, a janela é fechada. Se o navegador bloquear a janela, o aviso oferece **Abrir WhatsApp do cliente**. Esse segundo botão apenas consulta o estado e prepara a conversa; não grava uma nova confirmação. Se a resposta da confirmação no site se perder, o painel consulta o registro para conferir se foi salvo.

## Personalização das cores

Execute `supabase-personalizacao.sql` após a instalação SaaS. A atualização adiciona três cores à barbearia e mantém as políticas que permitem a edição apenas pelo seu dono. Em **Personalização**, escolha cor principal, destaque e fundo, veja a prévia e salve. O painel e todas as etapas do link público carregam a mesma paleta. O modelo do site continua igual para todas as barbearias.

As cores são salvas no banco, sem depender do navegador do barbeiro. Os tons de texto, superfícies e foco são derivados automaticamente para manter a leitura. Descartar prévia recupera as cores salvas; Restaurar padrão ainda exige Salvar cores. A demonstração não salva alterações.

## Imagem de fundo

A migração `supabase/migrations/20261006001151_fundo_barbearia.sql` adiciona o fundo personalizado e o bucket público `fundos-barbearias`. Já foi aplicada ao projeto conectado. Em **Personalização → Imagem de fundo**, escolha um arquivo JPG, PNG ou WebP de até 5 MB, confira a prévia e clique em **Salvar imagem de fundo**. **Remover imagem** também exige salvar; **Descartar prévia** recupera a imagem salva. A escolha é independente das cores e vale para o painel e as quatro páginas públicas do agendamento.

O navegador ajusta a imagem para no máximo 1920 pixels no maior lado e a comprime para WebP, com JPG como alternativa. O arquivo publicado tem limite de 2 MB. O fundo cobre a tela; as áreas de texto usam as superfícies da paleta para preservar a leitura. A imagem é pública, e apenas o dono pode enviar arquivos na pasta da sua barbearia e alterar seu fundo.

Cada envio usa um caminho novo. Trocas e remoções salvas tentam limpar a imagem anterior; as regras do banco impedem excluir o arquivo que ainda está em uso. Se não for possível conferir o estado após uma falha de conexão, o arquivo é preservado. Uma edição concorrente da imagem exige atualizar o painel antes de salvar novamente.

Execute `node testar-fundo-sql.cjs CAMINHO_DAS_DEPENDENCIAS` e `node testar-fundo-interface.cjs CAMINHO_DAS_DEPENDENCIAS` com PGlite e jsdom na pasta indicada. Os testes cobrem permissões entre barbearias, formatos e tamanho, prévia, compressão, descarte, troca, remoção, falhas de envio, resposta perdida, edição concorrente e preservação das cores. Usam dados isolados e API simulada.

## Fotos dos profissionais

Execute `supabase-fotos-profissionais.sql` após a instalação SaaS. No banco compartilhado em uso, esta atualização foi aplicada em 3 de outubro de 2026. Ela adiciona o caminho da foto ao cadastro e cria o bucket público `fotos-profissionais`, com limite de 5 MB e formatos JPG, PNG e WebP. Cada dono só pode enviar e excluir arquivos na pasta da sua barbearia. As imagens podem ser vistas pelos clientes pela URL pública; cadastros inativos continuam ocultos da lista pública.

Em **Barbearia e profissionais**, selecione uma foto ao cadastrar ou clique em **Editar profissional** para atualizar uma pessoa existente. A prévia é local: só **Salvar profissional** publica a alteração. **Remover foto** também exige salvar, e **Cancelar edição** descarta a prévia. Sem foto, ou se o arquivo não carregar, aparecem as iniciais. As fotos são mostradas na escolha do profissional e na etapa de serviços.

Cada envio usa um caminho novo para evitar imagem antiga em cache. Após uma troca ou remoção salva, o painel exclui o arquivo antigo se nenhum outro cadastro o estiver usando. Falhas de conexão podem deixar um arquivo sem referência; o painel preserva arquivos quando não consegue confirmar o estado salvo no banco.

O rodapé das cinco páginas principais identifica **Wendell Kawhan**, com contato **(79) 99677-6478** por WhatsApp.

## Exclusão de profissionais e limpeza da agenda

Execute `supabase-exclusoes.sql` após a instalação SaaS. **Excluir profissional**, em **Barbearia e profissionais**, pede confirmação e retira a pessoa da equipe e da seleção pública. O registro fica arquivado e inativo no banco para preservar seus agendamentos existentes e a integridade do histórico.

Em **Agendamentos**, **Limpar lista** pede confirmação e exclui permanentemente os registros exibidos. Com uma data selecionada, só alcança essa data; com o filtro vazio, alcança todas as datas exibidas. A exclusão libera os horários reservados. Agendamentos recebidos depois da consulta ficam preservados. O botão fica desabilitado enquanto a lista carrega, quando está vazia ou durante a limpeza. A função do banco exige a conta do dono e respeita o isolamento entre barbearias.

## Tempo de atendimento por profissional

Execute `supabase-duracao-profissionais.sql` após a instalação SaaS e as demais atualizações. Em **Horários → Tempo de atendimento por profissional**, digite a quantidade de minutos desejada para cada pessoa e clique em **Salvar tempo**. O tempo é único por barbeiro e vale para todos os serviços dele. O campo aceita qualquer número inteiro de minutos entre 1 e 1440, inclusive 25 ou 35; não há uma lista fechada de opções. A alteração fica salva no banco da barbearia; novos profissionais começam sem tempo preenchido e só ficam disponíveis para novas reservas depois que seu tempo for escolhido e salvo. Os profissionais anteriores à atualização mantêm inicialmente os 40 minutos que já utilizavam, e podem alterar esse valor no painel.

A agenda calcula a grade, o término antes do fechamento, os intervalos e os conflitos conforme a duração de cada profissional. A opção sem preferência reúne as vagas disponíveis da equipe e escolhe um profissional que possa atender naquele horário. Cada reserva guarda a duração usada ao agendar; alterar o tempo do barbeiro não modifica reservas existentes. As reservas anteriores a esta atualização mantêm 40 minutos. Bloqueios de horário continuam cobrindo 40 minutos; os bloqueios de dia inteiro e a pausa continuam valendo para toda a equipe.

Execute `node testar-duracoes.cjs CAMINHO_DA_PASTA` e `node testar-duracoes-interface.cjs CAMINHO_DA_PASTA` para verificar a migração, grades com diferentes durações, preservação das reservas, conflitos, fechamento, intervalos, bloqueios, isolamento entre lojas e edição dos tempos no painel. Os testes usam PGlite e jsdom em dados isolados.

## Valores da agenda por dia e barbeiro

Execute `supabase-resumo-financeiro.sql` após a instalação SaaS. Na aba **Agendamentos**, o filtro **Dia** também seleciona o resumo: mostra a soma dos preços salvos nos agendamentos confirmados e, separadamente, os valores previstos dos pendentes. Cancelados não entram nas somas. O resumo é compacto, sem um quadro externo, e mostra apenas dois quadros: Confirmados e Pendentes. Os totais incluem registros de profissionais inativos ou excluídos que tenham agendamentos no período. Com o filtro vazio, o resumo abrange todas as datas.

Confirmar, cancelar, atualizar a lista ou mudar a data recalcula o resumo. Alterações posteriores no preço do catálogo não alteram os valores já registrados. Os totais representam valores de agendamentos por status; o sistema não registra pagamentos recebidos. A limpeza permanente dos agendamentos também retira seus valores do resumo.

A função do banco soma todos os registros do período e retorna um único objeto, sem o limite de linhas da lista. Somente o dono pode consultar o resumo de sua barbearia; a função usa as políticas de acesso existentes e não expõe dados de clientes. Falhas de consulta mostram um aviso, em vez de um total zerado. Execute `node testar-financeiro.cjs CAMINHO_DA_PASTA` e `node testar-financeiro-interface.cjs CAMINHO_DA_PASTA` com as dependências temporárias já usadas nos demais testes.

## Verificação antes de publicar

O script `testar-saas.cjs` verifica a instalação e as regras de acesso em PostgreSQL local com PGlite. Instale `@electric-sql/pglite@0.3.14` em uma pasta temporária e execute `node testar-saas.cjs CAMINHO_DA_PASTA`, a partir da pasta do projeto. Ele cria duas contas e verifica isolamento de leitura/escrita, privacidade, reservas, conflito de horário e pausa. Essa validação não substitui os testes de autenticação no Supabase publicado.

Para testar a inicialização das páginas e o fluxo do painel com API simulada, instale também `jsdom@26.1.0` na mesma pasta temporária e execute `node testar-interface.cjs CAMINHO_DA_PASTA`.

Execute também `node testar-fotos.cjs CAMINHO_DA_PASTA` para verificar fotos, prévia, cancelamento, cadastro, troca, remoção, falhas de envio e os contatos no rodapé. O teste SQL inclui as políticas do Storage com o contrato mínimo local; os formatos e tamanho dos arquivos também são limitados pelo bucket no Supabase.

Execute `node testar-exclusoes.cjs CAMINHO_DA_PASTA` para verificar as confirmações, o filtro por data, cancelamentos, falhas de conexão e a preservação de agendamentos recebidos após a consulta. O teste SQL também verifica a exclusão com histórico, o isolamento da limpeza e a liberação de horários.

Execute `node testar-confirmacao-whatsapp.cjs CAMINHO_DA_PASTA` para verificar o destinatário e o texto da mensagem, a confirmação antes da abertura, a recuperação de respostas perdidas, o bloqueio de pop-up e agendamentos alterados em outra aba. Nenhuma mensagem real é enviada nos testes.

Crie duas contas de teste, cada uma com sua barbearia. Confira que cada dono vê somente suas reservas e consegue alterar somente seus registros, inclusive por requisições diretas à API. Confira que reservas no mesmo horário de barbearias diferentes funcionam, que duas reservas concorrentes para o mesmo profissional não ocupam o mesmo horário e que a consulta pública não retorna dados de clientes. Teste os e-mails de confirmação e recuperação no endereço publicado.

Não há alterações automáticas no Supabase pelo código local: a instalação SQL e a configuração de autenticação são necessárias para ativar o cadastro.

## Rotina do barbeiro

A atualização está em `supabase/migrations/20261004171711_rotina_barbeiro.sql`, criada com a CLI do Supabase. Aplique depois das atualizações SaaS existentes e, em seguida, aplique `20261005021250_indice_pagamentos_reserva.sql`. As duas já foram aplicadas ao projeto conectado. Mantêm os agendamentos anteriores e importam seus clientes válidos para um cadastro privado.

- **Agendamentos:** Novo agendamento registra reservas pelo painel e já as confirma no site. É possível registrar encaixes em horários de hoje que já começaram. As vagas respeitam o expediente, a pausa, os bloqueios, os intervalos e a duração do profissional. O painel permite até 365 dias; o calendário público continua limitado aos próximos 14 dias. Remarcar mantém o ID e libera o horário antigo somente quando o novo horário foi validado e salvo. No mesmo profissional, preserva a duração original; ao trocar, usa o tempo do novo profissional. Reservas pagas ou finalizadas não podem ser remarcadas.
- **Concluir atendimento e Cliente faltou:** abrem uma confirmação dentro do painel e só permitem gravar quando o horário já começou. Horários futuros mostram a explicação no cartão e na confirmação. Falhas de gravação permanecem visíveis nessa janela; respostas perdidas são conferidas pela situação salva. A falta fica no histórico. Concluir um atendimento não registra dinheiro recebido.
- **Pagamentos:** registre valor, Pix/dinheiro/cartão e data do recebimento em um atendimento confirmado ou concluído. Cada atendimento tem um único pagamento total, que pode ser corrigido; a correção substitui o valor anterior. Repetir o salvamento não duplica a entrada. Não representa cobrança automática de cartão ou Pix, pagamento parcial ou estorno.
- **Clientes:** cadastro a partir dos agendamentos, busca por nome/telefone, preferências e histórico de cortes/faltas/recebimentos. O telefone com DDD identifica o cliente dentro de cada barbearia. Corrigir o telefone numa remarcação cria o cadastro correspondente; o histórico continua ligado ao telefone registrado em cada reserva.
- **Caixa:** consulta por dia ou período de até um ano, com recebimentos, despesas, saldo e entradas por forma de pagamento. Recebimentos usam a data do pagamento; despesas usam sua própria data. O saldo é recebimentos menos despesas registradas, sem estimativa de lucro contábil. Registre despesas e, em caso de erro, exclua o lançamento. As listas são paginadas, mas os totais consideram o período inteiro.
- **Lembretes:** em Outras ações, Lembrar no WhatsApp abre uma mensagem com cliente, barbearia, serviço, data e horário. O barbeiro precisa tocar em Enviar no WhatsApp. Nenhuma mensagem é enviada nem sua entrega é registrada automaticamente.
- **Lista de espera:** registre serviço, profissional opcional, data e preferência de horário. Avisar no WhatsApp prepara uma mensagem; Marcar como contatado é uma ação separada. Agendar só retira a solicitação da espera após reservar a vaga no banco. Encerrar mantém a solicitação para consulta. Preferências orientam o barbeiro, que escolhe a vaga disponível no formulário.

Limpar lista atua somente sobre os agendamentos da página exibida e preserva registros concluídos, faltas e pagamentos. As novas tabelas usam RLS por barbearia e não têm leitura pública. As funções administrativas usam `SECURITY INVOKER`, verificam o dono e não concedem execução ao visitante. As reservas do painel usam a mesma trava das reservas públicas para evitar disputas pelo mesmo horário. Consultas do painel têm paginação e índices por barbearia, cliente e período; não há consulta automática em loop.

Para verificar sem alterar clientes reais, execute `node testar-rotina.cjs CAMINHO_DAS_DEPENDENCIAS` e `node testar-rotina-interface.cjs CAMINHO_DAS_DEPENDENCIAS`. A pasta indicada deve conter `node_modules/@electric-sql/pglite` e `node_modules/jsdom`. O primeiro usa um Postgres em memória; o segundo usa API e WhatsApp simulados. Cobrem isolamento por loja, conflitos e remarcação atômica, finalização, pagamentos e correções, caixa por data de recebimento, histórico protegido, espera, paginação, falhas e logout.
