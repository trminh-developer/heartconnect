## 💖 HeartConnect

<div align="center">
    ![Node](https://img.shields.io/badge/node-24.x-brightgreen)
    ![TypeScript](https://img.shields.io/badge/TypeScript-6.x%20%2F%207.x-blue)
    ![Deploy](https://img.shields.io/badge/deploy-Vercel-black)
</div>

# 💖 HeartConnect - Ứng Dụng Hẹn Hò

Chào mừng bạn đến với dự án **HeartConnect**! Đây là một nền tảng kết nối trực tuyến được thiết kế để giúp người dùng gặp gỡ, giao tiếp và xây dựng các mối quan hệ một cách an toàn và thú vị.

---

## ✨ Các Chức Năng Chính

Dự án cung cấp một trải nghiệm liền mạch với các tính năng cơ bản và nâng cao:

1. **Quản lý Tài Khoản:** Đăng nhập và đăng ký bảo mật, cho phép người dùng tùy chỉnh hồ sơ cá nhân.
2. **Khám Phá & Tương Hợp (Match):** Cơ chế quẹt trái/phải thông minh giúp người dùng dễ dàng tìm kiếm những đối tượng phù hợp với sở thích.
3. **Nhắn Tin Trực Tiếp (Chat):** Hệ thống trò chuyện thời gian thực dành cho những người dùng đã tương hợp.
4. **Tài Khoản Premium:** Các gói nâng cấp trả phí mang lại trải nghiệm không giới hạn và các đặc quyền ưu tiên trong ứng dụng.
5. **Cập nhật vị trí:** Khi người dùng cập nhật vị trí thì sẽ định vị trong khoảng cách gần nhất sẽ phát hiện đối tượng đang gần với mình nhất.
6. **Identity verifications:** Khi người dùng xác minh danh tính, sau khi xác minh xong user phải đợi từ 3 - 7 ngày từ hệ thống duyệt hồ sơ duyệt xác minh danh tính để cung cấp tích xanh.

---

## Trang thử API (Swagger UI)

- Chạy `npm ci --prefix backend`, sau đó `npm run dev --prefix backend` và mở **http://localhost:3000/docs** (thay cổng nếu cấu hình `PORT` khác). Không cần chạy frontend để dùng trang này.
- Trang liệt kê các API nghiệp vụ theo nhóm, có tham số, JSON mẫu và mã phản hồi. Mở API → **Try it out** → nhập dữ liệu → **Execute** để xem HTTP status và JSON thực tế. Tài liệu OpenAPI nằm tại `/openapi.json`; CSS/JavaScript của Swagger được phục vụ từ backend.
- Dùng **Auth → POST /auth/login** đăng nhập bằng tài khoản hiện có trong hệ thống. Mẫu local điền sẵn tài khoản ADMIN từ dữ liệu seed. Cookie được gửi tự động trên cùng trang; cũng có thể sao chép `accessToken` vào **Authorize**. API quản trị cần tài khoản ADMIN/CENSOR tương ứng.
- Thành công thường trả 200, dữ liệu sai trả 400; tạo tài khoản/yêu cầu xác thực/tin trả 201. Các lỗi đăng nhập, quyền truy cập, tài nguyên và giao thức callback được ghi theo mã thực tế của từng API. Ba API quên mật khẩu/OTP/đặt lại mật khẩu trả **501** vì chưa có dịch vụ khôi phục được cấu hình; giao diện hiển thị lỗi này, không thông báo thành công giả.
- Chạy `npm test --prefix backend` để kiểm thử API bằng database trong bộ nhớ. Việc **Execute** trong Swagger sử dụng database của server đang chạy theo cấu hình môi trường.

- Refresh token được lưu dạng SHA-256 trong bảng `refresh_sessions`, thay mới sau mỗi lần dùng và không thể dùng lại sau khi đăng xuất. Đổi mật khẩu cần gửi `currentPassword` cùng `password` và thu hồi các refresh session của tài khoản. Khi cập nhật từ bản dùng token trong bộ nhớ, người dùng cần đăng nhập lại một lần.
- API `/api/stories` lưu tin văn bản, ảnh và video thật vào database, lấy tác giả từ phiên đăng nhập và đặt thời hạn 24 giờ ở backend. Danh sách loại tin hết hạn, tác giả bị khóa và tài khoản đã chặn hai chiều. Tin văn bản tối đa 1.000 ký tự, ảnh tối đa 10 MB, video tối đa 28 MB trên giao diện.
- `npm run lint` kiểm tra toàn bộ TypeScript/TSX, bao gồm quy tắc React Hooks. Frontend dùng TypeScript 6.0 để tương thích phạm vi phiên bản được `typescript-eslint` hỗ trợ; backend tiếp tục dùng TypeScript 7. `npm run ci` chạy lint, typecheck, build backend, test và build frontend.
- Cấu hình sửa trong `vercel.json` chuyển rewrite `/api/*` tới `https://heartconnect-api.vercel.app/api/*`; cần cấu hình CA và deploy để áp dụng. Bản Render cũ trả `/api/health` 200 nhưng các API truy vấn database trả 500; kiểm tra health phải có `apiVersion: 2` và đúng commit. PostgreSQL Aiven cần biến `DATABASE_SSL_CA` chứa CA certificate của project: thiếu CA sẽ gây `SELF_SIGNED_CERT_IN_CHAIN` và backend mới trả 503. Tải CA ở **Aiven → pg-heartconnect → Overview → CA Certificate**; không tắt kiểm tra TLS để bỏ qua lỗi. Có thể kiểm tra CA trước bằng `node scripts/configure-database-ca.cjs <đường-dẫn-ca.pem>`, thêm `--apply` để cập nhật CA đã kiểm tra lên backend Vercel rồi redeploy backend và frontend.

## Thanh toán QR ngân hàng và quyền Premium

- Cấu hình `backend/.env` theo `backend/.env.example`, đặt `PAYMENT_MODE=sandbox` và `BACKEND_URL` trỏ đến backend công khai khi nhận callback/IPN. VNPay/MoMo dùng thông tin merchant sandbox; Stripe dùng `sk_test_...`; PayPal dùng tài khoản sandbox.
- VNPay: đăng ký IPN `/api/payments/vnpay/ipn`. MoMo: đặt `MOMO_IPN_URL` thành `<BACKEND_URL>/api/payments/momo/ipn`. Stripe: đăng ký webhook `/api/payments/stripe/webhook` và cấu hình `STRIPE_WEBHOOK_SECRET`.
- Backend tự tạo mã đơn, lấy người mua từ phiên đăng nhập và quyết định giá test: 1 tháng **3.000đ**, 6 tháng **6.000đ**, 12 tháng **9.000đ**. Giao diện checkout luôn tải giá từ backend; không dùng giá cũ trong localStorage. PayPal dùng mức chuyển đổi cố định 25.000 VND/USD tại checkout.
- Phương thức **Chuyển qua ngân hàng (QR code)** thay VNPay trên giao diện. Mặc định `BANK_PAYMENT_MODE=direct`: mỗi gói dùng đúng ảnh từ link VietQR do chủ tài khoản cung cấp, nhận tại **BIDV · 96247MB07Y · TRAN DUC MINH**. Ba ảnh được lưu ở `frontend/public/payments/bidv-premium-*.png`, có dự phòng về URL gốc khi ảnh cục bộ không tải được. Không cần khóa merchant để hiển thị QR chuyển khoản trực tiếp.
- Với QR trực tiếp, người mua chuyển tiền thật bằng ứng dụng ngân hàng rồi nhập mã giao dịch trên biên lai. Đơn vẫn `PENDING`; nút “Tôi đã chuyển khoản” chỉ gửi thông tin đối soát. Tài khoản **ADMIN** vào **Quản trị → Doanh thu & Premium → Đối soát chuyển khoản QR**, kiểm tra người chuyển và tiền thực nhận trong sao kê BIDV, nhập mã giao dịch/số tiền rồi xác nhận để kích hoạt Premium. CENSOR và người mua không được duyệt. Vì nội dung QR dùng chung theo gói, không xác nhận chỉ dựa trên nội dung hoặc số tiền. Một mã giao dịch ngân hàng chỉ dùng cho một đơn; lưu người duyệt và thời điểm xác nhận.
- Có thể chuyển sang checkout tự động bằng `BANK_PAYMENT_MODE=sepay` và SDK `sepay-pg-node` ở backend. Cấu hình `SEPAY_ENV`, `SEPAY_MERCHANT_ID`, `SEPAY_SECRET_KEY` trong môi trường backend; local dùng `backend/.env.local` (được Git bỏ qua). Không đưa secret vào biến `VITE_*` hoặc mã React. SePay sandbox không chuyển tiền thật; muốn checkout nhận tiền thật phải dùng `SEPAY_ENV=production` cùng merchant/key production. Backend từ chối dùng bộ khóa test trong production. Đơn lưu chế độ/môi trường riêng, nên IPN sandbox không duyệt đơn QR trực tiếp.
- Với chế độ `sepay`, đăng ký IPN `https://heartconnect-qa29.onrender.com/api/payments/sepay/ipn` ở **SePay → Cổng thanh toán → Cấu hình → IPN**, chọn xác thực `SECRET_KEY`. Đặt cùng giá trị cho `SEPAY_IPN_SECRET` ở backend và mục IPN; nếu không đặt riêng, cần cấu hình IPN dùng merchant secret. Backend kiểm tra đơn, VND, số tiền và giao dịch ngân hàng đã duyệt qua API SePay; callback gửi lại không cộng Premium lần nữa. IPN của Cổng thanh toán này không xác nhận ba QR trực tiếp.
- `FRONTEND_URL` ở backend cần là URL frontend công khai (production hiện tại: `https://heartconnect.vercel.app`) để SePay đưa khách về đúng trang kết quả. Phương thức khác chưa có khóa production sẽ hiển thị chưa khả dụng.
- Logo ngân hàng, MoMo, Visa, Mastercard và PayPal được phục vụ từ `frontend/public/payments`, không phụ thuộc vào CDN khi người dùng mở checkout.
- Chỉ giao dịch đã được backend xác nhận mới kích hoạt Premium. Mua thêm cộng tiếp thời hạn còn lại; đối soát hoặc callback gửi lại không cộng thời hạn lần nữa. Checkout SePay thiếu khóa thanh toán sẽ báo lỗi cấu hình.
- Mọi gói có tích xanh Premium và quyền đổi logo ứng dụng riêng tại **Cài đặt**. Hai quyền này hết hiệu lực khi gói hết hạn; xác minh danh tính được quản lý riêng.
- Tên hiển thị (họ/tên) và username có thời gian chờ riêng 7 ngày sau mỗi lần thay đổi thực sự. Lưu giá trị cũ hoặc sửa thông tin khác không đặt lại thời gian chờ.
- Backend bổ sung các cột mới bằng migration cộng thêm khi khởi động; không cần tạo lại database.

Tài liệu cổng thanh toán: [VNPay](https://sandbox.vnpayment.vn/apis/docs/thanh-toan-pay/pay.html), [MoMo](https://developers.momo.vn/v3/docs/payment/api/wallet/onetime/), [Stripe](https://docs.stripe.com/checkout/fulfillment), [PayPal](https://developer.paypal.com/api/rest/integration/orders-api).

## Thuật toán Match và Discover

Triển khai theo `Data Analysis/THUẬT TOÁN HEARTCONNECT.docx`: Jaccard, điểm hai chiều với trọng số 40/30/20/10 và trung bình điều hòa; match chỉ tạo khi hai người cùng thích. Discover có bộ lọc hai chiều, phiên phân trang ổn định và ghi nhận hồ sơ thực sự được hiển thị.

Xem [chi tiết triển khai và cách kiểm thử](Data%20Analysis/HEARTCONNECT_IMPLEMENTATION.md). Khởi động lại backend để bổ sung schema; chạy `npm test` trong `backend` để kiểm tra trên database trong bộ nhớ.

## Repository GitHub và triển khai

- Frontend Vercel và backend Render được triển khai riêng. Push thành công hoặc `/api/health` trả 200 chưa chứng minh backend đã cập nhật. Backend mới trả `apiVersion: 2` và `commit` (SHA từ `RENDER_GIT_COMMIT`) trong health; health trả 503 cho tới khi database và migration sẵn sàng.
- Repository hiện tại là [trminh-developer/heartconnect trên GitHub](https://github.com/trminh-developer/heartconnect.git). Với service Render hiện có `heartconnect-qa29`, đổi liên kết repository sang URL này, branch `main`, Node.js 22. Nếu dùng runtime Node với Root Directory ở gốc repo: Build Command là `npm ci --include=dev --prefix frontend && npm ci --include=dev --prefix backend && npm run ci`; Start Command là `npm start --prefix backend`; Health Check Path là `/api/health`. Bộ test backend kiểm tra cả phần ánh xạ profile của frontend nên cần cài dependencies ở cả hai thư mục. Giữ các biến môi trường database, JWT và thanh toán trong Render.
- Bản demo dùng dữ liệu mock SQLite, không cần Aiven. Trong **Render → Environment**, đặt `NODE_ENV=production`, `USE_MOCK_DB=true`, `SQLITE_STORAGE=/tmp/heartconnect.sqlite`; có thể xóa `DATABASE_URL` cũ. Mock được ưu tiên ngay cả trong production và khi còn URL MySQL cũ. Database SQLite mới tự nạp dữ liệu từ `backend/Database/*.json` khi khởi động. File trong `/tmp` là dữ liệu tạm, sẽ mất khi Render Free deploy lại, khởi động lại hoặc cho service ngủ; dữ liệu JSON được nạp lại vào database mới ([Render Free](https://render.com/docs/free#local-files-lost-on-redeploy)). Nếu Root Directory hiện tại là `backend`, dùng Build Command `npm ci --include=dev && node ../scripts/prepare-ci.cjs && npm run build` và Start Command `npm start`.
- Khi deploy không có file `.env` local, backend vẫn mặc định dùng SQLite mock; URL Aiven cũ trong môi trường không tự bật MySQL. Mặc định production lưu `heartconnect.sqlite` trong thư mục tạm của hệ điều hành để nạp dữ liệu JSON mới; local giữ database trong `backend/Database`. Chỉ bật MySQL khi đặt rõ `USE_MOCK_DB=false` hoặc `DATABASE_TYPE=mysql` cùng `DATABASE_URL`.
- `render.yaml` cung cấp cấu hình Blueprint cho service này: runtime Node, plan Free, tự deploy nhánh `main`, chạy toàn bộ CI trước khi khởi động và bật SQLite mock. Giữ nguyên `JWT_SECRET`/`REFRESH_SECRET` từ service cũ; các biến `sync: false` được nhập trong Render, không ghi vào repository. Nếu cần tạo service thay thế, đổi tên service trong Blueprint; chỉ cập nhật rewrite API của Vercel sau khi URL backend mới vượt qua kiểm tra triển khai. Tham khảo [Render Blueprint](https://render.com/docs/blueprint-spec).
- Sau khi backend và frontend deploy, chạy `npm run smoke:deployment -- https://heartconnect.vercel.app <SHA-commit-backend>`. Lệnh kiểm tra các API công khai, các route có xác thực và phiên bản backend; trả mã lỗi nếu route còn 404 hoặc backend cũ. Các request ghi dùng phiên chưa đăng nhập và phải bị chặn 401, không tạo dữ liệu thật.

- `.gitlab-ci.yml` là cấu hình CI dành cho GitLab còn lưu trong repository. Bộ kiểm tra chung `npm run ci` kiểm tra ESLint và TypeScript frontend, build backend, chạy toàn bộ test backend bằng SQLite trong bộ nhớ rồi build frontend; lệnh này tiếp tục được dùng khi build trên Vercel và trong Blueprint Render.
- `allowScripts` trong mỗi `package.json` cho phép các script cài đặt cần thiết ở đúng phiên bản đã khóa (như SQLite và esbuild) khi dùng npm mới. Khi nâng phiên bản các package này, cập nhật mục tương ứng cùng lockfile.
- `scripts/prepare-ci.cjs` kiểm tra SQLite trước khi chạy test. Nếu binary tải sẵn yêu cầu glibc mới hơn máy CI Linux, script biên dịch lại SQLite bằng `node-gyp` trên chính máy đó; cần Python và bộ biên dịch C++.
- Trong Vercel, kết nối project `heartconnect` với repository GitHub `trminh-developer/heartconnect`: push vào `main` tạo bản production; các nhánh khác tạo bản preview. `vercel.json` ở gốc chạy cùng lệnh `npm run ci` trước mỗi deployment, nên lỗi typecheck, test hoặc build sẽ chặn bản deploy đó.
- Cấu hình project Vercel: **Root Directory** để trống (gốc repository), **Framework Preset** là Vite, **Node.js Version** là 24.x, **Production Branch** là `main`. Install Command và Build Command lấy từ `vercel.json`; Output Directory là `frontend/dist`. Không chuyển Root Directory sang `frontend`, vì bộ kiểm tra cần cả backend.
- Đặt `VITE_API_URL=/api` cho cả Production và Preview trong Vercel. API được proxy sang backend Render qua rewrite hiện có; CI không khởi động server production và không dùng database thật.
- Xem kết quả tại **Vercel → Deployments → Build Logs** và log triển khai của service backend trên Render.

Chạy cùng bộ kiểm tra ở máy local từ gốc repository:

```bash
npm ci --include=dev --prefix frontend
npm ci --include=dev --prefix backend
npm run ci
```

Tham khảo: [Vercel for GitHub](https://vercel.com/docs/git/vercel-for-github), [Vercel Build Configuration](https://vercel.com/docs/builds/configure-a-build).

## Lưu hồ sơ và database production

- Website Vercel gửi `/api` tới service Render `heartconnect-qa29`. Các biến database phải được cấu hình trên **service backend Render**; `backend/.env.local` chỉ áp dụng ở máy phát triển, còn `VITE_*` không được chứa thông tin kết nối DB.
- SQLite ở thư mục tạm của Render Free bị mất khi service restart, redeploy hoặc spin down. Production cần một database ngoài service, ví dụ PostgreSQL Aiven. Đặt `USE_MOCK_DB=false`, `DATABASE_TYPE=postgres`, `REQUIRE_PERSISTENT_DB=true`, `DATABASE_URL` và `DATABASE_SSL_CA` trong Environment của Render. `DATABASE_SSL_CA_FILE` là lựa chọn thay thế nếu CA được cung cấp dưới dạng secret file. [Lưu trữ trên Render Free](https://render.com/docs/free#local-files-lost-on-redeploy), [kết nối Aiven với Node.js](https://aiven.io/docs/products/postgresql/howto/connect-node).
- Trước khi chuyển DB, sao lưu SQLite đang chạy và database đích; đối chiếu hoặc di chuyển tài khoản, hồ sơ và dữ liệu liên quan. Không dùng seed demo để thay thế hồ sơ người dùng. Kiểm tra Aiven đang hoạt động và chấp nhận kết nối, rồi xác minh TLS bằng CA đúng dự án. Có thể chạy `node scripts/configure-database-ca.cjs backend/aiven-ca.pem` để kiểm tra từ máy local; lệnh này không thay đổi dữ liệu khi không có `--apply`.
- Áp dụng đủ các biến trên trước khi triển khai nhánh này. Backend sẽ báo lỗi cấu hình khi đã yêu cầu DB ngoài nhưng thiếu URL; khi `REQUIRE_PERSISTENT_DB=true`, backend từ chối SQLite demo. Không bật cờ này trên service đang thiếu thông tin DB vì service sẽ không khởi động được.
- Sau triển khai, `/api/health` phải trả `database: postgres`. Lưu một thay đổi hồ sơ, đọc lại qua `/api/auth/me`, rồi restart backend và đọc lại lần nữa. Chỉ xác nhận chuyển DB hoàn tất khi dữ liệu vẫn còn. Bộ test có kiểm tra độc lập việc API ghi hồ sơ xuống file DB và đọc lại từ tiến trình backend mới.

## Gọi thoại và video

- Mở Tin nhắn, chọn cuộc trò chuyện rồi bấm Gọi thoại/Gọi video. Hai tài khoản đăng nhập độc lập dùng cùng URL `/call/:callId` khi người nhận trả lời. Chỉ người trong cuộc trò chuyện hiện có được gọi và trao đổi tín hiệu; kiểm tra tài khoản bị khóa, chặn và máy bận ở backend.
- Cuộc gọi dùng microphone/camera thật qua WebRTC. Chỉ hiện đã kết nối khi peer connection kết nối thành công. Tắt mic/camera điều khiển media track; kết thúc ở một bên dừng cả hai bên và giải phóng thiết bị. Tải lại trang kết thúc kết nối cũ, có thể gọi lại từ Tin nhắn.
- Ứng dụng gửi heartbeat mỗi 10 giây theo từng tab. Offline được xác định sau tối đa 35 giây không có heartbeat; đóng tab gửi yêu cầu xóa presence. Người gọi vẫn nghe tiếng tút khi người nhận offline; người online nhận hộp thoại và chuông. Không trả lời trong 45 giây thì cuộc gọi chuyển sang không có người trả lời. Trình duyệt có thể yêu cầu một lần chạm để cho phép phát chuông.
- Backend đã có các API yêu cầu đăng nhập: `POST /api/calls`, `GET /api/calls/incoming`, `GET /api/calls/:callId`, `POST /api/calls/:callId/accept`, `POST /api/calls/:callId/end`, `POST /api/calls/:callId/signals`, `POST/DELETE /api/calls/presence`, `GET /api/calls/config`. Xem nhóm **Calls** tại `/docs`; SDP/ICE chỉ cấp cho hai bên và bị xóa khi kết thúc.
- Trình duyệt cần HTTPS (hoặc localhost) và quyền microphone/camera. STUN được cấu hình sẵn. Để nối qua các mạng di động/NAT/firewall hạn chế, cung cấp relay TURN của bạn bằng `TURN_URLS` và `TURN_SHARED_SECRET` ở backend hosting; API cấp thông tin xác thực một giờ, shared secret không gửi xuống client. Có thể dùng `TURN_USERNAME`/`TURN_CREDENTIAL` từ nhà cung cấp thay cho shared secret. Không cấu hình các khóa này trong `VITE_*`. [Hướng dẫn kết nối WebRTC](https://webrtc.org/getting-started/peer-connections).

## 🌟 Tác Giả

- Phát triển bởi: **MQV**
- Người sáng lập: **Trần Đức Minh**
- Đồng sáng lập: **Trần Quốc Việt - Đỗ Trúc Quỳnh**

Cảm ơn bạn đã quan tâm đến dự án này! 🎉
