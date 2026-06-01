# Trabalhe Conosco - Next.js 14 + Supabase

Módulo recomendado para migrar a área de carreiras da Renostter para Next.js App Router com custo zero/free tier.

## Estrutura

```txt
app/
  api/candidaturas/route.ts
  admin/trabalhe-conosco/page.tsx
  admin/dashboard-trabalhe-conosco/page.tsx
components/trabalhe-conosco/
  TrabalheConoscoModal.tsx
  CandidaturaForm.tsx
  VagasAdminClient.tsx
  DashboardTrabalheConosco.tsx
  ExportCandidaturasButton.tsx
lib/
  supabase/client.ts
  supabase/server.ts
  trabalhe-conosco/schemas.ts
supabase/schema.sql
```

## Variáveis

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RH_EMAIL=admin@renostter.com
N8N_CANDIDATURA_WEBHOOK_URL=
NEXT_PUBLIC_SITE_URL=https://renostter.com
```

Use `SUPABASE_SERVICE_ROLE_KEY` somente em server routes/actions.

## Dependências

```bash
npm i @supabase/ssr @supabase/supabase-js react-hook-form zod @hookform/resolvers resend xlsx recharts lucide-react @tiptap/react @tiptap/starter-kit
```
