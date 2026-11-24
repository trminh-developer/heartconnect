import { Request, Response } from "express";
import { Status, StatusLike, StatusComment, User, Report } from "../../models";
import { AuthRequest } from "../../middlewares/authMiddleware";
import { z } from 'zod';

const feedError = (res: Response, error: any) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(issue => issue.message).join(', ') });
  return res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : 'Internal server error' });
};

// Regex to check if base64 string is a valid image (jpeg, jpg, png, webp, gif, svg)
const isBase64Image = (str: string) => {
  return (
    typeof str === "string" &&
    /^data:image\/(jpeg|jpg|png|webp|gif|svg\+xml);base64,/i.test(str)
  );
};

export const getStatuses = async (req: AuthRequest, res: Response) => {
  try {
    const { userId } = req.params;
    const page = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(100000)).default(1).parse(req.query.page);
    const limit = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(z.number().int().min(1).max(100)).default(20).parse(req.query.limit);
    const offset = (page - 1) * limit;

    let whereClause: any = { is_hidden: false };
    if (userId && userId !== "all") {
      whereClause = { user_id: userId, is_hidden: false };
    }

    const statuses = await Status.findAll({
      where: whereClause,
      limit,
      offset,
      include: [
        {
          model: User,
          attributes: ["id", "username", "first_name", "last_name", "avatar", "is_verified", "is_premium", "premium_expires_at"],
        },
      ],
      order: [["created_at", "DESC"]],
    });

    const statusIds = statuses.map((s: any) => s.id);

    // Bulk fetch likes and comments for only these statuses to eliminate N+1 Query
    const [likes, comments] = await Promise.all([
      StatusLike.findAll({ where: { status_id: statusIds } }),
      StatusComment.findAll({ where: { status_id: statusIds } }),
    ]);

    const results = statuses.map((s: any) => {
      const sLikes = likes.filter((l: any) => l.status_id === s.id);
      const sComments = comments.filter((c: any) => c.status_id === s.id);

      let hasLiked = false;
      if (req.user) {
        hasLiked = sLikes.some((l: any) => l.user_id === req.user?.id);
      }

      const author = s.User || {};

      return {
        id: s.id,
        userId: s.user_id,
        user: {
          id: author.id,
          username: author.username,
          firstName:
            author.first_name ||
            author.firstName ||
            author.username ||
            "Người dùng",
          lastName: author.last_name || author.lastName || "",
          first_name: author.first_name,
          last_name: author.last_name,
          avatar: author.avatar || "",
          isVerified: author.is_verified,
          isPremium: author.is_premium,
          premiumExpiresAt: author.premium_expires_at,
        },
        content: s.content,
        mediaUrls: s.media_urls || [],
        likesCount: sLikes.length,
        commentsCount: sComments.length,
        hasLiked,
        createdAt: s.created_at,
      };
    });

    // We can return an array to keep it compatible with current frontend,
    // or wrap in { data: results, page, totalPages } if frontend supports it.
    // For now, return array directly to avoid breaking useFeed.ts
    return res.json(results);
  } catch (err: any) {
    if (!(err instanceof z.ZodError)) console.error("Error in getStatuses:", err);
    return feedError(res, err);
  }
};

export const createStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { content, mediaUrls } = z.object({
      content: z.string().trim().max(5000).default(''),
      mediaUrls: z.array(z.string().refine(isBase64Image, 'Only image uploads are allowed')).max(10).default([]),
    }).refine(body => !!body.content || body.mediaUrls.length > 0, 'Nội dung bài viết không được để trống.').parse(req.body);
    // ALWAYS use the authenticated user's ID
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    // Validate mediaUrls (Checklist #7: Giới hạn loại file)
    if (mediaUrls && Array.isArray(mediaUrls)) {
      for (const media of mediaUrls) {
        if (!isBase64Image(media)) {
          return res
            .status(400)
            .json({
              error: "Invalid file type. Only image uploads are allowed.",
            });
        }
      }
    }

    const status = await Status.create({
      user_id: userId,
      content,
      media_urls: mediaUrls || [],
    });

    const statusData = status.toJSON ? status.toJSON() : (status as any);

    const formattedStatus = {
      id: statusData.id,
      userId: statusData.user_id,
      user: {
        id: req.user.id,
        username: req.user.username,
        firstName:
          req.user.first_name ||
          req.user.firstName ||
          req.user.username ||
          "Người dùng",
        lastName: req.user.last_name || req.user.lastName || "",
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        avatar: req.user.avatar || "",
        isVerified: req.user.is_verified,
        isPremium: req.user.is_premium,
        premiumExpiresAt: req.user.premium_expires_at,
      },
      content: statusData.content,
      mediaUrls: statusData.media_urls || [],
      likesCount: 0,
      commentsCount: 0,
      hasLiked: false,
      createdAt: statusData.created_at,
    };

    return res.json({ success: true, status: formattedStatus });
  } catch (err: any) {
    if (!(err instanceof z.ZodError)) console.error("Error in createStatus:", err);
    return feedError(res, err);
  }
};

