import { TestDatabaseConfig } from '../core/interfaces';
import { TestDatabase as TestDatabaseInstance, testDatabaseManager } from '../core/test-database-manager';

/**
 * Global test database instance for decorator usage
 */
let globalTestDb: TestDatabaseInstance | null = null;

/**
 * Decorator for setting up test database in Jest/Vitest test suites
 */
export function TestDatabase(config: TestDatabaseConfig = {}) {
  return function(target: any) {
    // Store original beforeAll and afterAll if they exist
    const originalBeforeAll = target.beforeAll;
    const originalAfterAll = target.afterAll;

    // Set up database before all tests
    target.beforeAll = async () => {
      // Create test database
      globalTestDb = await testDatabaseManager.create(config);
      
      // Run original beforeAll if it exists
      if (originalBeforeAll) {
        await originalBeforeAll.call(target);
      }
    };

    // Clean up database after all tests
    target.afterAll = async () => {
      // Run original afterAll if it exists
      if (originalAfterAll) {
        await originalAfterAll.call(target);
      }
      
      // Clean up test database
      if (globalTestDb) {
        await globalTestDb.destroy();
        globalTestDb = null;
      }
    };

    return target;
  };
}

/**
 * Get the current test database instance
 * Can be used within tests to access the database directly
 */
export function getTestDatabase(): TestDatabaseInstance {
  if (!globalTestDb) {
    throw new Error('No test database available. Make sure to use @TestDatabase decorator.');
  }
  return globalTestDb;
}

/**
 * Alternative decorator that sets up database for each test (beforeEach/afterEach)
 * Provides better isolation but is slower
 */
export function TestDatabaseEach(config: TestDatabaseConfig = {}) {
  return function(target: any) {
    const originalBeforeEach = target.beforeEach;
    const originalAfterEach = target.afterEach;

    target.beforeEach = async () => {
      globalTestDb = await testDatabaseManager.create(config);
      
      if (originalBeforeEach) {
        await originalBeforeEach.call(target);
      }
    };

    target.afterEach = async () => {
      if (originalAfterEach) {
        await originalAfterEach.call(target);
      }
      
      if (globalTestDb) {
        await globalTestDb.destroy();
        globalTestDb = null;
      }
    };

    return target;
  };
}

/**
 * Decorator for transaction-based test isolation
 * Wraps each test in a transaction that gets rolled back
 */
export function WithTransaction() {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      if (!globalTestDb) {
        throw new Error('No test database available. Make sure to use @TestDatabase decorator.');
      }

      const client = globalTestDb.getClient();
      
      // Start transaction
      return await client.$transaction(async (tx: any) => {
        // Replace the global client with the transaction client temporarily
        const originalClient = globalTestDb!.getClient;
        globalTestDb!.getClient = () => tx as any;
        
        try {
          const result = await method.apply(this, args);
          // Force rollback by throwing (transaction will be rolled back)
          throw new Error('__ROLLBACK__');
        } catch (error: any) {
          if (error.message === '__ROLLBACK__') {
            // This was our intentional rollback, return the result
            return;
          }
          throw error;
        } finally {
          // Restore original client
          globalTestDb!.getClient = originalClient;
        }
      });
    };

    return descriptor;
  };
} 