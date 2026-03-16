import { describe, expect, it } from "vitest";
import { splitSqlStatements } from "../src/lib/sql.js";

describe("splitSqlStatements", () => {
  it("keeps dollar-quoted DO blocks intact", () => {
    const statements = splitSqlStatements(`
      ALTER TABLE images ADD COLUMN IF NOT EXISTS provider_request_id TEXT;

      DO $$
      BEGIN
        EXECUTE '
          UPDATE images
          SET provider_request_id = COALESCE(provider_request_id, fal_request_id)
          WHERE provider_request_id IS NULL AND fal_request_id IS NOT NULL
        ';
      END $$;

      UPDATE images SET is_current = TRUE WHERE is_current IS NULL;
    `);

    expect(statements).toEqual([
      "ALTER TABLE images ADD COLUMN IF NOT EXISTS provider_request_id TEXT;",
      `DO $$
      BEGIN
        EXECUTE '
          UPDATE images
          SET provider_request_id = COALESCE(provider_request_id, fal_request_id)
          WHERE provider_request_id IS NULL AND fal_request_id IS NOT NULL
        ';
      END $$;`,
      "UPDATE images SET is_current = TRUE WHERE is_current IS NULL;"
    ]);
  });

  it("ignores semicolons inside quoted strings and comments", () => {
    const statements = splitSqlStatements(`
      -- keep semicolons in comments; they are not statement boundaries
      INSERT INTO prompts(prompt) VALUES ('calm; airy watercolor');
      /* block comment with ; inside */
      INSERT INTO prompts(prompt) VALUES ('look at ''quoted; text''');
    `);

    expect(statements).toEqual([
      "-- keep semicolons in comments; they are not statement boundaries\n      INSERT INTO prompts(prompt) VALUES ('calm; airy watercolor');",
      "/* block comment with ; inside */\n      INSERT INTO prompts(prompt) VALUES ('look at ''quoted; text''');"
    ]);
  });
});
