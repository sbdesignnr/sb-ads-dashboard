// Local CSV import diagnostic — decodes and parses a file exactly like the
// /api/finance/import route does, so you can debug an SLSP George export
// offline without uploading it.
//
// Usage: npx tsx scripts/test-csv.ts <path-to-csv>

import fs from "node:fs";
import { decodeCsv, parseSlspCsv } from "../lib/finance/csv-parser";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/test-csv.ts <path-to-csv>");
  process.exit(1);
}

const nodeBuf = fs.readFileSync(filePath);
const uint8 = new Uint8Array(nodeBuf);
// Slice out just this file's bytes — a Node Buffer may share a larger pool.
const arrayBuffer = nodeBuf.buffer.slice(nodeBuf.byteOffset, nodeBuf.byteOffset + nodeBuf.byteLength);

console.log("File size:", nodeBuf.length);
console.log(
  "First 4 bytes (hex):",
  Array.from(uint8.slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join(" "),
);

// Same decoding logic as the server (BOM + UTF-16 heuristic + strict-UTF-8 →
// Windows-1250 fallback), so results here mirror a real upload.
const { text, encoding } = decodeCsv(arrayBuffer);
console.log("Encoding detected:", encoding);
console.log("First 200 chars:", text.substring(0, 200));
console.log("First line:", text.split("\n")[0]);
console.log("---");

const result = parseSlspCsv(text);
console.log("Parsed transactions:", result.length);
if (result.length > 0) {
  console.log("First transaction:", result[0]);
}
