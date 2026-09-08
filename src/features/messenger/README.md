# Messenger feature structure

- `MessengerContext.tsx`: dữ liệu, cache, API calls, polling và actions. Đây là nơi duy nhất quản lý state Messenger.
- `types.ts`: toàn bộ type/interface.
- `constants.ts`: default config, tag, status, filter.
- `utils.ts`: format và template helpers.
- `components/ConversationList.tsx`: danh sách + tìm kiếm + lọc.
- `components/ChatPanel.tsx`: lịch sử chat + gửi text/file + tin mẫu.
- `components/CustomerPanel.tsx`: tag, note, trạng thái, công thức riêng.
- `components/AutomationModal.tsx`: rule, giờ hoạt động, template, test.
- `components/TemplateModal.tsx`: chọn tin nhắn mẫu.
- `components/Avatar.tsx`, `AttachmentView.tsx`: UI dùng lại.
- `pages/MessagesPage.tsx`: chỉ ghép các module, không chứa business logic.

## Cache
`MessengerProvider` nằm trên router pages nên chuyển tab không làm mất danh sách/hội thoại. Dữ liệu cache theo Page; quay lại tab sẽ hiện ngay dữ liệu cũ và chỉ refresh nền khi cache quá cũ.
