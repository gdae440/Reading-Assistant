export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  // 从 URL 提取路径
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/api\/siliconflow/, '');
  const targetUrl = `https://api.siliconflow.cn/v1${path}${url.search}`;

  // 转发请求到 SiliconFlow
  const response = await fetch(targetUrl, {
    method: request.method,
    headers: {
      'Authorization': request.headers.get('Authorization') || '',
      'Content-Type': request.headers.get('Content-Type') || 'application/json',
      'Accept-Encoding': 'identity',
    },
    body: request.body,
  });

  // 返回响应，包括 CORS 头
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
