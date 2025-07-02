import { MongooseConfig } from '../adapters/mongoose-adapter';
import { MongooseTestDatabase as MongooseTestDatabaseInstance, mongooseTestDatabaseManager } from '../core/mongoose-test-database-manager';

/**
 * Global Mongoose test database instance for decorator usage
 */
let globalMongooseTestDb: MongooseTestDatabaseInstance | null = null;

/**
 * Decorator for setting up Mongoose test database in Jest/Vitest test suites
 */
export function MongooseTestDatabase(config: MongooseConfig = {}) {
  return function(target: any) {
    // Store original beforeAll and afterAll if they exist
    const originalBeforeAll = target.beforeAll;
    const originalAfterAll = target.afterAll;

    // Set up database before all tests
    target.beforeAll = async () => {
      // Create Mongoose test database
      globalMongooseTestDb = await mongooseTestDatabaseManager.create(config);
      
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
      if (globalMongooseTestDb) {
        await globalMongooseTestDb.destroy();
        globalMongooseTestDb = null;
      }
    };

    return target;
  };
}

/**
 * Get the current Mongoose test database instance
 * Can be used within tests to access the database directly
 */
export function getMongooseTestDatabase(): MongooseTestDatabaseInstance {
  if (!globalMongooseTestDb) {
    throw new Error('No Mongoose test database available. Make sure to use @MongooseTestDatabase decorator.');
  }
  return globalMongooseTestDb;
}

/**
 * Alternative decorator that sets up database for each test (beforeEach/afterEach)
 * Provides better isolation but is slower
 */
export function MongooseTestDatabaseEach(config: MongooseConfig = {}) {
  return function(target: any) {
    const originalBeforeEach = target.beforeEach;
    const originalAfterEach = target.afterEach;

    target.beforeEach = async () => {
      globalMongooseTestDb = await mongooseTestDatabaseManager.create(config);
      
      if (originalBeforeEach) {
        await originalBeforeEach.call(target);
      }
    };

    target.afterEach = async () => {
      if (originalAfterEach) {
        await originalAfterEach.call(target);
      }
      
      if (globalMongooseTestDb) {
        await globalMongooseTestDb.destroy();
        globalMongooseTestDb = null;
      }
    };

    return target;
  };
}

/**
 * Decorator for MongoDB session-based test isolation
 * Note: MongoDB transactions require replica sets, so this is mainly for documentation
 */
export function WithMongooseSession() {
  return function(target: any, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;

    descriptor.value = async function(...args: any[]) {
      if (!globalMongooseTestDb) {
        throw new Error('No Mongoose test database available. Make sure to use @MongooseTestDatabase decorator.');
      }

      const connection = globalMongooseTestDb.getConnection();
      
      // For MongoDB, we'll use collection-level cleanup instead of transactions
      // since transactions require replica sets which are complex for testing
      
      // Get all collection names before the test
      const collectionsBefore = await connection.db.listCollections().toArray();
      const collectionNamesBefore = collectionsBefore.map((c: any) => c.name);
      
      try {
        // Run the test method
        const result = await method.apply(this, args);
        
        // Clean up: remove all data from collections that existed before
        for (const collectionName of collectionNamesBefore) {
          if (!collectionName.startsWith('system.')) {
            await connection.db.collection(collectionName).deleteMany({});
          }
        }
        
        return result;
      } catch (error) {
        // Clean up even if test failed
        for (const collectionName of collectionNamesBefore) {
          if (!collectionName.startsWith('system.')) {
            try {
              await connection.db.collection(collectionName).deleteMany({});
            } catch (cleanupError) {
              // Ignore cleanup errors
            }
          }
        }
        throw error;
      }
    };

    return descriptor;
  };
} 