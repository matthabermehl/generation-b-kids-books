import type { CloudFormationCustomResourceEvent, Handler } from "aws-lambda";
import { execute } from "./lib/rds.js";
import { splitSqlStatements } from "./lib/sql.js";

const migrationSql = `
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE,
  country TEXT,
  timezone TEXT
);

CREATE TABLE IF NOT EXISTS child_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_first_name TEXT NOT NULL,
  pronouns TEXT NOT NULL,
  age_years INTEGER NOT NULL,
  reading_profile_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id UUID NOT NULL REFERENCES child_profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  stripe_session_id TEXT,
  price_cents INTEGER NOT NULL,
  currency TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  stripe_session_id TEXT NOT NULL UNIQUE,
  checkout_url TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payment_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  stripe_event_id TEXT NOT NULL UNIQUE,
  stripe_event_type TEXT NOT NULL,
  payload_sha256 TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  processed_status TEXT NOT NULL,
  processing_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  money_lesson_key TEXT NOT NULL,
  interest_tags TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  reading_profile_id TEXT NOT NULL,
  character_description TEXT NOT NULL DEFAULT '',
  book_version TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ready_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS book_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL,
  s3_url TEXT NOT NULL,
  sha256 TEXT,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  illustration_brief_json JSONB NOT NULL,
  reading_checks_json JSONB NOT NULL,
  status TEXT NOT NULL,
  UNIQUE(book_id, page_index)
);

CREATE TABLE IF NOT EXISTS images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  role TEXT NOT NULL,
  model_endpoint TEXT NOT NULL,
  prompt TEXT NOT NULL,
  negative_prompt TEXT,
  seed INTEGER NOT NULL,
  loras_json JSONB,
  provider_request_id TEXT,
  width INTEGER,
  height INTEGER,
  s3_url TEXT,
  qa_json JSONB,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS review_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  stage TEXT NOT NULL,
  reason_summary TEXT NOT NULL,
  reason_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS review_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  review_case_id UUID NOT NULL REFERENCES review_cases(id) ON DELETE CASCADE,
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_id UUID REFERENCES pages(id) ON DELETE SET NULL,
  reviewer_email TEXT NOT NULL,
  action TEXT NOT NULL,
  notes TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  book_id UUID NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  model_used TEXT NOT NULL,
  score_json JSONB NOT NULL,
  verdict TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS privacy_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  child_profile_id UUID,
  event_type TEXT NOT NULL,
  status TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE books
  ADD COLUMN IF NOT EXISTS product_family TEXT NOT NULL DEFAULT 'picture_book_fixed_layout',
  ADD COLUMN IF NOT EXISTS layout_profile_id TEXT NOT NULL DEFAULT 'pb_square_spread_8_5_v1',
  ADD COLUMN IF NOT EXISTS character_description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS selected_character_image_id UUID REFERENCES images(id) ON DELETE SET NULL;

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS composition_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS provider_request_id TEXT,
  ADD COLUMN IF NOT EXISTS parent_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS input_assets_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS mask_s3_url TEXT,
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE;

ALTER TABLE book_artifacts
  ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'images' AND column_name = 'fal_request_id'
  ) THEN
    EXECUTE '
      UPDATE images
      SET provider_request_id = COALESCE(provider_request_id, fal_request_id)
      WHERE provider_request_id IS NULL AND fal_request_id IS NOT NULL
    ';
  END IF;
END $$;

UPDATE images SET is_current = TRUE WHERE is_current IS NULL;
UPDATE book_artifacts SET is_current = TRUE WHERE is_current IS NULL;
UPDATE books
SET money_lesson_key = CASE money_lesson_key
  WHEN 'inflation_candy' THEN 'prices_change'
  WHEN 'saving_later' THEN 'jar_saving_limits'
  WHEN 'delayed_gratification' THEN 'keep_what_you_earn'
  ELSE money_lesson_key
END
WHERE money_lesson_key IN ('inflation_candy', 'saving_later', 'delayed_gratification');

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_order ON payment_sessions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_books_order ON books(order_id);
CREATE INDEX IF NOT EXISTS idx_pages_book ON pages(book_id);
CREATE INDEX IF NOT EXISTS idx_images_book ON images(book_id);
CREATE INDEX IF NOT EXISTS idx_images_page ON images(page_id);
CREATE INDEX IF NOT EXISTS idx_images_page_role_current ON images(page_id, role, is_current);
CREATE INDEX IF NOT EXISTS idx_images_book_role_current ON images(book_id, role, is_current);
CREATE INDEX IF NOT EXISTS idx_book_artifacts_book_type_current ON book_artifacts(book_id, artifact_type, is_current);
CREATE INDEX IF NOT EXISTS idx_review_cases_book ON review_cases(book_id);
CREATE INDEX IF NOT EXISTS idx_review_cases_status ON review_cases(status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_cases_book_active ON review_cases(book_id) WHERE status IN ('open', 'retrying');
CREATE INDEX IF NOT EXISTS idx_review_events_case ON review_events(review_case_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_privacy_events_user ON privacy_events(user_id);
`;

export const handler: Handler<CloudFormationCustomResourceEvent, { PhysicalResourceId: string; Data?: { statementCount: number } }> = async (event) => {
  const migrationVersion =
    typeof event.ResourceProperties?.MigrationVersion === "string" ? event.ResourceProperties.MigrationVersion : "migrations";

  if (event.RequestType === "Delete") {
    return {
      PhysicalResourceId: event.PhysicalResourceId ?? migrationVersion
    };
  }

  const statements = splitSqlStatements(migrationSql);

  for (const statement of statements) {
    await execute(statement);
  }

  return {
    PhysicalResourceId: migrationVersion,
    Data: {
      statementCount: statements.length
    }
  };
};
