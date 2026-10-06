/* ================================================================
   index.ts — Workers 入口 / 路由

   路由风格：手写前缀匹配，不引入框架。
     理由：Worker 的冷启动时间与打包体积直接相关，而本项目只有
     20 来个端点。Hono/itty-router 能省几十行代码，但多一个依赖
     对"任何人 clone 下来就能改"的开源项目来说是净负担。

   中间件顺序（与 fullstack-dev 的建议一致）：
     requestId → CORS → 限流 → 认证 → 校验 → 处理 → 错误处理
   ================================================================ */

import { AppError, NotFoundError, toAppError } from './lib/errors';
import {
  corsHeaders, errorResponse, json, log, newRequestId,
  securityHeaders, type Env,
} from './lib/http';
import { requireUser, checkRate, ruleFor } from './middleware/auth';
import { assertSecretUsable } from './lib/tokens';
import * as auth from './routes/auth';
import * as matches from './routes/matches';
import * as clubs from './routes/clubs';
import * as sessions from './routes/sessions';

interface Ctx {
  req: Request;
  env: Env;
  url: URL;
  parts: string[];      // 已按 / 切分且去掉空段的路径
  requestId: string;
  cors: Record<string, string>;
  /** 路径参数，由 dispatch 在匹配后填入（如 :clientId / :id） */
  params: Record<string, string>;
}

/* ---------- 路由表 ----------
   用「方法 + 路径段数 + 匹配函数」描述，避免正则地狱。
   顺序敏感：先注册的先匹配（把静态路径放在参数路径前面）。

   handler 刻意声明成 `(ctx: any) => Promise<Response>`：
   路由函数各有各的签名（有的收 user，有的收路径参数），
   在表里做类型体操只会让代码难读。真正的类型安全由各 route
   模块自己的签名保证 —— 那里是强类型的，写错调用直接编译失败。 */
type RouteHandler = (ctx: any) => Promise<Response>;

interface Route {
  method: string;
  match: (parts: string[]) => Record<string, string> | null;
  handler: RouteHandler;
  auth?: boolean;
}

function seg(n: number, build: (parts: string[]) => Record<string, string> | null) {
  return (parts: string[]) => (parts.length === n ? build(parts) : null);
}

