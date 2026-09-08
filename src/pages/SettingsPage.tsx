import React, { useEffect, useState } from 'react';
import {
  Facebook,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  RefreshCw,
  Key,
  Database,
  Save,
  LogOut,
} from 'lucide-react';
import { useFacebook } from '../context/FacebookContext';

export const SettingsPage: React.FC = () => {
  const {
    connectedPages,
    availablePages,
    selectedPage,
    setSelectedPage,
    hasConnection,
    loading,
    configStatus,
    metaConfig,
    saveMetaConfig,
    connectFacebook,
    disconnectFacebookAccount,
    connectPage,
    disconnectPage,
    testPage,
    refreshPages,
  } = useFacebook();

  const [copiedRedirect, setCopiedRedirect] = useState(false);
  const [testingPageId, setTestingPageId] = useState<string | null>(null);
  const [connectingPageId, setConnectingPageId] = useState<string | null>(null);
  const [alertMessage, setAlertMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [metaAppId, setMetaAppId] = useState('');
  const [metaAppSecret, setMetaAppSecret] = useState('');
  const [graphVersion, setGraphVersion] = useState('v23.0');
  const [showSecret, setShowSecret] = useState(false);
  const [savingMeta, setSavingMeta] = useState(false);
  const [reauthorizing, setReauthorizing] = useState(false);
  const [disconnectingAccount, setDisconnectingAccount] = useState(false);
  const [showDisconnectAccountConfirm, setShowDisconnectAccountConfirm] = useState(false);

  const redirectUri = configStatus?.redirectUri || `${window.location.origin}/api/facebook/callback`;

  useEffect(() => {
    if (!metaConfig) return;
    setMetaAppId(metaConfig.appId || '');
    setGraphVersion(metaConfig.graphApiVersion || 'v23.0');
    setMetaAppSecret('');
  }, [metaConfig]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedRedirect(true);
    setTimeout(() => setCopiedRedirect(false), 2000);
  };

  const handleSaveMeta = async () => {
    setAlertMessage(null);
    if (!metaAppId.trim()) {
      setAlertMessage({ type: 'error', text: 'Hãy nhập App ID của Meta.' });
      return;
    }
    if ((!metaConfig?.appSecretConfigured || metaConfig?.source !== 'saved' || metaConfig?.vaultKeyMatches === false) && !metaAppSecret.trim()) {
      setAlertMessage({ type: 'error', text: metaConfig?.vaultKeyMatches === false ? 'Trình duyệt này có khóa bảo mật mới. Hãy nhập lại App Secret.' : 'Lần đầu cấu hình phải nhập App Secret.' });
      return;
    }

    setSavingMeta(true);
    const result = await saveMetaConfig({
      appId: metaAppId.trim(),
      appSecret: metaAppSecret.trim() || undefined,
      graphApiVersion: graphVersion.trim() || 'v23.0',
    });
    setSavingMeta(false);

    if (result.success) {
      setMetaAppSecret('');
      setAlertMessage({
        type: 'success',
        text: 'Đã lưu Meta App ID/App Secret. Giờ có thể bấm Kết nối Facebook.',
      });
    } else {
      setAlertMessage({ type: 'error', text: result.error || 'Không thể lưu cấu hình Meta.' });
    }
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
      setAlertMessage({ type: 'error', text: result.error || 'Kiểm tra kết nối thất bại.' });
    }
  };

  const handleConnectPage = async (pageId: string) => {
    setConnectingPageId(pageId);
    setAlertMessage(null);
    const result = await connectPage(pageId);
    setConnectingPageId(null);

    if (result.success) {
      setAlertMessage({ type: 'success', text: result.message || 'Đã kết nối Page thành công!' });
    } else {
      setAlertMessage({ type: 'error', text: result.error || 'Lỗi kết nối Page' });
    }
  };

  const handleReauthorize = async () => {
    setAlertMessage(null);
    setReauthorizing(true);
    const result = await connectFacebook();
    setReauthorizing(false);

    if (result.success) {
      await refreshPages();
      setAlertMessage({
        type: 'success',
        text: 'Đã lấy token Facebook mới. Hãy quay lại Messenger và bấm “Đồng bộ ngay” để kiểm tra quyền.',
      });
    } else {
      setAlertMessage({ type: 'error', text: result.error || 'Không thể cấp lại quyền Facebook.' });
    }
  };

  const handleDisconnectFacebookAccount = async () => {
    setDisconnectingAccount(true);
    setAlertMessage(null);
    const result = await disconnectFacebookAccount();
    setDisconnectingAccount(false);
    setShowDisconnectAccountConfirm(false);

    if (result.success) {
      setAlertMessage({
        type: 'success',
        text: result.message || 'Đã đăng xuất Facebook khỏi Page Manager. Bấm Kết nối Facebook để cấp quyền lại từ đầu.',
      });
    } else {
      setAlertMessage({ type: 'error', text: result.error || 'Không thể đăng xuất Facebook.' });
    }
  };

  const handleDisconnectPage = async (pageId: string) => {
    if (!window.confirm('Bạn có chắc muốn ngắt kết nối Page này khỏi Page Manager?')) return;
    setAlertMessage(null);
    const result = await disconnectPage(pageId);
    if (result.success) {
      setAlertMessage({ type: 'success', text: 'Đã ngắt kết nối Page thành công.' });
    } else {
      setAlertMessage({ type: 'error', text: result.error || 'Không thể ngắt kết nối Page' });
    }
  };

  return (
    <div className="space-y-4 pb-6 w-full">
      <div>
        <h2 className="text-lg font-extrabold text-slate-900 tracking-tight">
          Cài đặt & Kết nối Facebook
        </h2>
        <p className="text-xs text-slate-500 mt-1">
          Nhập Meta App trực tiếp tại đây, sau đó kết nối Page và đăng bài qua Meta Graph API thật.
        </p>
      </div>

      {alertMessage && (
        <div className={`p-4 rounded-2xl border text-xs flex items-center justify-between gap-3 ${
          alertMessage.type === 'success'
            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
            : 'bg-rose-50 border-rose-200 text-rose-900'
        }`}>
          <div className="flex items-center gap-2">
            {alertMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span className="font-semibold">{alertMessage.text}</span>
          </div>
          <button onClick={() => setAlertMessage(null)} className="text-slate-400 hover:text-slate-600 font-bold px-1">✕</button>
        </div>
      )}

      {/* Meta App config - stored encrypted per Firebase user */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-50 text-indigo-600">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Cấu hình Meta Developer App</h3>
                {metaConfig?.configured ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Đã cấu hình</span>
                ) : (
                  <span className="text-[10px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Chưa cấu hình</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Không cần tìm AI Studio Secrets. App Secret được mã hóa trước khi lưu vào Firestore.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">META APP ID</label>
            <input
              value={metaAppId}
              onChange={e => setMetaAppId(e.target.value)}
              placeholder="Ví dụ: 1234567890123456"
              inputMode="numeric"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">GRAPH API VERSION</label>
            <input
              value={graphVersion}
              onChange={e => setGraphVersion(e.target.value)}
              placeholder="v23.0"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono"
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700">META APP SECRET</label>
            {metaConfig?.appSecretConfigured && (
              <span className="text-[10px] font-bold text-emerald-600">✓ Đã có secret được mã hóa</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              type={showSecret ? 'text' : 'password'}
              value={metaAppSecret}
              onChange={e => setMetaAppSecret(e.target.value)}
              placeholder={metaConfig?.vaultKeyMatches === false ? 'Khóa trình duyệt đã đổi — bắt buộc nhập lại App Secret' : metaConfig?.appSecretConfigured ? 'Để trống nếu không muốn thay App Secret' : 'Dán App Secret từ Meta Developer'}
              autoComplete="new-password"
              className="flex-1 px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono"
            />
            <button
              type="button"
              onClick={() => setShowSecret(v => !v)}
              className="px-3 py-2 border border-slate-200 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-50"
            >
              {showSecret ? 'Ẩn' : 'Hiện'}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Secret không được trả ngược về giao diện sau khi lưu. Nếu đổi trình duyệt/xóa dữ liệu trình duyệt, hãy nhập lại secret và kết nối Page lại.
          </p>
        </div>

        <button
          type="button"
          onClick={handleSaveMeta}
          disabled={savingMeta}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white rounded-xl text-xs font-bold"
        >
          {savingMeta ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          <span>{savingMeta ? 'Đang lưu...' : 'Lưu cấu hình Meta'}</span>
        </button>
      </div>

      {/* Facebook account connection */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-blue-600 text-white flex items-center justify-center shadow-sm shadow-blue-500/20 shrink-0">
              <Facebook className="w-6 h-6 fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-900">Tài khoản Meta / Facebook</h3>
                {hasConnection ? (
                  <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">Đã liên kết</span>
                ) : (
                  <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">Chưa liên kết</span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">Cấp quyền để Page Manager lấy danh sách Page và xuất bản bài viết.</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={hasConnection ? handleReauthorize : async () => {
                setReauthorizing(true);
                const result = await connectFacebook();
                setReauthorizing(false);
                if (!result.success) setAlertMessage({ type: 'error', text: result.error || 'Không thể kết nối Facebook.' });
              }}
              disabled={!metaConfig?.configured || reauthorizing || disconnectingAccount}
              title={!metaConfig?.configured ? 'Lưu App ID và App Secret ở phần trên trước' : undefined}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${reauthorizing ? 'animate-spin' : ''}`} />
              <span>{reauthorizing ? 'Đang lấy quyền mới...' : hasConnection ? 'Làm mới quyền Facebook' : 'Kết nối Facebook'}</span>
            </button>
            {hasConnection && (
              <>
                <button
                  onClick={async () => {
                    setAlertMessage(null);
                    await refreshPages();
                    setAlertMessage({ type: 'success', text: 'Đã tải lại dữ liệu Page đang lưu trong Page Manager.' });
                  }}
                  disabled={loading || reauthorizing || disconnectingAccount}
                  title="Tải lại dữ liệu Page"
                  className="p-2.5 border border-slate-200 hover:bg-slate-50 text-slate-600 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setShowDisconnectAccountConfirm(true)}
                  disabled={reauthorizing || disconnectingAccount}
                  title="Xóa token Facebook đang lưu để kết nối lại từ đầu"
                  className="inline-flex items-center gap-1.5 px-3 py-2.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold disabled:opacity-50"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Đăng xuất FB</span>
                </button>
              </>
            )}
          </div>
        </div>

        {showDisconnectAccountConfirm && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold text-rose-900">Đăng xuất Facebook khỏi Page Manager?</p>
              <p className="text-[11px] text-rose-700 mt-1">
                Hệ thống sẽ xóa token Facebook/Page đang lưu. Sau đó mày kết nối lại để Meta cấp token mới có quyền Messenger. Tài khoản facebook.com vẫn đăng nhập bình thường.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={() => setShowDisconnectAccountConfirm(false)} disabled={disconnectingAccount} className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700">
                Hủy
              </button>
              <button type="button" onClick={handleDisconnectFacebookAccount} disabled={disconnectingAccount} className="inline-flex items-center gap-2 px-3 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold">
                {disconnectingAccount ? <RefreshCw className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
                <span>{disconnectingAccount ? 'Đang đăng xuất...' : 'Xóa token & đăng xuất'}</span>
              </button>
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Danh sách Facebook Pages ({availablePages.length})</h4>
            <span className="text-[11px] text-slate-400">Đã kích hoạt: {connectedPages.length} Page</span>
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-blue-600" />
              <span>Đang kiểm tra danh sách Page từ Meta...</span>
            </div>
          ) : availablePages.length === 0 ? (
            <div className="p-8 border border-dashed border-slate-200 rounded-2xl text-center bg-slate-50">
              <p className="text-xs font-bold text-slate-700">{hasConnection ? 'Không tìm thấy Page nào trong tài khoản Facebook của bạn' : 'Chưa có dữ liệu Facebook Page'}</p>
              <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                {hasConnection
                  ? 'Hãy đảm bảo tài khoản Meta có quyền quản lý Page.'
                  : metaConfig?.configured
                    ? 'Nhấn nút "Kết nối Facebook" ở trên để đăng nhập và tải danh sách Page.'
                    : 'Nhập App ID + App Secret và bấm "Lưu cấu hình Meta" trước.'}
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
                  <div key={page.page_id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      {page.page_avatar_url ? (
                        <img src={page.page_avatar_url} alt={page.page_name} className="w-10 h-10 rounded-xl object-cover ring-1 ring-slate-200 shrink-0" />
                      ) : (
                        <div className="w-10 h-10 rounded-xl bg-blue-600 text-white font-bold text-sm flex items-center justify-center shrink-0">{page.page_name.slice(0, 1)}</div>
                      )}
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h5 className="text-xs font-bold text-slate-900 truncate">{page.page_name}</h5>
                          {isConnected && <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md border border-emerald-200">Đã kích hoạt</span>}
                          {isCurrentSelected && <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-md border border-blue-200">Đang dùng</span>}
                        </div>
                        <p className="text-[11px] text-slate-400 mt-0.5 font-mono">ID: {page.page_id} {page.page_username ? `• @${page.page_username}` : ''}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                      <button
                        type="button"
                        onClick={() => setSelectedPage(page)}
                        className="px-2.5 py-1.5 border border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl"
                      >
                        Chọn Page
                      </button>
                      {isConnected ? (
                        <>
                          <button type="button" onClick={() => handleTestPage(page.page_id)} disabled={isTesting} className="px-2.5 py-1.5 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl disabled:opacity-50">
                            {isTesting ? 'Đang kiểm tra...' : 'Kiểm tra token'}
                          </button>
                          <button type="button" onClick={() => handleDisconnectPage(page.page_id)} className="px-2.5 py-1.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-xl">Ngắt kết nối</button>
                        </>
                      ) : (
                        <button type="button" onClick={() => handleConnectPage(page.page_id)} disabled={isConnecting} className="px-3.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl disabled:opacity-50">
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

      {/* Meta setup guide */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-5">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><Key className="w-5 h-5" /></div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Hướng dẫn cấu hình Meta Developer App</h3>
            <p className="text-xs text-slate-500">Meta vẫn cần đúng callback và 3 quyền Page; App ID/Secret thì nhập ngay ở form phía trên.</p>
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">Valid OAuth Redirect URI:</span>
            <button onClick={() => copyToClipboard(redirectUri)} className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700">
              {copiedRedirect ? <><Check className="w-3.5 h-3.5 text-emerald-600" /><span className="text-emerald-600">Đã chép</span></> : <><Copy className="w-3.5 h-3.5" /><span>Sao chép</span></>}
            </button>
          </div>
          <div className="p-2.5 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-800 break-all select-all">{redirectUri}</div>
        </div>

        <div className="space-y-3 text-xs text-slate-600">
          <p><strong>1.</strong> Meta Developer → app Page Manager → <strong>Đăng nhập bằng Facebook → Cài đặt</strong> → dán URL trên vào <strong>URI chuyển hướng OAuth hợp lệ</strong>.</p>
          <p><strong>2.</strong> Use case <strong>Quản lý mọi thứ trên Trang</strong> phải có: <code className="font-mono text-blue-600">pages_show_list</code>, <code className="font-mono text-blue-600">pages_read_engagement</code>, <code className="font-mono text-blue-600">pages_manage_posts</code>.</p>
          <p><strong>3.</strong> Meta Developer → <strong>Cài đặt ứng dụng → Thông tin cơ bản</strong> → lấy App ID + App Secret rồi nhập vào form đầu trang này.</p>
        </div>
      </div>

      {/* Firebase status */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
          <div className="p-2 rounded-xl bg-amber-50 text-amber-600"><Database className="w-5 h-5" /></div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Hệ thống lưu trữ Firebase</h3>
            <p className="text-xs text-slate-500">Firestore/Auth/Storage dùng tài khoản Firebase hiện tại; Meta secrets và access tokens được mã hóa.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="font-bold text-slate-900 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600" />Firebase</span>
            <p className="text-slate-500">Trạng thái: <strong>{configStatus?.firebaseConfigured ? 'Đã cấu hình' : 'Chưa cấu hình'}</strong></p>
          </div>
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1">
            <span className="font-bold text-slate-900 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600" />Meta App</span>
            <p className="text-slate-500">Trạng thái: <strong>{metaConfig?.configured ? 'Đã lưu trong tài khoản' : 'Chưa lưu'}</strong></p>
          </div>
        </div>
      </div>
    </div>
  );
};
