-- ============================================================================
-- COC Platform – initial schema
-- Apply with:  supabase db push   (or paste into the Supabase SQL editor)
-- All tables: RLS enabled, NO policies → only the service-role key (server) can
-- read/write. The browser never talks to Supabase directly.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- helpers
-- ---------------------------------------------------------------------------
create or replace function coc_set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
create table coc_users (
  id               uuid primary key default gen_random_uuid(),
  entra_object_id  text unique,
  email            text not null unique,
  display_name     text,
  role             text not null default 'Viewer'
                   check (role in ('Admin','Quality','Production','Viewer')),
  active           boolean not null default true,
  last_login_at    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create trigger coc_users_updated before update on coc_users for each row execute function coc_set_updated_at();

-- ---------------------------------------------------------------------------
-- template assets (backgrounds, logos, images) – files in private bucket
-- ---------------------------------------------------------------------------
create table coc_template_assets (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid,                       -- nullable: shared assets
  kind          text not null check (kind in ('background','logo','image','font')),
  file_name     text not null,
  mime_type     text not null,
  storage_path  text not null unique,
  size_bytes    integer not null,
  page_count    integer,
  width_pt      numeric,
  height_pt     numeric,
  sha256        text,
  created_by    uuid references coc_users(id),
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- templates & versions
-- ---------------------------------------------------------------------------
create table coc_templates (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  description        text,
  template_type      text not null default 'COC',
  status             text not null default 'active' check (status in ('active','archived')),
  active_version_id  uuid,
  created_by         uuid references coc_users(id),
  updated_by         uuid references coc_users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger coc_templates_updated before update on coc_templates for each row execute function coc_set_updated_at();

create table coc_template_versions (
  id                   uuid primary key default gen_random_uuid(),
  template_id          uuid not null references coc_templates(id) on delete cascade,
  version_number       integer not null,
  revision             text,
  status               text not null default 'draft'
                       check (status in ('draft','published','deprecated','deleted')),
  template_json        jsonb not null,
  background_asset_id  uuid references coc_template_assets(id),
  change_note          text,
  published_at         timestamptz,
  published_by         uuid references coc_users(id),
  created_by           uuid references coc_users(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (template_id, version_number)
);
create trigger coc_template_versions_updated before update on coc_template_versions for each row execute function coc_set_updated_at();
alter table coc_templates
  add constraint templates_active_version_fk
  foreign key (active_version_id) references coc_template_versions(id) on delete set null;
alter table coc_template_assets
  add constraint coc_template_assets_template_fk
  foreign key (template_id) references coc_templates(id) on delete set null;

-- published versions are immutable
create or replace function coc_template_versions_immutable() returns trigger language plpgsql as $$
begin
  if old.status = 'published' and (
       new.template_json is distinct from old.template_json
    or new.background_asset_id is distinct from old.background_asset_id
    or new.version_number is distinct from old.version_number
  ) then
    raise exception 'Published template versions are immutable (version %). Create a new version instead.', old.version_number
      using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger coc_template_versions_guard before update on coc_template_versions
  for each row execute function coc_template_versions_immutable();

-- ---------------------------------------------------------------------------
-- field definitions + D365 mappings
-- ---------------------------------------------------------------------------
create table coc_field_definitions (
  id                 uuid primary key default gen_random_uuid(),
  field_name         text not null unique check (field_name ~ '^[A-Za-z][A-Za-z0-9_]*$'),
  display_name       text not null,
  description        text,
  data_type          text not null check (data_type in
                     ('TEXT','MULTILINE','NUMBER','DATE','TIME','DATETIME','BOOLEAN','DROPDOWN','IMAGE','SIGNATURE')),
  source_type        text not null check (source_type in
                     ('D365FO','MANUAL','SYSTEM','STATIC','SIGNATURE','IMAGE','CUSTOM')),
  category           text not null default 'Custom Fields',
  required           boolean not null default false,
  read_only          boolean not null default false,
  allow_override     boolean not null default false,
  default_value      text,
  unit               text,
  validation_json    jsonb not null default '{}'::jsonb,
  config_json        jsonb not null default '{}'::jsonb,
  is_system_defined  boolean not null default false,
  active             boolean not null default true,
  sort_order         integer not null default 100,
  created_by         uuid references coc_users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create trigger coc_field_definitions_updated before update on coc_field_definitions for each row execute function coc_set_updated_at();

create table coc_d365_field_mappings (
  id          uuid primary key default gen_random_uuid(),
  field_id    uuid not null unique references coc_field_definitions(id) on delete cascade,
  entity      text not null,
  property    text not null,
  path        text,
  odata_type  text,
  transform   text not null default 'none',
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger coc_d365_field_mappings_updated before update on coc_d365_field_mappings for each row execute function coc_set_updated_at();

-- ---------------------------------------------------------------------------
-- COC documents & processing
-- ---------------------------------------------------------------------------
create table coc_documents (
  id                       uuid primary key default gen_random_uuid(),
  coc_number               text unique,
  template_id              uuid not null references coc_templates(id),
  template_version_id      uuid not null references coc_template_versions(id),
  template_version_number  integer not null,
  production_order         text not null,
  item_number              text,
  item_description         text,
  serial_number            text,
  customer_po              text,
  sales_order              text,
  sales_line               text,
  customer_account         text,
  quantity                 numeric,
  status                   text not null default 'DRAFT' check (status in
                           ('DRAFT','DATA_RETRIEVED','VALIDATED','PDF_GENERATED','UPLOAD_FAILED','UPLOADED',
                            'D365_UPDATE_PENDING','D365_UPDATE_FAILED','COMPLETED','CANCELLED')),
  d365_context_json        jsonb,
  generated_pdf_path       text,
  pdf_sha256               text,
  sharepoint_url           text,
  sharepoint_item_id       text,
  d365_record_key          text,
  last_error               text,
  idempotency_key          text unique,
  created_by               uuid references coc_users(id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  completed_by             uuid references coc_users(id),
  completed_at             timestamptz
);
create trigger coc_documents_updated before update on coc_documents for each row execute function coc_set_updated_at();
create unique index coc_documents_po_serial_uq
  on coc_documents (production_order, serial_number)
  where status <> 'CANCELLED' and serial_number is not null;
create index coc_documents_status_idx on coc_documents (status);
create index coc_documents_created_idx on coc_documents (created_at desc);

create table coc_document_values (
  id               uuid primary key default gen_random_uuid(),
  coc_document_id  uuid not null references coc_documents(id) on delete cascade,
  field_id         uuid references coc_field_definitions(id),
  field_name       text not null,
  source_type      text not null,
  value_text       text,
  value_json       jsonb,
  resolved_at      timestamptz not null default now(),
  unique (coc_document_id, field_name)
);

create table coc_process_steps (
  id               uuid primary key default gen_random_uuid(),
  coc_document_id  uuid not null references coc_documents(id) on delete cascade,
  step             text not null check (step in ('D365_FETCH','VALIDATE','RENDER','SP_UPLOAD','D365_UPDATE')),
  status           text not null check (status in ('STARTED','OK','FAILED')),
  attempt          integer not null default 1,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz,
  duration_ms      integer,
  error            text,
  details          jsonb
);
create index coc_process_steps_doc_idx on coc_process_steps (coc_document_id, started_at);

create table coc_sharepoint_documents (
  id               uuid primary key default gen_random_uuid(),
  coc_document_id  uuid not null references coc_documents(id) on delete cascade,
  site_id          text,
  drive_id         text,
  item_id          text,
  folder_path      text,
  file_name        text,
  web_url          text,
  etag             text,
  size_bytes       integer,
  uploaded_at      timestamptz not null default now(),
  uploaded_by      uuid references coc_users(id)
);

create table coc_signatures (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references coc_users(id) on delete cascade,
  label         text,
  storage_path  text not null unique,
  mime_type     text not null,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);

create table coc_number_sequences (
  year        integer primary key,
  last_value  bigint not null default 0
);

-- ---------------------------------------------------------------------------
-- settings & audit
-- ---------------------------------------------------------------------------
create table coc_app_settings (
  key          text primary key,
  value        jsonb not null,
  description  text,
  updated_by   uuid references coc_users(id),
  updated_at   timestamptz not null default now()
);

create table coc_audit_logs (
  id           bigserial primary key,
  entity_type  text not null,
  entity_id    text,
  action       text not null,
  user_id      uuid,
  user_email   text,
  coc_number   text,
  details      jsonb,
  created_at   timestamptz not null default now()
);
create index coc_audit_logs_entity_idx on coc_audit_logs (entity_type, entity_id);
create index coc_audit_logs_created_idx on coc_audit_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Row Level Security: enabled everywhere, no policies (server-only access)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  for t in select unnest(array['coc_users','coc_template_assets','coc_templates','coc_template_versions','coc_field_definitions',
                               'coc_d365_field_mappings','coc_documents','coc_document_values','coc_process_steps',
                               'coc_sharepoint_documents','coc_signatures','coc_number_sequences','coc_app_settings','coc_audit_logs'])
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Storage buckets (private)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('coc-template-assets', 'coc-template-assets', false, 20971520, array['application/pdf','image/png','image/jpeg','font/ttf','application/octet-stream']),
  ('coc-signatures',      'coc-signatures',      false,  2097152, array['image/png','image/jpeg']),
  ('coc-generated',   'coc-generated',   false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: settings
-- ---------------------------------------------------------------------------
insert into coc_app_settings (key, value, description) values
  ('template.types',            '["COC","InspectionCertificate","TestCertificate","QualityCertificate","PackingCertificate","MaterialCertificate","ShippingCertificate"]', 'Available template types'),
  ('coc.numberFormat',          '"COC-{yyyy}-{seq:4}"', 'Used only when coc.numberAuthority = app'),
  ('coc.numberAuthority',       '"app"', 'app | d365 – who issues COC numbers'),
  ('coc.enforceRemainingQty',   'true', 'Block COCs exceeding remaining sales-line quantity'),
  ('sharepoint.folderPattern',  '"{root}/{yyyy}/{ItemNumber}"', 'Folder pattern; tokens: {root} {yyyy} {MM} and any field name'),
  ('sharepoint.fileNamePattern','"{COCNumber}.pdf"', 'File name pattern'),
  ('sharepoint.createOrgLink',  'false', 'Create organisation-scoped view link after upload'),
  ('signature.required',        'true', 'Default signature requirement for new templates')
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- Seed: field definitions (editable in Admin → Field Definitions)
-- ---------------------------------------------------------------------------
insert into coc_field_definitions
  (field_name, display_name, data_type, source_type, category, required, read_only, allow_override, config_json, is_system_defined, sort_order)
values
  -- D365FO
  ('ProductionOrder',     'Production Order',      'TEXT',   'D365FO', 'D365FO Fields', true,  true, false, '{}', true, 10),
  ('ItemNumber',          'Item Number',           'TEXT',   'D365FO', 'D365FO Fields', false, true, false, '{}', true, 11),
  ('ItemDescription',     'Item Description',      'TEXT',   'D365FO', 'D365FO Fields', false, true, false, '{}', true, 12),
  ('ProductionQuantity',  'Production Quantity',   'NUMBER', 'D365FO', 'D365FO Fields', false, true, false, '{}', true, 13),
  ('SalesOrder',          'Sales Order',           'TEXT',   'D365FO', 'D365FO Fields', false, true, false, '{}', true, 14),
  ('SalesLineNumber',     'Sales Line',            'TEXT',   'D365FO', 'D365FO Fields', false, true, false, '{}', true, 15),
  ('SalesQuantity',       'Sales Order Quantity',  'NUMBER', 'D365FO', 'D365FO Fields', false, true, false, '{}', true, 16),
  ('CustomerPO',          'Customer PO',           'TEXT',   'D365FO', 'D365FO Fields', true,  true, false, '{}', true, 17),
  ('CustomerAccount',     'Customer Account',      'TEXT',   'D365FO', 'D365FO Fields', false, true, false, '{}', true, 18),
  ('CustomerName',        'Customer Name',         'TEXT',   'D365FO', 'D365FO Fields', false, true, false, '{}', true, 19),
  ('CustomerPartNumber',  'Customer Part Number',  'TEXT',   'D365FO', 'D365FO Fields', false, true, false, '{}', true, 20),
  ('Site',                'Site',                  'TEXT',   'D365FO', 'D365FO Fields', false, true, false, '{}', true, 21),
  ('Warehouse',           'Warehouse',             'TEXT',   'D365FO', 'D365FO Fields', false, true, false, '{}', true, 22),
  -- Manual
  ('TopLevelSerialNumber','Top Level Serial Number','TEXT',  'MANUAL', 'Manual Fields', true,  false, false, '{"placeholder":"HSIN : 1392"}', true, 30),
  ('InspectionResult',    'Inspection Result',     'DROPDOWN','MANUAL','Manual Fields', false, false, false, '{"options":["PASS","FAIL","CONDITIONAL"]}', true, 31),
  ('Comments',            'Comments',              'MULTILINE','MANUAL','Manual Fields', false, false, false, '{}', true, 32),
  ('InspectionTime',      'Inspection Time',       'TIME',   'MANUAL', 'Manual Fields', false, false, false, '{}', true, 33),
  -- System
  ('COCNumber',           'COC Number',            'TEXT',   'SYSTEM', 'System Fields', false, true, false, '{"systemKey":"COC_NUMBER"}', true, 40),
  ('COCDate',             'COC Date',              'DATE',   'SYSTEM', 'System Fields', false, true, true,  '{"systemKey":"CURRENT_DATE","format":"yyyy-MM-dd"}', true, 41),
  ('CompletedDate',       'Completed Date',        'DATE',   'SYSTEM', 'System Fields', false, true, false, '{"systemKey":"CURRENT_DATE","format":"yyyy-MM-dd"}', true, 42),
  ('CurrentTime',         'Current Time',          'TIME',   'SYSTEM', 'System Fields', false, true, false, '{"systemKey":"CURRENT_TIME","format":"HH:mm"}', true, 43),
  ('CurrentDateTime',     'Current Date & Time',   'DATETIME','SYSTEM','System Fields', false, true, false, '{"systemKey":"CURRENT_DATETIME","format":"yyyy-MM-dd HH:mm"}', true, 44),
  ('CompletedBy',         'Completed By',          'TEXT',   'SYSTEM', 'System Fields', false, true, false, '{"systemKey":"CURRENT_USER"}', true, 45),
  ('TemplateVersion',     'Template Version',      'TEXT',   'SYSTEM', 'System Fields', false, true, false, '{"systemKey":"TEMPLATE_VERSION"}', true, 46),
  -- Signature / image
  ('Signature',           'Signature',             'SIGNATURE','SIGNATURE','Manual Fields', true, false, false, '{}', true, 50),
  ('CompanyLogo',         'Company Logo',          'IMAGE',  'IMAGE',  'Manual Fields', false, true, false, '{}', true, 51);

insert into coc_d365_field_mappings (field_id, entity, property)
select id, 'COCProductionData', field_name from coc_field_definitions where source_type = 'D365FO';

insert into coc_number_sequences (year, last_value) values (extract(year from now())::int, 0)
on conflict do nothing;
