/* ================================================================
   lib/errors.ts — 类型化错误层级

   为什么不用 `throw new Error('...')`：
     全局错误处理器需要区分「用户输入错了（422，可以告诉用户）」
     和「我们代码崩了（500，只能记日志、对外含糊）」。
     靠字符串匹配 message 来区分是脆的，所以用类型。

   对外响应格式统一为 { title, status, detail, request_id }，
   与前端 lib/api.ts 的解析逻辑一一对应。
   ================================================================ */

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  /** true = 预期内的业务错误（可以如实告诉用户）
   *  false = 编程错误（对外只说"服务器开小差了"，细节进日志） */
  readonly operational: boolean;

  constructor(message: string, code: string, status: number, operational = true) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.operational = operational;
  }
}

export class ValidationError extends AppError {
  readonly fields: { path: string; message: string }[];
  constructor(fields: { path: string; message: string }[]) {
    super('请求参数不合法', 'VALIDATION_ERROR', 422);
    this.fields = fields;
  }
}

export class UnauthorizedError extends AppError {
  constructor(detail = '请先登录') {
    super(detail, 'UNAUTHORIZED', 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(detail = '没有权限执行此操作') {
    super(detail, 'FORBIDDEN', 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(id ? `${resource} 不存在：${id}` : `${resource} 不存在`, 'NOT_FOUND', 404);
  }
}

export class ConflictError extends AppError {
  constructor(detail: string) {
    super(detail, 'CONFLICT', 409);
  }
}

export class RateLimitError extends AppError {
  constructor(retryAfterSec: number) {
    super(`请求过于频繁，请 ${retryAfterSec} 秒后再试`, 'RATE_LIMITED', 429);
    this.retryAfterSec = retryAfterSec;
  }
  readonly retryAfterSec: number;
}

export class ConfigError extends AppError {
  constructor(detail: string) {
    /* 配置错误属于编程错误：operational=false，对外不暴露细节 */
    super(detail, 'CONFIG_ERROR', 500, false);
  }
}

/** 把任意 throw 出来的东西收敛成 AppError，供全局处理器使用 */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new AppError(message, 'INTERNAL_ERROR', 500, false);
}
