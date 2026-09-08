# Instagram feature

Module riêng cho Instagram Professional để tránh làm phình Messenger/Content.

- `InstagramContext.tsx`: cache theo Facebook Page, API state, tránh reload khi đổi tab.
- `components/InstagramOverview.tsx`: profile + chỉ số + bài gần đây.
- `components/InstagramMediaGrid.tsx`: danh sách bài Instagram.
- `components/InstagramCommentsPanel.tsx`: đọc/trả lời/xóa bình luận.
- `components/InstagramInboxPanel.tsx`: đọc và trả lời Instagram DM.
- Backend nằm riêng ở `server/routes/instagramRoutes.ts` và `server/services/meta/instagramService.ts`.
