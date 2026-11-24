import { Request } from 'express';
import { col, fn, Op, where } from 'sequelize';
import sequelize from '../../config/db';

export const adminError = (message: string, statusCode = 400) => Object.assign(new Error(message), { statusCode });
export function pagination(req: Request) {
  const page = Number(req.query.page ?? 1), pageSize = Number(req.query.pageSize ?? 20);
  if (!Number.isSafeInteger(page) || page < 1 || page > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw adminError('Trang hoặc số dòng không hợp lệ.');
  }
  return { page, pageSize, limit: pageSize, offset: (page - 1) * pageSize };
}
export function filter(req: Request, key: string, allowed: string[], fallback?: string) {
  const value = req.query[key];
  if (value === undefined || value === '' || value === 'ALL') return fallback;
  if (typeof value !== 'string' || !allowed.includes(value)) throw adminError('Bộ lọc không hợp lệ: ' + key);
  return value;
}
export function search(req: Request) {
  if (req.query.q === undefined) return '';
  if (typeof req.query.q !== 'string' || req.query.q.length > 150) throw adminError('Từ khóa tìm kiếm không hợp lệ.');
  return req.query.q.trim();
}
export const searchWhere = (q: string, columns: string[], dialect = sequelize.getDialect()) => {
  if (!q) return {};
  const needle = q.toLocaleLowerCase('vi');
  const matchFn = dialect === 'postgres' ? 'STRPOS' : 'INSTR';
  return {
    [Op.or]: columns.map(column => where(fn(matchFn, fn('LOWER', col(column.replace(/^\$|\$$/g, ''))), needle), { [Op.gt]: 0 })),
  };
};
export function pageResult(items: unknown[], total: number, paging: ReturnType<typeof pagination>) {
  return { items, total, page: paging.page, pageSize: paging.pageSize, totalPages: Math.max(1, Math.ceil(total / paging.pageSize)) };
}
export const REPORT_TIME_OFFSET_MS = 7 * 60 * 60 * 1000;
export function period(req: Request) {
  const days = Number(req.query.days ?? 30);
  if (![7, 30, 90].includes(days)) throw adminError('Khoảng thời gian phải là 7, 30 hoặc 90 ngày.');
  const today = new Date(Date.now() + REPORT_TIME_OFFSET_MS);
  today.setUTCHours(0, 0, 0, 0);
  const from = new Date(today.getTime() - REPORT_TIME_OFFSET_MS - (days - 1) * 86400000);
  return { days, from, to: new Date(today.getTime() - REPORT_TIME_OFFSET_MS + 86400000) };
}
