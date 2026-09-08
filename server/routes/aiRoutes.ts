import crypto from 'crypto';
import { Router, Request, Response } from 'express';
import { authenticateRequest } from '../middleware/authMiddleware';
import {
  getDocument,
  queryDocuments,
  setDocument,
} from '../services/firebaseRest';
import {
  createGeminiResponse,
  getGeminiModel,
  isGeminiConfigured,
} from '../services/ai/geminiService';

export const aiRouter = Router();

type ShopTask = {
  id: string;
  title: string;
  status: 'open' | 'done';
  dueAt?: string | null;
  createdAt: string;
  completedAt?: string | null;
};

function safeDate(value: any): number {
  const parsed = new Date(value || 0).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeTasks(value: any): ShopTask[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(task => task && typeof task === 'object' && task.id && task.title)
    .map(task => ({
      id: String(task.id),
      title: String(task.title),
      status: task.status === 'done' ? 'done' : 'open',
      dueAt: task.dueAt || null,
      createdAt: task.createdAt || new Date().toISOString(),
      completedAt: task.completedAt || null,
    }));
}

async function getUserTasks(user: any): Promise<ShopTask[]> {
  const userDoc = await getDocument<any>(user.idToken, 'users', user.id);
  return normalizeTasks(userDoc?.data?.shopTasks);
}

async function saveUserTasks(user: any, tasks: ShopTask[]) {
  await setDocument(
    user.idToken,
    'users',
    user.id,
    {
      uid: user.id,
      email: user.email || null,
      shopTasks: tasks.slice(0, 100),
      updatedAt: new Date().toISOString(),
    },
    true
  );
}

async function buildShopOverview(user: any, days = 7, pageId?: string | null) {
  const normalizedDays = days === 30 ? 30 : 7;
  const now = Date.now();
  const since = now - normalizedDays * 24 * 60 * 60 * 1000;

  const [contentRecords, pageRecords, tasks] = await Promise.all([
    queryDocuments<any>(user.idToken, 'contents', [{ field: 'userId', value: user.id }], 300),
    queryDocuments<any>(user.idToken, 'facebookPages', [{ field: 'userId', value: user.id }], 50),
    getUserTasks(user),
  ]);

  let content = contentRecords.map(record => ({ id: record.id, ...record.data }));
  if (pageId) content = content.filter(item => item.facebookPageId === pageId);

  const periodContent = content.filter(item => {
    const timestamp = safeDate(item.facebookCreatedTime || item.updatedAt || item.createdAt);
    return timestamp >= since;
  });

  const countStatus = (status: string) => periodContent.filter(item => item.status === status).length;
  const published = countStatus('published');
  const failed = countStatus('failed');
  const draft = periodContent.filter(item => item.status === 'draft' || item.status === 'ready').length;
  const publishing = countStatus('publishing');
  const attempted = published + failed;
  const publishSuccessRate = attempted > 0 ? Math.round((published / attempted) * 100) : null;

  const periodPosts = periodContent
    .sort((a, b) => safeDate(b.facebookCreatedTime || b.createdAt) - safeDate(a.facebookCreatedTime || a.createdAt))
    .slice(0, 12)
    .map(item => ({
      id: item.id,
      title: item.title || String(item.message || '').slice(0, 70) || 'Bài viết',
      status: item.status || 'draft',
      source: item.source || 'pagemanager',
      createdAt: item.facebookCreatedTime || item.createdAt || null,
      hasMedia: Array.isArray(item.media) && item.media.length > 0,
      hasLink: Boolean(item.link),
    }));

  const selectedPage = pageId
    ? pageRecords.find(page => page.data.pageId === pageId || page.id === pageId)
    : null;

  const openTasks = tasks.filter(task => task.status === 'open');
  const doneTasks = tasks.filter(task => task.status === 'done');
  const overdueTasks = openTasks.filter(task => task.dueAt && safeDate(task.dueAt) < now);
  const periodCompletedTasks = doneTasks.filter(task => safeDate(task.completedAt || task.createdAt) >= since);

  const activityScore = Math.max(
    0,
    Math.min(
      100,
      45 + Math.min(published * 8, 32) + Math.min(periodCompletedTasks.length * 4, 16) - failed * 10 - overdueTasks.length * 5
    )
  );

  return {
    periodDays: normalizedDays,
    generatedAt: new Date().toISOString(),
    page: selectedPage
      ? {
          id: selectedPage.id,
          pageId: selectedPage.data.pageId,
          pageName: selectedPage.data.pageName,
        }
      : null,
    pages: {
      connected: pageRecords.length,
    },
    content: {
      totalInPeriod: periodContent.length,
      published,
      failed,
      drafts: draft,
      publishing,
      publishSuccessRate,
      recentPosts: periodPosts,
    },
    work: {
      totalTasks: tasks.length,
      open: openTasks.length,
      done: doneTasks.length,
      completedInPeriod: periodCompletedTasks.length,
      overdue: overdueTasks.length,
      tasks: tasks
        .slice()
        .sort((a, b) => Number(a.status === 'done') - Number(b.status === 'done') || safeDate(a.dueAt) - safeDate(b.dueAt))
        .slice(0, 20),
    },
    messages: {
      connected: false,
      total: null,
      unread: null,
      note: 'Messenger chưa được kết nối với Page Manager nên AI không được phép suy đoán số liệu tin nhắn.',
    },
    activityScore,
    ai: {
      configured: isGeminiConfigured(),
      model: getGeminiModel(),
    },
  };
}

aiRouter.get('/overview', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });

    const days = Number(req.query.days) === 30 ? 30 : 7;
    const pageId = typeof req.query.page_id === 'string' ? req.query.page_id : null;
    return res.json({ overview: await buildShopOverview(user, days, pageId) });
  } catch (err: any) {
    console.error('AI overview error:', err);
    return res.status(500).json({ error: err.message || 'Không thể tải dữ liệu AI Shop Manager' });
  }
});

