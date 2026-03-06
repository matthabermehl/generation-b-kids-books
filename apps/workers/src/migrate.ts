import type { CloudFormationCustomResourceEvent, Handler } from "aws-lambda";
import { execute } from "./lib/rds.js";

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
  fal_request_id TEXT,
  width INTEGER,
  height INTEGER,
  s3_url TEXT,
  qa_json JSONB,
  status TEXT NOT NULL,
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
  ADD COLUMN IF NOT EXISTS layout_profile_id TEXT NOT NULL DEFAULT 'pb_square_8_5_v1';

ALTER TABLE pages
  ADD COLUMN IF NOT EXISTS composition_json JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE images
  ADD COLUMN IF NOT EXISTS parent_image_id UUID REFERENCES images(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS input_assets_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS mask_s3_url TEXT;

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_payment_sessions_order ON payment_sessions(order_id);
CREATE INDEX IF NOT EXISTS idx_payment_events_order ON payment_events(order_id);
CREATE INDEX IF NOT EXISTS idx_books_order ON books(order_id);
CREATE INDEX IF NOT EXISTS idx_pages_book ON pages(book_id);
CREATE INDEX IF NOT EXISTS idx_images_book ON images(book_id);
CREATE INDEX IF NOT EXISTS idx_images_page ON images(page_id);
CREATE INDEX IF NOT EXISTS idx_privacy_events_user ON privacy_events(user_id);
`;

function splitSqlStatements(sql: string): string[] {
  return sql
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `${part};`);
}

export const handler: Handler<CloudFormationCustomResourceEvent, { PhysicalResourceId: string; Data?: { statementCount: number } }> = async (event) => {
  if (event.RequestType === "Delete") {
    return {
      PhysicalResourceId: event.PhysicalResourceId ?? "migrations"
    };
  }

  const statements = splitSqlStatements(migrationSql);

  for (const statement of statements) {
    await execute(statement);
  }

  return {
    PhysicalResourceId: "migrations-v2",
    Data: {
      statementCount: statements.length
    }
  };
};
