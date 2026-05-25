const bcrypt = require("bcryptjs");
const env = require("../src/config/env");
const { connectDatabase } = require("../src/config/db");
const User = require("../src/models/User");

async function seedAdmin() {
  const userId = String(env.defaultAdminUser || "").trim();
  const plainPassword = String(env.defaultAdminPassword || "");

  if (!userId || !plainPassword) {
    throw new Error("DEFAULT_ADMIN_USER and DEFAULT_ADMIN_PASSWORD are required");
  }

  await connectDatabase();
  const passwordHash = await bcrypt.hash(plainPassword, 10);

  const user = await User.findOneAndUpdate(
    { userId },
    {
      $set: {
        userId,
        passwordHash,
        displayName: "Administrator",
        role: "admin",
      },
    },
    { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
  );

  // eslint-disable-next-line no-console
  console.log(`Admin user seeded: ${user.userId}`);
  process.exit(0);
}

seedAdmin().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("Failed to seed admin:", error.message);
  process.exit(1);
});
