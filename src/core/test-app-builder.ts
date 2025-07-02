import { Test, TestingModule } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { TestAppConfig, DatabaseSeeder } from './interfaces';
import { TestDatabase, testDatabaseManager } from './test-database-manager';

/**
 * Builder for creating NestJS test applications with database integration
 */
export class TestAppBuilder {
  private testDb: TestDatabase | null = null;
  private config: TestAppConfig;

  constructor(config: TestAppConfig = {}) {
    this.config = config;
  }

  /**
   * Create a test NestJS application with integrated test database
   */
  async create(): Promise<TestingModule> {
    // Create test database
    this.testDb = await testDatabaseManager.create(this.config.databaseConfig);

    // Build the test module
    const moduleBuilder = Test.createTestingModule({
      imports: this.config.imports || [],
      providers: [
        // Provide the test Prisma client
        {
          provide: PrismaClient,
          useValue: this.testDb.getClient(),
        },
        // Additional providers
        ...(this.config.providers || []),
      ],
      controllers: this.config.controllers || [],
    });

    const module = await moduleBuilder.compile();

    // Run seeders if specified
    if (this.config.seed) {
      await this.runSeeders(this.config.seed);
    }

    return module;
  }

  /**
   * Get the test database instance
   */
  getTestDatabase(): TestDatabase | null {
    return this.testDb;
  }

  /**
   * Clean up the test application and database
   */
  async cleanup(): Promise<void> {
    if (this.testDb) {
      await this.testDb.destroy();
      this.testDb = null;
    }
  }

  private async runSeeders(seeders: string[] | DatabaseSeeder[] | ((client: PrismaClient) => Promise<void>)): Promise<void> {
    if (!this.testDb) {
      throw new Error('Test database not initialized');
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
 * Helper function to create a test app with database integration
 */
export async function createTestApp(config: TestAppConfig = {}): Promise<TestingModule> {
  const builder = new TestAppBuilder(config);
  return await builder.create();
}

/**
 * Helper function to create a test app builder for more advanced usage
 */
export function createTestAppBuilder(config: TestAppConfig = {}): TestAppBuilder {
  return new TestAppBuilder(config);
} 