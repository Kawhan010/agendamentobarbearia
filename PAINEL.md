# Painel da Barbearia Salles

Abra admin.html pelo Live Server. A demonstração permite experimentar as telas sem alterar os dados reais.

## Configuração pendente do Supabase
1. Execute supabase-setup.sql uma única vez no SQL Editor do projeto aomiougfbfodahcpbdmu. Ele cria tabelas, permissões, catálogo e funções para reservar horários.
2. Em Authentication > Users, crie a conta do barbeiro. Não habilite cadastro público no painel.
3. Copie o UUID do usuário e execute no SQL Editor:
   insert into public.administradores(user_id) values ('UUID-DO-USUARIO');
4. Copie a chave pública publishable/anon para publicKey em supabase-config.js. Nunca coloque service_role ou secret no site.
5. Altere enabled para true em supabase-config.js após concluir o banco e a autorização.
6. Abra admin.html, entre e teste horários, preços e bloqueios. O site passa a consultar o banco quando a chave estiver preenchida.

A troca do e-mail da mesma conta mantém o UUID e as permissões. Uma conta nova precisa ser autorizada separadamente.

O SQL não foi executado remotamente nesta sessão. Não publique antes de testar o login, as políticas RLS e duas reservas simultâneas. A função pública de reservas deve ganhar proteção contra abuso (por exemplo CAPTCHA via Edge Function) antes da divulgação ampla.

Reservas pendentes ocupam horário mesmo se o cliente não enviar a mensagem no WhatsApp. O barbeiro pode cancelar no painel para liberar a vaga. Cancelamento via WhatsApp é um pedido: não libera o horário automaticamente.

O expediente e os bloqueios são compartilhados pelos dois profissionais. Todos os serviços duram 40 minutos. Alterar expediente não remarca reservas existentes.


## Intervalos e pausa
Execute supabase-intervalos-pausa.sql no banco existente (não repita supabase-setup.sql). Depois atualize o painel. Em Horários, configure os dois campos de intervalo por dia e salve. Pausar expediente bloqueia novas reservas de toda a barbearia, inclusive datas futuras, até Retomar expediente. Reservas existentes permanecem. Os botões ficam desabilitados enquanto essa atualização não estiver instalada.

