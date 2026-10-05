-- Cobre a chave estrangeira por barbearia e atendimento.
create index if not exists saas_pagamentos_reserva
 on public.saas_pagamentos(barbearia_id,reserva_id);
