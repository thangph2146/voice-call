# Voice Call — Gemini AI Realtime WebRTC + shadcn/ui (Next.js starter)

Mô tả ngắn
---
Starter template cho ứng dụng Voice AI thời gian thực dùng Google Gemini AI và WebRTC, có giao diện được xây dựng bằng `shadcn/ui` và Tailwind CSS. Ứng dụng hỗ trợ nhận diện giọng nói tiếng Việt và phát lại bằng giọng nữ tiếng Việt tự nhiên.

Tính năng chính
---
- Giao tiếp âm thanh real-time qua WebRTC + Google Gemini AI
- Nhận diện giọng nói tiếng Việt với độ chính xác cao
- Phát lại phản hồi bằng giọng nữ tiếng Việt tự nhiên
- UI hiện đại với Tailwind CSS + shadcn/ui và animation
- Hook tách biệt logic WebRTC (kết nối, stream, signaling)
- Ví dụ gọi "tool" từ client (ví dụ: getCurrentTime, launchWebsite, copyToClipboard, ...)
- Hỗ trợ đa ngôn ngữ cho giao diện và agent
- Hệ thống logger toàn diện để debug

Yêu cầu
---
- Node.js (phiên bản 18+ khuyến nghị) hoặc Deno
- Biến môi trường `NEXT_PUBLIC_GEMINI_API_KEY` trong file `.env`

Cài đặt & chạy (Node.js)
---
1) Clone repo và vào thư mục project

```powershell
git clone <your-repo-url>
Set-Location 'openai-realtime-api-nextjs'
```

2) Tạo file môi trường

Tạo file `.env` ở gốc dự án và thêm:

```
NEXT_PUBLIC_GEMINI_API_KEY=your-gemini-api-key
```

*Lưu ý: Bạn có thể lấy Gemini API key từ [Google AI Studio](https://makersuite.google.com/app/apikey)*

3) Cài dependencies và chạy

```powershell
npm install
npm run dev
```

Mặc định ứng dụng sẽ chạy tại: `http://localhost:3000`.

Cài đặt & chạy (Deno)
---
Nếu bạn muốn dùng Deno, kiểm tra `deno.json` và dùng lệnh tương ứng (ví dụ `deno task start`).

Bảo mật / Quản lý secrets
---
- Không commit file `.env`. Thêm `/.env` vào `.gitignore` trước khi push.
- Nếu khóa API đã từng được commit, hãy xóa khỏi lịch sử với `git filter-repo` hoặc `bfg-repo-cleaner` (tôi có thể hướng dẫn nếu cần).

Triển khai nhanh (Vercel)
---
1) Tạo project trên Vercel và kết nối repository.
2) Thêm biến môi trường `NEXT_PUBLIC_GEMINI_API_KEY` trong phần Settings của Vercel.
3) Deploy — Vercel sẽ tự build và publish.

Gỡ rối nhanh
---
- Lỗi khi cài dependencies trên Windows (ví dụ `EPERM`): đóng VS Code/terminal, chạy terminal với quyền Administrator và thử `npm install` lại.
- Nếu WebRTC không kết nối: kiểm tra quyền Microphone, chạy trên HTTPS (Vercel hoặc localhost có TLS), và xem console trình duyệt/server để biết lỗi cụ thể.
- **Logger Panel**: Nhấn nút "Logs" ở góc dưới phải để xem logs chi tiết, debug speech recognition và các lỗi khác.
- **Speech Recognition**: Đảm bảo browser hỗ trợ Web Speech API (Chrome/Edge recommended), và cấp quyền microphone. Ứng dụng được tối ưu cho tiếng Việt (vi-VN).
- **Vietnamese Female Voice**: Ứng dụng tự động tìm và sử dụng giọng nữ tiếng Việt nếu có sẵn trong hệ thống. Nếu không tìm thấy, sẽ dùng giọng mặc định.
- **Gemini API**: Đảm bảo API key hợp lệ và có đủ quota. Kiểm tra logs để xem lỗi API cụ thể.

Tính năng mới
---
- **Logger System**: Hệ thống ghi log toàn diện với panel UI để debug
- **Speech Recognition**: Sử dụng Web Speech API để nhận diện giọng nói với hỗ trợ tối ưu cho tiếng Việt (vi-VN)
- **Vietnamese Female Voice**: Phát lại phản hồi AI bằng giọng nữ tiếng Việt tự nhiên với tốc độ và cao độ được tối ưu
- **Gemini AI Integration**: Sử dụng Google Gemini 2.0 Flash cho phản hồi AI thông minh và tự nhiên
- **Real-time Conversation**: Giao tiếp voice real-time với khả năng xử lý ngữ cảnh liên tục
- **Error Handling**: Xử lý lỗi toàn diện với fallback responses bằng tiếng Việt

Tài liệu & Acknowledgements
---
- Dự án gốc tham khảo: https://github.com/skrivov/openai-voice-webrtc-next
- OpenAI, Next.js, Tailwind CSS, shadcn/ui

License
---
MIT — xem file `LICENSE` trong repo để biết chi tiết.

Tiếp theo tôi có thể giúp:
- Thêm `.env.example` mẫu
- Cập nhật `.gitignore` nếu cần
- Viết hướng dẫn deploy chi tiết cho Vercel hoặc Netlify

Cho tôi biết bạn muốn bước nào tiếp theo.