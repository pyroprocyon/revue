import {
  ReviewFailure,
  type ReviewGateway,
  type ReviewResult,
  type StudyCard,
  type StudyQueue,
} from '../application/reviews';
import { sameOriginRequest, sameOriginWrite } from '../../../shared/http/sameOriginRequest';

async function request(path: string) {
  return checked(await sameOriginRequest(path));
}

async function checked(response: Response) {
  if (response.status === 401) throw new ReviewFailure('signed-out');
  if (response.status === 403) throw new ReviewFailure('expired-form');
  if (response.status === 404) throw new ReviewFailure('unavailable');
  if (response.status === 409 || response.status === 422) {
    const problem = (await response.json()) as { reason?: string; card?: StudyCard };
    throw new ReviewFailure(response.status === 409 ? 'conflict' : 'invalid', problem.reason, problem.card);
  }
  if (!response.ok) throw new ReviewFailure('unknown');
  return response;
}

export const httpReviews: ReviewGateway = {
  async queue(selection, summaryOnly, pausedTopic) {
    const params = new URLSearchParams();
    if (selection) {
      params.set('topic', selection.topic);
      params.set('includeNew', String(selection.includeNew));
    }
    if (summaryOnly) params.set('summaryOnly', 'true');
    if (pausedTopic) params.set('pausedTopic', pausedTopic);
    const query = params.size ? `?${params}` : '';
    const response = await request(`/api/v1/cards/due${query}`);
    return response.json() as Promise<StudyQueue>;
  },
  async rate(cardId, input) {
    try {
      const response = await checked(
        await sameOriginWrite(`/api/v1/reviews/${encodeURIComponent(cardId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(input),
        }),
      );
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
