-- Run as the schema owner after provisioning an alternate runtime role.
-- psql --set runtime_role=your_runtime_role --file deploy/runtime-grants.sql
GRANT USAGE ON SCHEMA public TO :"runtime_role";
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO :"runtime_role";
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO :"runtime_role";
REVOKE ALL ON audit_log, schema_migrations FROM :"runtime_role";
GRANT SELECT, INSERT ON audit_log TO :"runtime_role";
GRANT SELECT ON schema_migrations TO :"runtime_role";
REVOKE CREATE ON SCHEMA public FROM :"runtime_role";
