const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

export interface OpenAIRequestOptions {
  maxOutputTokens?: number;
  jsonSchema?: {
    name: string;
    description?: string;
    schema: Record<string, any>;
  };
}

export function isOpenAIConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function getOpenAIModel(): string {
  return process.env.OPENAI_MODEL?.trim() || 'gpt-5';
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    if (item?.type !== 'message') continue;
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'output_text' && typeof content?.text === 'string') {
        parts.push(content.text);
      }
    }
  }
  return parts.join('\n').trim();
}

async function parseOpenAIError(response: Response): Promise<Error> {
  let detail = '';
  try {
    const body = await response.json();
    detail = body?.error?.message || body?.error?.code || '';
  } catch {
    try {
      detail = await response.text();
    } catch {}
  }
  return new Error(detail || `OpenAI API lỗi HTTP ${response.status}`);
}

export async function createOpenAIResponse(
  instructions: string,
  input: string,
  options: OpenAIRequestOptions = {}
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY chưa được cấu hình trong AI Studio Environment/Secrets.');
  }

  const body: Record<string, any> = {
    model: getOpenAIModel(),
    instructions,
    input,
    store: false,
    max_output_tokens: options.maxOutputTokens || 1400,
  };

  if (options.jsonSchema) {
    body.text = {
      format: {
        type: 'json_schema',
        name: options.jsonSchema.name,
        description: options.jsonSchema.description,
        strict: true,
        schema: options.jsonSchema.schema,
      },
    };
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) throw await parseOpenAIError(response);

  const payload = await response.json();
  const text = extractOutputText(payload);
  if (!text) throw new Error('OpenAI không trả về nội dung văn bản.');
  return text;
}
