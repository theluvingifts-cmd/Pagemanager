# CRM khách hàng v1

Module này chỉ chịu trách nhiệm dữ liệu CRM nằm cạnh hội thoại Messenger:
- người phụ trách
- nhu cầu/sản phẩm
- giá trị đơn dự kiến
- điện thoại/email/địa chỉ
- lịch follow-up
- lịch sử thay đổi CRM ngắn gọn

Dữ liệu hiện được lưu trong `users/{uid}.messengerContacts[pageId_customerId].crm` để không cần đổi Firestore Rules ở bản v1.
Automation vẫn nằm trong `features/messenger`; CRM không tự gửi tin.