aiRouter.get('/tasks', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    return res.json({ tasks: await getUserTasks(user) });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Không thể tải công việc' });
  }
});

aiRouter.post('/tasks', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'Vui lòng nhập nội dung công việc.' });

    const tasks = await getUserTasks(user);
    const task: ShopTask = {
      id: crypto.randomBytes(8).toString('hex'),
      title: title.slice(0, 180),
      status: 'open',
      dueAt: req.body?.dueAt || null,
      createdAt: new Date().toISOString(),
      completedAt: null,
    };
    tasks.unshift(task);
    await saveUserTasks(user, tasks);
    return res.json({ success: true, task });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Không thể tạo công việc' });
  }
});

aiRouter.patch('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const tasks = await getUserTasks(user);
    const index = tasks.findIndex(task => task.id === req.params.id);
    if (index < 0) return res.status(404).json({ error: 'Không tìm thấy công việc' });

    if (typeof req.body?.title === 'string' && req.body.title.trim()) {
      tasks[index].title = req.body.title.trim().slice(0, 180);
    }
    if (req.body?.dueAt !== undefined) tasks[index].dueAt = req.body.dueAt || null;
    if (req.body?.status === 'done' || req.body?.status === 'open') {
      tasks[index].status = req.body.status;
      tasks[index].completedAt = req.body.status === 'done' ? new Date().toISOString() : null;
    }

    await saveUserTasks(user, tasks);
    return res.json({ success: true, task: tasks[index] });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Không thể cập nhật công việc' });
  }
});

aiRouter.delete('/tasks/:id', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    const tasks = await getUserTasks(user);
    const next = tasks.filter(task => task.id !== req.params.id);
    if (next.length === tasks.length) return res.status(404).json({ error: 'Không tìm thấy công việc' });
    await saveUserTasks(user, next);
    return res.json({ success: true });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Không thể xóa công việc' });
  }
});

const briefSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    shop_score: { type: 'integer', minimum: 0, maximum: 100 },
    status: { type: 'string', enum: ['Tốt', 'Ổn định', 'Cần chú ý', 'Nguy cấp'] },
    executive_summary: { type: 'string' },
    wins: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    risks: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    priorities: {
      type: 'array',
      maxItems: 5,
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          priority: { type: 'string', enum: ['P1', 'P2', 'P3'] },
          title: { type: 'string' },
          why: { type: 'string' },
          action: { type: 'string' },
        },
        required: ['priority', 'title', 'why', 'action'],
      },
    },
    content_direction: { type: 'array', items: { type: 'string' }, maxItems: 6 },
    data_gaps: { type: 'array', items: { type: 'string' }, maxItems: 6 },
  },
  required: ['shop_score', 'status', 'executive_summary', 'wins', 'risks', 'priorities', 'content_direction', 'data_gaps'],
};

