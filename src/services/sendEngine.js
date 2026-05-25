const path = require("path");
const Campaign = require("../models/Campaign");
const Contact = require("../models/Contact");
const Log = require("../models/Log");
const whatsappService = require("./whatsappService");
const { personalizeMessage } = require("./phoneService");
const { recalculateCampaignStats } = require("./campaignStatsService");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomInt(min, max) {
  const parsedMin = Math.max(500, Number(min || 1000));
  const parsedMax = Math.max(parsedMin, Number(max || parsedMin));
  return Math.floor(Math.random() * (parsedMax - parsedMin + 1)) + parsedMin;
}

class SendEngine {
  constructor() {
    this.io = null;
    this.jobs = new Map();
  }

  setIO(io) {
    this.io = io;
  }

  getCampaignRoom(campaignId) {
    return `campaign:${campaignId}`;
  }

  emitToCampaign(campaignId, eventName, payload) {
    if (!this.io) {
      return;
    }
    this.io.to(this.getCampaignRoom(campaignId)).emit(eventName, payload);
    this.io.emit(eventName, payload);
  }

  getJob(campaignId) {
    return this.jobs.get(String(campaignId)) || null;
  }

  async startCampaign({ campaignId, userId }) {
    const key = String(campaignId);
    const existingJob = this.jobs.get(key);
    if (existingJob && !existingJob.stopped) {
      return {
        started: false,
        message: "Campaign is already running",
      };
    }

    const campaign = await Campaign.findOne({ _id: campaignId, user: userId });
    if (!campaign) {
      const error = new Error("Campaign not found");
      error.statusCode = 404;
      throw error;
    }

    const hasMessage = Boolean(campaign.message?.trim());
    const hasImages = Array.isArray(campaign.imagePaths) && campaign.imagePaths.length > 0;
    if (!hasMessage && !hasImages) {
      const error = new Error("Please add a message or at least one image before sending");
      error.statusCode = 400;
      throw error;
    }

    const contacts = await Contact.find({
      campaign: campaignId,
      user: userId,
      $or: [{ status: "pending" }, { status: "failed", attempts: { $lt: campaign.retryLimit + 1 } }],
    }).sort({ createdAt: 1 });

    if (!contacts.length) {
      const error = new Error("No contacts available to send");
      error.statusCode = 400;
      throw error;
    }

    await whatsappService.ensureReady();
    await Campaign.updateOne(
      { _id: campaignId },
      {
        $set: {
          status: "sending",
          startedAt: campaign.startedAt || new Date(),
          finishedAt: null,
        },
      },
    );

    const job = {
      campaignId: key,
      userId: String(userId),
      paused: false,
      stopped: false,
      startedAt: Date.now(),
      lastProcessedAt: null,
      totalToProcess: contacts.length,
      processedInRun: 0,
      sentInRun: 0,
      failedInRun: 0,
      promise: null,
    };

    this.jobs.set(key, job);
    job.promise = this.processCampaign(job, campaign, contacts);
    return { started: true, message: "Campaign started" };
  }

  async processCampaign(job, campaign, contacts) {
    const campaignId = job.campaignId;
    let status = "completed";

    for (let index = 0; index < contacts.length; index += 1) {
      const contact = contacts[index];
      if (job.stopped) {
        status = "stopped";
        break;
      }

      while (job.paused && !job.stopped) {
        await sleep(500);
      }

      if (job.stopped) {
        status = "stopped";
        break;
      }

      await Contact.updateOne(
        { _id: contact._id },
        {
          $set: {
            status: "sending",
            processingAt: new Date(),
          },
        },
      );

      this.emitToCampaign(campaignId, "campaign:contact-status", {
        campaignId,
        contactId: contact._id.toString(),
        status: "sending",
        error: "",
      });

      try {
        const personalizedMessage = personalizeMessage(campaign.message, contact);
        await whatsappService.sendMessage({
          chatId: `${contact.phone}@c.us`,
          message: personalizedMessage,
          imagePaths: (campaign.imagePaths || []).map((relativePath) =>
            path.resolve(process.cwd(), relativePath),
          ),
        });

        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              status: "sent",
              sentAt: new Date(),
              lastError: "",
              processingAt: null,
            },
            $inc: { attempts: 1 },
          },
        );

