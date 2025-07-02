import { Test, TestingModule } from '@nestjs/testing';
import { MongooseModule } from '@nestjs/mongoose';
import mongoose, { Connection } from 'mongoose';
import { TestAppConfig, DatabaseSeeder } from './interfaces';
import { MongooseConfig } from '../adapters/mongoose-adapter';
import { MongooseTestDatabase, mongooseTestDatabaseManager, MongooseSeeder } from './mongoose-test-database-manager';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';

/**
 * Configuration for creating Mongoose test NestJS applications
 */
export interface MongooseTestAppConfig extends Omit<TestAppConfig, 'databaseConfig' | 'seed'> {
  /** Mongoose-specific database configuration */
  databaseConfig?: MongooseConfig;
  
  /** Seed data to populate before tests */
  seed?: string[] | DatabaseSeeder[] | MongooseSeeder[] | ((connection: Connection) => Promise<void>);
  
  /** Schema definitions to register */
  schemas?: Array<{ name: string; schema: any; collection?: string }>;
}

/**
 * Builder for creating NestJS test applications with Mongoose integration
 */
export class MongooseTestAppBuilder {
  private testDb: MongooseTestDatabase | null = null;
  private config: MongooseTestAppConfig;

  constructor(config: MongooseTestAppConfig = {}) {
    this.config = config;
  }

  /**
   * Create a test NestJS application with integrated Mongoose test database
   */
  async create(): Promise<TestingModule> {
    try {
      // Create Mongoose test database
      this.testDb = await mongooseTestDatabaseManager.create(this.config.databaseConfig);
      const connection = this.testDb.getConnection();

      logger.debug('Setting up Mongoose test module...');

      // Register schemas if provided
      if (this.config.schemas) {
        for (const schemaConfig of this.config.schemas) {
          this.testDb.registerModel(
            schemaConfig.name,
            schemaConfig.schema,
            schemaConfig.collection
          );
        }
      }

      // Build the test module with Mongoose integration
      const moduleBuilder = Test.createTestingModule({
        imports: [
          // Configure Mongoose module with test database
          MongooseModule.forRootAsync({
            useFactory: () => ({
              uri: connection.db.databaseName, // This won't work directly
              // We need a different approach for NestJS + Mongoose integration
              connectionName: 'test',
            }),
            connectionFactory: async () => {
              // Return our test connection instead of creating a new one
              return connection;
            },
          }),
          // User-provided imports (including MongooseModule.forFeature)
          ...(this.config.imports || []),
        ],
        providers: [
          // Provide the test Connection
          {
            provide: 'CONNECTION',
            useValue: connection,
          },
          // Additional providers
          ...(this.config.providers || []),
        ],
        controllers: this.config.controllers || [],
      });

      const module = await moduleBuilder.compile();

      // Initialize the app
      const app = module.createNestApplication();
      await app.init();

      logger.success('Created Mongoose test application');

      // Run seeders if specified
      if (this.config.seed) {
        await this.runSeeders(this.config.seed);
      }

      return module;

    } catch (error: any) {
      logger.error('Failed to create Mongoose test application', error);
      throw ErrorHandler.handle(error, 'MongooseTestAppBuilder.create');
    }
  }

  /**
   * Get the Mongoose test database instance
   */
  getTestDatabase(): MongooseTestDatabase | null {
    return this.testDb;
  }

  /**
   * Clean up the test application and database
   */
  async cleanup(): Promise<void> {
    if (this.testDb) {
      await this.testDb.destroy();
      this.testDb = null;
      logger.debug('Cleaned up Mongoose test application');
    }
  }

