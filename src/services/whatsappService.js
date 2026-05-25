const path = require("path");
const QRCode = require("qrcode");
const { Client, LocalAuth, MessageMedia } = require("whatsapp-web.js");
const env = require("../config/env");

class WhatsAppService {
  constructor() {
    this.client = null;
    this.io = null;
    this.status = "idle";
    this.lastQrText = "";
    this.lastQrImage = "";
    this.lastMessage = "";
    this.readyAt = null;
    this.initializing = false;
    this.initializingPromise = null;
  }

  async initialize(io) {
    if (this.client) {
      this.io = io || this.io;
      return this.client;
    }

    if (this.initializingPromise) {
      this.io = io || this.io;
      return this.initializingPromise;
    }

    this.initializing = true;
    this.io = io;
    this.status = "initializing";
    this.lastMessage = "Starting WhatsApp session...";
    this.emit("whatsapp:status", this.getStatus());

    const puppeteerOptions = {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    };
    if (env.puppeteerExecutablePath) {
      puppeteerOptions.executablePath = env.puppeteerExecutablePath;
    }

    this.client = new Client({
      authStrategy: new LocalAuth({
        dataPath: path.resolve(process.cwd(), env.whatsappAuthDir),
      }),
      puppeteer: puppeteerOptions,
    });

    this.attachListeners();
    this.initializingPromise = this.client.initialize();

    try {
      await this.initializingPromise;
      return this.client;
    } catch (error) {
      this.lastMessage = error?.message || "Failed to initialize WhatsApp session";
      this.status = "auth_failure";
      this.emit("whatsapp:status", this.getStatus());
      await this.destroyClient();
      throw error;
    } finally {
      this.initializing = false;
      this.initializingPromise = null;
    }
  }

  attachListeners() {
    if (!this.client) {
      return;
    }

    this.client.on("qr", async (qrText) => {
      this.status = "qr_required";
      this.readyAt = null;
      this.lastMessage = "QR generated. Scan once from your phone and wait for connection.";
      this.lastQrText = qrText;
      try {
        this.lastQrImage = await QRCode.toDataURL(qrText);
      } catch (error) {
        this.lastQrImage = "";
      }
      this.emit("whatsapp:status", this.getStatus());
    });

    this.client.on("authenticated", () => {
      this.status = "authenticated";
      this.lastMessage = "QR scanned. Finalizing secure login...";
      this.emit("whatsapp:status", this.getStatus());
    });

    this.client.on("auth_failure", (message) => {
      this.status = "auth_failure";
      this.lastMessage = message || "Authentication failed";
      this.emit("whatsapp:status", {
        ...this.getStatus(),
        message,
      });
    });

    this.client.on("ready", () => {
      this.status = "ready";
      this.readyAt = new Date();
      this.lastQrText = "";
      this.lastQrImage = "";
      this.lastMessage = "WhatsApp session is ready";
      this.emit("whatsapp:status", this.getStatus());
    });

    this.client.on("disconnected", (reason) => {
      this.status = "disconnected";
      this.readyAt = null;
      this.lastMessage = reason || "WhatsApp disconnected";
      this.emit("whatsapp:status", {
        ...this.getStatus(),
        reason,
      });
    });

    this.client.on("change_state", (state) => {
      if (this.status === "ready") {
        return;
      }
      this.lastMessage = `WhatsApp state: ${String(state || "").toLowerCase()}`;
      this.emit("whatsapp:status", this.getStatus());
    });
  }

  emit(eventName, payload) {
    if (this.io) {
      this.io.emit(eventName, payload);
    }
  }

  getStatus() {
    return {
      state: this.status,
      qrImage: this.status === "qr_required" ? this.lastQrImage : "",
      readyAt: this.readyAt,
      message: this.lastMessage,
    };
  }

  isReady() {
    return this.status === "ready";
  }

  async ensureReady() {
    if (!this.client && !this.initializingPromise) {
      await this.initialize(this.io);
    }
    if (this.initializingPromise) {
      await this.initializingPromise;
    }
    if (!this.isReady()) {
      const error = new Error("WhatsApp client is not ready. Please scan QR code first.");
      error.statusCode = 400;
      throw error;
    }
  }

  async ensureInitialized(io) {
    if (this.client || this.initializingPromise) {
      this.io = io || this.io;
      return;
    }
    await this.initialize(io || this.io);
  }

  async destroyClient() {
    if (!this.client) {
      return;
    }

    try {
      await this.client.destroy();
    } catch (error) {
      // Client destroy is best-effort.
    }

    this.client = null;
    this.initializing = false;
    this.initializingPromise = null;
  }