        job.sentInRun += 1;
        this.emitToCampaign(campaignId, "campaign:contact-status", {
          campaignId,
          contactId: contact._id.toString(),
          status: "sent",
          error: "",
        });
      } catch (error) {
        const errorMessage = error?.message || "Failed to send message";
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              status: "failed",
              lastError: errorMessage,
              processingAt: null,
            },
            $inc: { attempts: 1 },
          },
        );

        job.failedInRun += 1;
        this.emitToCampaign(campaignId, "campaign:contact-status", {
          campaignId,
          contactId: contact._id.toString(),
          status: "failed",
          error: errorMessage,
        });
      }

      job.processedInRun += 1;
      job.lastProcessedAt = Date.now();

      const stats = await recalculateCampaignStats(campaign._id);
      const elapsedMs = Math.max(1, Date.now() - job.startedAt);
      const avgPerContactMs = elapsedMs / Math.max(1, job.processedInRun);
      const remaining = Math.max(0, job.totalToProcess - job.processedInRun);
      const etaMs = Math.round(avgPerContactMs * remaining);

      this.emitToCampaign(campaignId, "campaign:progress", {
        campaignId,
        status: job.paused ? "paused" : "sending",
        stats,
        processedInRun: job.processedInRun,
        remainingInRun: remaining,
        etaMs,
      });

      const delay = randomInt(campaign.delayMinMs, campaign.delayMaxMs);
      await sleep(delay);
    }

    if (job.paused && !job.stopped) {
      status = "paused";
    }

    const finalStats = await recalculateCampaignStats(campaign._id);
    await Campaign.updateOne(
      { _id: campaign._id },
      {
        $set: {
          status,
          finishedAt: status === "completed" || status === "stopped" ? new Date() : null,
        },
      },
    );

    if (status === "completed" || status === "stopped") {
      await Log.create({
        user: campaign.user,
        campaign: campaign._id,
        campaignName: campaign.name,
        totalContacts: finalStats.total,
        sentCount: finalStats.sent,
        failedCount: finalStats.failed,
        status,
        finishedAt: new Date(),
      });
    }

    this.emitToCampaign(campaignId, "campaign:finished", {
      campaignId,
      status,
      stats: finalStats,
    });

    if (status !== "paused") {
      this.jobs.delete(campaignId);
    }
  }

  async pauseCampaign(campaignId) {
    const job = this.getJob(campaignId);
    if (!job) {
      throw new Error("Campaign is not running");
    }
    job.paused = true;
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: "paused" } });
    this.emitToCampaign(campaignId, "campaign:status", {
      campaignId,
      status: "paused",
    });
    return { success: true };
  }

  async resumeCampaign(campaignId, userId) {
    const job = this.getJob(campaignId);
    if (job) {
      job.paused = false;
      await Campaign.updateOne({ _id: campaignId }, { $set: { status: "sending" } });
      this.emitToCampaign(campaignId, "campaign:status", {
        campaignId,
        status: "sending",
      });
      return { resumed: true, mode: "in-memory" };
    }
    return this.startCampaign({ campaignId, userId });
  }

  async stopCampaign(campaignId) {
    const job = this.getJob(campaignId);
    if (!job) {
      throw new Error("Campaign is not running");
    }
    job.stopped = true;
    job.paused = false;
    await Campaign.updateOne({ _id: campaignId }, { $set: { status: "stopped", finishedAt: new Date() } });
    this.emitToCampaign(campaignId, "campaign:status", {
      campaignId,
      status: "stopped",
    });
    return { success: true };
  }
}

module.exports = new SendEngine();
