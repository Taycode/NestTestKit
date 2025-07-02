import { TypeORMConfig } from '../adapters/typeorm-adapter';
import { TypeORMTestDatabase as TypeORMTestDatabaseInstance, typeormTestDatabaseManager } from '../core/typeorm-test-database-manager';

/**
 * Global TypeORM test database instance for decorator usage
 */
let globalTypeORMTestDb: TypeORMTestDatabaseInstance | null = null;

/**
 * Decorator for setting up TypeORM test database in Jest/Vitest test suites
 */
export function TypeORMTestDatabase(config: TypeORMConfig = {}) {
  return function(target: any) {
    // Store original beforeAll and afterAll if they exist
    const originalBeforeAll = target.beforeAll;
    const originalAfterAll = target.afterAll;

    // Set up database before all tests
    target.beforeAll = async () => {
      // Create TypeORM test database
      globalTypeORMTestDb = await typeormTestDatabaseManager.create(config);
      
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
      if (globalTypeORMTestDb) {
        await globalTypeORMTestDb.destroy();
        globalTypeORMTestDb = null;
      }
    };

    return target;
  };
}

/**
 * Get the current TypeORM test database instance
 * Can be used within tests to access the database directly
 */
export function getTypeORMTestDatabase(): TypeORMTestDatabaseInstance {
  if (!globalTypeORMTestDb) {
    throw new Error('No TypeORM test database available. Make sure to use @TypeORMTestDatabase decorator.');
  }
  return globalTypeORMTestDb;
}

/**
 * Alternative decorator that sets up database for each test (beforeEach/afterEach)
 * Provides better isolation but is slower
 */
export function TypeORMTestDatabaseEach(config: TypeORMConfig = {}) {
  return function(target: any) {
    const originalBeforeEach = target.beforeEach;
    const originalAfterEach = target.afterEach;

    target.beforeEach = async () => {
      globalTypeORMTestDb = await typeormTestDatabaseManager.create(config);
      
      if (originalBeforeEach) {
        await originalBeforeEach.call(target);
      }
    };

    target.afterEach = async () => {
      if (originalAfterEach) {
        await originalAfterEach.call(target);
      }
      
      if (globalTypeORMTestDb) {
        await globalTypeORMTestDb.destroy();
        globalTypeORMTestDb = null;
      }
    };

    return target;
  };
}

/**
 * Decorator for transaction-based test isolation with TypeORM
 * Wraps each test in a transaction that gets rolled back
 */
export function WithTypeORMTransaction() {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      if (!globalTypeORMTestDb) {
        throw new Error('No TypeORM test database available. Make sure to use @TypeORMTestDatabase decorator.');
      }

      const dataSource = globalTypeORMTestDb.getDataSource();
      
      // Start transaction
      return await dataSource.transaction(async (transactionalEntityManager: any) => {
        // Replace the global DataSource's manager with the transaction manager temporarily
        const originalManager = dataSource.manager;
        (dataSource as any).manager = transactionalEntityManager;
        
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
          // Restore original manager
          (dataSource as any).manager = originalManager;
        }
      });
    };

    return descriptor;
  };
} 