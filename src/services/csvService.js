const fs = require("fs");
const path = require("path");
const Papa = require("papaparse");
const XLSX = require("xlsx");
const { cleanString, normalizePhone } = require("./phoneService");

const NAME_FIELD_CANDIDATES = [
  "name",
  "full name",
  "fullname",
  "guest",
  "recipient",
];

const PHONE_FIELD_CANDIDATES = [
  "phone",
  "phone number",
  "mobile",
  "mobile number",
  "contact",
  "number",
  "whatsapp",
  "whatsapp number",
];

function normalizeHeader(header) {
  return cleanString(header).toLowerCase();
}

function pickColumn(headers, candidates) {
  const normalizedHeaders = headers.map((h) => normalizeHeader(h));
  for (const candidate of candidates) {
    const index = normalizedHeaders.findIndex((h) =>
      h.includes(normalizeHeader(candidate)),
    );
    if (index !== -1) {
      return headers[index];
    }
  }
  return null;
}

function parseCsv(filePath) {
  const csvContent = fs.readFileSync(filePath, "utf8");
  const { data, errors } = Papa.parse(csvContent, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => cleanString(header),
  });

  if (errors?.length) {
    const firstError = errors[0];
    throw new Error(`CSV parse error at row ${firstError.row}: ${firstError.message}`);
  }

  return data;
}

function parseXlsx(filePath) {
  const workbook = XLSX.readFile(filePath, { cellDates: false });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) {
    return [];
  }
  return XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], {
    defval: "",
    raw: false,
  });
}

function readRows(filePath, originalName = "") {
  const ext = path.extname(originalName || filePath).toLowerCase();
  if (ext === ".xlsx" || ext === ".xls") {
    return parseXlsx(filePath);
  }
  return parseCsv(filePath);
}

function extractContacts(rows, countryCode) {
  const headers = rows.length ? Object.keys(rows[0] || {}) : [];
  const nameKey = pickColumn(headers, NAME_FIELD_CANDIDATES) || headers[0];
  const phoneKey = pickColumn(headers, PHONE_FIELD_CANDIDATES) || headers[1];

  const uniquePhones = new Set();
  const contacts = [];
  const invalidRows = [];
  const duplicateRows = [];

  rows.forEach((row, index) => {
    const rowNo = index + 2;
    const nameValue = cleanString(row[nameKey] ?? "");
    const phoneValue = cleanString(row[phoneKey] ?? "");

    const normalized = normalizePhone(phoneValue, countryCode);
    if (!normalized.isValid) {
      invalidRows.push({
        rowNo,
        name: nameValue,
        phone: phoneValue,
        reason: normalized.reason,
      });
      return;
    }

    if (uniquePhones.has(normalized.normalized)) {
      duplicateRows.push({
        rowNo,
        name: nameValue,
        phone: phoneValue,
      });
      return;
    }

    uniquePhones.add(normalized.normalized);

    contacts.push({
      name: nameValue || `Guest ${contacts.length + 1}`,
      phoneRaw: phoneValue,
      phone: normalized.normalized,
      e164: normalized.e164,
      whatsappId: normalized.whatsappId,
      status: "pending",
    });
  });

  return {
    contacts,
    invalidRows,
    duplicateRows,
    meta: {
      totalRows: rows.length,
      extracted: contacts.length,
      invalid: invalidRows.length,
      duplicates: duplicateRows.length,
      nameColumn: nameKey,
      phoneColumn: phoneKey,
    },
  };
}

function parseAndExtractContacts(filePath, originalName, countryCode) {
  const rows = readRows(filePath, originalName);
  return extractContacts(rows, countryCode);
}

module.exports = {
  parseAndExtractContacts,
};
