import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Eye,
  Heart,
  MessageCircle,
  Share2,
  MousePointerClick,
  Bot,
  ShieldCheck,
  Play,
  Loader2,
  FileText,
  Clock,
  CalendarDays,
  Plus,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFacebook } from '../context/FacebookContext';

type Metrics = {
  reach: number | null;
  impressions: number | null;
  views: number | null;
  engagement: number | null;
  reactions: number | null;
  comments: number | null;
  shares: number | null;
  clicks: number | null;
  saves: number | null;
  replies: number | null;
};

type AnalyticsItem = {
  id: string;
  contentKey?: string;
  platform: 'facebook' | 'instagram';
  title: string;
  message?: string;
  thumbnail?: string | null;
  mediaUrl?: string | null;
  permalink?: string | null;
  createdAt: string;
  metrics: Metrics;
  classification?: string;
};

type AnalyticsPayload = {
  page: null | { id: string; pageId: string; pageName: string };
  periodDays: number;
  totals: { feed?: Metrics; story?: Metrics; all?: Metrics };
  facebookPosts: AnalyticsItem[];
  instagramPosts: AnalyticsItem[];
  stories: AnalyticsItem[];
  warnings: string[];
  generatedAt?: string;
};

type Policy = {
  enabled: boolean;
  startAt: string | null;
  endAt: string | null;
  weekdays: number[];
  timeWindows: Array<{ start: string; end: string }>;
  dailyPostLimit: number;
  dailyStoryLimit: number;
  cooldownDays: number;
  minIntervalMinutes: number;
  timezoneOffsetHours: number;
  pageId: string | null;
  actions: {
    facebookPost: boolean;
    instagramPost: boolean;
    facebookStory: boolean;
    instagramStory: boolean;
    repostExisting: boolean;
    createNew: boolean;
  };
  pillars: string[];
  updatedAt?: string | null;
};

type ActivityItem = {
  id: string;
  kind: 'feed' | 'story' | 'error';
  contentId?: string;
  channels?: string[];
  success: boolean;
  createdAt: string;
  errors?: string[];
  generated?: boolean;
};

const DEFAULT_POLICY: Policy = {
  enabled: false,
  startAt: null,
  endAt: null,
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  timeWindows: [{ start: '08:00', end: '22:00' }],
  dailyPostLimit: 1,
  dailyStoryLimit: 2,
  cooldownDays: 10,
  minIntervalMinutes: 120,
  timezoneOffsetHours: 7,
  pageId: null,
  actions: {
    facebookPost: false,
    instagramPost: false,
    facebookStory: false,
    instagramStory: false,
    repostExisting: true,
    createNew: false,
  },
  pillars: ['sales', 'branding', 'feedback', 'value', 'engagement', 'campaign', 'behind_the_scenes', 'advertising', 'unclassified'],
};

const PILLARS = [
  ['sales', 'Bán hàng'],
  ['advertising', 'Quảng cáo'],
  ['feedback', 'Feedback'],
  ['behind_the_scenes', 'Hậu trường'],
  ['engagement', 'Tương tác'],
  ['value', 'Giá trị'],
  ['branding', 'Thương hiệu'],
  ['campaign', 'Chiến dịch'],
  ['unclassified', 'Chưa phân loại'],
] as const;

const WEEKDAYS = [
  [1, 'T2'], [2, 'T3'], [3, 'T4'], [4, 'T5'], [5, 'T6'], [6, 'T7'], [0, 'CN'],
] as const;

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : value.toLocaleString('vi-VN');

const toInputDate = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const fromInputDate = (value: string) => value ? new Date(value).toISOString() : null;