  async logoutSession() {
    if (!this.client && !this.initializingPromise) {
      this.status = "idle";
      this.lastQrImage = "";
      this.lastQrText = "";
      this.lastMessage = "Session logged out";
      this.readyAt = null;
      this.emit("whatsapp:status", this.getStatus());
      return this.getStatus();
    }

    if (this.initializingPromise) {
      try {
        await this.initializingPromise;
      } catch (error) {
        // continue logout flow
      }
    }

    if (this.client) {
      try {
        await this.client.logout();
      } catch (error) {
        // Logout can fail if the browser context is already gone.
      }
    }

    await this.destroyClient();
    this.status = "idle";
    this.lastQrImage = "";
    this.lastQrText = "";
    this.lastMessage = "Session logged out";
    this.readyAt = null;
    this.emit("whatsapp:status", this.getStatus());
    return this.getStatus();
  }

  async regenerateQr(io) {
    await this.logoutSession();
    await this.initialize(io || this.io);
    return this.getStatus();
  }

  async sendMessage({ chatId, message, imagePaths = [] }) {
    await this.ensureReady();

    const resolvedChatId = await this.resolveRecipientChatId(chatId);
    const payloads = this.buildSendPayloads({ message, imagePaths });
    let lastError = null;

    for (const targetChatId of this.buildRetryChatIds(chatId, resolvedChatId)) {
      try {
        await this.sendPayloadsToChat(targetChatId, payloads);
        return;
      } catch (error) {
        lastError = error;
        if (!this.isNoLidError(error)) {
          throw error;
        }
      }
    }

    if (lastError) {
      const normalized = this.normalizeChatId(chatId);
      if (this.isNoLidError(lastError)) {
        const error = new Error(
          `Unable to resolve recipient on WhatsApp for ${normalized}. Ask this contact to message your number once, then retry.`,
        );
        error.statusCode = 400;
        throw error;
      }
      lastError.message = `${lastError.message}\nRecipient: ${normalized}`;
      throw lastError;
    }
  }

  async sendPayloadsToChat(chatId, payloads) {
    for (const payload of payloads) {
      if (payload.type === "text") {
        await this.client.sendMessage(chatId, payload.text);
        continue;
      }
      const media = MessageMedia.fromFilePath(payload.path);
      const options = payload.caption ? { caption: payload.caption } : {};
      await this.client.sendMessage(chatId, media, options);
    }
  }

  normalizeChatId(chatId) {
    const raw = String(chatId || "").trim().replace(/\s+/g, "");
    if (!raw) {
      const error = new Error("Recipient number is empty");
      error.statusCode = 400;
      throw error;
    }
    if (raw.includes("@")) {
      return raw.toLowerCase();
    }
    const digits = raw.replace(/[^\d]/g, "");
    if (!digits) {
      const error = new Error("Recipient number is invalid");
      error.statusCode = 400;
      throw error;
    }
    return `${digits}@c.us`;
  }

  buildRetryChatIds(originalChatId, resolvedChatId) {
    const ordered = [];
    const pushUnique = (id) => {
      const value = String(id || "").trim();
      if (!value || ordered.includes(value)) {
        return;
      }
      ordered.push(value);
    };

    pushUnique(resolvedChatId);
    pushUnique(this.normalizeChatId(originalChatId));

    return ordered;
  }

  async resolveRecipientChatId(chatId) {
    const normalizedChatId = this.normalizeChatId(chatId);
    const userPart = normalizedChatId.split("@")[0].replace(/[^\d]/g, "");
    const candidates = [];
    const pushUnique = (id) => {
      const value = String(id || "").trim();
      if (!value || candidates.includes(value)) {
        return;
      }
      candidates.push(value);
    };

    pushUnique(normalizedChatId);
    if (userPart) {
      pushUnique(`${userPart}@c.us`);
    }

    if (userPart) {
      try {
        const registered = await this.client.getNumberId(userPart);
        pushUnique(registered?._serialized);
      } catch (error) {
        // Best-effort lookup only.
      }
    }

    const baseCandidate = candidates.find((id) => id.endsWith("@c.us")) || candidates[0];
    if (baseCandidate && typeof this.client.getContactLidAndPhone === "function") {
      try {
        const mappingList = await this.client.getContactLidAndPhone([baseCandidate]);
        const mapping = Array.isArray(mappingList) ? mappingList[0] : null;
        pushUnique(mapping?.pn);
        pushUnique(mapping?.lid);
      } catch (error) {
        // Best-effort lookup only.
      }
    }

    if (!candidates.length) {
      const error = new Error("Unable to resolve recipient number");
      error.statusCode = 400;
      throw error;
    }

    const preferred = candidates.find((id) => id.endsWith("@lid")) || candidates[0];
    return preferred;
  }

  isNoLidError(error) {
    const message = String(error?.message || "");
    return message.toLowerCase().includes("no lid for user");
  }

  buildSendPayloads({ message, imagePaths = [] }) {
    const text = String(message || "");
    if (!imagePaths.length) {
      return [{ type: "text", text }];
    }

    return imagePaths.map((imagePath, index) => {
      const isLast = index === imagePaths.length - 1;
      return {
        type: "image",
        path: imagePath,
        caption: isLast ? text : "",
      };
    });
  }
}

module.exports = new WhatsAppService();
