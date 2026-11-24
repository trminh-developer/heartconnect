import { z } from 'zod';
import { registerSchema, updateProfileSchema } from '../validators/userValidator';

type Schema = Record<string, any>;
type Parameter = { name: string; in: 'path' | 'query' | 'header'; required?: boolean; description?: string; schema: Schema };
type OperationOptions = {
  tag: string;
  auth?: 'required' | 'optional' | 'public';
  description?: string;
  body?: Schema;
  parameters?: Parameter[];
  result?: Schema;
  status?: number;
  errors?: number[];
  security?: Record<string, string[]>[];
  deprecated?: boolean;
};

const string = (example?: string): Schema => ({ type: 'string', ...(example === undefined ? {} : { example }) });
const boolean: Schema = { type: 'boolean' };
const integer = (minimum = 0, maximum?: number): Schema => ({ type: 'integer', minimum, ...(maximum === undefined ? {} : { maximum }) });
const enumeration = (...values: string[]): Schema => ({ type: 'string', enum: values });
const object = (properties: Record<string, Schema>, required: string[] = []): Schema => ({
  type: 'object', properties, ...(required.length ? { required } : {}),
});
const array = (items: Schema): Schema => ({ type: 'array', items });
const ref = (name: string): Schema => ({ $ref: `#/components/schemas/${name}` });
const query = (name: string, schema: Schema, description?: string): Parameter => ({ name, in: 'query', schema, ...(description ? { description } : {}) });
const jsonResponse = (description: string, schema: Schema) => ({ description, content: { 'application/json': { schema } } });
const profileList = array(ref('Profile'));
const tokenSecurity = [{ bearerAuth: [] }, { cookieAuth: [] }];
const role = enumeration('USER', 'CENSOR', 'ADMIN');
const accountStatus = enumeration('ACTIVE', 'BANNED', 'DELETED');
const verificationStatus = enumeration('PENDING', 'APPROVED', 'REJECTED');
const reportStatus = enumeration('PENDING', 'RESOLVED', 'DISMISSED');
const planId = enumeration('1_month', '6_months', '12_months');
const dateTime: Schema = { type: 'string', format: 'date-time' };
const loginExample = process.env.NODE_ENV === 'production'
  ? { email: 'user@example.com', password: 'your-password' }
  : { email: 'admin@heartconnect.com', password: 'admin123' };
const pagination = [query('page', { ...integer(1, 100000), default: 1 }), query('pageSize', { ...integer(1, 100), default: 20 }), query('q', { type: 'string', maxLength: 150 })];
const limit = query('limit', { ...integer(1, 50), default: 20 });
const paths: Record<string, Record<string, any>> = {};
const errorDescriptions: Record<number, string> = {
  400: 'Dữ liệu đầu vào không hợp lệ.',
  401: 'Chưa đăng nhập hoặc token không hợp lệ.',
  403: 'Không đủ quyền hoặc tài khoản đã bị khóa.',
  404: 'Không tìm thấy dữ liệu.',
  409: 'Dữ liệu bị trùng hoặc trạng thái đã thay đổi.',
  413: 'Nội dung yêu cầu vượt quá giới hạn 50 MB.',
  422: 'Chưa xác minh được giao dịch với nhà cung cấp.',
  429: 'Vượt giới hạn yêu cầu hoặc đang trong thời gian chờ.',
  500: 'Lỗi nội bộ máy chủ.',
  502: 'Không thể kết nối hoặc xử lý với cổng thanh toán.',
  503: 'Backend đang khởi động hoặc dịch vụ chưa được cấu hình.',
};

