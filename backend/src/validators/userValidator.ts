import { z } from "zod";
import { ageOn, normalizeGender, normalizeGoal } from '../features/match/compatibility';

const genderSchema = z.string().transform(normalizeGender).pipe(z.enum(['male', 'female', 'other']));
const goalSchema = z.string().transform(normalizeGoal).pipe(z.enum(['LONG_TERM', 'SHORT_TERM', 'FRIENDSHIP', 'NOT_SURE', '']));
const usernameSchema = z.string().trim().min(3).max(30).regex(/^[a-zA-Z0-9_.-]+$/, 'Username chỉ gồm chữ, số, dấu chấm, gạch dưới và gạch ngang.');
const dateOfBirthSchema = z.string().refine(value => {
  const age = ageOn(value);
  return age !== null && age >= 18 && age <= 100;
}, 'Date of birth must be a valid YYYY-MM-DD date for an adult aged 18 to 100');

export const registerSchema = z.object({
  email: z.string().trim().email("Invalid email format").toLowerCase(),
  username: usernameSchema.optional(),
  password: z.string().min(6, "Password must be at least 6 characters"),
  firstName: z.string().trim().min(1, "First name is required").max(50),
  lastName: z.string().trim().min(1, "Last name is required").max(50),
  gender: genderSchema,
  dateOfBirth: dateOfBirthSchema,
});

export const updateProfileSchema = z.object({
  username: usernameSchema.optional(),
  firstName: z.string().trim().min(1).max(50).optional(),
  lastName: z.string().trim().max(50).optional(),
  appLogo: z.string().max(1500000).refine(
    (value) => value === '' || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value),
    'Logo phải là ảnh PNG, JPEG, WebP hoặc GIF, tối đa 1 MB.',
  ).nullish(),
  password: z.string().min(6).nullish(),
  currentPassword: z.string().min(1).optional(),
  dateOfBirth: z.union([z.literal(''), dateOfBirthSchema]).nullish(),
  bio: z.string().max(500).nullish(),
  coverPhoto: z.string().nullish(),
  avatar: z.string().nullish(),
  photos: z.array(z.string()).nullish(),
  isOnline: z.boolean().nullish(),
  datingVisible: z.boolean().optional(),
  refreshLocation: z.boolean().optional(),
  profession: z.string().max(100).nullish(),
  education: z.string().max(100).nullish(),
  relationshipGoal: goalSchema.nullish(),

  interests: z
    .array(
      z
        .object({
          id: z.string().nullish(),
          name: z.string(),
          icon: z.string().nullish(),
          category: z.string().nullish(),
        })
        .passthrough(),
    )
    .nullish(),

  location: z
    .object({
      city: z.string().nullish(),
      country: z.string().nullish(),
      latitude: z.number().min(-90).max(90).nullish(),
      longitude: z.number().min(-180).max(180).nullish(),
    })
    .nullish(),

  datingPreference: z
    .object({
      preferredGender: z
        .array(genderSchema)
        .nullish(),
      ageRange: z
        .object({
          min: z.number().int().min(18).max(100).nullish(),
          max: z.number().int().min(18).max(100).nullish(),
        })
        .nullish(),
      maxDistance: z.number().int().min(1).max(20000).nullish(),
      relationshipGoal: goalSchema.nullish(),
      acceptedGoals: z.array(goalSchema).max(4).optional(),
      goalRequired: z.boolean().optional(),
      distanceRequired: z.boolean().optional(),
      distanceHalfLife: z.number().min(0.1).max(1000).optional(),
    })
    .nullish(),
}).refine(body => !body.password || !!body.currentPassword, {
  path: ['currentPassword'], message: 'Current password is required to change the password',
});
