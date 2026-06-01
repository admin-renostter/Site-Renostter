create extension if not exists "pgcrypto";

create table if not exists public.vagas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  departamento text not null,
  localizacao text not null,
  tipo_contrato text not null,
  faixa_salarial text,
  descricao text not null,
  requisitos jsonb not null default '[]'::jsonb,
  beneficios jsonb not null default '[]'::jsonb,
  status text not null default 'ativa' check (status in ('rascunho', 'ativa', 'pausada', 'encerrada')),
  data_publicacao timestamptz not null default now(),
  data_expiracao timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidaturas (
  id uuid primary key default gen_random_uuid(),
  vaga_id uuid references public.vagas(id) on delete set null,
  nome_completo text not null,
  cpf text not null,
  email text not null,
  celular text not null,
  endereco jsonb not null,
  curriculo_url text not null,
  status text not null default 'recebida' check (status in ('recebida', 'em_analise', 'entrevista', 'reprovada', 'contratada')),
  observacoes text,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin')),
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vagas_set_updated_at on public.vagas;
create trigger vagas_set_updated_at
before update on public.vagas
for each row execute function public.set_updated_at();

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.admin_profiles
    where user_id = auth.uid() and role = 'admin'
  );
$$;

alter table public.vagas enable row level security;
alter table public.candidaturas enable row level security;
alter table public.admin_profiles enable row level security;

drop policy if exists "Vagas ativas sao publicas" on public.vagas;
create policy "Vagas ativas sao publicas"
on public.vagas for select
to anon, authenticated
using (
  status = 'ativa'
  and data_publicacao <= now()
  and (data_expiracao is null or data_expiracao >= now())
);

drop policy if exists "Admins gerenciam vagas" on public.vagas;
create policy "Admins gerenciam vagas"
on public.vagas for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins leem candidaturas" on public.candidaturas;
create policy "Admins leem candidaturas"
on public.candidaturas for select
to authenticated
using (public.is_admin());

drop policy if exists "Admins atualizam candidaturas" on public.candidaturas;
create policy "Admins atualizam candidaturas"
on public.candidaturas for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "Admins removem candidaturas" on public.candidaturas;
create policy "Admins removem candidaturas"
on public.candidaturas for delete
to authenticated
using (public.is_admin());

drop policy if exists "Admins leem perfis admin" on public.admin_profiles;
create policy "Admins leem perfis admin"
on public.admin_profiles for select
to authenticated
using (public.is_admin());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'curriculos',
  'curriculos',
  false,
  10485760,
  array[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

drop policy if exists "Admins leem curriculos" on storage.objects;
create policy "Admins leem curriculos"
on storage.objects for select
to authenticated
using (bucket_id = 'curriculos' and public.is_admin());

drop policy if exists "Admins removem curriculos" on storage.objects;
create policy "Admins removem curriculos"
on storage.objects for delete
to authenticated
using (bucket_id = 'curriculos' and public.is_admin());

create index if not exists vagas_status_idx on public.vagas(status);
create index if not exists candidaturas_vaga_idx on public.candidaturas(vaga_id);
create index if not exists candidaturas_status_idx on public.candidaturas(status);
create index if not exists candidaturas_created_at_idx on public.candidaturas(created_at);
