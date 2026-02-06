import type { VercelRequest, VercelResponse } from '@vercel/node';

export default async function handler(
  request: VercelRequest,
  response: VercelResponse
) {
  // 从URL路径中提取硅流动API路径
  // 原始请求: /api/siliconflow/chat/completions
  // 我们需要提取: chat/completions
  const urlPath = request.url || '';
  const match = urlPath.match(/\/api\/siliconflow\/(.+)/);
  const path = match ? match[1] : '';

  if (!path) {
    return response.status(400).json({ error: 'Invalid path' });
  }

  // 从 Authorization header 获取 API Key
  const authHeader = request.headers['authorization'];
  const apiKey = authHeader?.replace(/^Bearer /i, '');

  if (!apiKey) {
    return response.status(401).json({ error: 'Missing API Key' });
  }

  try {
    const fetchResponse = await fetch(`https://api.siliconflow.cn/v1/${path}`, {
      method: request.method,
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Accept-Encoding': 'identity',
      },
      body: request.body ? JSON.stringify(request.body) : undefined,
    });

    const data = await fetchResponse.json();

    // 返回状态和数据
    response.status(fetchResponse.status).json(data);
  } catch (error) {
    console.error('Proxy error:', error);
    response.status(500).json({ error: 'Proxy request failed' });
  }
}
