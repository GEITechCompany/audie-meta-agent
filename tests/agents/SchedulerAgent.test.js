const SchedulerAgent = require('../../src/agents/SchedulerAgent');
const logger = require('../../src/utils/logger');
const nock = require('nock');

// Spy on logger
jest.spyOn(logger, 'info');
jest.spyOn(logger, 'warn');
jest.spyOn(logger, 'error');

describe('SchedulerAgent', () => {
  test('should be defined', () => {
    expect(SchedulerAgent).toBeDefined();
  });
});