function operation(method: string, path: string, summary: string, options: OperationOptions) {
  const auth = options.auth ?? 'required';
  const status = options.status ?? 200;
  const errors = new Set([500, 503, ...(auth === 'required' ? [401, 403] : []), ...(options.body ? [400, 413] : []), ...(options.errors ?? [])]);
  const parameters: Parameter[] = [...path.matchAll(/\{([^}]+)\}/g)].map((match) => ({
    name: match[1], in: 'path', required: true, schema: string(),
    description: match[1] === 'userId' ? 'ID người dùng, lấy từ đăng nhập hoặc GET /auth/me.' : 'ID lấy từ API tạo hoặc danh sách tương ứng.',
  }));
  parameters.push(...(options.parameters ?? []));
  const responses: Record<string, any> = {
    [status]: status === 204 ? { description: 'Đã nhận thông báo, không có nội dung trả về.' }
      : jsonResponse(status === 201 ? 'Tạo thành công.' : 'Xử lý thành công.', options.result ?? ref('Success')),
  };
  for (const code of errors) responses[code] = jsonResponse(errorDescriptions[code], ref('Error'));
  (paths[path] ??= {})[method] = {
    tags: [options.tag], summary,
    operationId: method + path.replace(/[{}]/g, '').replace(/[^a-zA-Z0-9]+/g, '_'),
    ...(options.description ? { description: options.description } : {}),
    security: options.security ?? (auth === 'public' ? [] : auth === 'optional' ? [{}, ...tokenSecurity] : tokenSecurity),
    ...(parameters.length ? { parameters } : {}),
    ...(options.body ? { requestBody: { required: true, content: { 'application/json': { schema: options.body } } } } : {}),
    ...(options.deprecated ? { deprecated: true } : {}), responses,
  };
}

operation('post', '/auth/login', 'Đăng nhập', {
  tag: 'Auth', auth: 'public', body: ref('Login'), result: ref('AuthTokens'), errors: [400, 401, 403, 429],
  description: 'Đăng nhập bằng tài khoản hiện có trong hệ thống. Mẫu local dùng tài khoản ADMIN từ dữ liệu seed. Cookie được gửi tự động cho các lần gọi tiếp theo trên trang này. Có thể sao chép accessToken vào nút Authorize (chỉ nhập token).',
});
operation('post', '/auth/register', 'Đăng ký tài khoản', { tag: 'Auth', auth: 'public', body: ref('Registration'), result: ref('AuthTokens'), status: 201, errors: [409, 429] });
operation('post', '/auth/refresh', 'Làm mới token', {
  tag: 'Auth', auth: 'public', body: object({ token: string() }), result: ref('Tokens'), errors: [401, 403, 429],
  description: 'Truyền refresh token trong body hoặc dùng cookie refreshToken sau khi đăng nhập. Token được lưu dạng băm trong database, chỉ dùng được một lần và được thay mới sau mỗi lần refresh. Đăng xuất hoặc đổi mật khẩu sẽ thu hồi phiên tương ứng.',
});
operation('post', '/auth/logout', 'Đăng xuất', { tag: 'Auth', auth: 'public', body: object({ token: string() }), errors: [429] });
operation('get', '/auth/me', 'Thông tin tài khoản đang đăng nhập', { tag: 'Auth', result: ref('Profile'), errors: [404, 429] });
for (const [path, summary] of [['forgot-password', 'Yêu cầu khôi phục mật khẩu'], ['verify-otp', 'Kiểm tra OTP'], ['reset-password', 'Đặt lại mật khẩu']]) {
  operation('post', '/auth/' + path, summary, {
    tag: 'Auth', auth: 'public', deprecated: true,
    description: 'Khôi phục mật khẩu chưa được cấu hình. Endpoint trả HTTP 501 với thông báo lỗi; không gửi email, kiểm tra OTP hoặc đổi mật khẩu.',
    status: 501, result: ref('Error'),
    body: object({ email: { ...string('api.tester@example.test'), format: 'email' }, ...(path === 'forgot-password' ? {} : { otp: string('123456') }), ...(path === 'reset-password' ? { password: string('LocalDemo123!') } : {}) }), errors: [429],
  });
}

