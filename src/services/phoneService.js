const env = require("../config/env");

function cleanString(value) {
  return String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizePhone(input, defaultCountryCode = env.defaultCountryCode) {
  const raw = cleanString(input);
  if (!raw) {
    return {
      isValid: false,
      reason: "Phone number is empty",
      normalized: null,
      e164: null,
      whatsappId: null,
    };
  }

  let digits = raw.replace(/[^\d+]/g, "");
  if (!digits) {
    return {
      isValid: false,
      reason: "Phone number contains no digits",
      normalized: null,
      e164: null,
      whatsappId: null,
    };
  }

  const hasPlusPrefix = digits.startsWith("+");
  digits = digits.replace(/\D/g, "");

  if (digits.startsWith("00")) {
    digits = digits.slice(2);
  }

  if (!hasPlusPrefix && digits.startsWith("0")) {
    digits = digits.replace(/^0+/, "");
  }

  if (!digits) {
    return {
      isValid: false,
      reason: "Phone number became empty after normalization",
      normalized: null,
      e164: null,
      whatsappId: null,
    };
  }

  let normalized = digits;
  if (!hasPlusPrefix && digits.length <= 10) {
    normalized = `${defaultCountryCode}${digits}`;
  }

  if (defaultCountryCode === "92") {
    if (/^03\d{9}$/.test(raw.replace(/[^\d]/g, ""))) {
      normalized = `92${raw.replace(/[^\d]/g, "").slice(1)}`;
    } else if (/^3\d{9}$/.test(digits)) {
      normalized = `92${digits}`;
    }
  }

  if (defaultCountryCode === "91") {
    if (/^0[6-9]\d{9}$/.test(raw.replace(/[^\d]/g, ""))) {
      normalized = `91${raw.replace(/[^\d]/g, "").slice(1)}`;
    } else if (/^[6-9]\d{9}$/.test(digits)) {
      normalized = `91${digits}`;
    }
  }

  if (normalized.length < 10 || normalized.length > 15) {
    return {
      isValid: false,
      reason: "Phone number length is outside E.164 range",
      normalized: null,
      e164: null,
      whatsappId: null,
    };
  }

  if (!/^\d+$/.test(normalized)) {
    return {
      isValid: false,
      reason: "Phone number is not numeric after normalization",
      normalized: null,
      e164: null,
      whatsappId: null,
    };
  }

  return {
    isValid: true,
    reason: null,
    normalized,
    e164: `+${normalized}`,
    whatsappId: `${normalized}@c.us`,
  };
}

function personalizeMessage(template, contact) {
  const baseMessage = String(template || "");
  return baseMessage
    .replaceAll("{{name}}", contact.name || "Guest")
    .replaceAll("{{number}}", contact.e164 || `+${contact.phone}`);
}

module.exports = {
  cleanString,
  normalizePhone,
  personalizeMessage,
};
