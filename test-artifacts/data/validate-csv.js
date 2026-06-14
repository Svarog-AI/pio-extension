import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const csvPath = resolve(__dirname, "sample-records.csv");

const VALID_STATUSES = new Set(["active", "inactive", "pending"]);
const EXPECTED_COLUMNS = 4;
const EXPECTED_ROWS = 10;

function validate() {
  const errors = [];

  const content = readFileSync(csvPath, "utf-8");
  const lines = content.split("\n").filter((line) => line.trim() !== "");

  if (lines.length === 0) {
    errors.push("File is empty — no rows found.");
    report(errors, lines);
    return;
  }

  // Check header
  const header = lines[0].split(",").map((c) => c.trim());
  if (header.length !== EXPECTED_COLUMNS) {
    errors.push(
      `Header has ${header.length} columns, expected ${EXPECTED_COLUMNS}.`
    );
  }

  // Check row count (excluding header)
  const dataRows = lines.slice(1);
  if (dataRows.length !== EXPECTED_ROWS) {
    errors.push(
      `Found ${dataRows.length} data rows, expected ${EXPECTED_ROWS}.`
    );
  }

  // Check each data row
  for (let i = 0; i < dataRows.length; i++) {
    const rowNum = i + 2; // 1-indexed, header is row 1
    const cols = dataRows[i].split(",").map((c) => c.trim());

    // Column count
    if (cols.length !== EXPECTED_COLUMNS) {
      errors.push(
        `Row ${rowNum}: has ${cols.length} columns, expected ${EXPECTED_COLUMNS}.`
      );
      continue;
    }

    // Empty values
    for (let j = 0; j < cols.length; j++) {
      if (cols[j] === "") {
        errors.push(
          `Row ${rowNum}, column ${j + 1} ("${header[j]}"): value is empty.`
        );
      }
    }

    // Status constraint
    const status = cols[3];
    if (!VALID_STATUSES.has(status)) {
      errors.push(
        `Row ${rowNum}: status "${status}" is not valid. Must be one of: ${[...VALID_STATUSES].join(", ")}.`
      );
    }
  }

  report(errors, lines);
}

function report(errors, lines) {
  if (errors.length === 0) {
    const rowCount = lines.length - 1;
    console.log(`PASS: All checks passed. Validated ${rowCount} data rows.`);
    process.exit(0);
  } else {
    console.log("FAIL: Validation errors found:");
    for (const err of errors) {
      console.log(`  - ${err}`);
    }
    process.exit(1);
  }
}

validate();
