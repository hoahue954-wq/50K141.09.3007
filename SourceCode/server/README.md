# Backend — Hệ thống Quản lý Bán hàng Tạp hóa Hằng

REST API xây dựng bằng Node.js, Express, TypeScript, Prisma/PostgreSQL và Supabase Auth. API dùng tiền tố `/api`, trả JSON trực tiếp (không envelope), field `snake_case`; lỗi có `message` và `code`.

## Kiến trúc

```text
src/
  routes/         Khai báo endpoint và gắn xác thực/phân quyền
  controllers/    Đọc, kiểm tra đầu vào và trả response
  services/       Business rules, chuyển đổi DTO
  repositories/   Truy vấn Prisma và transaction
  middlewares/    Xác thực, RBAC, validation, xử lý lỗi
  validators/     Zod schema cho body/query
  config/         Env, Prisma, Supabase, lưu ảnh minh chứng
  types/          Kiểu xác thực và profile
  utils/          Lỗi, thời gian, quy tắc dùng chung
prisma/
  schema.prisma
  migrations/
  seed.ts
tests/            Node test runner; test service/repository dùng mock
```

Controller là lớp mỏng; nghiệp vụ nằm trong service, truy vấn/transaction nằm trong repository. Supabase Auth quản lý danh tính; profile và role được lưu trong PostgreSQL.

## Yêu cầu hệ thống

- Node.js 20.19 trở lên.
- npm.
- Project Supabase có PostgreSQL và Auth.
- Bucket Supabase Storage riêng tư cho ảnh minh chứng phiếu hủy/đổi trả.

## Cài đặt và chạy

Chạy lệnh từ thư mục `server/`.

1. Tạo project Supabase, lấy URL/key trong Project Settings và connection string PostgreSQL.
2. Sao chép `.env.example` thành `.env`, điền giá trị phù hợp. Không commit `.env`.
3. Cài package và tạo Prisma Client:

   ```powershell
   npm.cmd install
   npm.cmd run prisma:generate
   ```

4. Áp dụng schema:

   ```powershell
   # Môi trường phát triển: tạo migration khi schema thay đổi
   npm.cmd run prisma:migrate -- --name init

   # Môi trường đã có migration: chỉ áp dụng migration đã commit
   npx.cmd prisma migrate deploy
   ```

5. Tạo tài khoản seed và dữ liệu mẫu:

   ```powershell
   npm.cmd run seed
   ```

6. Chạy API:

   ```powershell
   npm.cmd run dev
   ```

   Health check public: `GET http://localhost:3000/api/health`.

PowerShell trên một số máy có thể chặn script shim của npm/npx; dùng `npm.cmd` và `npx.cmd` như các lệnh trên. Nếu Prisma Client generate gặp `EPERM`, hãy dừng server backend trước rồi chạy `npm.cmd run prisma:generate`.

Các lệnh dự án:

| Lệnh | Mục đích |
|---|---|
| `npm.cmd run prisma:generate` | Sinh Prisma Client |
| `npm.cmd run prisma:migrate -- --name <ten_migration>` | Tạo và áp dụng migration trong môi trường phát triển |
| `npx.cmd prisma migrate deploy` | Áp dụng migration đã commit |
| `npm.cmd run seed` | Tạo/upsert role, tài khoản mẫu, danh mục và dữ liệu demo |
| `npm.cmd run dev` | Chạy API với chế độ watch |
| `npm.cmd run build` | TypeScript build vào `dist/` |
| `npm.cmd start` | Chạy build từ `dist/` |
| `npm.cmd test` | Build và chạy toàn bộ Node tests |
| `npm.cmd run typecheck` | Typecheck, không phát sinh build |
| `npx.cmd prisma validate` | Kiểm tra schema Prisma |

### Cấu hình môi trường

