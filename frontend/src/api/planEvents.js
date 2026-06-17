import request from './request';

export const planEventsApi = {
  list: (planId) => request.get(`/plans/${planId}/events`),
};
