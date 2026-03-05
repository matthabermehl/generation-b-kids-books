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

CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_books_order ON books(order_id);
CREATE INDEX IF NOT EXISTS idx_pages_book ON pages(book_id);
CREATE INDEX IF NOT EXISTS idx_images_book ON images(book_id);
CREATE INDEX IF NOT EXISTS idx_images_page ON images(page_id);
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
    PhysicalResourceId: "migrations-v1",
    Data: {
      statementCount: statements.length
    }
  };
};
