-- ============================================================
# Renostter - Inicialização do PostgreSQL
# Executado automaticamente na primeira inicialização do container
# ============================================================

-- Extensões úteis
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Configuração recomendada para o tamanho da VPS
-- (pode ajustar depois via SQL ou pgAdmin)
ALTER SYSTEM SET log_min_duration_statement = '500ms';
ALTER SYSTEM SET log_connections = 'on';
ALTER SYSTEM SET log_disconnections = 'on';
