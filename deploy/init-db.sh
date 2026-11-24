#!/bin/sh
set -eu
# Executed once by the official PostgreSQL entrypoint, only on an empty volume.
# psql quoted variables safely escape passwords; no plaintext credentials in source.
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 \
  --set owner_password="$DB_OWNER_PASSWORD" --set app_password="$DB_APP_PASSWORD" <<'SQL'
CREATE ROLE mafuta_owner LOGIN PASSWORD :'owner_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
CREATE ROLE mafuta_app LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA public TO mafuta_owner;
GRANT USAGE ON SCHEMA public TO mafuta_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mafuta_owner IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mafuta_app;
ALTER DEFAULT PRIVILEGES FOR ROLE mafuta_owner IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO mafuta_app;
SQL