export const AnalyticsPage: React.FC = () => {
  const { apiFetch } = useAuth();
  const { selectedPage } = useFacebook();
  const pageId = selectedPage?.page_id || '';

  const [days, setDays] = useState<7 | 30>(7);
  const [analytics, setAnalytics] = useState<AnalyticsPayload | null>(null);
  const [policy, setPolicy] = useState<Policy>(DEFAULT_POLICY);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [brief, setBrief] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);
  const [runLoading, setRunLoading] = useState<'dry' | 'real' | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadPolicyAndActivity = async () => {
    const [policyRes, activityRes] = await Promise.all([
      apiFetch('/api/automation/background/ai/policy'),
      apiFetch('/api/automation/background/ai/activity'),
    ]);
    const policyData = await policyRes.json();
    const activityData = await activityRes.json();
    if (!policyRes.ok) throw new Error(policyData.error || 'Không tải được quyền AI');
    setPolicy({ ...DEFAULT_POLICY, ...policyData.policy, actions: { ...DEFAULT_POLICY.actions, ...(policyData.policy?.actions || {}) } });
    if (activityRes.ok) setActivity(activityData.activity || []);
  };

  const loadAnalytics = async () => {
    if (!pageId) { setAnalytics(null); return; }
    setAnalyticsLoading(true);
    try {
      const params = new URLSearchParams({ days: String(days), page_id: pageId });
      const response = await apiFetch(`/api/automation/background/ai/analytics?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tải được số liệu Meta');
      setAnalytics(data);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      await Promise.all([loadPolicyAndActivity(), loadAnalytics()]);
    } catch (err: any) {
      setError(err.message || 'Không tải được dữ liệu Hiệu quả & AI');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [pageId]);
  useEffect(() => { if (!loading) loadAnalytics().catch(err => setError(err.message)); }, [days]);

  const savePolicy = async () => {
    setPolicySaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch('/api/automation/background/ai/policy', {
        method: 'PUT',
        body: JSON.stringify({ ...policy, pageId: pageId || policy.pageId || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không lưu được quyền AI');
      setPolicy(data.policy);
      setNotice(data.policy.enabled
        ? 'Đã lưu. AI chỉ được tự đăng đúng thời gian, kênh và giới hạn mày vừa cấp.'
        : 'Đã lưu. AI Publishing đang tắt.');
    } catch (err: any) {
      setError(err.message || 'Không lưu được quyền AI');
    } finally {
      setPolicySaving(false);
    }
  };

  const runAi = async (dryRun: boolean) => {
    setRunLoading(dryRun ? 'dry' : 'real');
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch('/api/automation/background/ai/run-now', {
        method: 'POST',
        body: JSON.stringify({ dryRun }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || data.result?.errors?.join(' · ') || 'AI chạy lỗi');
      const result = data.result;
      if (result.skipped) setNotice(result.skipped);
      else if (dryRun) setNotice(`AI thử chọn: ${result.selectedContentId || 'không có'} • Feed ${result.feed?.planned ? '✓' : '—'} • Story ${result.story?.planned ? '✓' : '—'}`);
      else setNotice(`AI đã chạy: ${Object.keys(result.feed || {}).join(', ') || 'không feed'} • ${Object.keys(result.story || {}).join(', ') || 'không story'}`);
      await loadPolicyAndActivity();
      if (!dryRun) await loadAnalytics();
    } catch (err: any) {
      setError(err.message || 'AI publishing chạy lỗi');
    } finally {
      setRunLoading(null);
    }
  };

  const generateBrief = async () => {
    setBriefLoading(true);
    setError(null);
    try {
      const response = await apiFetch('/api/ai/brief', {
        method: 'POST',
        body: JSON.stringify({ days, page_id: pageId || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tạo được AI Brief');
      setBrief(data.brief);
    } catch (err: any) {
      setError(err.message || 'Không tạo được AI Brief');
    } finally {
      setBriefLoading(false);
    }
  };

  const totals = analytics?.totals?.all;
  const allFeed = useMemo(() => [
    ...(analytics?.facebookPosts || []),
    ...(analytics?.instagramPosts || []),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()), [analytics]);


  const classifyItem = async (item: AnalyticsItem, pillar: string) => {
    setError(null);
    try {
      const response = await apiFetch('/api/automation/background/ai/classification', {
        method: 'PUT',
        body: JSON.stringify({ contentKey: item.contentKey || item.id, pillar }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không lưu được phân loại');
      setAnalytics(prev => prev ? {
        ...prev,
        facebookPosts: prev.facebookPosts.map(row => row.id === item.id ? { ...row, classification: pillar } : row),
        instagramPosts: prev.instagramPosts.map(row => row.id === item.id ? { ...row, classification: pillar } : row),
        stories: prev.stories.map(row => row.id === item.id ? { ...row, classification: pillar } : row),
      } : prev);
    } catch (err: any) {
      setError(err.message || 'Không lưu được phân loại nội dung');
    }
  };

  const toggleAction = (key: keyof Policy['actions']) =>
    setPolicy(prev => ({ ...prev, actions: { ...prev.actions, [key]: !prev.actions[key] } }));

  const togglePillar = (key: string) => setPolicy(prev => ({
    ...prev,
    pillars: prev.pillars.includes(key) ? prev.pillars.filter(item => item !== key) : [...prev.pillars, key],
  }));

  const toggleWeekday = (day: number) => setPolicy(prev => ({
    ...prev,
    weekdays: prev.weekdays.includes(day) ? prev.weekdays.filter(item => item !== day) : [...prev.weekdays, day],
  }));

  return (
    <div className="space-y-4 pb-8">
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center"><Sparkles className="w-4 h-4" /></div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900">Hiệu quả & AI</h2>
              <p className="text-xs text-slate-500 mt-0.5">Số liệu thật từ Meta + quyền mày cấp cho AI tự đăng bài/Story.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex p-1 bg-white border border-slate-200 rounded-xl">
            {[7, 30].map(value => (
              <button key={value} onClick={() => setDays(value as 7 | 30)} className={`px-3 py-1.5 rounded-lg text-xs font-bold ${days === value ? 'bg-slate-900 text-white' : 'text-slate-500'}`}>{value} ngày</button>
            ))}
          </div>
          <button onClick={loadAll} className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600" title="Làm mới"><RefreshCw className={`w-4 h-4 ${loading || analyticsLoading ? 'animate-spin' : ''}`} /></button>
          <button onClick={generateBrief} disabled={briefLoading} className="px-4 py-2.5 bg-violet-600 text-white rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-60">
            {briefLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Bot className="w-4 h-4" />} AI phân tích
          </button>
        </div>
      </div>

      {error && <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs font-semibold text-rose-800 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" />{error}</div>}
      {notice && <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex gap-2"><ShieldCheck className="w-4 h-4 shrink-0" />{notice}</div>}
      {analytics?.warnings?.length ? <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800"><b>Một số số liệu chưa đọc được:</b> {analytics.warnings.join(' · ')}. Nếu vừa thêm quyền Insights, hãy kết nối Facebook lại để lấy token mới.</div> : null}

      <div className="grid grid-cols-2 xl:grid-cols-6 gap-3">
        <Metric label="Reach" value={formatNumber(totals?.reach)} icon={<Eye className="w-4 h-4" />} />
        <Metric label="View / Impression" value={formatNumber(totals?.views ?? totals?.impressions)} icon={<FileText className="w-4 h-4" />} />
        <Metric label="Tương tác" value={formatNumber(totals?.engagement)} icon={<Heart className="w-4 h-4" />} />
        <Metric label="Bình luận" value={formatNumber(totals?.comments)} icon={<MessageCircle className="w-4 h-4" />} />
        <Metric label="Chia sẻ" value={formatNumber(totals?.shares)} icon={<Share2 className="w-4 h-4" />} />
        <Metric label="Click" value={formatNumber(totals?.clicks)} icon={<MousePointerClick className="w-4 h-4" />} />
      </div>

      {brief && (
        <div className="bg-white border border-violet-200 rounded-2xl p-5">
          <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-extrabold text-slate-900">AI Brief</h3><span className="text-[11px] font-bold px-2.5 py-1 bg-violet-50 text-violet-700 rounded-full">{brief.status} • {brief.shop_score}/100</span></div>
          <p className="text-xs text-slate-700 mt-3 leading-relaxed">{brief.executive_summary}</p>
          {!!brief.priorities?.length && <div className="mt-3 grid md:grid-cols-3 gap-2">{brief.priorities.slice(0, 3).map((item: any, i: number) => <div key={i} className="p-3 bg-slate-50 rounded-xl"><p className="text-[10px] font-black text-violet-700">{item.priority}</p><p className="text-xs font-bold mt-1">{item.title}</p><p className="text-[11px] text-slate-500 mt-1">{item.action}</p></div>)}</div>}
        </div>
      )}

      <div className="grid grid-cols-1 2xl:grid-cols-[1.45fr_1fr] gap-4">
        <div className="space-y-4">
          <PerformanceTable title="Hiệu quả bài đăng" items={allFeed} loading={analyticsLoading} onClassify={classifyItem} />
          <PerformanceTable title="Hiệu quả Story" items={analytics?.stories || []} loading={analyticsLoading} isStory onClassify={classifyItem} />
        </div>

        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
              <div><h3 className="text-base font-extrabold text-slate-900">Quyền AI tự đăng</h3><p className="text-[11px] text-slate-500 mt-1">AI chỉ được hoạt động trong hàng rào mày đặt.</p></div>
              <button onClick={() => setPolicy(prev => ({ ...prev, enabled: !prev.enabled }))} className={`relative w-11 h-6 rounded-full transition-colors ${policy.enabled ? 'bg-emerald-500' : 'bg-slate-300'}`}><span className={`absolute top-1 w-4 h-4 bg-white rounded-full shadow transition-all ${policy.enabled ? 'left-6' : 'left-1'}`} /></button>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Bắt đầu"><input type="datetime-local" value={toInputDate(policy.startAt)} onChange={e => setPolicy(prev => ({ ...prev, startAt: fromInputDate(e.target.value) }))} className="input-mini" /></Field>
                <Field label="Kết thúc"><input type="datetime-local" value={toInputDate(policy.endAt)} onChange={e => setPolicy(prev => ({ ...prev, endAt: fromInputDate(e.target.value) }))} className="input-mini" /></Field>
              </div>

              <div>
                <p className="label-mini">Ngày AI được chạy</p>
                <div className="flex gap-1.5 flex-wrap mt-2">{WEEKDAYS.map(([day, label]) => <button key={day} onClick={() => toggleWeekday(day)} className={`w-9 h-9 rounded-lg text-[11px] font-bold border ${policy.weekdays.includes(day) ? 'bg-slate-900 border-slate-900 text-white' : 'bg-white border-slate-200 text-slate-500'}`}>{label}</button>)}</div>
              </div>

              <div>
                <div className="flex items-center justify-between"><p className="label-mini">Khung giờ AI được chạy</p><button onClick={() => setPolicy(prev => ({ ...prev, timeWindows: [...prev.timeWindows, { start: '18:00', end: '22:00' }].slice(0, 4) }))} className="text-[11px] font-bold text-blue-600 flex items-center gap-1"><Plus className="w-3 h-3" /> Thêm</button></div>
                <div className="space-y-2 mt-2">{policy.timeWindows.map((window, index) => <div key={index} className="flex items-center gap-2"><input type="time" value={window.start} onChange={e => setPolicy(prev => ({ ...prev, timeWindows: prev.timeWindows.map((item, i) => i === index ? { ...item, start: e.target.value } : item) }))} className="input-mini flex-1" /><span className="text-xs text-slate-400">→</span><input type="time" value={window.end} onChange={e => setPolicy(prev => ({ ...prev, timeWindows: prev.timeWindows.map((item, i) => i === index ? { ...item, end: e.target.value } : item) }))} className="input-mini flex-1" />{policy.timeWindows.length > 1 && <button onClick={() => setPolicy(prev => ({ ...prev, timeWindows: prev.timeWindows.filter((_, i) => i !== index) }))} className="p-2 text-slate-400 hover:text-rose-600"><Trash2 className="w-4 h-4" /></button>}</div>)}</div>
              </div>

              <div>
                <p className="label-mini">AI được làm gì</p>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  <Toggle label="Bài Facebook" active={policy.actions.facebookPost} onClick={() => toggleAction('facebookPost')} />
                  <Toggle label="Bài Instagram" active={policy.actions.instagramPost} onClick={() => toggleAction('instagramPost')} />
                  <Toggle label="Story Facebook" active={policy.actions.facebookStory} onClick={() => toggleAction('facebookStory')} />
                  <Toggle label="Story Instagram" active={policy.actions.instagramStory} onClick={() => toggleAction('instagramStory')} />
                  <Toggle label="Đăng lại bài cũ" active={policy.actions.repostExisting} onClick={() => toggleAction('repostExisting')} />
                  <Toggle label="Tự viết bài mới" active={policy.actions.createNew} onClick={() => toggleAction('createNew')} />
                </div>
              </div>

              <div>
                <p className="label-mini">Loại nội dung AI được dùng</p>
                <div className="flex flex-wrap gap-1.5 mt-2">{PILLARS.map(([key, label]) => <button key={key} onClick={() => togglePillar(key)} className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border ${policy.pillars.includes(key) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-slate-200 text-slate-400'}`}>{label}</button>)}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <NumberField label="Bài/ngày" value={policy.dailyPostLimit} onChange={value => setPolicy(prev => ({ ...prev, dailyPostLimit: value }))} />
                <NumberField label="Story/ngày" value={policy.dailyStoryLimit} onChange={value => setPolicy(prev => ({ ...prev, dailyStoryLimit: value }))} />
                <NumberField label="Cooldown (ngày)" value={policy.cooldownDays} onChange={value => setPolicy(prev => ({ ...prev, cooldownDays: value }))} />
                <NumberField label="Khoảng nghỉ (phút)" value={policy.minIntervalMinutes} onChange={value => setPolicy(prev => ({ ...prev, minIntervalMinutes: value }))} />
              </div>

              <div className="flex gap-2">
                <button onClick={savePolicy} disabled={policySaving} className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-xs font-bold disabled:opacity-60">{policySaving ? 'Đang lưu...' : 'Lưu quyền AI'}</button>
                <button onClick={() => runAi(true)} disabled={!!runLoading} className="px-3 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 flex items-center gap-1.5"><Play className="w-3.5 h-3.5" /> Thử</button>
                <button onClick={() => runAi(false)} disabled={!!runLoading || !policy.enabled} className="px-3 py-2.5 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50">Chạy ngay</button>
              </div>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
            <div className="p-4 border-b border-slate-100"><h3 className="text-sm font-extrabold text-slate-900">AI đã làm gì</h3></div>
            <div className="max-h-72 overflow-y-auto divide-y divide-slate-100">
              {activity.length === 0 ? <div className="p-6 text-center text-xs text-slate-400">Chưa có hoạt động tự động.</div> : activity.slice(0, 20).map(item => <div key={item.id} className="p-3.5 flex items-start gap-3"><div className={`mt-1 w-2 h-2 rounded-full ${item.success ? 'bg-emerald-500' : 'bg-rose-500'}`} /><div className="min-w-0 flex-1"><p className="text-xs font-bold text-slate-700">{item.kind === 'feed' ? 'Đăng bài' : item.kind === 'story' ? 'Đăng Story' : 'Lỗi'} {item.generated ? '• AI viết mới' : '• đăng lại'}</p><p className="text-[10px] text-slate-400 mt-1">{item.channels?.join(' + ') || item.errors?.join(' · ') || item.contentId} • {new Date(item.createdAt).toLocaleString('vi-VN')}</p></div></div>)}
            </div>
          </div>
        </div>
      </div>

      <style>{`.input-mini{width:100%;border:1px solid #e2e8f0;border-radius:.65rem;padding:.55rem .65rem;font-size:.72rem;background:white;outline:none}.input-mini:focus{border-color:#64748b}.label-mini{font-size:.68rem;font-weight:800;color:#475569}`}</style>
    </div>
  );
};