| Biến | Ý nghĩa |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string duy nhất được Prisma schema hiện tại đọc. Supabase direct/session pooler thường dùng cổng `5432`; transaction pooler thường dùng `6543`. Dùng connection string tương ứng với chế độ mạng của môi trường; ưu tiên direct hoặc session pooler cho migration. |
| `SUPABASE_URL` | URL project Supabase, dùng bởi server và seed. |
| `SUPABASE_ANON_KEY` | Public anon key dùng cho Supabase client server-side; không phải service-role key. |
| `SUPABASE_SERVICE_ROLE_KEY` | Secret server-side dùng cho seed qua Supabase Admin API **và** upload/xem ảnh minh chứng trong Storage. Tuyệt đối không đưa vào `web/`, response API hoặc repository. |
| `EVIDENCE_STORAGE_BUCKET` | Bucket Storage riêng tư cho ảnh minh chứng; mặc định `slip-evidence`. |
| `SEED_OWNER_EMAIL`, `SEED_OWNER_PASSWORD` | Email/mật khẩu seed cho tài khoản OWNER. |
| `SEED_STAFF_EMAIL`, `SEED_STAFF_PASSWORD` | Email/mật khẩu seed cho tài khoản STAFF. |
| `PORT` | Cổng Express; mặc định `3000`. |
| `FRONTEND_ORIGINS` | Danh sách origin frontend được CORS cho phép, phân cách bằng dấu phẩy; mặc định `http://localhost:5173`. |
| `DEFAULT_MIN_STOCK` | Tồn tối thiểu mặc định nếu sản phẩm chưa có ngưỡng; mặc định `5`. |

Schema không khai báo hoặc đọc `DIRECT_URL`; chỉ dùng `DATABASE_URL`. Connection string Supabase và các secret không nên lưu trong tài liệu hoặc commit.

### Tài khoản seed

Email mẫu trong `.env.example`:

- OWNER: `owner@taphoahang.local`
- STAFF: `staff@taphoahang.local`

Seed sử dụng email/mật khẩu từ các biến `SEED_*`; nếu bạn thay email trong `.env`, hãy đăng nhập bằng email đã cấu hình. Hãy đặt mật khẩu riêng, đủ mạnh trước khi chạy seed. Seed không in mật khẩu.

## API và phân quyền

Trừ `GET /api/health`, các endpoint dưới đây yêu cầu Supabase access token dạng `Authorization: Bearer <token>`. OWNER và STAFF đều là người dùng đã xác thực; `—` nghĩa là role không được phép.

### Xác thực, sản phẩm và danh mục

| Method | URL | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/health` | Public | Health check |
| GET | `/api/auth/me` | OWNER, STAFF | Profile của access token |
| GET | `/api/categories` | OWNER, STAFF | Danh sách; hỗ trợ `search` |
| GET | `/api/categories/:id` | OWNER, STAFF | Chi tiết danh mục |
| POST | `/api/categories` | OWNER | Tạo; `code` tùy chọn, tự sinh nếu bỏ trống |
| PUT | `/api/categories/:id` | OWNER | Sửa danh mục |
| DELETE | `/api/categories/:id` | OWNER | Xóa nếu danh mục không còn sản phẩm |
| GET | `/api/products` | OWNER, STAFF | Danh sách; hỗ trợ `search`, `category_id`; STAFF không nhận `cost_price` |
| GET | `/api/products/:barcode` | OWNER, STAFF | Chi tiết theo mã vạch |
| POST | `/api/products` | OWNER | Tạo sản phẩm; `cost_price` và `selling_price` bắt buộc, phải dương |
| PUT | `/api/products/:barcode` | OWNER | Cập nhật; `cost_price` bắt buộc và phải dương |
| DELETE | `/api/products/:barcode` | OWNER | Ngừng kinh doanh; từ chối nếu đã được tham chiếu bởi hóa đơn |

### Bán hàng, hóa đơn, khách hàng và dashboard

| Method | URL | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/invoices` | OWNER, STAFF | Bán hàng; giá lấy từ DB, hỗ trợ `CASH`, `TRANSFER`, `DEBT`; tồn và log giao dịch được cập nhật nguyên tử |
| GET | `/api/invoices` | OWNER, STAFF | Danh sách; lọc `date` (giờ VN), `status`, `payment_method`, `search`; `page`/`limit` tùy chọn |
| GET | `/api/invoices/code/:code` | OWNER, STAFF | Tìm hóa đơn theo mã |
| GET | `/api/invoices/:id` | OWNER, STAFF | Chi tiết hóa đơn và dòng hàng |
| PATCH | `/api/invoices/:id/status` | OWNER | Gạch nợ toàn phần; yêu cầu phương thức và số tiền thanh toán đủ dư nợ |
| POST | `/api/invoices/:id/settle` | OWNER | Alias gạch nợ toàn phần tương thích frontend |
| DELETE | `/api/invoices/:id` | OWNER | Xóa mềm và hoàn tồn; từ chối hóa đơn đã có nợ hoặc phiếu đổi/trả |
| GET | `/api/customers` | OWNER, STAFF | Tìm tên/SĐT (`search`), lọc khách quen (`is_regular`, `type`) |
| POST | `/api/customers` | OWNER, STAFF | Tạo/chọn khách hàng |
| GET | `/api/customers/:id/debt` | OWNER, STAFF | Chi tiết công nợ và lịch sử |
| GET | `/api/debts` | OWNER, STAFF | Khách còn dư nợ; lọc `search`, phân trang |
| POST | `/api/debts` | OWNER, STAFF | Ghi nhận khoản nợ cho khách quen |
| POST | `/api/debts/payments` | OWNER | Thanh toán một phần/toàn phần; phân bổ hóa đơn cũ nhất trước |
| GET | `/api/dashboard` | OWNER, STAFF | OWNER: doanh thu/ngày, hóa đơn mới, bán chạy tuần; STAFF: tóm tắt ca theo hóa đơn của chính mình |
| GET | `/api/reports/dashboard` | OWNER, STAFF | Alias dashboard để tương thích frontend |

