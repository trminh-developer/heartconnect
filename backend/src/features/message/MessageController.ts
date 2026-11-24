import { Request, Response } from "express";
import { Message, Conversation, Match, Notification, UserBlock } from "../../models";
import { datingTransaction, lockPair } from "../match/transactions";
import { datingError } from "../match/swipes";
import { AuthRequest } from "../../middlewares/authMiddleware";
import { Op } from "sequelize";
import { z } from 'zod';
import { publicProfileAttributes } from '../match/profiles';

async function conversationFor(conversationId: string, userId: string) {
  const conversation: any = await Conversation.findByPk(conversationId, { include: [{ model: Match }] });
  if (!conversation) throw datingError('Conversation not found', 404);
  if (![conversation.Match?.user1_id, conversation.Match?.user2_id].includes(userId)) throw datingError('Forbidden', 403);
  return conversation;
}

export const getConversations = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;

    // IDOR Check
    if (req.user?.id !== userId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    const { Conversation, Match, User, Message } = require("../../models");

    const conversations = await Conversation.findAll({
      include: [
        {
          model: Match,
          where: {
            [Op.or]: [{ user1_id: userId }, { user2_id: userId }],
          },
          include: [
            { model: User, as: "User1", attributes: publicProfileAttributes },
            { model: User, as: "User2", attributes: publicProfileAttributes },
          ],
        },
        {
          model: Message,
          order: [["created_at", "DESC"]],
        },
      ],
    });

    const unread = await Notification.findAll({ where: { user_id: userId, is_read: false, type: { [Op.in]: ['message', 'MESSAGE'] } }, attributes: ['from_user_id'] });
    const formatted = conversations.map((c: any) => {
      const conv = c.toJSON();
      const match = conv.Match;
      const participants: any[] = [];
      if (match.User1) participants.push(match.User1);
      if (match.User2) participants.push(match.User2);
      // Find latest message not deleted for this user
      let lastMessage = null;
      if (conv.Messages && conv.Messages.length > 0) {
        const sortedMsgs = [...conv.Messages].sort(
          (a: any, b: any) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        for (const m of sortedMsgs) {
          let delFor = m.deleted_for;
          if (typeof delFor === "string") {
            try {
              delFor = JSON.parse(delFor);
            } catch {
              delFor = [];
            }
          }
          if (!Array.isArray(delFor) || !delFor.includes(userId)) {
            lastMessage = m;
            break;
          }
        }
      }

      return {
        id: conv.id,
        participants: participants,
        lastMessage: lastMessage,
        unreadCount: unread.filter(notification => participants.some(participant => participant.id !== userId && participant.id === notification.get('from_user_id'))).length,
        updatedAt: conv.updated_at,
      };
    });

    return res.json(formatted);
  } catch (e: any) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const getMessages = async (req: AuthRequest, res: Response) => {
  try {
    const { Message, Conversation, Match } = require("../../models");
    const conversationId = req.params.conversationId;

    // IDOR prevention: check if user is in conversation
    const conv = await Conversation.findByPk(conversationId, {
      include: [{ model: Match }],
    });

    if (!conv) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    if (
      req.user?.role !== "ADMIN" &&
      conv.Match?.user1_id !== req.user?.id &&
      conv.Match?.user2_id !== req.user?.id
    ) {
      return res.status(403).json({ error: "Forbidden" });
    }

    const messages = await Message.findAll({
      where: { conversation_id: conversationId },
      order: [["created_at", "ASC"]],
    });

    const currentUserId = req.user?.id;
    const filteredMessages = messages.filter((m: any) => {
      let delFor = m.deleted_for;
      if (typeof delFor === "string") {
        try {
          delFor = JSON.parse(delFor);
        } catch {
          delFor = [];
        }
      }
      if (Array.isArray(delFor) && delFor.includes(currentUserId)) {
        return false;
      }
      return true;
    });

    return res.json(filteredMessages);
  } catch (e: any) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const sendMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { conversationId, content, type } = z.object({
      conversationId: z.string().min(1), content: z.string().trim().min(1).max(30000000),
      type: z.string().transform(value => value.toLowerCase()).pipe(z.enum(['text', 'image', 'emoji', 'location'])).default('text'),
    }).parse(req.body);
    const senderId = req.user?.id;
    if (!senderId) return res.status(401).json({ error: 'Unauthorized' });
    const initial: any = await Conversation.findByPk(conversationId, { include: [{ model: Match }] });
    if (!initial) throw datingError('Conversation not found', 404);
    const pairUsers = [initial.Match?.user1_id, initial.Match?.user2_id];
    if (!pairUsers.includes(senderId)) throw datingError('Forbidden', 403);
    const receiverId = pairUsers.find(id => id !== senderId)!;
    const msg = await datingTransaction(async transaction => {
      const pair = await lockPair(senderId, receiverId, transaction);
      const current = await Conversation.findByPk(conversationId, { transaction });
      if (!current || pair.get('state') === 'unmatched') throw datingError('Conversation not found', 404);
      const blocked = await UserBlock.findOne({
        where: { [Op.or]: [{ user_id: senderId, target_id: receiverId }, { user_id: receiverId, target_id: senderId }] }, transaction,
      });
      if (blocked || pair.get('state') === 'blocked') throw datingError('Không thể nhắn tin sau khi chặn người dùng.', 403);
      const message = await Message.create({
        conversation_id: conversationId, sender_id: senderId, content, type: type || 'text',
      }, { transaction });
      await current.update({ updated_at: new Date() }, { transaction });
      await Notification.create({
        user_id: receiverId, from_user_id: senderId, type: 'message',
        message: 'Bạn có một tin nhắn mới.', is_read: false,
      }, { transaction });
      return message;
    });
    return res.json(msg);
  } catch (error: any) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(issue => issue.message).join(', ') });
    if (!error.statusCode) console.error('Send message failed:', error);
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Internal server error' });
  }
};

