/**
 * DEPRECATED.
 *
 * Vercel hiện chạy root server.ts trực tiếp (zero-config Node server).
 * File này cố ý không import ../server nữa để tránh tạo Vercel Function thứ hai
 * và tránh lỗi 500 do hai runtime cùng tranh routing.
 *
 * Không endpoint nào của Page Manager đi qua file này.
 */
export default function handler(_req: any, res: any) {
  return res.status(410).json({
    success: false,
    error: 'Legacy API wrapper disabled. Requests are handled by root server.ts.'
  });
}
