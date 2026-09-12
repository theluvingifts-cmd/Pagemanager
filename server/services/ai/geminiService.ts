import { GoogleGenAI } from '@google/genai';

export interface GeminiRequestOptions {
  maxOutputTokens?: number;
  jsonSchema?: {
    name: string;
    description?: string;
    schema: Record<string, any>;
  };
}

function getGeminiApiKey(): string {
  return (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

export function isGeminiConfigured(): boolean {
  return Boolean(getGeminiApiKey());
}

const DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
const SAFE_FALLBACK_MODELS = ['gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];

function normalizeGeminiModelName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  let model = value.trim();
  if (!model) return null;
  model = model.replace(/^['"]|['"]$/g, '').trim();
  model = model.replace(/^https?:\/\/[^/]+\/v\d+(?:beta)?\/models\//i, '');
  model = model.replace(/^models\//i, '');
  model = model.replace(/:generateContent(?:\?.*)?$/i, '');
  model = model.trim();
  if (!/^gemini-[a-z0-9][a-z0-9._-]*$/i.test(model)) return null;
  return model.toLowerCase();
}

export function getGeminiModel(): string {
  return normalizeGeminiModelName(process.env.GEMINI_MODEL) || DEFAULT_GEMINI_MODEL;
}

function getCandidateModels(): string[] {
  const configured = normalizeGeminiModelName(process.env.GEMINI_MODEL);
  const envFallbacks = (process.env.GEMINI_FALLBACK_MODELS || '')
    .split(',')
    .map(normalizeGeminiModelName)
    .filter((value): value is string => Boolean(value));
  return Array.from(new Set([
    configured || DEFAULT_GEMINI_MODEL,
    ...envFallbacks,
    DEFAULT_GEMINI_MODEL,
    ...SAFE_FALLBACK_MODELS,
  ]));
}

function cleanJsonSchema(value: any): any {
  if (Array.isArray(value)) return value.map(cleanJsonSchema);
  if (!value || typeof value !== 'object') return value;
  const blocked = new Set([
    'additionalProperties', '$schema', '$id', '$defs', 'definitions',
    'minItems', 'maxItems', 'minimum', 'maximum',
  ]);
  const out: Record<string, any> = {};
  for (const [key, item] of Object.entries(value)) {
    if (blocked.has(key)) continue;
    out[key] = cleanJsonSchema(item);
  }
  return out;
}

function parsePossibleJson(value: unknown): any {
  if (typeof value !== 'string') return null;
  let text = value.trim();
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  }
  if (!text.startsWith('{') && !text.startsWith('[')) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function getErrorDetails(err: any): { status: number | null; message: string } {
  const parsedMessage = parsePossibleJson(err?.message);
  const nestedError = err?.error || err?.response?.data?.error || parsedMessage?.error || parsedMessage || null;
  const statusCandidate = nestedError?.code ?? nestedError?.statusCode ?? err?.status ?? err?.statusCode ?? err?.response?.status ?? null;
  const statusNumber = Number(statusCandidate);
  const status = Number.isFinite(statusNumber) ? statusNumber : null;
  const message = String(
    nestedError?.message || err?.response?.data?.message ||
    (typeof err?.message === 'string' ? err.message : '') || err ||
    'Gemini API gặp lỗi không xác định.'
  ).trim();
  return { status, message };
}

function isTransientError(err: any): boolean {
  const { status, message } = getErrorDetails(err);
  if (status !== null && [408, 429, 500, 502, 503, 504].includes(status)) return true;
  return /UNAVAILABLE|RESOURCE_EXHAUSTED|high demand|temporar(?:y|ily)|overload|capacity|timeout|deadline/i.test(message);
}

function isCapacityError(err: any): boolean {
  const { status, message } = getErrorDetails(err);
  return status === 503 || /UNAVAILABLE|high demand|overload|capacity/i.test(message);
}

function isModelFormatError(err: any): boolean {
  const { message } = getErrorDetails(err);
  return /GenerateContentRequest\.model|unexpected model name format|invalid model name/i.test(message);
}

function friendlyError(err: any, triedModels: string[]): string {
  const { status, message } = getErrorDetails(err);
  if (status === 503 || /UNAVAILABLE|high demand|overload|capacity/i.test(message)) {
    return `Gemini đang quá tải tạm thời. Page Manager đã tự thử lại và chuyển qua model dự phòng (${triedModels.join(' → ')}) nhưng Google vẫn chưa cấp được tài nguyên. Hãy bấm thử lại sau 10–30 giây.`;
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate limit/i.test(message)) {
    return 'Gemini đang giới hạn lượt gọi hoặc quota của API key. Hãy chờ một lúc rồi thử lại; nếu lỗi lặp lại, kiểm tra quota Gemini API trong Google AI Studio.';
  }
  if (status === 401 || status === 403 || /API key|permission|forbidden|unauthor/i.test(message)) {
    return 'GEMINI_API_KEY không hợp lệ hoặc chưa có quyền gọi Gemini API. Kiểm tra Settings → Secrets trong Google AI Studio rồi Apply lại.';
  }
  if (status === 404 || /model.*not found/i.test(message)) {
    return `Không tìm thấy model Gemini đã cấu hình. Model hiện tại: ${getGeminiModel()}.`;
  }
  if (/GenerateContentRequest\.model|unexpected model name format|invalid model name/i.test(message)) {
    return 'Tên model Gemini trong Environment không hợp lệ. Page Manager đã bỏ qua cấu hình sai và thử các model mặc định nhưng vẫn không gọi được API.';
  }
  return message || 'Gemini API gặp lỗi không xác định.';
}

function sleep(ms: number) { return new Promise(resolve => setTimeout(resolve, ms)); }
async function waitWithBackoff(attempt: number) {
  const base = 900 * Math.pow(2, attempt);
  const jitter = Math.floor(Math.random() * 350);
  await sleep(base + jitter);
}

export async function createGeminiResponse(
  instructions: string,
  input: string,
  options: GeminiRequestOptions = {}
): Promise<string> {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY chưa có trong server environment. Với Google AI Studio Build, key này thường được tạo tự động trong Settings → Secrets.');
  }

  const ai = new GoogleGenAI({ apiKey });
  const config: Record<string, any> = {
    systemInstruction: instructions,
    maxOutputTokens: options.maxOutputTokens || 1800,
    temperature: options.jsonSchema ? 0.25 : 0.45,
  };
  if (options.jsonSchema) {
    config.responseMimeType = 'application/json';
    config.responseSchema = cleanJsonSchema(options.jsonSchema.schema);
  }

  const models = getCandidateModels();
  const triedModels: string[] = [];
  let lastError: any = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex += 1) {
    const model = models[modelIndex];
    triedModels.push(model);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await ai.models.generateContent({ model, contents: input, config });
        const text = typeof response.text === 'string' ? response.text.trim() : '';
        if (!text) throw new Error('Gemini không trả về nội dung văn bản.');
        return text;
      } catch (err: any) {
        lastError = err;
        if (isModelFormatError(err)) break;
        if (!isTransientError(err)) throw new Error(friendlyError(err, triedModels));
        if (attempt === 0) { await waitWithBackoff(attempt); continue; }
        if (modelIndex < models.length - 1) {
          await sleep(isCapacityError(err) ? 300 + Math.floor(Math.random() * 250) : 700);
        }
      }
    }
  }
  throw new Error(friendlyError(lastError, triedModels));
}

/**
 * Structured-output wrapper used anywhere Page Manager expects JSON.
 * Gemini can occasionally return truncated JSON even with responseSchema.
 * We validate here, then ask for a clean regeneration once instead of leaking
 * JSON.parse errors such as "Unterminated string" into the UI.
 */
export async function createGeminiJsonResponse<T = any>(
  instructions: string,
  input: string,
  options: GeminiRequestOptions & { repairAttempts?: number } = {}
): Promise<T> {
  const repairAttempts = Math.max(0, Math.min(2, Number(options.repairAttempts ?? 1)));
  let lastRaw = '';
  let lastError: any = null;

  for (let attempt = 0; attempt <= repairAttempts; attempt += 1) {
    const repairNote = attempt === 0
      ? ''
      : '\n\nQUAN TRỌNG: Lần trả lời trước bị JSON lỗi/cắt cụt. Hãy tạo lại TOÀN BỘ JSON từ đầu, không dùng markdown, không giải thích ngoài JSON, đóng đủ mọi dấu ngoặc và dấu nháy.';
    try {
      lastRaw = await createGeminiResponse(
        `${instructions}${repairNote}`,
        input,
        {
          ...options,
          maxOutputTokens: Math.max(options.maxOutputTokens || 1800, attempt > 0 ? 2600 : 0),
        }
      );
      const parsed = parsePossibleJson(lastRaw);
      if (parsed !== null) return parsed as T;
      lastError = new Error('Gemini trả về JSON không hợp lệ hoặc bị cắt cụt.');
    } catch (err) {
      lastError = err;
      if (attempt >= repairAttempts) throw err;
    }
  }

  const preview = lastRaw.slice(0, 180).replace(/\s+/g, ' ');
  throw new Error(`${lastError?.message || 'Gemini trả về JSON không hợp lệ.'}${preview ? ` Nội dung đầu: ${preview}` : ''}`);
}