for (const path of ['/users', '/users/recommended']) {
  operation('get', path, 'Danh sách hồ sơ được đề xuất', { tag: 'Users', auth: 'optional', parameters: [limit], result: profileList, errors: [400] });
}
operation('get', '/users/nearby', 'Danh sách hồ sơ gần đây', {
  tag: 'Users', auth: 'public', result: profileList,
  description: 'Hiện trả tối đa 20 hồ sơ công khai; endpoint này chưa lọc theo tọa độ. Dùng Discover để áp dụng tùy chọn khoảng cách.',
});
operation('get', '/users/search', 'Tìm hồ sơ theo từ khóa', { tag: 'Users', auth: 'public', parameters: [query('q', { type: 'string', maxLength: 150 }, 'Tìm theo username, họ, tên hoặc tiểu sử.')], result: profileList, errors: [400] });
operation('get', '/users/username/{username}', 'Xem hồ sơ theo username', { tag: 'Users', auth: 'optional', result: ref('Profile'), errors: [404] });
operation('get', '/users/{id}', 'Xem hồ sơ theo ID', { tag: 'Users', auth: 'optional', result: ref('Profile'), errors: [404] });
operation('put', '/users/{id}', 'Cập nhật hồ sơ và tùy chọn', {
  tag: 'Users', body: ref('ProfileUpdate'), result: ref('Profile'), errors: [404, 409, 429],
  description: 'Gửi các trường cần sửa. Người dùng sửa hồ sơ của mình; ADMIN có thể sửa hồ sơ khác. Đổi tên/username có thời gian chờ riêng 7 ngày; đổi logo cần Premium.',
});
operation('post', '/users/block', 'Chặn người dùng', { tag: 'Users', body: object({ blockedId: string() }, ['blockedId']), errors: [404] });
operation('post', '/users/report', 'Báo cáo người dùng', {
  tag: 'Users', body: object({ reportedId: string(), reason: { ...string('Spam'), minLength: 1, maxLength: 255 }, details: { ...string(), maxLength: 5000 } }, ['reportedId', 'reason']), errors: [404],
});
operation('post', '/users/{id}/verification', 'Gửi yêu cầu xác thực danh tính', {
  tag: 'Users', status: 201, body: object({ id_card_image: { ...string(), minLength: 1, maxLength: 10000000 }, selfie_image: { ...string(), minLength: 1, maxLength: 40000000 } }, ['id_card_image', 'selfie_image']), errors: [409],
});
operation('get', '/users/discover', 'Khám phá hồ sơ và lấy cursor tiếp theo', {
  tag: 'Discover', parameters: [limit, query('cursor', string(), 'Dùng next_cursor trả về từ trang trước.')], result: ref('DiscoveryFeed'), errors: [400, 404, 409],
});
operation('post', '/users/discover/{sessionId}/impressions', 'Ghi nhận hồ sơ đã hiển thị', {
  tag: 'Discover', body: object({ targetId: string() }, ['targetId']), errors: [404, 409],
  description: 'sessionId và targetId phải thuộc trang Discover đã được cấp cho người đăng nhập.',
});

for (const [path, summary] of [['/matches/{id}', 'Danh sách tương hợp'], ['/matches/who-liked-me/{userId}', 'Những người đã thích tôi'], ['/matches/who-i-liked/{userId}', 'Những người tôi đã thích']]) {
  operation('get', path, summary, { tag: 'Matches', result: path === '/matches/{id}' ? array(ref('Match')) : profileList, errors: [404], description: 'ID là ID người dùng lấy từ đăng nhập hoặc GET /auth/me.' });
}
for (const [action, summary] of [['like', 'Thích hồ sơ'], ['pass', 'Bỏ qua hồ sơ'], ['superlike', 'Super Like hồ sơ']]) {
  operation('post', '/matches/' + action, summary, {
    tag: 'Matches', body: object({ targetId: string(), requestId: { ...string(), description: 'Mã yêu cầu để chống lặp thao tác (tùy chọn).' } }, ['targetId']),
    result: action === 'pass' ? ref('Success') : ref('SwipeResult'), errors: [404, 409],
  });
}
operation('delete', '/matches/{id}', 'Hủy tương hợp', { tag: 'Matches', errors: [404], description: 'Xóa cuộc hội thoại của cặp và giữ lại quyết định hủy tương hợp.' });

