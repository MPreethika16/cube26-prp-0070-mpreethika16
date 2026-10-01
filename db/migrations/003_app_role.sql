-- 003_app_role.sql
-- Create non-owner, non-superuser application role with NO BYPASSRLS
-- Variable interpolation handled in init script or default creation

DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'prep_app') THEN
        CREATE ROLE prep_app WITH LOGIN PASSWORD 'prep_app_secure_pass_2026';
    END IF;
END
$$;

-- Ensure prep_app is strictly constrained
ALTER ROLE prep_app NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;

-- Grant usage on schema
GRANT USAGE ON SCHEMA public TO prep_app;

-- Grant DML privileges on tables
GRANT SELECT, INSERT, UPDATE, DELETE ON organizations TO prep_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON prep_inspections TO prep_app;

-- Seed organizations (org_demo_alpha, org_demo_bravo)
INSERT INTO organizations (id, name)
VALUES 
    ('org_demo_alpha', 'Demo Organization Alpha'),
    ('org_demo_bravo', 'Demo Organization Bravo')
ON CONFLICT (id) DO NOTHING;
