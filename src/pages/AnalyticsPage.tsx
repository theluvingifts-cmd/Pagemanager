import React, { useEffect, useMemo, useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  FileText,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  ListTodo,
  Plus,
  Trash2,
  Send,
  Loader2,
  Target,
  Lightbulb,
  ShieldAlert,
  Circle,
  CheckCircle,
  Bot,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFacebook } from '../context/FacebookContext';

interface ShopTask {
  id: string;
  title: string;
  status: 'open' | 'done';
  dueAt?: string | null;
  createdAt: string;
  completedAt?: string | null;
}

interface ShopOverview {
  periodDays: number;
  generatedAt: string;
  page: null | { id: string; pageId: string; pageName: string };
  pages: { connected: number };
  content: {
    totalInPeriod: number;
    published: number;
    failed: number;
    drafts: number;
    publishing: number;
    publishSuccessRate: number | null;
    recentPosts: Array<{
      id: string;
      title: string;
      status: string;
      source: string;
      createdAt: string | null;
      hasMedia: boolean;
      hasLink: boolean;
    }>;
  };
  work: {
    totalTasks: number;
    open: number;
    done: number;
    completedInPeriod: number;
    overdue: number;
    tasks: ShopTask[];
  };
  messages: {
    connected: boolean;
    total: number | null;
    unread: number | null;
    note: string;
  };
  activityScore: number;
  ai: { configured: boolean; model: string };
}

interface AIBrief {
  shop_score: number;
  status: 'Tốt' | 'Ổn định' | 'Cần chú ý' | 'Nguy cấp';
  executive_summary: string;
  wins: string[];
  risks: string[];
  priorities: Array<{
    priority: 'P1' | 'P2' | 'P3';
    title: string;
    why: string;
    action: string;
  }>;
  content_direction: string[];
  data_gaps: string[];
}

interface ChatItem {
  role: 'user' | 'assistant';
  content: string;
}

const formatNumber = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : value.toLocaleString('vi-VN');