export const toggleLike = async (req: AuthRequest, res: Response) => {
  try {
    const { statusId, isLiked } = z.object({ statusId: z.string().min(1), isLiked: z.boolean() }).parse(req.body);
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    if (!await Status.findOne({ where: { id: statusId, is_hidden: false } })) return res.status(404).json({ error: 'Status not found' });

    if (isLiked) {
      await StatusLike.findOrCreate({ where: { status_id: statusId, user_id: userId } });
    } else {
      await StatusLike.destroy({
        where: { status_id: statusId, user_id: userId },
      });
    }
    return res.json({ success: true });
  } catch (err) {
    return feedError(res, err);
  }
};

export const addComment = async (req: AuthRequest, res: Response) => {
  try {
    const { statusId, content } = z.object({ statusId: z.string().min(1), content: z.string().trim().min(1).max(5000) }).parse(req.body);
    const userId = req.user?.id;

    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    if (!await Status.findOne({ where: { id: statusId, is_hidden: false } })) return res.status(404).json({ error: 'Status not found' });

    const comment = await StatusComment.create({
      status_id: statusId,
      user_id: userId,
      content,
    });
    return res.json({ success: true, comment });
  } catch (err) {
    return feedError(res, err);
  }
};

export const getComments = async (req: Request, res: Response) => {
  try {
    const { statusId } = req.params;
    if (!await Status.findOne({ where: { id: statusId, is_hidden: false } })) {
      return res.status(404).json({ error: 'Status not found' });
    }
    const comments = await StatusComment.findAll({
      where: { status_id: statusId },
      include: [
        {
          model: User,
          attributes: ["id", "username", "first_name", "last_name", "avatar", "is_verified", "is_premium", "premium_expires_at"],
        },
      ],
      order: [["created_at", "ASC"]],
    });
    return res.json(comments);
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const updateStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { statusId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const { content, mediaUrls } = z.object({
      content: z.string().trim().max(5000).default(''),
      mediaUrls: z.array(z.string().refine(isBase64Image, 'Only image uploads are allowed')).max(10).optional(),
    }).refine(body => !!body.content || (body.mediaUrls && body.mediaUrls.length > 0), 'Nội dung bài viết không được để trống.').parse(req.body);

    const status: any = await Status.findByPk(statusId as string);
    if (!status) return res.status(404).json({ error: "Status not found" });

    // IDOR Check: Only the owner or admin can update
    if (status.user_id !== userId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    status.content = content;
    if (mediaUrls !== undefined) {
      status.media_urls = mediaUrls;
    }
    await status.save();

    return res.json({
      success: true,
      status: {
        id: status.id,
        userId: status.user_id,
        content: status.content,
        mediaUrls: status.media_urls || [],
        createdAt: status.created_at,
        updatedAt: status.updated_at,
      },
    });
  } catch (err: any) {
    if (!(err instanceof z.ZodError)) console.error("Error in updateStatus:", err);
    return feedError(res, err);
  }
};

export const reportStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { statusId } = req.params;
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: "Unauthorized" });

    const body = z.object({
      reason: z.string().trim().min(1, 'Vui lòng chọn lý do báo cáo.').max(255),
      details: z.string().trim().max(5000).optional(),
    }).parse(req.body);

    const status: any = await Status.findByPk(statusId as string);
    if (!status) return res.status(404).json({ error: "Status not found" });

    if (status.user_id === userId) {
      return res.status(400).json({ error: "Không thể tự báo cáo bài viết của chính bạn." });
    }

    const report = await Report.create({
      reporter_id: userId,
      reported_user_id: status.user_id,
      reported_status_id: statusId,
      reason: body.reason,
      description: body.details || "",
      status: "PENDING",
    });

    return res.json({ success: true, report: { id: report.get("id"), status: report.get("status") } });
  } catch (err: any) {
    if (!(err instanceof z.ZodError)) console.error("Error in reportStatus:", err);
    return feedError(res, err);
  }
};

export const deleteStatus = async (req: AuthRequest, res: Response) => {
  try {
    const { statusId } = req.params;
    const userId = req.user?.id;

    const status: any = await Status.findByPk(statusId as string);
    if (!status) return res.status(404).json({ error: "Status not found" });

    // IDOR Check: Only the owner or admin can delete
    if (status.user_id !== userId && req.user?.role !== "ADMIN") {
      return res.status(403).json({ error: "Forbidden" });
    }

    await StatusLike.destroy({ where: { status_id: statusId } });
    await StatusComment.destroy({ where: { status_id: statusId } });
    await status.destroy();
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};
