import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { z } from 'zod';
import { Story, User, UserBlock } from '../../models';
import { AuthRequest, requireAuth } from '../../middlewares/authMiddleware';

const authorAttributes = ['id', 'username', 'first_name', 'last_name', 'avatar'];
const storySchema = z.discriminatedUnion('mediaType', [
  z.object({
    mediaType: z.literal('text'), textContent: z.string().trim().min(1).max(1000),
    backgroundColor: z.string().regex(/^#[0-9a-f]{6}$/i).default('#000000'),
  }),
  z.object({
    mediaType: z.literal('image'),
    mediaUrl: z.string().max(14000000).regex(/^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/),
  }),
  z.object({
    mediaType: z.literal('video'),
    mediaUrl: z.string().max(40000000).regex(/^data:video\/(?:mp4|webm|quicktime);base64,[A-Za-z0-9+/]+={0,2}$/),
  }),
]);
function format(story: Story) {
  const data = story.toJSON();
  return { id: data.id, userId: data.user_id, mediaType: data.media_type, mediaUrl: data.media_url,
    textContent: data.text_content, backgroundColor: data.background_color,
    createdAt: data.created_at, expiresAt: data.expires_at, user: data.User };
}
const handler = (work: (req: AuthRequest, res: Response) => Promise<unknown>) => async (req: AuthRequest, res: Response) => {
  try { return await work(req, res); }
  catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json({ error: error.issues.map(issue => issue.message).join(', ') });
    console.error('Story request failed:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

const router = Router();
router.get('/api/stories', requireAuth, handler(async (req, res) => {
  const blocks = await UserBlock.findAll({ where: { [Op.or]: [{ user_id: req.user.id }, { target_id: req.user.id }] } });
  const blockedIds = blocks.map(block => block.get('user_id') === req.user.id ? block.get('target_id') : block.get('user_id'));
  const stories = await Story.findAll({
    where: { expires_at: { [Op.gt]: new Date() }, ...(blockedIds.length ? { user_id: { [Op.notIn]: blockedIds } } : {}) },
    include: [{ model: User, attributes: authorAttributes, where: { status: 'ACTIVE' } }],
    order: [['created_at', 'ASC'], ['id', 'ASC']], limit: 100,
  });
  return res.json(stories.map(format));
}));
router.post('/api/stories', requireAuth, handler(async (req, res) => {
  const body = storySchema.parse(req.body);
  const story = await Story.create({
    user_id: req.user.id, media_type: body.mediaType,
    ...('mediaUrl' in body ? { media_url: body.mediaUrl } : { text_content: body.textContent, background_color: body.backgroundColor }),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
  await story.reload({ include: [{ model: User, attributes: authorAttributes }] });
  return res.status(201).json(format(story));
}));
router.delete('/api/stories/:id', requireAuth, handler(async (req, res) => {
  const story = await Story.findByPk(req.params.id as string);
  if (!story) return res.status(404).json({ error: 'Story not found' });
  if (story.get('user_id') !== req.user.id && req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Forbidden' });
  await story.destroy();
  return res.json({ success: true });
}));
export default router;
