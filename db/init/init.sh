#!/bin/bash
set -e

echo ">> Running PostgreSQL initialization scripts..."

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    \i /docker-entrypoint-initdb.d/001_initial.sql
    \i /docker-entrypoint-initdb.d/002_rls.sql
    \i /docker-entrypoint-initdb.d/003_app_role.sql
EOSQL

echo ">> PostgreSQL initialization complete."
