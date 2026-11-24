-- Managed PostgreSQL installations may provision the runtime role under another name.
-- In that case apply equivalent grants using deploy/runtime-grants.sql after migration.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mafuta_app') THEN
    REVOKE ALL ON audit_log FROM mafuta_app;
    GRANT SELECT, INSERT ON audit_log TO mafuta_app;
    REVOKE ALL ON schema_migrations FROM mafuta_app;
    GRANT SELECT ON schema_migrations TO mafuta_app;
  END IF;
END;
$$;
