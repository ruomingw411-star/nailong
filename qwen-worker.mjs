const origin = 'https://ruomingw411-star.github.io';

export default {
  async fetch(request, env) {
    const headers = {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'no-store',
    };
    const reply = (body, status = 200) => Response.json(body, { status, headers });
    if (request.headers.get('Origin') !== origin) return reply({ error: '来源不允许' }, 403);
    if (new URL(request.url).pathname !== '/chat') return reply({ error: '地址不正确' }, 404);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return reply({ error: '请求方式不支持' }, 405);
    if (!env.NAILONG_ACCESS_CODE || !env.QWEN_CHAT_URL) return reply({ error: '后端未配置' }, 503);
    if (request.headers.get('Authorization') !== 'Bearer ' + env.NAILONG_ACCESS_CODE) {
      return reply({ error: '访问码不正确' }, 401);
    }

    let messages;
    try {
      const body = await request.text();
      if (body.length > 16000) return reply({ error: '消息太长了' }, 413);
      ({ messages } = JSON.parse(body));
      if (!Array.isArray(messages) || !messages.length || messages.length > 12 ||
          messages.at(-1)?.role !== 'user' || messages.some(message =>
            !message || !['user', 'assistant'].includes(message.role) ||
            typeof message.content !== 'string' || !message.content.trim() ||
            message.content.length > 1000)) {
        return reply({ error: '聊天记录格式不正确' }, 400);
      }
    } catch {
      return reply({ error: '无法读取聊天记录' }, 400);
    }

    try {
      const upstreamHeaders = { 'Content-Type': 'application/json' };
      if (env.QWEN_API_KEY) upstreamHeaders.Authorization = 'Bearer ' + env.QWEN_API_KEY;
      const upstream = await fetch(env.QWEN_CHAT_URL, {
        method: 'POST',
        headers: upstreamHeaders,
        signal: AbortSignal.timeout(25000),
        body: JSON.stringify({
          model: env.QWEN_MODEL || 'Qwen/Qwen2-7B-Instruct',
          messages: [{
            role: 'system',
            content: '你叫奶龙，是一只圆圆的黄色陪伴宠物。用自然、亲切的中文接着用户的话聊，通常一到三句。偶尔问一个具体的问题。只根据收到的内容聊天。'
          }, ...messages],
          max_tokens: 200,
          stream: false,
        }),
      });
      if (!upstream.ok) return reply({ error: '千问服务暂时无法回答' }, 502);
      const data = await upstream.json();
      const answer = data?.choices?.[0]?.message?.content;
      if (typeof answer !== 'string' || !answer.trim()) {
        return reply({ error: '千问没有返回文字' }, 502);
      }
      return reply({ reply: answer.trim() });
    } catch {
      return reply({ error: '暂时连不上千问服务' }, 502);
    }
  },
};