operation('get', '/messages/conversations/{userId}', 'Danh sách cuộc hội thoại', { tag: 'Messages', result: array(ref('Conversation')) });
operation('get', '/messages/{id}', 'Tin nhắn trong cuộc hội thoại', { tag: 'Messages', result: array(ref('Message')), errors: [404], description: 'ID là ID cuộc hội thoại lấy từ danh sách hội thoại.' });
operation('post', '/messages', 'Gửi tin nhắn', {
  tag: 'Messages', body: object({ conversationId: string(), content: { ...string('Xin chào!'), minLength: 1, maxLength: 30000000 }, type: { ...enumeration('text', 'image', 'emoji', 'location'), default: 'text' } }, ['conversationId', 'content']),
  result: ref('Message'), errors: [404],
});
operation('put', '/messages/{conversationId}/read', 'Đánh dấu cuộc hội thoại đã đọc', { tag: 'Messages', errors: [404] });
for (const method of ['put', 'post']) operation(method, '/messages/{messageId}/recall', 'Thu hồi tin nhắn đã gửi', { tag: 'Messages', errors: [404] });
for (const path of ['/messages/{id}', '/messages/{messageId}/for-me']) operation('delete', path, 'Xóa tin nhắn ở phía mình', { tag: 'Messages', errors: [404], description: 'ID là ID tin nhắn cần xóa.' });

operation('get', '/feed/{id}', 'Bảng tin hoặc bài viết của một người', {
  tag: 'Feed', auth: 'optional', parameters: [query('page', { ...integer(1, 100000), default: 1 }), query('limit', { ...integer(1, 100), default: 20 })], result: array(ref('Post')), errors: [400],
  description: 'ID là ID người dùng; đặt id = all để xem bảng tin chung.',
});
operation('post', '/feed', 'Đăng bài viết', {
  tag: 'Feed', body: object({ content: { ...string('Bài viết thử từ Swagger'), maxLength: 5000 }, mediaUrls: { ...array(string()), maxItems: 10, description: 'Ảnh dạng data:image/...;base64,...; cần nội dung hoặc ít nhất một ảnh.' } }),
  result: object({ success: boolean, status: ref('Post') }),
});
operation('post', '/feed/like', 'Thích hoặc bỏ thích bài viết', { tag: 'Feed', body: object({ statusId: string(), isLiked: { ...boolean, example: true } }, ['statusId', 'isLiked']), errors: [404] });
operation('get', '/feed/{statusId}/comments', 'Danh sách bình luận', { tag: 'Feed', result: array(ref('Comment')), errors: [404] });
operation('post', '/feed/comment', 'Bình luận bài viết', {
  tag: 'Feed', body: object({ statusId: string(), content: { ...string('Bình luận thử'), minLength: 1, maxLength: 5000 } }, ['statusId', 'content']), result: ref('Comment'), errors: [404],
});
operation('delete', '/feed/{id}', 'Xóa bài viết', { tag: 'Feed', errors: [404], description: 'ID là ID bài viết cần xóa.' });
operation('put', '/feed/{id}', 'Chỉnh sửa bài viết', {
  tag: 'Feed', body: object({ content: { ...string('Nội dung bài viết đã chỉnh sửa'), maxLength: 5000 }, mediaUrls: { ...array(string()), maxItems: 10 } }),
  result: object({ success: boolean, status: ref('Post') }), errors: [403, 404],
});
operation('post', '/feed/{id}/report', 'Báo cáo bài viết', {
  tag: 'Feed', body: object({ reason: string('Nội dung không phù hợp'), details: string() }, ['reason']),
  result: object({ success: boolean, report: object({ id: string(), status: string() }) }), errors: [400, 404],
});

operation('get', '/stories', 'Tin còn hiệu lực trong 24 giờ', {
  tag: 'Stories', result: array(ref('Story')),
  description: 'Trả tối đa 100 tin của tài khoản đang hoạt động, loại tin hết hạn và tài khoản đã chặn hai chiều.',
});
operation('post', '/stories', 'Đăng tin trong 24 giờ', {
  tag: 'Stories', status: 201, result: ref('Story'),
  body: object({ mediaType: enumeration('text', 'image', 'video'), textContent: { ...string('Tin mới của tôi'), maxLength: 1000 },
    backgroundColor: { ...string('#ff6b6b'), pattern: '^#[0-9a-fA-F]{6}$' }, mediaUrl: string() }, ['mediaType']),
  description: 'Tin văn bản cần textContent. Ảnh cần mediaUrl dạng data:image/png|jpeg|jpg|webp|gif;base64,... tối đa 14 triệu ký tự. Video dùng data:video/mp4|webm|quicktime;base64,... tối đa 40 triệu ký tự. Backend lấy tác giả từ phiên đăng nhập và tự đặt thời điểm hết hạn.',
});
operation('delete', '/stories/{id}', 'Xóa tin (tác giả hoặc ADMIN)', { tag: 'Stories', errors: [404] });

