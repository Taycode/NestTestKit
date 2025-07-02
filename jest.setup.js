// Jest setup file for NestTestKit

// Enable experimental decorators for Jest
require('reflect-metadata');

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.NEST_TEST_KIT_LOGGING = 'false'; // Disable logging during tests
process.env.NEST_TEST_KIT_LOG_LEVEL = '0'; // Only show errors

// Global test timeout
jest.setTimeout(30000);

// Mock console to reduce noise during testing
const originalConsole = console;
global.console = {
  ...originalConsole,
  log: jest.fn((...args) => {
    // Only log if VERBOSE_TESTS is set
    if (process.env.VERBOSE_TESTS) {
      originalConsole.log(...args);
    }
  }),
  info: jest.fn((...args) => {
    if (process.env.VERBOSE_TESTS) {
      originalConsole.info(...args);
    }
  }),
  warn: originalConsole.warn, // Always show warnings
  error: originalConsole.error, // Always show errors
  debug: jest.fn((...args) => {
    if (process.env.VERBOSE_TESTS) {
      originalConsole.debug(...args);
    }
  }),
};

// Cleanup after all tests
afterAll(async () => {
  // Add any global cleanup here
}); 