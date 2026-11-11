# ZapPilot MVP

MVP React + TypeScript conectado ao Supabase. O painel, os contatos, templates, funil, campanhas, conversas e instâncias leem e gravam dados do workspace. Sem configuração Supabase o app pede configuração; não preenche telas com dados fictícios.

## Rodar localmente

1. Instale Node.js 20 ou superior.
2. Mantenha `.env.local` com `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` do projeto.
3. Em Supabase → Authentication → URL Configuration, permita o endereço local (por padrão `http://localhost:5173`) como Site URL e Redirect URL.
4. Na pasta do projeto, execute `npm install` e `npm run dev`.
5. Entre com um usuário já cadastrado no Supabase.

## Backend

As migrations já aplicadas no projeto são:

- `202611100001_whatsapp_workspace.sql`
- `202611100002_campaign_queue.sql`
- `202611100003_inbox.sql`
- `20261111195217_function_privileges.sql`

O funil usa `pipeline_stages` e `leads`; cada workspace recebe as etapas iniciais automaticamente. Contatos sem opt-in e contatos bloqueados ou descadastrados não são incluídos nas campanhas.

## WhatsApp e campanhas reais

As Edge Functions `whatsapp-admin`, `whatsapp-webhook`, `campaign-worker` e `conversation-admin` estão publicadas. Para conectar o gateway, configure estes secrets em Supabase → Edge Functions → Secrets:

- `EVOLUTION_API_URL`
- `EVOLUTION_API_KEY`
- `WHATSAPP_WEBHOOK_SECRET` (segredo forte exclusivo do webhook)
- `CAMPAIGN_WORKER_SECRET` (segredo forte exclusivo do worker)

Depois, crie o número na área WhatsApp e leia o QR Code. Configure o webhook da Evolution para `https://SEU_PROJECT_REF.supabase.co/functions/v1/whatsapp-webhook`, enviando o `WHATSAPP_WEBHOOK_SECRET` como Bearer token. Campanhas entram na fila e só são processadas quando o Supabase Cron chama `campaign-worker`; use `supabase/schedule_campaign_worker.sql` depois de substituir os placeholders e habilitar Cron, Net e Vault. Nenhuma mensagem é enviada enquanto Evolution e Cron não estiverem configurados.

As respostas recebidas são classificadas por regras locais. O conteúdo das mensagens não é enviado a um serviço externo de IA.

## Limites do MVP

Cadências automáticas, faturamento/créditos, múltiplos papéis avançados, edição em massa e relatórios históricos detalhados ainda não estão disponíveis. As áreas sem backend funcional exibem esse estado claramente.
