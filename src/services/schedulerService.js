const cron = require("node-cron");
const Campaign = require("../models/Campaign");
const sendEngine = require("./sendEngine");

let scheduledTask = null;

function startScheduler() {
  if (scheduledTask) {
    return scheduledTask;
  }

  scheduledTask = cron.schedule("*/1 * * * *", async () => {
    const now = new Date();
    const dueCampaigns = await Campaign.find({
      status: "scheduled",
      scheduleAt: { $lte: now },
    }).limit(25);

    for (const campaign of dueCampaigns) {
      try {
        await sendEngine.startCampaign({
          campaignId: campaign._id,
          userId: campaign.user,
        });
      } catch (error) {
        await Campaign.updateOne(
          { _id: campaign._id },
          {
            $set: {
              status: "draft",
              "meta.lastError": error.message || "Failed to schedule campaign",
            },
          },
        );
      }
    }
  });

  return scheduledTask;
}

module.exports = {
  startScheduler,
};
