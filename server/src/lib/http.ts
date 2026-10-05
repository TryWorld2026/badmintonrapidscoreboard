/* ================================================================
   lib/http.ts — 响应构造 / CORS / request id

   统一响应格式，前端 lib/api.ts 按同一套解析：
     成功 → 直接返回数据对象（不套 { data: ... } 壳，少一层解包）
     失败 → { title, status, detail, request_id, fields? }
       与 RFC 7807 (problem+json) 对齐，便于将来接标准工具
   ================================================================ */

import { AppError, ValidationError } from './errors';

export interface Env {
  DB: D1Database;
  BUCKET?: R2Bucket;
  RATE_LIMIT?: KVNamespace;
  JWT_SECRET: string;
  ENVIRONMENT?: string;
  /** 允许的前端来源，逗号分隔。生产必须显式配置，不用 * */
  CORS_ORIGINS?: string;
}

export function json(data: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      /* API 响应绝不缓存：带用户数据的 GET 被中间层缓存会串号 */
      'Cache-Control': 'no-store',
      ...extraHeaders,
    },
  });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}

/* ---------- CORS ----------
   不用 '*'：带 cookie 的请求（refresh）在 '*' 下会被浏览器拒绝，
   而且 '*' 意味着任何站点都能调用你的 API。
   显式白名单 + Vary: Origin，避免 CDN 把 A 站的 CORS 头发给 B 站。 */
export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.CORS_ORIGINS || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  /* 本地开发默认放行 localhost 各端口 */
  const isLocal = origin && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  const ok = origin && (allowed.includes(origin) || isLocal);

  const h: Record<string, string> = {
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
  if (ok) {
    h['Access-Control-Allow-Origin'] = origin!;
    /* 允许携带 refresh cookie */
    h['Access-Control-Allow-Credentials'] = 'true';
  }
  return h;
}

/* ---------- request id ----------
   每个请求一个 id，同时进日志与错误响应。
   用户报障时给出这个 id，就能在日志里精确捞到那一次请求。 */
export function newRequestId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += bytes[i].toString(16).padStart(2, '0');
  return s;
}

/* ---------- 错误 → 响应 ---------- */
export function errorResponse(err: unknown, requestId: string, cors: Record<string, string>): Response {
  if (err instanceof ValidationError) {
    return json(
      {
        title: 'VALIDATION_ERROR',
        status: 422,
        detail: err.message,
        /* 字段级错误：前端可以直接标在对应输入框下 */
        fields: err.fields,
        request_id: requestId,
      },
      422,
      cors,
    );
  }

  if (err instanceof AppError) {
    const body: Record<string, unknown> = {
      title: err.code,
      status: err.status,
      detail: err.message,
      request_id: requestId,
    };
    if (err.operational === false) {
      /* 非预期错误：对外含糊，细节已进日志 */
      body.detail = '服务器开小差了，请稍后再试';
    }
    const extra: Record<string, string> = { ...cors };
    if (err.code === 'RATE_LIMITED' && 'retryAfterSec' in err) {
      extra['Retry-After'] = String((err as { retryAfterSec: number }).retryAfterSec);
    }
    return json(body, err.status, extra);
  }

  return json(
    { title: 'INTERNAL_ERROR', status: 500, detail: '服务器开小差了，请稍后再试', request_id: requestId },
    500,
    cors,
  );
}

/* ---------- 结构化日志 ----------
   不用 console.log 拼字符串：Workers 的日志检索是按 JSON 字段的。
   ⚠️ 绝不记录密码、令牌、邮箱等敏感信息。 */
export function log(level: 'info' | 'warn' | 'error', msg: string, fields: Record<string, unknown> = {}): void {
  const entry = JSON.stringify({ level, msg, ...fields, ts: Date.now() });
  if (level === 'error') console.error(entry);
  else if (level === 'warn') console.warn(entry);
  else console.log(entry);
}

/* ---------- 安全响应头 ---------- */
export const securityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
};

/* ---------- 读取 JSON body（带大小上限）----------
   不设上限的话，一个超大 body 能直接把 Worker 打爆内存。 */
export async function readJson(req: Request, maxBytes = 512 * 1024): Promise<unknown> {
  const len = req.headers.get('content-length');
  if (len && parseInt(len, 10) > maxBytes) {
    throw new AppError('请求体过大', 'PAYLOAD_TOO_LARGE', 413);
  }
  const text = await req.text();
  if (text.length > maxBytes) {
    throw new AppError('请求体过大', 'PAYLOAD_TOO_LARGE', 413);
  }
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new AppError('请求体不是合法 JSON', 'BAD_JSON', 400);
  }
}
