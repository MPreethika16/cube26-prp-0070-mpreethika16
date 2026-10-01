-- 001_initial.sql
-- Create base schema owned by migration/admin role (prep_admin)

CREATE TABLE IF NOT EXISTS organizations (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prep_inspections (
    id UUID PRIMARY KEY,
    org_id TEXT NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    unit_id TEXT NOT NULL,
    work_order_id TEXT,
    status TEXT NOT NULL,
    inspection_record JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_prep_inspections_org_id ON prep_inspections(org_id);
CREATE INDEX IF NOT EXISTS idx_prep_inspections_unit_id ON prep_inspections(unit_id);
CREATE INDEX IF NOT EXISTS idx_prep_inspections_created_at ON prep_inspections(created_at);
