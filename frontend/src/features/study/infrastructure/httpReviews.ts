import { ReviewFailure, type ReviewGateway, type ReviewResult, type StudyQueue } from '../application/reviews';

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    signal: AbortSignal.timeout(10_000),
    ...init,
  });
  if (response.status === 401) throw new ReviewFailure('signed-out');
  if (response.status === 403) throw new ReviewFailure('expired-form');
  if (response.status === 404) throw new ReviewFailure('unavailable');
  if (response.status === 409 || response.status === 422) {
    const problem = (await response.json()) as { reason?: string };
    throw new ReviewFailure(response.status === 409 ? 'conflict' : 'invalid', problem.reason);
  }
  if (!response.ok) throw new ReviewFailure('unknown');
  return response;
}

export const httpReviews: ReviewGateway = {
  async queue() {
    const response = await request('/api/v1/cards/due');
    return response.json() as Promise<StudyQueue>;
  },
  async rate(cardId, input) {
    try {
      const bootstrap = await request('/api/v1/auth/csrf');
      const csrf = (await bootstrap.json()) as { token: string; headerName: string };
      const response = await request(`/api/v1/reviews/${encodeURIComponent(cardId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [csrf.headerName]: csrf.token },
        body: JSON.stringify(input),
      });
      const result = (await response.json()) as ReviewResult;
      if (
        result.requestId !== input.requestId ||
        result.cardId !== cardId ||
        result.scheduleVersion !== input.expectedVersion + 1
      ) {
        throw new ReviewFailure('unknown');
      }
      return result;
    } catch (error) {
      if (error instanceof ReviewFailure) throw error;
      throw new ReviewFailure('unknown');
    }
  },
};