aiRouter.post('/brief', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!isGeminiConfigured()) {
      return res.status(503).json({ error: 'Chưa có GEMINI_API_KEY. Trong Google AI Studio Build, key này thường được tạo tự động trong Settings → Secrets.' });
    }

    const days = Number(req.body?.days) === 30 ? 30 : 7;
    const pageId = typeof req.body?.page_id === 'string' ? req.body.page_id : null;
    const overview = await buildShopOverview(user, days, pageId);

    const instructions = [
      'Bạn là AI COO kiêm Marketing Manager cho một shop bán hàng online tại Việt Nam.',
      'Chỉ được kết luận từ dữ liệu được cung cấp. Tuyệt đối không bịa reach, inbox, doanh thu, đơn hàng hoặc engagement khi không có dữ liệu.',
      'Ưu tiên hành động cụ thể, thực chiến, có thứ tự. Viết tiếng Việt ngắn gọn và rõ ràng.',
      'Nếu một nguồn dữ liệu chưa kết nối, hãy đưa nó vào data_gaps chứ không tự suy đoán.',
      'shop_score phải phản ánh vận hành tổng thể trong dữ liệu hiện có, không phải điểm doanh thu.',
    ].join('\n');

    const raw = await createGeminiResponse(
      instructions,
      `Phân tích dữ liệu shop ${days} ngày gần nhất và tạo brief quản lý:\n${JSON.stringify(overview, null, 2)}`,
      {
        maxOutputTokens: 1800,
        jsonSchema: {
          name: 'shop_manager_brief',
          description: 'Báo cáo điều hành shop dựa trên dữ liệu thật của Page Manager.',
          schema: briefSchema,
        },
      }
    );

    const brief = JSON.parse(raw);

    try {
      await setDocument(
        user.idToken,
        'users',
        user.id,
        {
          uid: user.id,
          lastAiShopBrief: brief,
          lastAiShopBriefAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        true
      );
    } catch (saveErr) {
      console.warn('Không thể lưu AI brief, vẫn trả kết quả cho client:', saveErr);
    }

    return res.json({ success: true, brief, overview });
  } catch (err: any) {
    console.error('AI brief error:', err);
    return res.status(500).json({ error: err.message || 'AI không thể tạo báo cáo lúc này.' });
  }
});

aiRouter.post('/chat', async (req: Request, res: Response) => {
  try {
    const user = await authenticateRequest(req);
    if (!user) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (!isGeminiConfigured()) {
      return res.status(503).json({ error: 'Chưa có GEMINI_API_KEY. Trong Google AI Studio Build, key này thường được tạo tự động trong Settings → Secrets.' });
    }

    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ error: 'Hãy nhập câu hỏi cho AI.' });

    const days = Number(req.body?.days) === 30 ? 30 : 7;
    const pageId = typeof req.body?.page_id === 'string' ? req.body.page_id : null;
    const overview = await buildShopOverview(user, days, pageId);
    const history = Array.isArray(req.body?.history)
      ? req.body.history.slice(-6).map((item: any) => ({ role: item.role, content: String(item.content || '').slice(0, 1600) }))
      : [];

    const instructions = [
      'Bạn là AI quản lý shop nằm bên trong Page Manager.',
      'Trả lời bằng tiếng Việt, thẳng vào câu hỏi và ưu tiên quyết định/hành động.',
      'Mọi số liệu phải xuất phát từ SHOP_DATA bên dưới. Không bịa số tin nhắn, doanh thu, đơn hàng, reach hay engagement.',
      'Nếu dữ liệu thiếu, nói rõ thiếu nguồn nào và vẫn đưa ra phương án dựa trên phần dữ liệu đang có.',
      'Không trả lời chung chung kiểu giáo trình marketing nếu dữ liệu shop đủ để đưa ra nhận định cụ thể.',
    ].join('\n');

    const answer = await createGeminiResponse(
      instructions,
      `SHOP_DATA:\n${JSON.stringify(overview, null, 2)}\n\nLỊCH SỬ CHAT GẦN NHẤT:\n${JSON.stringify(history)}\n\nCÂU HỎI CỦA CHỦ SHOP:\n${message}`,
      { maxOutputTokens: 1600 }
    );

    return res.json({ success: true, answer, overview });
  } catch (err: any) {
    console.error('AI chat error:', err);
    return res.status(500).json({ error: err.message || 'AI không thể trả lời lúc này.' });
  }
});