const ROUTES: Route[] = [
  /* ---------- 健康检查 ---------- */
  {
    method: 'GET', match: seg(1, p => (p[0] === 'health' ? {} : null)),
    handler: async () => json({ status: 'ok', time: Date.now() }),
  },
  {
    /* /ready 探依赖：D1 不通就不该把流量导进来 */
    method: 'GET', match: seg(1, p => (p[0] === 'ready' ? {} : null)),
    handler: async ({ env }) => {
      const checks: Record<string, string> = {};
      let ok = true;
      try {
        await env.DB.prepare('SELECT 1').first();
        checks.database = 'ok';
      } catch (e) {
        checks.database = 'fail';
        ok = false;
      }
      /* 用 tokens.ts 的同一套校验，而不是在这里重写一遍长度判断。
         重写的坏处实测过：/ready 只判长度，于是 .env.example 里那个
         52 字符的占位符会被报成 auth: ok —— 探活说没问题，
         而实际签发令牌时才会炸。健康检查必须与真实校验同源。 */
      try {
        assertSecretUsable(env.JWT_SECRET);
        checks.auth = 'ok';
      } catch (e) {
        checks.auth = 'misconfigured';
        ok = false;
      }
      return json({ status: ok ? 'ok' : 'degraded', checks }, ok ? 200 : 503);
    },
  },

  /* ---------- 认证 ----------
     这四条不需要登录（登录/注册本身就是获取身份的入口），
     所以包一层把 ctx 适配成各 route 模块的 (req, env) 签名。 */
  {
    method: 'POST', match: seg(2, p => (p[0] === 'auth' && p[1] === 'register' ? {} : null)),
    handler: (ctx) => auth.register(ctx.req, ctx.env),
  },
  {
    method: 'POST', match: seg(2, p => (p[0] === 'auth' && p[1] === 'login' ? {} : null)),
    handler: (ctx) => auth.login(ctx.req, ctx.env),
  },
  {
    method: 'POST', match: seg(2, p => (p[0] === 'auth' && p[1] === 'refresh' ? {} : null)),
    handler: (ctx) => auth.refresh(ctx.req, ctx.env),
  },
  {
    method: 'POST', match: seg(2, p => (p[0] === 'auth' && p[1] === 'logout' ? {} : null)),
    handler: (ctx) => auth.logout(ctx.req, ctx.env),
  },
  {
    method: 'GET', match: seg(2, p => (p[0] === 'auth' && p[1] === 'me' ? {} : null)),
    handler: (ctx) => auth.me(ctx.req, ctx.env, ctx.user), auth: true,
  },
  /* 兼容别名：/api/me 更好记 */
  {
    method: 'GET', match: seg(1, p => (p[0] === 'me' ? {} : null)),
    handler: (ctx) => auth.me(ctx.req, ctx.env, ctx.user), auth: true,
  },

  /* ---------- 比赛记录 ---------- */
  {
    method: 'GET', match: seg(1, p => (p[0] === 'matches' ? {} : null)),
    handler: (ctx) => matches.listMatches(ctx.req, ctx.env, ctx.user), auth: true,
  },
  {
    method: 'POST', match: seg(1, p => (p[0] === 'matches' ? {} : null)),
    handler: (ctx) => matches.upsertMatches(ctx.req, ctx.env, ctx.user), auth: true,
  },
  {
    /* DELETE /api/matches/:clientId */
    method: 'DELETE',
    match: seg(2, p => (p[0] === 'matches' && p[1] ? { clientId: p[1] } : null)),
    handler: (ctx) => matches.deleteMatch(ctx.req, ctx.env, ctx.user, ctx.params.clientId), auth: true,
  },

  /* ---------- 俱乐部 ---------- */
  {
    method: 'GET', match: seg(1, p => (p[0] === 'clubs' ? {} : null)),
    handler: (ctx) => clubs.listClubs(ctx.req, ctx.env, ctx.user), auth: true,
  },
  {
    method: 'POST', match: seg(1, p => (p[0] === 'clubs' ? {} : null)),
    handler: (ctx) => clubs.createClub(ctx.req, ctx.env, ctx.user), auth: true,
  },
  {
    method: 'POST', match: seg(2, p => (p[0] === 'clubs' && p[1] === 'join' ? {} : null)),
    handler: (ctx) => clubs.joinClub(ctx.req, ctx.env, ctx.user), auth: true,
  },
  {
    method: 'PATCH',
    match: seg(2, p => (p[0] === 'clubs' && p[1] ? { id: p[1] } : null)),
    handler: (ctx) => clubs.updateClub(ctx.req, ctx.env, ctx.user, ctx.params.id), auth: true,
  },
  {
    method: 'GET',
    match: seg(3, p => (p[0] === 'clubs' && p[2] === 'members' ? { id: p[1] } : null)),
    handler: (ctx) => clubs.listMembers(ctx.req, ctx.env, ctx.user, ctx.params.id), auth: true,
  },
  {
    method: 'DELETE',
    match: seg(4, p => (p[0] === 'clubs' && p[2] === 'members' && p[3] ? { id: p[1], uid: p[3] } : null)),
    handler: (ctx) => clubs.removeMember(ctx.req, ctx.env, ctx.user, ctx.params.id, ctx.params.uid), auth: true,
  },

  /* ---------- 球局 ---------- */
  {
    method: 'GET', match: seg(1, p => (p[0] === 'sessions' ? {} : null)),
    handler: (ctx) => sessions.listSessions(ctx.req, ctx.env, ctx.user), auth: true,
  },
  {
    method: 'POST', match: seg(1, p => (p[0] === 'sessions' ? {} : null)),
    handler: (ctx) => sessions.createSession(ctx.req, ctx.env, ctx.user), auth: true,
  },
  {
    method: 'GET',
    match: seg(2, p => (p[0] === 'sessions' && p[1] ? { id: p[1] } : null)),
    handler: (ctx) => sessions.getSession(ctx.req, ctx.env, ctx.user, ctx.params.id), auth: true,
  },
  {
    method: 'POST',
    match: seg(3, p => (p[0] === 'sessions' && p[2] === 'join' ? { id: p[1] } : null)),
    handler: (ctx) => sessions.joinSession(ctx.req, ctx.env, ctx.user, ctx.params.id), auth: true,
  },
  {
    method: 'POST',
    match: seg(3, p => (p[0] === 'sessions' && p[2] === 'leave' ? { id: p[1] } : null)),
    handler: (ctx) => sessions.leaveSession(ctx.req, ctx.env, ctx.user, ctx.params.id), auth: true,
  },
  {
    method: 'POST',
    match: seg(3, p => (p[0] === 'sessions' && p[2] === 'guests' ? { id: p[1] } : null)),
    handler: (ctx) => sessions.addGuest(ctx.req, ctx.env, ctx.user, ctx.params.id), auth: true,
  },
  {
    method: 'GET',
    match: seg(3, p => (p[0] === 'sessions' && p[2] === 'rotation' ? { id: p[1] } : null)),
    handler: (ctx) => sessions.nextRotation(ctx.req, ctx.env, ctx.user, ctx.params.id), auth: true,
  },
];