operation('get', '/notifications/{userId}', 'Danh sách thông báo', { tag: 'Notifications', result: array(ref('Notification')) });
operation('get', '/notifications/unread-count/{userId}', 'Số thông báo chưa đọc', { tag: 'Notifications', result: object({ count: integer() }) });
operation('put', '/notifications/{id}/read', 'Đánh dấu thông báo đã đọc', { tag: 'Notifications', errors: [404] });
operation('put', '/notifications/mark-all-read/{userId}', 'Đánh dấu tất cả thông báo đã đọc', { tag: 'Notifications' });
operation('post', '/notifications', 'Tạo thông báo (ADMIN)', {
  tag: 'Notifications', body: object({ userId: string(), fromUserId: string(), type: enumeration('LIKE', 'MATCH', 'MESSAGE', 'PROFILE_VIEW', 'SUPER_LIKE', 'SYSTEM'), message: { ...string('Thông báo thử'), minLength: 1, maxLength: 5000 } }, ['userId', 'type', 'message']), result: ref('Notification'), errors: [404],
});

operation('get', '/payments/methods', 'Phương thức thanh toán và giá gói', { tag: 'Payments', auth: 'public', result: ref('PaymentMethods') });
for (const provider of ['bank', 'vnpay', 'momo', 'card', 'paypal']) {
  operation('post', `/payments/${provider}/create`, `Tạo đơn ${provider.toUpperCase()}`, {
    tag: 'Payments', body: object({ planId: { ...planId, example: '1_month' } }, ['planId']), result: ref('PaymentCreated'), errors: [502],
    description: 'Giá và người mua được xác định tại backend. Cổng thanh toán bên ngoài cần thông tin merchant tương ứng; tạo đơn BANK ở chế độ direct không cần gọi cổng thanh toán.',
  });
}
operation('get', '/payments/bank/{orderId}', 'Thông tin đơn chuyển khoản và QR', { tag: 'Payments', result: ref('BankOrder'), errors: [404, 409] });
operation('get', '/payments/{orderId}/status', 'Trạng thái đơn của người mua', { tag: 'Payments', result: ref('PaymentStatus'), errors: [404] });
const reference = { ...string('LOCAL-DEMO-123456'), minLength: 6, maxLength: 80, description: 'Mã giao dịch từ biên lai ngân hàng.' };
operation('post', '/payments/bank/{orderId}/submit', 'Gửi mã giao dịch để đối soát', {
  tag: 'Payments', body: object({ reference }, ['reference']), result: object({ status: enumeration('PENDING', 'SUCCESS', 'FAILED'), submission: object({ reference: string(), submittedAt: dateTime }) }), errors: [404],
  description: 'Gửi mã giao dịch chưa kích hoạt Premium. ADMIN phải kiểm tra tiền thực nhận và xác nhận đơn.',
});
operation('get', '/payments/bank/pending', 'Đơn đang chờ đối soát (ADMIN)', { tag: 'Payments', parameters: [query('page', { ...integer(1, 10000), default: 1 }), query('pageSize', { ...integer(1, 50), default: 10 })], result: ref('Page') });
operation('post', '/payments/bank/{orderId}/confirm', 'Xác nhận tiền đã nhận (ADMIN)', {
  tag: 'Payments', body: object({ reference, amount: { type: 'integer', example: 3000 }, verified: { ...boolean, example: true } }, ['reference', 'amount', 'verified']), result: object({ orderId: string(), status: enumeration('SUCCESS') }), errors: [404, 409],
  description: 'Chỉ xác nhận sau khi đối chiếu người chuyển, mã giao dịch và số tiền thực nhận trong tài khoản ngân hàng.',
});
for (const provider of ['vnpay', 'momo', 'stripe', 'paypal']) {
  operation('get', `/payments/${provider}/return`, `Trang trở về từ ${provider.toUpperCase()}`, {
    tag: 'Payments', auth: 'public', status: 302,
    parameters: [query('orderId', string()), ...(provider === 'vnpay' ? [query('vnp_TxnRef', string()), query('vnp_ResponseCode', string()), query('vnp_SecureHash', string())] : provider === 'paypal' ? [query('token', string())] : provider === 'stripe' ? [query('session_id', string())] : [query('resultCode', string()), query('signature', string())])],
    description: 'Callback chuyển hướng về frontend /payment/result. Cần tham số có chữ ký từ cổng thanh toán; không phải API trả JSON. Trình duyệt theo redirect khi Execute.',
  });
  paths[`/payments/${provider}/return`].get.responses['302'] = { description: 'Chuyển hướng về trang kết quả trên frontend.', headers: { Location: { schema: string() } } };
}
operation('post', '/payments/sepay/ipn', 'Nhận thông báo SePay', {
  tag: 'Payments', auth: 'public', security: [{ sepaySecret: [] }],
  body: object({ notification_type: string('ORDER_PAID'), order: object({ order_invoice_number: string() }, ['order_invoice_number']) }, ['notification_type', 'order']), errors: [401, 409, 422, 502],
  description: 'SePay gửi X-Secret-Key. Backend đối soát lại qua API của SePay; không thể kích hoạt đơn chỉ bằng body giả lập.',
});
operation('get', '/payments/vnpay/ipn', 'Nhận thông báo VNPay', {
  tag: 'Payments', auth: 'public', result: object({ RspCode: string('00'), Message: string() }),
  parameters: ['vnp_TxnRef', 'vnp_Amount', 'vnp_ResponseCode', 'vnp_SecureHash'].map(name => query(name, string())),
  description: 'Theo giao thức VNPay, HTTP 200 chứa RspCode. RspCode = 00 khi xác nhận thành công; mã khác báo lỗi.',
});
operation('post', '/payments/momo/ipn', 'Nhận thông báo MoMo', {
  tag: 'Payments', auth: 'public', status: 204, body: object({ orderId: string(), amount: { type: 'number' }, resultCode: integer(), signature: string() }, ['orderId', 'signature']),
});
operation('post', '/payments/stripe/webhook', 'Nhận webhook Stripe', {
  tag: 'Payments', auth: 'public', body: object({ id: string(), type: string('checkout.session.completed'), data: object({ object: { type: 'object' } }) }),
  parameters: [{ name: 'stripe-signature', in: 'header', required: true, schema: string() }], result: object({ received: boolean }),
  description: 'Cần chữ ký hợp lệ của Stripe cho đúng raw body; nên gửi thử bằng Stripe CLI.',
});