  private async runSeeders(seeders: string[] | DatabaseSeeder[] | MongooseSeeder[] | ((connection: Connection) => Promise<void>)): Promise<void> {
    if (!this.testDb) {
      throw new Error('Mongoose test database not initialized');
    }

    if (typeof seeders === 'function') {
      // Handle function-based seeding
      await this.testDb.seed(seeders);
      return;
    }

    if (typeof seeders[0] === 'string') {
      // Handle string-based seeder names (would require a seeder registry)
      throw new Error('String-based seeders not yet implemented. Use DatabaseSeeder objects.');
    }

    await this.testDb.seed(seeders as DatabaseSeeder[]);
  }
}

/**
 * Alternative simpler approach for Mongoose + NestJS integration
 * This creates a test database separately and provides it to the module
 */
export class SimpleMongooseTestAppBuilder {
  private testDb: MongooseTestDatabase | null = null;
  private config: MongooseTestAppConfig;

  constructor(config: MongooseTestAppConfig = {}) {
    this.config = config;
  }

  async create(): Promise<{ module: TestingModule; connection: Connection }> {
    try {
      // Create Mongoose test database
      this.testDb = await mongooseTestDatabaseManager.create(this.config.databaseConfig);
      const connection = this.testDb.getConnection();

      logger.debug('Setting up simple Mongoose test module...');

      // Register schemas if provided
      if (this.config.schemas) {
        for (const schemaConfig of this.config.schemas) {
          this.testDb.registerModel(
            schemaConfig.name,
            schemaConfig.schema,
            schemaConfig.collection
          );
        }
      }

      // Build a simple test module
      const moduleBuilder = Test.createTestingModule({
        imports: this.config.imports || [],
        providers: [
          // Provide the test Connection
          {
            provide: Connection,
            useValue: connection,
          },
          {
            provide: 'DATABASE_CONNECTION',
            useValue: connection,
          },
          // Additional providers
          ...(this.config.providers || []),
        ],
        controllers: this.config.controllers || [],
      });

      const module = await moduleBuilder.compile();

      // Initialize the app
      const app = module.createNestApplication();
      await app.init();

      logger.success('Created simple Mongoose test application');

      // Run seeders if specified
      if (this.config.seed) {
        await this.runSeeders(this.config.seed);
      }

      return { module, connection };

    } catch (error: any) {
      logger.error('Failed to create simple Mongoose test application', error);
      throw ErrorHandler.handle(error, 'SimpleMongooseTestAppBuilder.create');
    }
  }

  getTestDatabase(): MongooseTestDatabase | null {
    return this.testDb;
  }

  async cleanup(): Promise<void> {
    if (this.testDb) {
      await this.testDb.destroy();
      this.testDb = null;
      logger.debug('Cleaned up simple Mongoose test application');
    }
  }

  private async runSeeders(seeders: string[] | DatabaseSeeder[] | MongooseSeeder[] | ((connection: Connection) => Promise<void>)): Promise<void> {
    if (!this.testDb) {
      throw new Error('Mongoose test database not initialized');
    }

    if (typeof seeders === 'function') {
      await this.testDb.seed(seeders);
      return;
    }

    if (typeof seeders[0] === 'string') {
      throw new Error('String-based seeders not yet implemented. Use DatabaseSeeder objects.');
    }

    await this.testDb.seed(seeders as DatabaseSeeder[]);
  }
}

/**
 * Helper function to create a Mongoose test app with database integration
 * Uses the simpler approach that's more reliable
 */
export async function createMongooseTestApp(config: MongooseTestAppConfig = {}): Promise<{ module: TestingModule; connection: Connection }> {
  const builder = new SimpleMongooseTestAppBuilder(config);
  return await builder.create();
}

/**
 * Helper function to create a Mongoose test app builder for more advanced usage
 */
export function createMongooseTestAppBuilder(config: MongooseTestAppConfig = {}): MongooseTestAppBuilder {
  return new MongooseTestAppBuilder(config);
}

/**
 * Helper function to create a simple Mongoose test app builder
 */
export function createSimpleMongooseTestAppBuilder(config: MongooseTestAppConfig = {}): SimpleMongooseTestAppBuilder {
  return new SimpleMongooseTestAppBuilder(config);
} 