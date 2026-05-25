const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const {
  normalizePhone,
  personalizeMessage,
} = require("../src/services/phoneService");
const { parseAndExtractContacts } = require("../src/services/csvService");
const whatsappService = require("../src/services/whatsappService");

function runPhoneNormalizationTests() {
  const one = normalizePhone("09330-505681", "91");
  assert.strictEqual(one.isValid, true);
  assert.strictEqual(one.normalized, "919330505681");
  assert.strictEqual(one.e164, "+919330505681");

  const two = normalizePhone("+1 (415) 555-2671", "1");
  assert.strictEqual(two.isValid, true);
  assert.strictEqual(two.normalized, "14155552671");

  const three = normalizePhone("abc", "91");
  assert.strictEqual(three.isValid, false);
}

function runMessageFormattingTests() {
  const template = "Hi {{name}},\nWelcome to our event \u{1F389}\nYour number: {{number}}";
  const text = personalizeMessage(template, {
    name: "Ali",
    e164: "+919330505681",
    phone: "919330505681",
  });

  assert.strictEqual(
    text,
    "Hi Ali,\nWelcome to our event \u{1F389}\nYour number: +919330505681",
  );
  assert.ok(text.includes("\u{1F389}"));
  assert.ok(text.includes("\n"));
}

function runImageCaptionPayloadTests() {
  const message = "Hello {{name}} \u{1F44B}\nSee attached image.";
  const payloads = whatsappService.buildSendPayloads({
    message,
    imagePaths: ["uploads/campaigns/one.jpg", "uploads/campaigns/two.jpg"],
  });

  assert.strictEqual(payloads.length, 2);
  assert.deepStrictEqual(payloads[0], {
    type: "image",
    path: "uploads/campaigns/one.jpg",
    caption: "",
  });
  assert.deepStrictEqual(payloads[1], {
    type: "image",
    path: "uploads/campaigns/two.jpg",
    caption: message,
  });

  const textOnly = whatsappService.buildSendPayloads({
    message: "Plain text \u{2705}",
    imagePaths: [],
  });
  assert.deepStrictEqual(textOnly, [{ type: "text", text: "Plain text \u{2705}" }]);
}

function runCsvExtractionTests() {
  const tempFilePath = path.join(os.tmpdir(), `wesp_contacts_${Date.now()}.csv`);
  const csvData = [
    "Name,Phone Number",
    "Ali,09330505681",
    "Sara,+919987654321",
    "Ali Duplicate,09330505681",
    "Broken,abc",
  ].join("\n");
  fs.writeFileSync(tempFilePath, csvData, "utf8");

  const parsed = parseAndExtractContacts(tempFilePath, "contacts.csv", "91");
  fs.unlinkSync(tempFilePath);

  assert.strictEqual(parsed.contacts.length, 2);
  assert.strictEqual(parsed.meta.invalid, 1);
  assert.strictEqual(parsed.meta.duplicates, 1);
  assert.strictEqual(parsed.contacts[0].e164, "+919330505681");
  assert.strictEqual(parsed.contacts[1].e164, "+919987654321");
}

function main() {
  runPhoneNormalizationTests();
  runMessageFormattingTests();
  runImageCaptionPayloadTests();
  runCsvExtractionTests();
  // eslint-disable-next-line no-console
  console.log("All formatting checks passed.");
}

main();
