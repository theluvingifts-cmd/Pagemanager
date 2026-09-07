import React, { useState } from 'react';
import {
  Facebook,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  ExternalLink,
  Power,
  Key,
  Database,
  Sliders,
  Radio,
  Plus,
  Trash2,
} from 'lucide-react';
import { useFacebook } from '../context/FacebookContext';
import { useAuth } from '../context/AuthContext';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();
  const {
    connectedPages,
    availablePages,
    selectedPage,
    setSelectedPage,
    hasConnection,
    loading,
    configStatus,
    connectFacebook,
    connectPage,
    disconnectPage,
    testPage,
    refreshPages,
  } = useFacebook();

  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [testingPageId, setTestingPageId] = useState<string | null>(null);
  const [connectingPageId, setConnectingPageId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const redirectUri = configStatus?.redirectUri || `${window.location.origin}/api/facebook/callback`;

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  const handleTestPage = async (pageId: string) => {
    setTestingPageId(pageId);
    setAlertMessage(null);
    const result = await testPage(pageId);
    setTestingPageId(null);

    if (result.success) {
      setAlertMessage({
        type: 'success',
        text: `Kết nối với Page "${result.message || 'thành công'}"! Quyền đăng bài: ${result.canPost ? 'Được phép (Active)' : 'Hạn chế'}`,
      });
    } else {
      setAlertMessage({
        type: 'error',
        text: result.error || 'Kiểm tra kết nối thất bại.',
      });
    }
  };

  const handleConnectPage = async (pageId: string) => {
    setConnectingPageId(pageId);
    setAlertMessage(null);
    const result = await connectPage(pageId);
    setConnectingPageId(null);

    if (result.success) {
      setAlertMessage({
        type: 'success',
        text: result.message || 'Đã kết nối Page thành công!',
      });
    } else {
      setAlertMessage({
        type: 'error',
        text: result.error || 'Lỗi kết nối Page',
      });
    }
  };

  const handleDisconnectPage = async (pageId: string) => {
    if (!window.confirm('Bạn có chắc muốn ngắt kết nối Page này khỏi Page Manager?')) return;
    setAlertMessage(null);
    const result = await disconnectPage(pageId);
    if (result.success) {
      setAlertMessage({
        type: 'success',
        text: 'Đã ngắt kết nối Page thành công.',
      });
    } else {
      setAlertMessage({
        type: 'error',
        text: result.error || 'Không thể ngắt kết nối Page',
      });
    }
  };

  return (
    <div className="space-y-8 pb-16 max-w-4xl">
      {/* Header */}
      <div>
        <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">
          Cài đặt & Kết nối Facebook
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Quản lý tích hợp Meta Graph API, danh sách Facebook Pages và trạng thái cơ sở dữ liệu thật.
        </p>
      </div>

      {/* Alert Banner */}
      {alertMessage && (
        <div
          className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
            alertMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {alertMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{alertMessage.text}</span>
          </div>
          <button
            onClick={() => setAlertMessage(null)}
            className="text-slate-400 hover:text-slate-600 font-bold px-1"
          >
            ✕
          </button>
        </div>
      )}

      {/* Section 1: Facebook Account Connection */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/20 shrink-0">
              <Facebook className="w-6 h-6 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">
                  Tài khoản Meta / Facebook
                </h3>
                {hasConnection ? (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                    Đã liên kết
                  </span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                    Chưa liên kết
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Cấp quyền cho Page Manager truy xuất danh sách Facebook Page và xuất bản bài viết
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={connectFacebook}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Facebook className="w-4 h-4 fill-white" />
              <span>{hasConnection ? 'Kết nối lại tài khoản' : 'Kết nối Facebook'}</span>
            </button>
            {hasConnection && (
              <button
                onClick={refreshPages}
                disabled={loading}
                title="Tải lại danh sách Page"
                className="p-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors cursor-pointer"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
              </button>
            )}
          </div>
        </div>

        {/* Managed Pages List */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Danh sách Facebook Pages ({availablePages.length})
            </h4>
            <span className="text-[11px] text-slate-400">
              Đã kích hoạt: {connectedPages.length} Page
            </span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Đang kiểm tra danh sách Page từ Meta...</span>
            </div>
          ) : availablePages.length === 0 ? (
            <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center bg-slate-50">
              <p className="text-xs font-bold text-slate-700">
                {hasConnection
                  ? 'Không tìm thấy Page nào trong tài khoản Facebook của bạn'
                  : 'Chưa có dữ liệu Facebook Page'}
              </p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                {hasConnection
                  ? 'Hãy đảm bảo tài khoản Meta của bạn có vai trò Quản trị viên (Admin) hoặc Biên tập viên trên ít nhất một Facebook Page.'
                  : 'Nhấn nút "Kết nối Facebook" ở trên để đăng nhập và tải danh sách Page.'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden">
              {availablePages.map(page => {
                const isConnected = page.isConnected;
                const isTesting = testingPageId === page.page_id;
                const isConnecting = connectingPageId === page.page_id;
                const isCurrentSelected = selectedPage?.page_id === page.page_id;

                return (
                  <div
                    key={page.page_id}
                    className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {page.page_avatar_url ? (
                        <img
                          src={page.page_avatar_url}
                          alt={page.page_name}
                          className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-200 shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0">
                          {page.page_name.slice(0, 1)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h5 className="text-xs font-bold text-slate-900 truncate">
                            {page.page_name}
                          </h5>
                          {isConnected && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">
                              Đã kích hoạt
                            </span>
                          )}
                          {isCurrentSelected && (
                            <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200">
                              Đang dùng
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 font-mono">
                          ID: {page.page_id} {page.page_username ? `• @${page.page_username}` : ''}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      {isConnected ? (
                        <>
                          <button
                            type="button"
                            onClick={() => handleTestPage(page.page_id)}
                            disabled={isTesting}
                            className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isTesting ? 'Đang kiểm tra...' : 'Kiểm tra token'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDisconnectPage(page.page_id)}
                            className="px-2.5 py-1.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                          >
                            Ngắt kết nối
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConnectPage(page.page_id)}
                          disabled={isConnecting}
                          className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                        >
                          {isConnecting ? 'Đang kích hoạt...' : 'Kết nối Page này'}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Section 2: Meta App Developer Setup Instructions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Hướng dẫn cấu hình Meta Developer App
            </h3>
            <p className="text-xs text-slate-500">
              Các bước để lấy App ID, App Secret và khai báo OAuth Redirect URI trên Meta Developer
            </p>
          </div>
        </div>

        {/* Redirect URI Box */}
        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">
              Valid OAuth Redirect URI (Dán vào cài đặt Facebook Login for Business):
            </span>
            <button
              onClick={() => copyToClipboard(redirectUri)}
              className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 cursor-pointer"
            >
              {copiedRedirect ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-emerald-600">Đã chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép</span>
                </>
              )}
            </button>
          </div>
          <div className="p-2.5 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800 break-all select-all">
            {redirectUri}
          </div>
        </div>

        {/* Step-by-step checklist */}
        <div className="space-y-3 text-xs text-slate-600">
          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 mt-0.5">
              1
            </span>
            <div>
              <p className="font-bold text-slate-800">
                Truy cập Meta for Developers:
              </p>
              <p className="mt-0.5 text-slate-500">
                Vào{' '}
                <a
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 font-semibold hover:underline"
                >
                  developers.facebook.com/apps
                </a>{' '}
                và tạo ứng dụng mới (Loại ứng dụng: <strong>Doanh nghiệp</strong> hoặc <strong>Khác</strong>).
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 mt-0.5">
              2
            </span>
            <div>
              <p className="font-bold text-slate-800">
                Thêm sản phẩm Facebook Login:
              </p>
              <p className="mt-0.5 text-slate-500">
                Vào <strong>Facebook Login for Business</strong> &gt; <strong>Cài đặt</strong>, dán địa chỉ <strong>Valid OAuth Redirect URI</strong> ở trên vào và bấm Lưu thay đổi.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 mt-0.5">
              3
            </span>
            <div>
              <p className="font-bold text-slate-800">
                Cấu hình quyền truy cập (Permissions):
              </p>
              <p className="mt-0.5 text-slate-500">
                Trong <strong>Xem xét ứng dụng (App Review)</strong> hoặc <strong>Quyền & tính năng</strong>, hãy bật các quyền: <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-600">pages_show_list</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-600">pages_read_engagement</code>, <code className="font-mono bg-slate-100 px-1 py-0.5 rounded text-blue-600">pages_manage_posts</code>.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2.5">
            <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center shrink-0 mt-0.5">
              4
            </span>
            <div>
              <p className="font-bold text-slate-800">
                Điền biến môi trường:
              </p>
              <p className="mt-0.5 text-slate-500">
                Sao chép <strong>App ID</strong> vào <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">META_APP_ID</code> và <strong>Khóa bí mật của ứng dụng (App Secret)</strong> vào <code className="font-mono bg-slate-100 px-1 py-0.5 rounded">META_APP_SECRET</code>.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Section 3: Firebase Platform Status */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Hệ thống lưu trữ Firebase (Firestore, Auth & Storage)
            </h3>
            <p className="text-xs text-slate-500">
              Lưu trữ danh sách bài viết, tệp tải lên và Access Token thật đã được mã hóa an toàn
            </p>
          </div>
        </div>

        <div className="text-xs space-y-3 text-slate-600">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Firebase Authentication & Firestore
              </span>
              <p className="text-slate-500 leading-relaxed">
                Đăng nhập bằng Email/Password. Các collection gồm <code className="font-mono text-blue-600">users</code>, <code className="font-mono text-blue-600">facebookPages</code>, <code className="font-mono text-blue-600">contents</code>, và <code className="font-mono text-blue-600">media</code>.
              </p>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
              <span className="font-bold text-slate-900 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                Bảo mật mã hóa Token AES-256-GCM
              </span>
              <p className="text-slate-500 leading-relaxed">
                Mọi Facebook Page Access Token và User Access Token đều được mã hóa bằng khóa bí mật 32-byte và không bao giờ gửi nguyên mẫu về client.
              </p>
            </div>
          </div>

          <div className="pt-2">
            <h4 className="font-bold text-slate-800 mb-2">
              Danh sách biến môi trường cần thiết (.env):
            </h4>
            <div className="p-3 bg-slate-900 text-slate-100 rounded-xl font-mono text-[11px] leading-relaxed select-all overflow-x-auto">
              <div># Firebase Configuration</div>
              <div className="text-emerald-400">VITE_FIREBASE_API_KEY=...</div>
              <div className="text-emerald-400">VITE_FIREBASE_AUTH_DOMAIN=...</div>
              <div className="text-emerald-400">VITE_FIREBASE_PROJECT_ID=...</div>
              <div className="text-emerald-400">VITE_FIREBASE_STORAGE_BUCKET=...</div>
              <div className="text-emerald-400">VITE_FIREBASE_MESSAGING_SENDER_ID=...</div>
              <div className="text-emerald-400">VITE_FIREBASE_APP_ID=...</div>
              <div className="mt-2"># Meta Graph API</div>
              <div className="text-blue-400">META_APP_ID=...</div>
              <div className="text-blue-400">META_APP_SECRET=...</div>
              <div className="text-blue-400">META_REDIRECT_URI={redirectUri}</div>
              <div className="text-blue-400">META_GRAPH_API_VERSION=v20.0</div>
              <div className="mt-2"># Security & App</div>
              <div className="text-amber-400">TOKEN_ENCRYPTION_KEY=...</div>
              <div className="text-amber-400">APP_URL={window.location.origin}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
