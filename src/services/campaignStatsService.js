const Contact = require("../models/Contact");
const Campaign = require("../models/Campaign");

async function recalculateCampaignStats(campaignId) {
  const statusCounts = await Contact.aggregate([
    { $match: { campaign: campaignId } },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
      },
    },
  ]);

  const total = statusCounts.reduce((acc, item) => acc + item.count, 0);
  const sent = statusCounts.find((x) => x._id === "sent")?.count || 0;
  const failed = statusCounts.find((x) => x._id === "failed")?.count || 0;
  const sending = statusCounts.find((x) => x._id === "sending")?.count || 0;
  const pending = statusCounts.find((x) => x._id === "pending")?.count || 0;
  const processed = sent + failed;
  const successRate = total > 0 ? Number(((sent / total) * 100).toFixed(2)) : 0;

  const stats = {
    total,
    processed,
    sent,
    failed,
    pending: pending + sending,
    successRate,
  };

  await Campaign.findByIdAndUpdate(campaignId, { $set: { stats } });
  return stats;
}

module.exports = {
  recalculateCampaignStats,
};
