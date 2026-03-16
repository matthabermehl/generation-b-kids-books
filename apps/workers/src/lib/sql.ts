function readDollarQuoteTag(sql: string, index: number): string | null {
  if (sql[index] !== "$") {
    return null;
  }

  let cursor = index + 1;
  while (cursor < sql.length && sql[cursor] !== "$") {
    const character = sql[cursor];
    if (!character || !/[A-Za-z0-9_]/.test(character)) {
      return null;
    }
    cursor += 1;
  }

  if (cursor >= sql.length || sql[cursor] !== "$") {
    return null;
  }

  const tagBody = sql.slice(index + 1, cursor);
  if (tagBody.length > 0 && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(tagBody)) {
    return null;
  }

  return sql.slice(index, cursor + 1);
}

export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarQuoteTag: string | null = null;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    const nextCharacter = sql[index + 1];

    if (inLineComment) {
      current += character;
      if (character === "\n") {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      current += character;
      if (character === "*" && nextCharacter === "/") {
        current += nextCharacter;
        index += 1;
        inBlockComment = false;
      }
      continue;
    }

    if (dollarQuoteTag) {
      if (sql.startsWith(dollarQuoteTag, index)) {
        current += dollarQuoteTag;
        index += dollarQuoteTag.length - 1;
        dollarQuoteTag = null;
        continue;
      }

      current += character;
      continue;
    }

    if (inSingleQuote) {
      current += character;
      if (character === "'" && nextCharacter === "'") {
        current += nextCharacter;
        index += 1;
        continue;
      }
      if (character === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (inDoubleQuote) {
      current += character;
      if (character === '"' && nextCharacter === '"') {
        current += nextCharacter;
        index += 1;
        continue;
      }
      if (character === '"') {
        inDoubleQuote = false;
      }
      continue;
    }

    if (character === "-" && nextCharacter === "-") {
      current += `${character}${nextCharacter}`;
      index += 1;
      inLineComment = true;
      continue;
    }

    if (character === "/" && nextCharacter === "*") {
      current += `${character}${nextCharacter}`;
      index += 1;
      inBlockComment = true;
      continue;
    }

    if (character === "'") {
      current += character;
      inSingleQuote = true;
      continue;
    }

    if (character === '"') {
      current += character;
      inDoubleQuote = true;
      continue;
    }

    const detectedDollarTag = readDollarQuoteTag(sql, index);
    if (detectedDollarTag) {
      current += detectedDollarTag;
      index += detectedDollarTag.length - 1;
      dollarQuoteTag = detectedDollarTag;
      continue;
    }

    if (character === ";") {
      const statement = current.trim();
      if (statement) {
        statements.push(`${statement};`);
      }
      current = "";
      continue;
    }

    current += character;
  }

  const trailingStatement = current.trim();
  if (trailingStatement) {
    statements.push(trailingStatement);
  }

  return statements;
}