### Nhập hàng và kho

| Method | URL | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/purchase-orders` | OWNER, STAFF | Lập phiếu `saved`; chưa đổi tồn. STAFF response không có giá nhập |
| GET | `/api/purchase-orders` | OWNER, STAFF | Danh sách; STAFF chỉ xem phiếu mình lập, không nhận giá nhập |
| GET | `/api/purchase-orders/:id` | OWNER, STAFF | Chi tiết; STAFF chỉ xem phiếu mình lập, không nhận giá nhập |
| PATCH, PUT | `/api/purchase-orders/:id` | OWNER | Sửa phiếu `saved`; PUT tương thích frontend |
| POST | `/api/purchase-orders/:id/complete` | OWNER | Duyệt một lần; cộng tồn, cập nhật giá nhập mới nhất, ghi `IMPORT` |
| DELETE | `/api/purchase-orders/:id` | OWNER | Xóa mềm phiếu chưa hoàn thành |
| GET | `/api/inventory` | OWNER, STAFF | Tồn kho; lọc `search`, `category_id`; STAFF không nhận giá vốn |
| GET | `/api/inventory/stats` | OWNER, STAFF | Alias frontend; `{ products, lowStockProducts, outOfStockProducts }` |
| GET | `/api/inventory/low-stock` | OWNER | Sản phẩm dưới ngưỡng, hết hàng trước |
| GET | `/api/inventory/transactions` | OWNER | Lịch sử tồn; lọc sản phẩm, loại, ngày VN; phân trang |

### Hủy hàng và đổi/trả hàng

`/api/disposal-slips` là alias của `/api/disposals`; `/api/return-slips` là alias của `/api/returns`.

| Method | URL | Quyền | Mô tả |
|---|---|---|---|
| POST | `/api/disposals` (`/api/disposal-slips`) | OWNER, STAFF | Tạo phiếu `pending`; yêu cầu lý do, minh chứng và mặt hàng |
| GET | `/api/disposals` (`/api/disposal-slips`) | OWNER, STAFF | Danh sách; STAFF chỉ xem phiếu do mình lập |
| GET | `/api/disposals/:id` (`/api/disposal-slips/:id`) | OWNER, STAFF | Chi tiết; STAFF không nhận giá vốn/giá trị hủy |
| PATCH, PUT | `/api/disposals/:id` (`/api/disposal-slips/:id`) | OWNER | Sửa phiếu `pending` |
| DELETE | `/api/disposals/:id` (`/api/disposal-slips/:id`) | OWNER | Xóa mềm phiếu `pending` |
| POST | `/api/disposals/:id/approve` | OWNER | Duyệt; trừ tồn và ghi `DISPOSAL` |
| POST | `/api/disposals/:id/reject` | OWNER | Từ chối phiếu |
| POST | `/api/returns` (`/api/return-slips`) | OWNER, STAFF | Tạo phiếu đổi/trả `pending`; hóa đơn trong 24 giờ, có lý do, minh chứng |
| GET | `/api/returns` (`/api/return-slips`) | OWNER, STAFF | Danh sách; STAFF chỉ xem phiếu do mình lập |
| GET | `/api/returns/:id` (`/api/return-slips/:id`) | OWNER, STAFF | Chi tiết |
| PATCH | `/api/returns/:id` (`/api/return-slips/:id`) | OWNER | Sửa phiếu `pending` |
| DELETE | `/api/returns/:id` (`/api/return-slips/:id`) | OWNER | Xóa mềm phiếu `pending` |
| POST | `/api/returns/:id/approve` | OWNER | Duyệt; cộng hàng trả, trừ hàng đổi và ghi biến động tồn |
| POST | `/api/returns/:id/reject` | OWNER | Từ chối phiếu |

### Báo cáo

Chỉ OWNER được truy cập. Ngày và khoảng ngày được diễn giải theo `Asia/Ho_Chi_Minh`; tuần bắt đầu thứ Hai. Hóa đơn xóa mềm không được tính.

| Method | URL | Quyền | Mô tả |
|---|---|---|---|
| GET | `/api/reports/revenue?from=YYYY-MM-DD&to=YYYY-MM-DD&group_by=day\|week\|month` | OWNER | Doanh thu, số hóa đơn và cơ cấu thanh toán |
| GET | `/api/reports/profit?from=YYYY-MM-DD&to=YYYY-MM-DD&group_by=day\|week\|month` | OWNER | Lợi nhuận dùng snapshot giá vốn tại thời điểm bán |
| GET | `/api/reports/daily?date=YYYY-MM-DD` | OWNER | Adapter shape camelCase tương thích frontend |
| GET | `/api/reports/monthly?year=YYYY&month=M` | OWNER | Adapter shape camelCase; gồm chi phí và sản phẩm bán ra |

### Chưa hỗ trợ

Frontend hiện có các lời gọi sau nhưng backend chưa cung cấp endpoint tương ứng; các lời gọi thật sẽ nhận 404:

- `PUT /api/customers/:id` và `DELETE /api/customers/:id`.
- Các endpoint `/api/expenses` (GET/POST/DELETE).
- `GET /api/settings`, `PUT /api/settings`.
- `GET /api/accounts`, `POST /api/accounts`, `POST /api/accounts/:id/toggle-lock`.
- `GET /api/audit-logs`.
- API sửa hóa đơn.

Không có thay đổi bổ sung các API này trong phạm vi rà soát hiện tại.

## Mô hình dữ liệu tóm tắt

- `Role` 1-n `Profile`; `Profile` liên kết với người lập/duyệt giao dịch và audit.
- `Category` 1-n `Product`; sản phẩm giữ giá nhập, giá bán, tồn hiện tại và trạng thái kinh doanh.
- `Customer` 1-n `Invoice`/`DebtRecord`; hóa đơn 1-n `InvoiceDetail`, có thể có một bản ghi công nợ.
- `PurchaseOrder` 1-n `PurchaseOrderItem`; hoàn thành phiếu tạo giao dịch nhập kho.
- `DisposalSlip` 1-n `DisposalItem`; `ReturnSlip` 1-n `ReturnItem`, liên kết hóa đơn gốc.
- `InventoryTransaction` lưu các biến động `SALE`, `IMPORT`, `DISPOSAL`, `RETURN`, `ADJUSTMENT`.
- `DebtPayment` ghi lịch sử thanh toán; `Expense`, `StoreSettings`, `AuditLog` phục vụ vận hành/báo cáo.
- Các bảng có snake_case trong PostgreSQL; tên model trong Prisma là PascalCase.

## Mã lỗi thường gặp

Response lỗi có dạng `{ "message": "...", "code": "..." }`; validation có thể kèm `details`.

| HTTP | `code` | Ý nghĩa |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Body/query không hợp lệ |
| 401 | `AUTH_REQUIRED`, `AUTH_INVALID` | Thiếu hoặc access token không hợp lệ |
| 403 | `FORBIDDEN`, `ACCOUNT_LOCKED`, `PROFILE_NOT_FOUND` | Thiếu quyền hoặc tài khoản không được phép |
| 404 | `PRODUCT_NOT_FOUND`, `INVOICE_NOT_FOUND`, `CUSTOMER_NOT_FOUND`, `NOT_FOUND` | Không tìm thấy đối tượng |
| 409 | `INSUFFICIENT_STOCK` | Tồn không đủ; có chi tiết sản phẩm |
| 409 | `DUPLICATE_RESOURCE`, `PRODUCT_NAME_EXISTS`, `PRODUCT_BARCODE_EXISTS`, `CATEGORY_NAME_EXISTS` | Dữ liệu trùng |
| 409 | `INVOICE_HAS_DEBT`, `INVOICE_HAS_RETURNS`, `PAYMENT_EXCEEDS_DEBT` | Vi phạm trạng thái/nghiệp vụ |
| 500 | `INTERNAL_ERROR` | Lỗi không dự kiến; response không chứa stack trace |

## Kết nối frontend

Trong `web/.env` cấu hình `VITE_USE_MOCK=false`, `VITE_API_URL=http://localhost:3000/api`, cùng `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY` của cùng project. Frontend đăng nhập qua Supabase Auth rồi gửi access token tới backend. Chỉ dùng anon key ở frontend; không bao giờ đưa `SUPABASE_SERVICE_ROLE_KEY` vào `web/`.

