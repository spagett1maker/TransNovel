/**
 * 테스트용 Request 객체 생성 헬퍼
 */
export function createRequest(
  url: string,
  options: {
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request {
  const { method = "GET", body, headers = {} } = options;

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  return new Request(url, init);
}

/**
 * Response 객체에서 status + body 추출
 */
export async function parseResponse(response: Response) {
  const status = response.status;
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status, body: body as Record<string, unknown> };
}