export const AnalyticsPage: React.FC = () => {
  const { apiFetch } = useAuth();
  const { selectedPage } = useFacebook();

  const [days, setDays] = useState<7 | 30>(7);
  const [overview, setOverview] = useState<ShopOverview | null>(null);
  const [brief, setBrief] = useState<AIBrief | null>(null);
  const [loading, setLoading] = useState(true);
  const [briefLoading, setBriefLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [newTask, setNewTask] = useState('');
  const [taskLoadingId, setTaskLoadingId] = useState<string | null>(null);
  const [creatingTask, setCreatingTask] = useState(false);

  const [chat, setChat] = useState<ChatItem[]>([
    {
      role: 'assistant',
      content: 'Tao đang đọc dữ liệu thật trong Page Manager. Hỏi về bài đăng, tiến độ công việc hoặc định hướng 7/30 ngày.',
    },
  ]);
  const [question, setQuestion] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  const pageId = selectedPage?.page_id || '';

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (pageId) params.set('page_id', pageId);
      const response = await apiFetch(`/api/ai/overview?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tải được dữ liệu shop');
      setOverview(data.overview);
    } catch (err: any) {
      setError(err.message || 'Không tải được dữ liệu AI Shop Manager');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOverview();
  }, [days, pageId]);

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
      setOverview(data.overview);
    } catch (err: any) {
      setError(err.message || 'Không tạo được AI Brief');
    } finally {
      setBriefLoading(false);
    }
  };

  const createTask = async () => {
    const title = newTask.trim();
    if (!title) return;
    setCreatingTask(true);
    setError(null);
    try {
      const response = await apiFetch('/api/ai/tasks', {
        method: 'POST',
        body: JSON.stringify({ title }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không tạo được công việc');
      setNewTask('');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Không tạo được công việc');
    } finally {
      setCreatingTask(false);
    }
  };

  const toggleTask = async (task: ShopTask) => {
    setTaskLoadingId(task.id);
    try {
      const response = await apiFetch(`/api/ai/tasks/${task.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: task.status === 'done' ? 'open' : 'done' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không cập nhật được công việc');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Không cập nhật được công việc');
    } finally {
      setTaskLoadingId(null);
    }
  };

  const deleteTask = async (task: ShopTask) => {
    setTaskLoadingId(task.id);
    try {
      const response = await apiFetch(`/api/ai/tasks/${task.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Không xóa được công việc');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Không xóa được công việc');
    } finally {
      setTaskLoadingId(null);
    }
  };

  const sendQuestion = async () => {
    const message = question.trim();
    if (!message || chatLoading) return;

    const history = chat.slice(-6);
    setChat(prev => [...prev, { role: 'user', content: message }]);
    setQuestion('');
    setChatLoading(true);
    setError(null);

    try {
      const response = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message, history, days, page_id: pageId || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'AI không trả lời được');
      setChat(prev => [...prev, { role: 'assistant', content: data.answer }]);
      if (data.overview) setOverview(data.overview);
    } catch (err: any) {
      const text = err.message || 'AI không trả lời được';
      setError(text);
      setChat(prev => [...prev, { role: 'assistant', content: `Lỗi: ${text}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  const tasks = overview?.work.tasks || [];
  const aiReady = Boolean(overview?.ai.configured);

  const statusTone = useMemo(() => {
    const status = brief?.status;
    if (status === 'Tốt') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'Nguy cấp') return 'bg-rose-50 text-rose-700 border-rose-200';
    if (status === 'Cần chú ý') return 'bg-amber-50 text-amber-700 border-amber-200';
    return 'bg-blue-50 text-blue-700 border-blue-200';
  }, [brief?.status]);

  return (
    <div className="space-y-4 pb-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center shadow-sm">
              <Sparkles className="w-4.5 h-4.5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">AI Trợ lý Shop</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Đọc dữ liệu thật của {selectedPage?.page_name || 'các Page đã kết nối'}, tổng hợp vận hành và đề xuất việc cần làm.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-white border border-slate-200 rounded-xl">
            {[7, 30].map(value => (
              <button
                key={value}
                onClick={() => setDays(value as 7 | 30)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                  days === value ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                {value} ngày
              </button>
            ))}
          </div>
          <button
            onClick={loadOverview}
            disabled={loading}
            className="p-2.5 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={generateBrief}
            disabled={briefLoading || !aiReady}
            className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-xl shadow-sm"
          >
            {briefLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {briefLoading ? 'AI đang phân tích...' : 'Phân tích shop bằng AI'}
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl text-xs font-semibold flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && overview && !aiReady && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <Bot className="w-5 h-5 text-amber-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-amber-900">Chưa bật Gemini cho AI Shop Manager</p>
              <p className="text-xs text-amber-700 mt-0.5">
                Google AI Studio thường tự tạo <code className="font-mono bg-amber-100 px-1 rounded">GEMINI_API_KEY</code> khi app dùng Gemini. Mở Settings → Secrets để kiểm tra key rồi Apply nếu cần. Dashboard số liệu và công việc vẫn dùng được ngay.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-bold text-amber-700 bg-white/70 border border-amber-200 rounded-lg px-2.5 py-1.5 whitespace-nowrap">
            Model mặc định: {overview.ai.model}
          </span>
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-5 gap-3.5">
        <MetricCard
          label="Điểm vận hành"
          value={loading ? '...' : `${overview?.activityScore ?? 0}/100`}
          note={`Dựa trên dữ liệu ${days} ngày`}
          icon={<Target className="w-4 h-4" />}
          tone="violet"
        />
        <MetricCard
          label="Đã đăng Facebook"
          value={loading ? '...' : formatNumber(overview?.content.published)}
          note={overview?.content.publishSuccessRate === null ? 'Chưa đủ lần đăng để tính tỷ lệ' : `Tỷ lệ thành công ${overview?.content.publishSuccessRate}%`}
          icon={<FileText className="w-4 h-4" />}
          tone="blue"
        />
        <MetricCard
          label="Đăng lỗi"
          value={loading ? '...' : formatNumber(overview?.content.failed)}
          note={overview?.content.failed ? 'Cần kiểm tra lỗi xuất bản' : 'Không có lỗi trong kỳ'}
          icon={<AlertTriangle className="w-4 h-4" />}
          tone="rose"
        />
        <MetricCard
          label="Công việc hoàn tất"
          value={loading ? '...' : formatNumber(overview?.work.completedInPeriod)}
          note={`${overview?.work.open || 0} việc đang mở • ${overview?.work.overdue || 0} quá hạn`}
          icon={<CheckCircle2 className="w-4 h-4" />}
          tone="emerald"
        />
        <MetricCard
          label="Tin nhắn"
          value={overview?.messages.connected ? formatNumber(overview.messages.total) : 'Chưa kết nối'}
          note={overview?.messages.connected ? `${overview.messages.unread || 0} chưa đọc` : 'Messenger sẽ được nối ở giai đoạn sau'}
          icon={<MessageCircle className="w-4 h-4" />}
          tone="slate"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
        <div className="xl:col-span-2 space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">AI Brief điều hành</h3>
                <p className="text-xs text-slate-500 mt-0.5">AI chỉ dùng dữ liệu Page Manager đang có, không tự bịa số liệu chưa kết nối.</p>
              </div>
              {brief && (
                <span className={`px-2.5 py-1 rounded-full border text-[11px] font-bold ${statusTone}`}>
                  {brief.status} • {brief.shop_score}/100
                </span>
              )}
            </div>

            {!brief ? (
              <div className="p-10 text-center">
                <Sparkles className="w-8 h-8 text-violet-300 mx-auto" />
                <p className="text-sm font-bold text-slate-800 mt-3">Chưa có phân tích AI</p>
                <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                  Bấm “Phân tích shop bằng AI” để lấy kết luận, rủi ro, ưu tiên và hướng content dựa trên dữ liệu {days} ngày gần nhất.
                </p>
              </div>
            ) : (
              <div className="p-5 space-y-5">
                <div className="p-4 rounded-xl bg-violet-50 border border-violet-100">
                  <p className="text-sm font-bold text-violet-950 leading-relaxed">{brief.executive_summary}</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <BriefList title="Điểm đang tốt" icon={<CheckCircle2 className="w-4 h-4 text-emerald-600" />} items={brief.wins} empty="Chưa có tín hiệu tốt đủ rõ." />
                  <BriefList title="Rủi ro / điểm nghẽn" icon={<ShieldAlert className="w-4 h-4 text-rose-600" />} items={brief.risks} empty="Chưa thấy rủi ro lớn trong dữ liệu." />
                </div>

                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Target className="w-4 h-4 text-blue-600" />
                    <h4 className="text-sm font-extrabold text-slate-900">Việc ưu tiên tiếp theo</h4>
                  </div>
                  <div className="space-y-2.5">
                    {brief.priorities.map((item, index) => (
                      <div key={`${item.title}-${index}`} className="p-3.5 border border-slate-200 rounded-xl flex gap-3">
                        <span className={`h-fit text-[10px] font-black px-2 py-1 rounded-md ${
                          item.priority === 'P1' ? 'bg-rose-100 text-rose-700' : item.priority === 'P2' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {item.priority}
                        </span>
                        <div>
                          <p className="text-xs font-extrabold text-slate-900">{item.title}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">{item.why}</p>
                          <p className="text-xs font-semibold text-blue-700 mt-1.5">→ {item.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <BriefList title="Định hướng content" icon={<Lightbulb className="w-4 h-4 text-amber-500" />} items={brief.content_direction} empty="Chưa đủ dữ liệu để định hướng content." />
                  <BriefList title="Dữ liệu còn thiếu" icon={<AlertTriangle className="w-4 h-4 text-slate-500" />} items={brief.data_gaps} empty="Không có khoảng trống dữ liệu đáng chú ý." />
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900">Hỏi AI về shop</h3>
              <p className="text-xs text-slate-500 mt-0.5">Ví dụ: “7 ngày qua tao đang yếu ở đâu?”, “Hôm nay nên tập trung gì?”, “Content tiếp theo nên đi hướng nào?”</p>
            </div>
            <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto bg-slate-50/50">
              {chat.map((item, index) => (
                <div key={index} className={`flex ${item.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[88%] px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed whitespace-pre-wrap ${
                    item.role === 'user'
                      ? 'bg-slate-900 text-white rounded-br-md'
                      : 'bg-white border border-slate-200 text-slate-700 rounded-bl-md shadow-xs'
                  }`}>
                    {item.content}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex justify-start">
                  <div className="px-3.5 py-2.5 bg-white border border-slate-200 rounded-2xl rounded-bl-md text-xs text-slate-500 flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-600" />
                    AI đang đọc dữ liệu shop...
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 flex gap-2">
              <input
                value={question}
                onChange={e => setQuestion(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendQuestion();
                  }
                }}
                placeholder={aiReady ? 'Hỏi AI về tình hình shop...' : 'Kiểm tra GEMINI_API_KEY trong AI Studio Secrets để chat với AI'}
                disabled={!aiReady || chatLoading}
                className="flex-1 px-3.5 py-2.5 text-xs border border-slate-200 bg-slate-50 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-violet-500 disabled:opacity-60"
              />
              <button
                onClick={sendQuestion}
                disabled={!aiReady || chatLoading || !question.trim()}
                className="w-10 h-10 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:bg-slate-300 text-white flex items-center justify-center"
              >
                {chatLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Việc cần làm</h3>
                <p className="text-xs text-slate-500 mt-0.5">AI đọc được tiến độ này khi phân tích shop.</p>
              </div>
              <ListTodo className="w-5 h-5 text-blue-600" />
            </div>
            <div className="p-4 border-b border-slate-100 flex gap-2">
              <input
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createTask()}
                placeholder="Thêm việc hôm nay..."
                className="flex-1 min-w-0 px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={createTask}
                disabled={creatingTask || !newTask.trim()}
                className="w-9 h-9 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white rounded-xl flex items-center justify-center"
              >
                {creatingTask ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>
            <div className="p-3 space-y-1 max-h-[420px] overflow-y-auto">
              {tasks.length === 0 ? (
                <div className="py-8 text-center">
                  <ListTodo className="w-7 h-7 text-slate-300 mx-auto" />
                  <p className="text-xs font-bold text-slate-600 mt-2">Chưa có công việc</p>
                  <p className="text-[11px] text-slate-400 mt-1">Thêm việc để AI đánh giá tiến độ vận hành.</p>
                </div>
              ) : tasks.map(task => {
                const busy = taskLoadingId === task.id;
                return (
                  <div key={task.id} className="group flex items-start gap-2.5 p-2.5 hover:bg-slate-50 rounded-xl">
                    <button onClick={() => toggleTask(task)} disabled={busy} className="mt-0.5 shrink-0 text-slate-400 hover:text-emerald-600">
                      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : task.status === 'done' ? <CheckCircle className="w-4 h-4 text-emerald-600" /> : <Circle className="w-4 h-4" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold leading-relaxed ${task.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                        {task.title}
                      </p>
                    </div>
                    <button onClick={() => deleteTask(task)} disabled={busy} className="opacity-0 group-hover:opacity-100 p-1 text-slate-300 hover:text-rose-600 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="p-5 border-b border-slate-100">
              <h3 className="text-base font-extrabold text-slate-900">Dữ liệu AI đang nhìn thấy</h3>
            </div>
            <div className="p-4 space-y-3 text-xs">
              <DataSourceRow label="Facebook Pages" value={`${overview?.pages.connected || 0} Page`} active={(overview?.pages.connected || 0) > 0} />
              <DataSourceRow label="Bài đăng" value={`${overview?.content.totalInPeriod || 0} bài / ${days} ngày`} active />
              <DataSourceRow label="Công việc" value={`${overview?.work.totalTasks || 0} việc`} active />
              <DataSourceRow label="Messenger / Inbox" value="Chưa kết nối" active={false} />
              <DataSourceRow label="Đơn hàng / Doanh thu" value="Chưa kết nối" active={false} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const MetricCard: React.FC<{
  label: string;
  value: string;
  note: string;
  icon: React.ReactNode;
  tone: 'violet' | 'blue' | 'rose' | 'emerald' | 'slate';
}> = ({ label, value, note, icon, tone }) => {
  const tones = {
    violet: 'bg-violet-50 text-violet-600',
    blue: 'bg-blue-50 text-blue-600',
    rose: 'bg-rose-50 text-rose-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    slate: 'bg-slate-100 text-slate-500',
  };
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-500 truncate">{label}</span>
        <div className={`p-2 rounded-xl shrink-0 ${tones[tone]}`}>{icon}</div>
      </div>
      <p className="text-xl font-black text-slate-900 mt-2 truncate">{value}</p>
      <p className="text-[10px] text-slate-400 mt-1 leading-relaxed line-clamp-2">{note}</p>
    </div>
  );
};

const BriefList: React.FC<{
  title: string;
  icon: React.ReactNode;
  items: string[];
  empty: string;
}> = ({ title, icon, items, empty }) => (
  <div className="border border-slate-200 rounded-xl p-4">
    <div className="flex items-center gap-2 mb-2.5">
      {icon}
      <h4 className="text-xs font-extrabold text-slate-900">{title}</h4>
    </div>
    <div className="space-y-2">
      {items.length === 0 ? (
        <p className="text-[11px] text-slate-400">{empty}</p>
      ) : items.map((item, index) => (
        <div key={index} className="flex items-start gap-2 text-[11px] text-slate-600 leading-relaxed">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-300 mt-1.5 shrink-0" />
          <span>{item}</span>
        </div>
      ))}
    </div>
  </div>
);

const DataSourceRow: React.FC<{ label: string; value: string; active: boolean }> = ({ label, value, active }) => (
  <div className="flex items-center justify-between gap-3">
    <div className="flex items-center gap-2 min-w-0">
      <span className={`w-2 h-2 rounded-full shrink-0 ${active ? 'bg-emerald-500' : 'bg-slate-300'}`} />
      <span className="font-semibold text-slate-700 truncate">{label}</span>
    </div>
    <span className={`text-[11px] whitespace-nowrap ${active ? 'text-emerald-700 font-semibold' : 'text-slate-400'}`}>{value}</span>
  </div>
);
