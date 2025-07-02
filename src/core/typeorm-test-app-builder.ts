import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { TestAppConfig, DatabaseSeeder } from './interfaces';
import { TypeORMConfig } from '../adapters/typeorm-adapter';
import { TypeORMTestDatabase, typeormTestDatabaseManager, TypeORMSeeder } from './typeorm-test-database-manager';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';

/**
 * Configuration for creating TypeORM test NestJS applications
 */
export interface TypeORMTestAppConfig extends Omit<TestAppConfig, 'databaseConfig' | 'seed'> {
  /** TypeORM-specific database configuration */
  databaseConfig?: TypeORMConfig;
  
  /** Seed data to populate before tests */
  seed?: string[] | DatabaseSeeder[] | TypeORMSeeder[] | ((dataSource: DataSource) => Promise<void>);
}

/**
 * Builder for creating NestJS test applications with TypeORM integration
 */
export class TypeORMTestAppBuilder {
  private testDb: TypeORMTestDatabase | null = null;
  private config: TypeORMTestAppConfig;

  constructor(config: TypeORMTestAppConfig = {}) {
    this.config = config;
  }

  /**
   * Create a test NestJS application with integrated TypeORM test database
   */
  async create(): Promise<TestingModule> {
    try {
      // Create TypeORM test database
      this.testDb = await typeormTestDatabaseManager.create(this.config.databaseConfig);
      const dataSource = this.testDb.getDataSource();

      logger.debug('Setting up TypeORM test module...');

      // Build the test module with TypeORM integration
      const moduleBuilder = Test.createTestingModule({
        imports: [
          // Configure TypeORM module with test database
          TypeOrmModule.forRootAsync({
            useFactory: () => ({
              ...dataSource.options,
              // Ensure we use the test database connection
              synchronize: false, // We handle this in the adapter
              retryAttempts: 0,
              keepConnectionAlive: false,
            }),
            dataSourceFactory: async () => {
              // Return our test DataSource instead of creating a new one
              return dataSource;
            },
          }),
          // User-provided imports
          ...(this.config.imports || []),
        ],
        providers: [
          // Provide the test DataSource
          {
            provide: DataSource,
            useValue: dataSource,
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

      logger.success('Created TypeORM test application');

      // Run seeders if specified
      if (this.config.seed) {
        await this.runSeeders(this.config.seed);
      }

      return module;

    } catch (error) {
      logger.error('Failed to create TypeORM test application', error);
      throw ErrorHandler.handle(error, 'TypeORMTestAppBuilder.create');
    }
  }

  /**
   * Get the TypeORM test database instance
   */
  getTestDatabase(): TypeORMTestDatabase | null {
    return this.testDb;
  }

  /**
   * Clean up the test application and database
   */
  async cleanup(): Promise<void> {
    if (this.testDb) {
      await this.testDb.destroy();
      this.testDb = null;
      logger.debug('Cleaned up TypeORM test application');
    }
  }

  private async runSeeders(seeders: string[] | DatabaseSeeder[] | TypeORMSeeder[] | ((dataSource: DataSource) => Promise<void>)): Promise<void> {
    if (!this.testDb) {
      throw new Error('TypeORM test database not initialized');
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
 * Helper function to create a TypeORM test app with database integration
 */
export async function createTypeORMTestApp(config: TypeORMTestAppConfig = {}): Promise<TestingModule> {
  const builder = new TypeORMTestAppBuilder(config);
  return await builder.create();
}

/**
 * Helper function to create a TypeORM test app builder for more advanced usage
 */
export function createTypeORMTestAppBuilder(config: TypeORMTestAppConfig = {}): TypeORMTestAppBuilder {
  return new TypeORMTestAppBuilder(config);
} 