const admin = { tag: 'Admin', description: 'Cần tài khoản ADMIN hoặc CENSOR; thao tác phân quyền, cài đặt và doanh thu chỉ dành cho ADMIN.' };
operation('get', '/admin/overview', 'Tổng quan quản trị', { ...admin, parameters: [query('days', { type: 'integer', enum: [7, 30, 90], default: 30 })], result: { type: 'object' }, errors: [400] });
operation('get', '/admin/analytics', 'Doanh thu và phân tích (ADMIN)', { ...admin, parameters: [query('days', { type: 'integer', enum: [7, 30, 90], default: 30 })], result: { type: 'object' }, errors: [400] });
operation('get', '/admin/users', 'Tìm và lọc người dùng', { ...admin, parameters: [...pagination, query('role', role), query('status', accountStatus), query('verified', enumeration('true', 'false'))], result: ref('Page'), errors: [400] });
for (const [action, summary, body] of [
  ['status', 'Khóa hoặc mở tài khoản', object({ status: enumeration('ACTIVE', 'BANNED') }, ['status'])],
  ['role', 'Đổi vai trò người dùng (ADMIN)', object({ role }, ['role'])],
  ['verification/revoke', 'Thu hồi xác thực danh tính', undefined],
  ['reset-violations', 'Đặt lại số lần vi phạm', undefined],
] as const) operation('put', '/admin/users/{id}/' + action, summary, { ...admin, body, errors: [404, 409] });
operation('delete', '/admin/users/{id}', 'Xóa hoàn toàn tài khoản và dữ liệu người dùng (ADMIN)', { ...admin, errors: [403, 404] });
operation('get', '/admin/verifications', 'Danh sách yêu cầu xác thực', { ...admin, parameters: [...pagination, query('status', verificationStatus)], result: ref('Page'), errors: [400] });
operation('get', '/admin/verifications/{id}', 'Chi tiết và ảnh xác thực', { ...admin, result: ref('Verification'), errors: [404] });
for (const [action, summary] of [['approve', 'Phê duyệt xác thực'], ['reject', 'Từ chối xác thực']]) operation('post', `/admin/verifications/{id}/${action}`, summary, { ...admin, errors: [404, 409] });
operation('get', '/admin/feed', 'Quản lý bài viết', { ...admin, parameters: [...pagination, query('visibility', enumeration('visible', 'hidden'))], result: ref('Page'), errors: [400] });
operation('put', '/admin/feed/{id}/visibility', 'Ẩn hoặc khôi phục bài viết', { ...admin, body: object({ hidden: { ...boolean, example: true } }, ['hidden']), errors: [404] });
operation('delete', '/admin/feed/{id}', 'Ẩn bài viết và giữ bằng chứng', { ...admin, errors: [404] });
operation('get', '/admin/reports', 'Danh sách báo cáo', { ...admin, parameters: [...pagination, query('status', reportStatus)], result: ref('Page'), errors: [400] });
operation('put', '/admin/reports/{id}', 'Xử lý báo cáo', { ...admin, body: object({ status: enumeration('RESOLVED', 'DISMISSED'), penalize: { ...boolean, default: false } }, ['status']), errors: [404, 409] });
operation('get', '/admin/settings', 'Cài đặt hệ thống (ADMIN)', { ...admin, result: object({ settings: ref('Settings') }) });
operation('put', '/admin/settings', 'Lưu chính sách kiểm duyệt (ADMIN)', { ...admin, body: object({ settings: ref('Settings') }, ['settings']), result: object({ message: string(), settings: ref('Settings') }) });

