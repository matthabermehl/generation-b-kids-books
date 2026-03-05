import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const specModulePath = resolve("./dist/apps/api/src/openapi/spec.js");
const outPath = resolve("./openapi.json");

const moduleUrl = pathToFileURL(specModulePath).href;
const mod = await import(moduleUrl);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(mod.openApiSpec, null, 2));

console.log(`Wrote ${outPath}`);