export const markAsRead = async (req: AuthRequest, res: Response) => {
  try {
    const conversation = await conversationFor(req.params.conversationId as string, req.user.id);
    const otherId = [conversation.Match.user1_id, conversation.Match.user2_id].find(id => id !== req.user.id);
    await datingTransaction(async transaction => {
      await Notification.update({ is_read: true }, { where: { user_id: req.user.id, from_user_id: otherId, type: { [Op.in]: ['message', 'MESSAGE'] }, is_read: false }, transaction });
      await Message.update({ status: 'seen' }, { where: { conversation_id: conversation.get('id'), sender_id: otherId }, transaction });
    });
    return res.json({ success: true });
  } catch (error: any) {
    return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Internal server error' });
  }
};

export const deleteMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { Message } = require("../../models");
    const msg = await Message.findByPk(messageId);
    if (!msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    await conversationFor(msg.conversation_id, userId);

    let delFor = msg.deleted_for;
    if (typeof delFor === "string") {
      try {
        delFor = JSON.parse(delFor);
      } catch {
        delFor = [];
      }
    }
    if (!Array.isArray(delFor)) {
      delFor = [];
    }
    delFor = [...delFor];

    if (!delFor.includes(userId)) {
      delFor.push(userId);
      await msg.update({ deleted_for: delFor });
    }

    return res.json({ success: true, messageId });
  } catch (e: any) {
    return res.status(e.statusCode || 500).json({ error: e.statusCode ? e.message : 'Internal server error' });
  }
};

export const recallMessage = async (req: AuthRequest, res: Response) => {
  try {
    const { messageId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { Message } = require("../../models");
    const msg = await Message.findByPk(messageId);
    if (!msg) {
      return res.status(404).json({ error: "Message not found" });
    }

    // Only the sender (or admin) can recall
    if (msg.sender_id !== userId && req.user?.role !== "ADMIN") {
      return res
        .status(403)
        .json({ error: "Forbidden: You can only recall your own messages" });
    }

    await msg.update({
      is_recalled: true,
      content: "Tin nhắn đã được thu hồi",
    });

    return res.json({ success: true, message: msg });
  } catch (e: any) {
    return res.status(500).json({ error: "Internal server error" });
  }
};
