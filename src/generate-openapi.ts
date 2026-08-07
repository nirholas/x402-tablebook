/**
 * Writes the committed openapi.json from the same builder the server serves at
 * runtime, so the checked-in copy can never drift from the live one.
 *
 *   npm run openapi
 *   PUBLIC_URL=https://your-deployment.example npm run openapi
 *
 * The committed copy is for humans and for diffing in review. Discovery reads
 * the live document from {origin}/openapi.json and ignores `servers`.
 */
import { writeFileSync } from "node:fs";

import { buildOpenApiDocument } from "./openapi.js";

const origin = process.env.PUBLIC_URL?.trim().replace(/\/$/, "") ?? "http://localhost:4021";
const out = process.env.OPENAPI_OUT ?? "openapi.json";

writeFileSync(out, `${JSON.stringify(buildOpenApiDocument(origin), null, 2)}\n`);
console.log(`wrote ${out} (servers: ${origin})`);
