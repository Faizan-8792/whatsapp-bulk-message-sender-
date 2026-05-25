const http = require("http");
const bcrypt = require("bcryptjs");
const env = require("./config/env");
const app = require("./app");
const { connectDatabase } = require("./config/db");
const User = require("./models/User");
const { initializeSocket } = require("./sockets/socketServer");
const { startScheduler } = require("./services/schedulerService");
const whatsappService = require("./services/whatsappService");

async function ensureDefaultAdmin() {
  const userId = String(env.defaultAdminUser || "").trim();
  if (!userId) {
    throw new Error("DEFAULT_ADMIN_USER is missing");
  }

  const existing = await User.findOne({ userId });
  const passwordHash = await bcrypt.hash(String(env.defaultAdminPassword || ""), 10);

  if (!existing) {
    return User.create({
      userId,
      passwordHash,
      displayName: "Administrator",
      role: "admin",
    });
  }

  const passwordMatched = await bcrypt.compare(
    String(env.defaultAdminPassword || ""),
    existing.passwordHash,
  );

  let shouldSave = false;
  if (!passwordMatched) {
    existing.passwordHash = passwordHash;
    shouldSave = true;
  }
  if (existing.role !== "admin") {
    existing.role = "admin";
    shouldSave = true;
  }
  if (!existing.displayName) {
    existing.displayName = "Administrator";
    shouldSave = true;
  }

  if (shouldSave) {
    await existing.save();
  }

  return existing;
}

async function logBootConfig() {
  // eslint-disable-next-line no-console
  console.log(`Allowed client origins: ${env.clientOrigins.join(", ")}`);
  // eslint-disable-next-line no-console
  console.log(`Default admin user seed: ${env.defaultAdminUser}`);
}

async function bootstrap() {
  await connectDatabase();
  await ensureDefaultAdmin();
  await logBootConfig();

  const server = http.createServer(app);
  const io = initializeSocket(server);
  app.set("io", io);

  whatsappService.initialize(io).catch((error) => {
    // eslint-disable-next-line no-console
    console.error("WhatsApp auto-initialize failed:", error?.message || error);
  });

  startScheduler();

  server.listen(env.port, () => {
    // eslint-disable-next-line no-console
    console.log(`Server running on http://localhost:${env.port}`);
  });
}

bootstrap().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to start server:", error);
  process.exit(1);
});