/* ---------- 分发 ---------- */
async function dispatch(ctx: Ctx): Promise<Response> {
  const { parts } = ctx;

  /* 先按路径找候选，再校验方法 —— 这样 /api/matches 用错方法时
     能返回 405 而不是 404，调试体验差很多。 */
  let pathMatched = false;
  for (const r of ROUTES) {
    const params = r.match(parts);
    if (!params) continue;
    pathMatched = true;
    if (r.method !== ctx.req.method) continue;

    ctx.params = params;

    if (r.auth) {
      const user = await requireUser(ctx.req, ctx.env);
      /* 写操作统一限流：登录限流只管认证入口，
         但一个被盗的令牌可以疯狂写数据，所以这里再兜一层。 */
      if (r.method !== 'GET') {
        const rl = await checkRate(ctx.env, 'write', user.id, ruleFor(ctx.env, 'write'));
        if (!rl.allowed) {
          throw new AppError('操作过于频繁，请稍后再试', 'RATE_LIMITED', 429);
        }
      }
      return r.handler({ ...ctx, user });
    }
    return r.handler(ctx);
  }

  throw new NotFoundError(pathMatched ? '该路径不支持此方法' : '接口');
}

/* ---------- 入口 ---------- */
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestId = newRequestId();
    const url = new URL(request.url);
    const origin = request.headers.get('origin');
    const cors = corsHeaders(origin, env);
    const started = Date.now();

    /* 路径统一去掉 /api 前缀，路由表里就不用到处写它 */
    let parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') parts = parts.slice(1);

    /* 预检请求直接返回，不进业务逻辑 */
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { ...cors, ...securityHeaders } });
    }

    const ctx: Ctx = {
      req: request, env, url, parts, requestId, cors,
      params: {},
    };

    try {
      const res = await dispatch(ctx);
      /* 给所有响应补上安全头与 CORS（业务代码不必逐个记得） */
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(cors)) headers.set(k, v);
      for (const [k, v] of Object.entries(securityHeaders)) headers.set(k, v);
      headers.set('X-Request-Id', requestId);

      log('info', 'request', {
        request_id: requestId,
        method: request.method,
        path: url.pathname,
        status: res.status,
        ms: Date.now() - started,
      });
      return new Response(res.body, { status: res.status, headers });
    } catch (err) {
      const appErr = toAppError(err);

      /* operational 的错误是预期内的（用户输入问题、未登录），
         日志级别用 warn；非预期的才用 error 并打完整堆栈。 */
      if (appErr.operational) {
        log('warn', 'handled error', {
          request_id: requestId, method: request.method,
          path: url.pathname, code: appErr.code, status: appErr.status,
          detail: appErr.message,
        });
      } else {
        log('error', 'unhandled error', {
          request_id: requestId, method: request.method, path: url.pathname,
          code: appErr.code,
          error: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        });
      }

      const res = errorResponse(appErr, requestId, cors);
      const headers = new Headers(res.headers);
      for (const [k, v] of Object.entries(securityHeaders)) headers.set(k, v);
      return new Response(res.body, { status: res.status, headers });
    }
  },
};
