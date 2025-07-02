import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import * as fs from 'fs-extra';
import * as path from 'path';
import { DatabaseAdapter, TestDatabaseConfig, CleanupStrategy } from '../core/interfaces';
import { logger, PerformanceTimer } from '../utils/logger';
import { ErrorHandler, DatabaseError, MigrationError } from '../utils/errors';

/**
 * Prisma adapter for database testing
 */
export class PrismaAdapter implements DatabaseAdapter {
  private client: PrismaClient | null = null;
  private config: TestDatabaseConfig = {};
  private databaseUrl: string = '';

  async initialize(config: TestDatabaseConfig): Promise<void> {
    return await PerformanceTimer.measure('PrismaAdapter.initialize', async () => {
      try {
        this.config = {
          databaseUrl: 'file:./test.db',
          cleanup: 'truncate',
          applyMigrations: true,
          logging: false,
          ...config,
        };

        // Generate unique database URL for this test instance
        this.databaseUrl = this.generateDatabaseUrl();
        logger.debug(`Generated database URL: ${this.databaseUrl}`);

        // Set environment variable for Prisma
        process.env.DATABASE_URL = this.databaseUrl;

        // Create Prisma client with test database
        this.client = new PrismaClient({
          datasources: {
            db: {
              url: this.databaseUrl,
            },
          },
          log: this.config.logging ? ['query', 'info', 'warn', 'error'] : [],
          ...this.config.prismaOptions,
        });

        logger.info('Created Prisma client for test database');

        // Apply migrations if needed
        if (this.config.applyMigrations) {
          await this.applyMigrations();
        }

        // Connect to the database
        await this.client.$connect();
        logger.success('Successfully connected to test database');

      } catch (error) {
        logger.error('Failed to initialize PrismaAdapter', error);
        throw ErrorHandler.handle(error, 'PrismaAdapter.initialize');
      }
    });
  }

  async getConnection(): Promise<PrismaClient> {
    if (!this.client) {
      throw new Error('PrismaAdapter not initialized. Call initialize() first.');
    }
    return this.client;
  }

  async cleanup(strategy: CleanupStrategy): Promise<void> {
    if (!this.client) return;

    return await PerformanceTimer.measure(`PrismaAdapter.cleanup:${strategy}`, async () => {
      try {
        logger.debug(`Starting cleanup with strategy: ${strategy}`);

        switch (strategy) {
          case 'transaction':
            // For transaction-based cleanup, we would typically rollback
            // This is handled at a higher level in the test setup
            logger.debug('Transaction cleanup - handled externally');
            break;

          case 'truncate':
            await this.truncateAllTables();
            logger.debug('Truncated all tables');
            break;

          case 'recreate':
            await this.reset();
            logger.debug('Recreated database');
            break;

          default:
            throw ErrorHandler.invalidCleanupStrategy(strategy);
        }

        logger.success(`Cleanup completed with strategy: ${strategy}`);
      } catch (error) {
        logger.error(`Cleanup failed with strategy: ${strategy}`, error);
        throw ErrorHandler.handle(error, `PrismaAdapter.cleanup:${strategy}`);
      }
    });
  }

  async close(): Promise<void> {
    if (this.client) {
      await this.client.$disconnect();
      this.client = null;
    }
  }

  async executeRaw(query: string, params?: any[]): Promise<any> {
    if (!this.client) {
      throw new Error('PrismaAdapter not initialized');
    }

    if (params && params.length > 0) {
      return await this.client.$executeRawUnsafe(query, ...params);
    }
    return await this.client.$executeRawUnsafe(query);
  }

  async applyMigrations(): Promise<void> {
    return await PerformanceTimer.measure('PrismaAdapter.applyMigrations', async () => {
      try {
        // Use Prisma CLI to apply migrations
        const schemaPath = this.config.schemaPath || './prisma/schema.prisma';
        const migrationsPath = path.dirname(schemaPath) + '/migrations';

        logger.debug(`Checking for migrations at: ${migrationsPath}`);

        if (await fs.pathExists(migrationsPath)) {
          // Apply existing migrations
          logger.info('Applying existing migrations...');
          execSync('npx prisma migrate deploy', {
            stdio: 'pipe', // Change from 'inherit' to capture output
            env: {
              ...process.env,
              DATABASE_URL: this.databaseUrl,
            },
          });
          logger.success('Successfully applied migrations');
        } else {
          // Push schema directly for testing (no migration files)
          logger.info('No migrations found, pushing schema directly...');
          execSync('npx prisma db push --force-reset', {
            stdio: 'pipe',
            env: {
              ...process.env,
              DATABASE_URL: this.databaseUrl,
            },
          });
          logger.success('Successfully pushed schema');
        }
      } catch (error) {
        logger.warn('Primary migration strategy failed, trying fallback:', error);
        
        try {
          // Fallback to db push
          execSync('npx prisma db push --force-reset', {
            stdio: 'pipe',
            env: {
              ...process.env,
              DATABASE_URL: this.databaseUrl,
            },
          });
          logger.success('Successfully applied migrations via fallback');
        } catch (fallbackError) {
          logger.error('Migration fallback also failed:', fallbackError);
          throw ErrorHandler.migrationFailed(fallbackError);
        }
      }
    });
  }

  async reset(): Promise<void> {
    if (!this.client) return;

    try {
      // Disconnect current client
      await this.client.$disconnect();

      // Recreate database
      if (this.databaseUrl.includes(':memory:')) {
        // For in-memory databases, we need to recreate the client
        this.client = new PrismaClient({
          datasources: {
            db: {
              url: this.databaseUrl,
            },
          },
          log: this.config.logging ? ['query', 'info', 'warn', 'error'] : [],
          ...this.config.prismaOptions,
        });
      } else {
        // For file databases, delete and recreate
        const dbPath = this.extractDbPath(this.databaseUrl);
        if (dbPath && await fs.pathExists(dbPath)) {
          await fs.remove(dbPath);
        }
      }

      // Reapply migrations
      if (this.config.applyMigrations) {
        await this.applyMigrations();
      }

      // Reconnect
      await this.client.$connect();
    } catch (error) {
      throw new Error(`Failed to reset database: ${error}`);
    }
  }

  private generateDatabaseUrl(): string {
    if (this.config.databaseUrl) {
      return this.config.databaseUrl;
    }

    // Generate unique SQLite database
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(7);
    return `file:./test-${timestamp}-${random}.db`;
  }

  private async truncateAllTables(): Promise<void> {
    if (!this.client) return;

    try {
      // Get all table names (SQLite specific)
      const tables = await this.client.$queryRaw<Array<{ name: string }>>`
        SELECT name FROM sqlite_master 
        WHERE type='table' 
        AND name NOT LIKE 'sqlite_%' 
        AND name NOT LIKE '_prisma_migrations'
      `;

      // Disable foreign key constraints
      await this.client.$executeRawUnsafe('PRAGMA foreign_keys = OFF');

      // Truncate each table
      for (const table of tables) {
        await this.client.$executeRawUnsafe(`DELETE FROM "${table.name}"`);
      }

      // Re-enable foreign key constraints
      await this.client.$executeRawUnsafe('PRAGMA foreign_keys = ON');
    } catch (error) {
      throw new Error(`Failed to truncate tables: ${error}`);
    }
  }

  private extractDbPath(databaseUrl: string): string | null {
    // Extract file path from database URL
    const match = databaseUrl.match(/file:(.+)/);
    return match ? match[1] : null;
  }
} 