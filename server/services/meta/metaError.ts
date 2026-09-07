export class MetaApiError extends Error {
  public type: string;
  public code: number;
  public subcode?: number;
  public fbtrace_id?: string;
  public userFriendlyMessage: string;

  constructor(
    message: string,
    type: string = 'MetaApiError',
    code: number = 0,
    subcode?: number,
    fbtrace_id?: string
  ) {
    super(message);
    this.name = 'MetaApiError';
    this.type = type;
    this.code = code;
    this.subcode = subcode;
    this.fbtrace_id = fbtrace_id;
    this.userFriendlyMessage = this.generateUserFriendlyMessage();
  }

  private generateUserFriendlyMessage(): string {
    // Check known Facebook Graph API error codes
    switch (this.code) {
      case 190:
        if (this.subcode === 463 || this.subcode === 467) {
          return 'Phiên đăng nhập Facebook hoặc Access Token đã hết hạn. Vui lòng kết nối lại tài khoản trong Cài đặt.';
        }
        return 'Access Token không hợp lệ hoặc đã bị vô hiệu hóa. Vui lòng kết nối lại Facebook Page.';
      case 200:
      case 283:
        return 'Ứng dụng chưa được cấp quyền quản lý bài đăng (`pages_manage_posts`) hoặc bạn không có vai trò Quản trị viên trên Page này.';
      case 10:
        return 'Ứng dụng không có quyền thực hiện hành động này. Hãy kiểm tra quyền nâng cao (Advanced Access) trong Meta Developer Dashboard.';
      case 100:
        return `Tham số gửi lên Graph API không hợp lệ: ${this.message}`;
      case 368:
        return 'Tài khoản Facebook hoặc Page tạm thời bị hạn chế đăng bài do chính sách an toàn của Meta.';
      case 506:
        return 'Nội dung bài viết trùng lặp với bài vừa đăng trên Page. Vui lòng thay đổi nội dung trước khi thử lại.';
      default:
        return `Lỗi Meta Graph API [Mã ${this.code}${this.subcode ? `:${this.subcode}` : ''}]: ${this.message}`;
    }
  }

  static fromGraphResponse(errorPayload: any): MetaApiError {
    const err = errorPayload?.error || errorPayload;
    return new MetaApiError(
      err?.message || 'Lỗi không xác định từ Meta Graph API',
      err?.type || 'OAuthException',
      err?.code || 0,
      err?.error_subcode,
      err?.fbtrace_id
    );
  }
}