export const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'HeartConnect API', version: '2.0.0',
  },
  servers: [{ url: '/api', description: 'Backend đang mở trang tài liệu này' }],
  tags: [
    ['Auth', 'Tài khoản và phiên đăng nhập'], ['Users', 'Hồ sơ và xác thực danh tính'],
    ['Discover', 'Khám phá và ghi nhận lượt hiển thị'], ['Matches', 'Thích, bỏ qua và tương hợp'], ['Messages', 'Hội thoại và tin nhắn'],
    ['Feed', 'Bài viết và bình luận'], ['Stories', 'Tin văn bản, ảnh và video trong 24 giờ'], ['Notifications', 'Thông báo'], ['Payments', 'Thanh toán Premium và callback'], ['Admin', 'Quản trị và kiểm duyệt'],
  ].map(([name, description]) => ({ name, description })),
  paths,
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT', description: 'Nhập accessToken trả về sau khi đăng nhập; không thêm tiền tố Bearer.' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: 'accessToken', description: 'Cookie HttpOnly được backend tự đặt khi đăng nhập. Trình duyệt gửi tự động; không nhập thủ công.' },
      sepaySecret: { type: 'apiKey', in: 'header', name: 'X-Secret-Key', description: 'Khóa IPN do backend và SePay cùng cấu hình.' },
    },
    schemas: {
      Error: object({ error: string('Dữ liệu không hợp lệ.'), code: string(), field: string(), nextAllowedAt: dateTime }, ['error']),
      Success: object({ success: { ...boolean, example: true }, message: string() }),
      Login: { ...object({ email: { ...string(loginExample.email), format: 'email' }, password: { ...string(loginExample.password), minLength: 1, format: 'password' } }, ['email', 'password']), example: loginExample },
      Registration: {
        ...z.toJSONSchema(registerSchema, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' }),
        example: { email: 'api.tester@example.test', password: 'LocalDemo123!', firstName: 'API', lastName: 'Tester', gender: 'male', dateOfBirth: '2000-01-01' },
      },
      ProfileUpdate: {
        ...z.toJSONSchema(updateProfileSchema, { target: 'openapi-3.0', io: 'input', unrepresentable: 'any' }),
        example: { bio: 'Hồ sơ thử từ Swagger', datingPreference: { preferredGender: ['female'], ageRange: { min: 18, max: 35 }, maxDistance: 50 } },
      },
      Tokens: object({ accessToken: string(), refreshToken: string() }, ['accessToken', 'refreshToken']),
      AuthTokens: { allOf: [ref('Tokens'), object({ user: ref('Profile') }, ['user'])] },
      Profile: object({
        id: string(), username: string(), first_name: string(), last_name: string(), gender: enumeration('male', 'female', 'other'),
        bio: { type: 'string', nullable: true }, avatar: { type: 'string', nullable: true }, city: string(), country: string(),
        date_of_birth: { type: 'string', format: 'date' }, is_verified: boolean, is_premium: boolean, role,
        match_percentage: { type: 'number', nullable: true }, interests: array(object({ id: string(), name: string() })),
      }),
      Match: object({ id: string(), user_id: string(), matched_user: ref('Profile'), matched_at: dateTime, match_percentage: { type: 'number', nullable: true } }),
      SwipeResult: object({ matched: boolean, match: ref('Match'), replayed: boolean }),
      DiscoveryFeed: object({ users: profileList, session_id: string(), next_cursor: { type: 'string', nullable: true }, algorithm_version: string(), expires_at: dateTime, location_required: boolean }),
      Conversation: object({ id: string(), participants: profileList, unreadCount: integer(), lastMessage: { type: 'object', nullable: true }, updatedAt: dateTime }),
      Message: object({ id: string(), conversation_id: string(), sender_id: string(), content: string(), type: enumeration('text', 'image', 'emoji', 'location'), status: enumeration('sent', 'delivered', 'seen'), is_recalled: boolean, created_at: dateTime }),
      Story: object({ id: string(), userId: string(), mediaType: enumeration('text', 'image', 'video'), mediaUrl: { type: 'string', nullable: true }, textContent: { type: 'string', nullable: true }, backgroundColor: { type: 'string', nullable: true }, user: ref('Profile'), createdAt: dateTime, expiresAt: dateTime }),
      Post: object({ id: string(), userId: string(), user: ref('Profile'), content: string(), mediaUrls: array(string()), likesCount: integer(), commentsCount: integer(), hasLiked: boolean, createdAt: dateTime }),
      Comment: object({ id: string(), status_id: string(), user_id: string(), content: string(), created_at: dateTime }),
      Notification: object({ id: string(), user_id: string(), from_user_id: { type: 'string', nullable: true }, type: string(), message: string(), is_read: boolean, fromUser: { type: 'object', nullable: true }, created_at: dateTime }),
      Page: object({ items: array({ type: 'object' }), total: integer(), page: integer(1), pageSize: integer(1), totalPages: integer(1) }),
      Verification: object({ id: string(), user_id: string(), status: verificationStatus, id_card_image: string(), selfie_image: string(), user: ref('Profile') }),
      Settings: object({ MAX_VIOLATIONS: { ...string('5'), pattern: '^(?:[1-9]|1[0-9]|20)$' }, AUTO_BAN_ENABLED: enumeration('true', 'false'), WARNING_NOTIFICATION_ENABLED: enumeration('true', 'false') }),
      PaymentCreated: object({ success: boolean, provider: string(), paymentUrl: string(), transactionId: string() }),
      PaymentStatus: object({ orderId: string(), status: enumeration('PENDING', 'SUCCESS', 'FAILED'), planId, confirmationMode: enumeration('manual', 'automatic') }),
      BankOrder: object({ orderId: string(), planId, amount: { type: 'number' }, status: enumeration('PENDING', 'SUCCESS', 'FAILED'), checkout: { type: 'object', nullable: true }, transfer: { type: 'object', nullable: true } }),
      PaymentMethods: object({ environment: { type: 'string', nullable: true }, confirmationMode: enumeration('manual', 'automatic'), methods: object({ bank: boolean, momo: boolean, card: boolean, paypal: boolean }), plans: array(object({ id: planId, price: { type: 'number' }, months: integer(1), title: string() })) }),
    },
  },
};
