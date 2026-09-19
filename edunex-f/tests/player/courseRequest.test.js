import { afterEach, describe, expect, it, vi } from 'vitest';
import { courseRequest } from '../../src/lib/courseRequest.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('courseRequest', () => {
  it('retries one transient gateway failure and returns the recovered playlist', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response('<html>Bad gateway</html>', { status: 502, headers: { 'content-type': 'text/html' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ title: 'AI Influencer Course', videos: [] }), { status: 200, headers: { 'content-type': 'application/json' } }));

    const result = await courseRequest('/api/courses/course-id/lessons', { retryDelayMs: 0 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.response.status).toBe(200);
    expect(result.data.title).toBe('AI Influencer Course');
  });

  it('preserves a non-JSON HTTP response so callers can handle its status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('<html>Service unavailable</html>', { status: 500, headers: { 'content-type': 'text/html' } }),
    );

    const result = await courseRequest('/api/courses/course-id/lessons');

    expect(result.response.status).toBe(500);
    expect(result.data.error).toContain('Service unavailable');
  });
});
