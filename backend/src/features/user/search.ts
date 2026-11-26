import { col, fn, Op, where, type WhereOptions } from 'sequelize';
import { z } from 'zod';
import { User } from '../../models';
import { profileIncludes } from '../match/profiles';

const integer = (min: number, max: number) => z.string().regex(/^\d+$/)
  .transform(Number).pipe(z.number().int().min(min).max(max));

const searchSchema = z.object({
  q: z.string().trim().max(150).default(''),
  gender: z.string().trim().toLowerCase().pipe(z.enum(['all', 'male', 'female', 'other'])).default('all'),
  ageMin: integer(18, 100).optional(),
  ageMax: integer(18, 100).optional(),
  onlineStatus: z.enum(['all', 'online', 'offline']).default('all'),
  limit: integer(1, 50).default(50),
  offset: integer(0, 1000000).default(0),
}).refine(value => value.ageMin === undefined || value.ageMax === undefined || value.ageMin <= value.ageMax);

// Clamp February 29 when calculating birthdays in a non-leap year.
export function birthdayCutoff(years: number, today = new Date()): string {
  const year = today.getUTCFullYear() - years;
  const month = today.getUTCMonth();
  const day = Math.min(today.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day)).toISOString().slice(0, 10);
}

export const normalizeSearchText = (value: string) => value.normalize('NFD').toLocaleLowerCase('vi')
  .replace(/\p{M}/gu, '').replace(/đ/g, 'd');
const accentedLetters = 'àáảãạăằắẳẵặâầấẩẫậđèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ';
const plainLetters = [...accentedLetters].map(normalizeSearchText).join('');
const searchFields = ['username', 'first_name', 'last_name'];

export async function findSearchUsers(query: unknown) {
  const { q, gender, ageMin, ageMax, onlineStatus, limit, offset } = searchSchema.parse(query);
  const clauses: WhereOptions[] = [];
  if (gender !== 'all') clauses.push(where(fn('LOWER', col('User.gender')), gender));
  if (ageMin !== undefined || ageMax !== undefined) {
    const today = new Date();
    clauses.push({ date_of_birth: {
      ...(ageMin === undefined ? {} : { [Op.lte]: birthdayCutoff(ageMin, today) }),
      ...(ageMax === undefined ? {} : { [Op.gt]: birthdayCutoff(ageMax + 1, today) }),
    } });
  }
  if (onlineStatus === 'online') clauses.push({ is_online: true });
  if (onlineStatus === 'offline') clauses.push({ [Op.or]: [{ is_online: false }, { is_online: null }] });

  const dialect = User.sequelize!.getDialect();
  const tokens = normalizeSearchText(q.replace(/^@(?=\S)/, '')).split(/\s+/).filter(Boolean);
  if (tokens.length && dialect === 'postgres') {
    // Strip Vietnamese accents and combining marks without a database extension;
    // STRPOS still treats %, _ and backslashes as literal search text.
    clauses.push(...tokens.map(token => ({ [Op.or]: searchFields.map(field =>
      where(fn('STRPOS', fn('REGEXP_REPLACE', fn('TRANSLATE', fn('LOWER', col(`User.${field}`)),
        accentedLetters, plainLetters), '[\u0300-\u036f]', '', 'g'), token), { [Op.gt]: 0 }),
    ) })));
  }
  const filters: WhereOptions = { status: 'ACTIVE', role: 'USER', [Op.and]: clauses };
  const order: [string, 'ASC'][] = [['username', 'ASC'], ['id', 'ASC']];

  if (tokens.length && dialect !== 'postgres') {
    // Match lightweight rows with Unicode support before paginating in dialects
    // without the PostgreSQL folding functions. Load full profiles for one page.
    const candidates = await User.findAll({ where: filters, attributes: ['id', ...searchFields], order });
    const ids = candidates.filter(user => {
      const fields = searchFields.map(field => normalizeSearchText(String(user.get(field) ?? '')));
      return tokens.every(token => fields.some(field => field.includes(token)));
    }).slice(offset, offset + limit).map(user => user.get('id') as string);
    if (!ids.length) return [];
    return User.findAll({ where: { id: { [Op.in]: ids } }, include: profileIncludes(), order });
  }
  return User.findAll({ where: filters, limit, offset, include: profileIncludes(), order });
}
