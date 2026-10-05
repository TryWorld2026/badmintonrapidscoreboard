/* ================================================================
   middleware/auth.ts — 身份识别

   从 Authorization: Bearer <jwt> 取令牌并验签。
   验签是必须的：只把 payload 解出来就用，等于任何人都能伪造 sub 冒充他人。
   ================================================================ */

import { UnauthorizedError } from '../lib/errors';
import { verifyAccessToken, type AccessClaims } from '../lib/tokens';
import type { Env } from '../lib/http';

export interface AuthedUser {
  id: string;
  email: string;
}

/** 解析并校验访问令牌。未登录返回 null（不抛错），由调用方决定是否强制。 */
export async function optionalUser(req: Request, env: Env): Promise<AuthedUser | null> {
  const h = req.headers.get('authorization') || req.headers.get('Authorization');
  if (!h) return null;
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (!m) return null;

  try {
    const claims: AccessClaims = await verifyAccessToken(m[1], env.JWT_SECRET);
    return { id: claims.sub, email: claims.email };
  } catch {
    /* 令牌无效/过期都当作未登录。刻意不把具体原因透给客户端：
       「签名错误」与「已过期」的区别对攻击者有用，对用户没用。 */
    return null;
  }
}

/** 强制登录：未登录直接 401 */
export async function requireUser(req: Request, env: Env): Promise<AuthedUser> {
  const u = await optionalUser(req, env);
  if (!u) throw new UnauthorizedError();
  return u;
}

/* ================================================================
   限流

   为什么必须有：
     /auth/login 与 /auth/register 是暴力破解与撞库的入口。
     没有限流的话，攻击者可以每秒试几千个密码。

   策略（两层）：
     1. 按 IP：挡住单机高频攻击
     2. 按账号（邮箱）：挡住分布式撞库（换 IP 但盯着同一个账号）
   存储用 KV（Workers 的 KV 有最终一致性，但对限流足够 ——
   宁可偶尔多放一个请求，也不能因为强一致而让每个请求都变慢）。
   ================================================================ */

export interface RateRule {
  /** 窗口长度（秒） */
  windowSec: number;
  /** 窗口内允许的最大次数 */
  max: number;
}

export const RATE_RULES: Record<string, RateRule> = {
  login: { windowSec: 300, max: 10 },
  register: { windowSec: 3600, max: 5 },
  refresh: { windowSec: 300, max: 30 },
  write: { windowSec: 60, max: 120 },
};

/* 开发环境放宽限流。
   理由：本地跑接口测试时一轮要注册十几个用户，
   「5 次/小时」的注册限流必然把测试自己挡在门外
   （实测：测试第 6 个用例开始全部 429）。
   这不是"为了测试而降低安全性"——开发环境本就不该套用生产限流；
   生产环境（ENVIRONMENT != development）仍用上面那组严格值。 */
export const DEV_RATE_RULES: Record<string, RateRule> = {
  login: { windowSec: 60, max: 500 },
  register: { windowSec: 60, max: 500 },
  refresh: { windowSec: 60, max: 500 },
  write: { windowSec: 60, max: 5000 },
};

export function ruleFor(env: Env, key: keyof typeof RATE_RULES): RateRule {
  const isDev = (env.ENVIRONMENT || 'production') === 'development';
  const table = isDev ? DEV_RATE_RULES : RATE_RULES;
  return table[key] || RATE_RULES[key];
}

export function clientIp(req: Request): string {
  /* Cloudflare 会把真实 IP 放在 CF-Connecting-IP。
     注意不要信任 X-Forwarded-For —— 那是客户端可以伪造的。 */
  return req.headers.get('CF-Connecting-IP')
    || req.headers.get('x-real-ip')
    || 'unknown';
}

export interface RateResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

/**
 * 计数式限流。
 * 用「固定窗口」而不是「滑动窗口」：实现简单、KV 操作次数少（1 读 1 写）。
 * 代价是窗口边界处可能放过约 2 倍流量 —— 对登录接口可以接受。
 */
export async function checkRate(
  env: Env,
  bucket: string,
  key: string,
  rule: RateRule,
): Promise<RateResult> {
  if (!env.RATE_LIMIT) {
    /* 没配 KV 就放行（本地开发 / 自部署简化场景）。
       不能因为缺少可选依赖就把功能锁死。 */
    return { allowed: true, remaining: rule.max, retryAfterSec: 0 };
  }

  const windowId = Math.floor(Date.now() / (rule.windowSec * 1000));
  const k = `rl:${bucket}:${key}:${windowId}`;

  let current = 0;
  try {
    const raw = await env.RATE_LIMIT.get(k);
    current = raw ? parseInt(raw, 10) || 0 : 0;
  } catch {
    /* KV 故障不应该把用户挡在门外：放行并记日志 */
    return { allowed: true, remaining: rule.max, retryAfterSec: 0 };
  }

  if (current >= rule.max) {
    const secsLeft = rule.windowSec - Math.floor((Date.now() / 1000) % rule.windowSec);
    return { allowed: false, remaining: 0, retryAfterSec: Math.max(1, secsLeft) };
  }

  try {
    /* expirationTtl 让键自动过期，不用自己清理 */
    await env.RATE_LIMIT.put(k, String(current + 1), { expirationTtl: rule.windowSec + 60 });
  } catch {
    /* 写失败也放行：限流是保护措施，不该变成可用性单点 */
  }

  return { allowed: true, remaining: rule.max - current - 1, retryAfterSec: 0 };
}