const Metric: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
  <div className="bg-white border border-slate-200 rounded-2xl p-4"><div className="flex items-center justify-between"><span className="text-[10px] font-bold text-slate-500">{label}</span><span className="text-slate-400">{icon}</span></div><p className="text-xl font-black text-slate-900 mt-2">{value}</p></div>
);

const PerformanceTable: React.FC<{ title: string; items: AnalyticsItem[]; loading: boolean; isStory?: boolean; onClassify: (item: AnalyticsItem, pillar: string) => void }> = ({ title, items, loading, isStory, onClassify }) => (
  <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
    <div className="p-4 border-b border-slate-100 flex items-center justify-between"><div><h3 className="text-sm font-extrabold text-slate-900">{title}</h3><p className="text-[10px] text-slate-400 mt-0.5">Metric nào Meta không trả thì để —, không suy đoán.</p></div>{loading && <Loader2 className="w-4 h-4 animate-spin text-blue-600" />}</div>
    <div className="overflow-x-auto">
      <table className="w-full text-left min-w-[760px]"><thead><tr className="text-[10px] text-slate-400 bg-slate-50"><th className="px-4 py-2.5">Nội dung</th><th className="px-3 py-2.5">Nền tảng</th><th className="px-3 py-2.5">Phân loại</th><th className="px-3 py-2.5">Reach</th><th className="px-3 py-2.5">View</th><th className="px-3 py-2.5">Tương tác</th><th className="px-3 py-2.5">Comment</th><th className="px-3 py-2.5">Share</th></tr></thead>
        <tbody className="divide-y divide-slate-100">{items.length === 0 ? <tr><td colSpan={8} className="p-8 text-center text-xs text-slate-400">{loading ? 'Đang đọc Meta...' : `Chưa có ${isStory ? 'Story' : 'bài'} đủ dữ liệu trong kỳ.`}</td></tr> : items.map(item => <tr key={item.id} className="text-xs"><td className="px-4 py-3"><div className="flex gap-2.5 items-center">{item.thumbnail || item.mediaUrl ? <img src={item.thumbnail || item.mediaUrl || ''} className="w-10 h-10 rounded-lg object-cover bg-slate-100" /> : <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center"><FileText className="w-4 h-4 text-slate-400" /></div>}<div className="min-w-0"><p className="font-bold text-slate-700 max-w-[260px] truncate">{item.title}</p><p className="text-[10px] text-slate-400 mt-0.5">{new Date(item.createdAt).toLocaleString('vi-VN')}</p></div></div></td><td className="px-3 py-3"><span className={`px-2 py-1 rounded-full text-[9px] font-bold ${item.platform === 'facebook' ? 'bg-blue-50 text-blue-700' : 'bg-fuchsia-50 text-fuchsia-700'}`}>{item.platform === 'facebook' ? 'Facebook' : 'Instagram'}</span></td><td className="px-3 py-3"><select value={item.classification || 'unclassified'} onChange={e => onClassify(item, e.target.value)} className="text-[10px] border border-slate-200 rounded-lg px-2 py-1.5 bg-white">{PILLARS.map(([key,label]) => <option key={key} value={key}>{label}</option>)}</select></td><td className="px-3 py-3 font-semibold">{formatNumber(item.metrics.reach)}</td><td className="px-3 py-3 font-semibold">{formatNumber(item.metrics.views ?? item.metrics.impressions)}</td><td className="px-3 py-3 font-semibold">{formatNumber(item.metrics.engagement)}</td><td className="px-3 py-3">{formatNumber(item.metrics.comments ?? item.metrics.replies)}</td><td className="px-3 py-3">{formatNumber(item.metrics.shares)}</td></tr>)}</tbody>
      </table>
    </div>
  </div>
);

const Toggle: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({ label, active, onClick }) => <button onClick={onClick} className={`p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 ${active ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-500'}`}><span className="text-[11px] font-bold">{label}</span><span className={`w-2 h-2 rounded-full ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} /></button>;
const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => <label><span className="label-mini block mb-1.5">{label}</span>{children}</label>;
const NumberField: React.FC<{ label: string; value: number; onChange: (value: number) => void }> = ({ label, value, onChange }) => <label><span className="label-mini block mb-1.5">{label}</span><input type="number" min={0} value={value} onChange={e => onChange(Number(e.target.value))} className="input-mini" /></label>;
