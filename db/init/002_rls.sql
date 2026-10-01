-- 002_rls.sql
-- Enable and Force Row-Level Security on prep_inspections (CUBE Rule 1)

-- 1. Enable RLS
ALTER TABLE prep_inspections ENABLE ROW LEVEL SECURITY;

-- 2. Force RLS (applies even to table owners/creators if not superuser)
ALTER TABLE prep_inspections FORCE ROW LEVEL SECURITY;

-- 3. Drop existing policies if any
DROP POLICY IF EXISTS tenant_isolation_policy ON prep_inspections;

-- 4. Create comprehensive tenant isolation policy using current_setting('app.current_org_id', true)
-- Note: 'true' parameter returns NULL instead of raising an error if app.current_org_id is not set.
-- When NULL or empty string, org_id = current_setting evaluates to false/unknown, resulting in ZERO rows accessible.
CREATE POLICY tenant_isolation_policy ON prep_inspections
    AS PERMISSIVE
    FOR ALL
    USING (
        org_id = NULLIF(current_setting('app.current_org_id', true), '')
    )
    WITH CHECK (
        org_id = NULLIF(current_setting('app.current_org_id', true), '')
    );