### Lưu ý khi nối frontend

- Payload tạo phiếu đổi/trả của frontend hiện không gửi `reason`, và `proof_image_url` được khai báo tùy chọn; API yêu cầu cả lý do lẫn minh chứng nên request hiện tại có thể bị `400`.
- `apiFetch` trong `web/src/api/client.ts` chỉ ném `Error(message)`, không giữ HTTP status hoặc `code`; UI không thể phân nhánh ổn định theo mã lỗi hiện tại.
- Dashboard STAFF trả `{ date, shift }`, khác shape thống kê dashboard OWNER và kiểu dữ liệu của `getDashboardStats()` trong frontend.
- Frontend mock có thể có dữ liệu/logic khác API thật; hãy kiểm thử với `VITE_USE_MOCK=false`.

## Khác biệt so với SRS

Các quyết định sau được giữ nguyên theo yêu cầu đã duyệt ở giai đoạn 5; không thay đổi trong đợt hoàn thiện này:

- Thời hạn đổi/trả là cửa sổ lăn 24 giờ kể từ thời điểm lập hóa đơn, không phải cùng ngày dương lịch Việt Nam. Lý do: giữ đúng quyết định nghiệp vụ đã chốt ở giai đoạn 5.
- Minh chứng là bắt buộc khi lập cả phiếu hủy và phiếu đổi/trả, kể cả OWNER. Lý do: thống nhất hợp đồng API/evidence storage đã triển khai ở giai đoạn 5.
- Phiếu hủy do OWNER lập vẫn ở trạng thái `PENDING`, phải duyệt riêng; không tự động duyệt.
- Chỉ OWNER được sửa/xóa phiếu hủy `PENDING`; STAFF không sửa/xóa qua API. Lý do: giữ nguyên phân quyền đã chốt ở giai đoạn 5.
- Có thanh toán công nợ một phần ngoài giả định SRS chỉ gạch nợ toàn bộ hóa đơn.

## Bảo mật và vận hành

- Không commit `.env`, access token, database URL hoặc service-role key. Hạn chế quyền truy cập file môi trường.
- Nếu key bị lộ, thu hồi/rotate key trong Supabase ngay; cập nhật secret ở backend/CI, khởi động lại dịch vụ và kiểm tra log/lịch sử commit. Không đưa key mới vào frontend.
- CORS chỉ cho các origin trong `FRONTEND_ORIGINS`; Helmet được bật.
- Tắt server backend trước khi chạy Prisma generate nếu Windows báo `EPERM`.

## Kiểm thử

`npm.cmd test` build các file TypeScript rồi chạy Node.js test runner. Test hiện tại dùng mock/adapters cho service và transaction helper; không cần PostgreSQL thật và không tự chạy trên dữ liệu seed. Để kiểm tra tích hợp trên DB riêng, cấu hình `.env` trỏ tới database thử nghiệm và chạy migration trước; không dùng database production cho test phá hủy dữ liệu.
