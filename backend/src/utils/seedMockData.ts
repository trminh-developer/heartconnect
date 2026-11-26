import fs from "fs";
import path from "path";
import { postgresSeedRows } from './seedIds';
import {
  User,
  Interest,
  UserInterest,
  UserPreference,
  Match,
  Conversation,
  Message,
  Status,
  StatusLike,
  StatusComment,
  Notification,
  Report,
  VerificationRequest,
  Transaction,
  SystemSetting,
  sequelize,
} from "../models";

export async function seedMockData(force: boolean = false) {
  try {
    const userCount = await User.count();
    if (userCount >= 20 && !force) {
      console.log(
        `[MockDB] Database already has ${userCount} users. Skipping seeder.`,
      );
      return;
    }

    console.log("[MockDB] Seeding mock data from backend/Database...");
    const dbDir = path.resolve(__dirname, "../../Database");

    const readJson = (filename: string) => {
      const p = path.join(dbDir, filename);
      if (fs.existsSync(p)) {
        const rows = JSON.parse(fs.readFileSync(p, "utf8"));
        return sequelize.getDialect() === 'postgres' ? postgresSeedRows(rows) : rows;
      }
      return [];
    };

    const users = readJson("users.json");
    const interests = readJson("interests.json");
    const userInterests = readJson("user_interests.json");
    const userPrefs = readJson("user_preferences.json");
    const matches = readJson("matches.json");
    const conversations = readJson("conversations.json");
    const messages = readJson("messages.json");
    const statuses = readJson("statuses.json");
    const statusLikes = readJson("status_likes.json");
    const statusComments = readJson("status_comments.json");
    const notifications = readJson("notifications.json");
    const reports = readJson("reports.json");
    const verifications = readJson("verification_requests.json");
    const transactions = readJson("transactions.json");
    const settings = readJson("system_settings.json");

    await sequelize.transaction(async transaction => {
      if (users.length > 0) {
        for (const u of users) {
          await User.upsert(u, { transaction });
        }
      }

      if (interests.length > 0) {
        for (const item of interests) {
          await Interest.upsert(item, { transaction });
        }
      }

      if (userInterests.length > 0) {
        for (const ui of userInterests) {
          await UserInterest.upsert(ui, { transaction });
        }
      }

      if (userPrefs.length > 0) {
        for (const up of userPrefs) {
          await UserPreference.upsert(up, { transaction });
        }
      }

      if (matches.length > 0) {
        for (const m of matches) {
          await Match.upsert(m, { transaction });
        }
      }

      if (conversations.length > 0) {
        for (const c of conversations) {
          await Conversation.upsert(c, { transaction });
        }
      }

      if (messages.length > 0) {
        for (const msg of messages) {
          await Message.upsert(msg, { transaction });
        }
      }

      if (statuses.length > 0) {
        for (const st of statuses) {
          await Status.upsert(st, { transaction });
        }
      }

      if (statusLikes.length > 0) {
        for (const sl of statusLikes) {
          await StatusLike.upsert(sl, { transaction });
        }
      }

      if (statusComments.length > 0) {
        for (const sc of statusComments) {
          await StatusComment.upsert(sc, { transaction });
        }
      }

      if (notifications.length > 0) {
        for (const n of notifications) {
          await Notification.upsert(n, { transaction });
        }
      }

      if (reports.length > 0) {
        for (const r of reports) {
          await Report.upsert(r, { transaction });
        }
      }

      if (verifications.length > 0) {
        for (const v of verifications) {
          await VerificationRequest.upsert(v, { transaction });
        }
      }

      if (transactions.length > 0) {
        for (const tx of transactions) {
          await Transaction.upsert(tx, { transaction });
        }
      }

      if (settings.length > 0) {
        for (const s of settings) {
          await SystemSetting.upsert(s, { transaction });
        }
      }

    });
    console.log("[MockDB] Successfully seeded mock data into database!");
  } catch (error) {
    console.error("[MockDB] Error seeding mock data:", error);
    throw error;
  }
}
