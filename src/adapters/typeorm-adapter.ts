import { DataSource, DataSourceOptions, EntityTarget, Repository } from 'typeorm';
import * as fs from 'fs-extra';
import * as path from 'path';
import { DatabaseAdapter, TestDatabaseConfig, CleanupStrategy } from '../core/interfaces';
import { logger, PerformanceTimer } from '../utils/logger';
import { ErrorHandler, DatabaseError, MigrationError } from '../utils/errors';

/**
 * TypeORM-specific configuration
 */
export interface TypeORMConfig extends TestDatabaseConfig {
  /** Database type (defaults to 'sqlite') */
  type?: 'sqlite' | 'postgres' | 'mysql' | 'mariadb' | 'better-sqlite3';
  
  /** Entity classes to load */
  entities?: any[];
  
  /** Auto-load entities from pattern */
  entityPattern?: string;
  
  /** Enable synchronization (create tables automatically) */
  synchronize?: boolean;
  
  /** Migration files directory */
  migrationsDir?: string;
  
  /** Run migrations automatically */
  runMigrations?: boolean;
  
  /** Drop schema before creating */
  dropSchema?: boolean;
  
  /** Additional TypeORM options */
  typeormOptions?: Partial<DataSourceOptions>;
}

/**
 * TypeORM adapter for database testing
 */
export class TypeORMAdapter implements DatabaseAdapter {
  private dataSource: DataSource | null = null;
  private config: TypeORMConfig = {};
  private databaseUrl: string = '';

  async initialize(config: TestDatabaseConfig): Promise<void> {
    return await PerformanceTimer.measure('TypeORMAdapter.initialize', async () => {
      try {
        this.config = {
          type: 'sqlite',
          databaseUrl: ':memory:',
          cleanup: 'truncate',
          synchronize: true,
          runMigrations: false,
          dropSchema: false,
          logging: false,
          entities: [],
          ...config,
        } as TypeORMConfig;

        // Generate unique database URL for this test instance
        this.databaseUrl = this.generateDatabaseUrl();
        logger.debug(`Generated TypeORM database URL: ${this.databaseUrl}`);

        // Create DataSource configuration
        const dataSourceOptions = await this.createDataSourceOptions();
        
        // Create and initialize DataSource
        this.dataSource = new DataSource(dataSourceOptions);
        await this.dataSource.initialize();
        
        logger.info('Created TypeORM DataSource for test database');

        // Run migrations if configured
        if (this.config.runMigrations) {
          await this.runMigrations();
        }

        // Synchronize schema if configured
        if (this.config.synchronize) {
          await this.dataSource.synchronize(this.config.dropSchema);
          logger.debug('Synchronized TypeORM schema');
        }

        logger.success('Successfully connected to TypeORM test database');

      } catch (error) {
        logger.error('Failed to initialize TypeORMAdapter', error);
        throw ErrorHandler.handle(error, 'TypeORMAdapter.initialize');
      }
    });
  }

  async getConnection(): Promise<DataSource> {
    if (!this.dataSource) {
      throw new Error('TypeORMAdapter not initialized. Call initialize() first.');
    }
    return this.dataSource;
  }

  async cleanup(strategy: CleanupStrategy): Promise<void> {
    if (!this.dataSource) return;

    return await PerformanceTimer.measure(`TypeORMAdapter.cleanup:${strategy}`, async () => {
      try {
        logger.debug(`Starting TypeORM cleanup with strategy: ${strategy}`);

        switch (strategy) {
          case 'transaction':
            // For transaction-based cleanup, we would typically rollback
            // This is handled at a higher level in the test setup
            logger.debug('Transaction cleanup - handled externally');
            break;

          case 'truncate':
            await this.truncateAllTables();
            logger.debug('Truncated all TypeORM tables');
            break;

          case 'recreate':
            await this.reset();
            logger.debug('Recreated TypeORM database');
            break;

          default:
            throw ErrorHandler.invalidCleanupStrategy(strategy);
        }

        logger.success(`TypeORM cleanup completed with strategy: ${strategy}`);
      } catch (error) {
        logger.error(`TypeORM cleanup failed with strategy: ${strategy}`, error);
        throw ErrorHandler.handle(error, `TypeORMAdapter.cleanup:${strategy}`);
      }
    });
  }

  async close(): Promise<void> {
    if (this.dataSource?.isInitialized) {
      await this.dataSource.destroy();
      this.dataSource = null;
      logger.debug('Closed TypeORM DataSource');
    }
  }

  async executeRaw(query: string, params?: any[]): Promise<any> {
    if (!this.dataSource) {
      throw new Error('TypeORMAdapter not initialized');
    }

    if (params && params.length > 0) {
      return await this.dataSource.query(query, params);
    }
    return await this.dataSource.query(query);
  }

  async applyMigrations(): Promise<void> {
    return await this.runMigrations();
  }

  async reset(): Promise<void> {
    if (!this.dataSource) return;

    return await PerformanceTimer.measure('TypeORMAdapter.reset', async () => {
      try {
        // Close current connection
        await this.dataSource.destroy();

        // Recreate database for file-based databases
        if (this.databaseUrl.startsWith('file:') || this.config.type === 'sqlite') {
          const dbPath = this.extractDbPath(this.databaseUrl);
          if (dbPath && await fs.pathExists(dbPath)) {
            await fs.remove(dbPath);
            logger.debug(`Removed database file: ${dbPath}`);
          }
        }

        // Reinitialize
        const dataSourceOptions = await this.createDataSourceOptions();
        this.dataSource = new DataSource(dataSourceOptions);
        await this.dataSource.initialize();

        // Recreate schema
        if (this.config.synchronize) {
          await this.dataSource.synchronize(true); // Force drop and recreate
        }

        if (this.config.runMigrations) {
          await this.runMigrations();
        }

        logger.success('Successfully reset TypeORM database');
      } catch (error) {
        throw new Error(`Failed to reset TypeORM database: ${error}`);
      }
    });
  }

  /**
   * Get a repository for an entity
   */
  getRepository<Entity>(entityTarget: EntityTarget<Entity>): Repository<Entity> {
    if (!this.dataSource) {
      throw new Error('TypeORMAdapter not initialized');
    }
    return this.dataSource.getRepository(entityTarget);
  }

  /**
   * Get the entity manager
   */
  getEntityManager() {
    if (!this.dataSource) {
      throw new Error('TypeORMAdapter not initialized');
    }
    return this.dataSource.manager;
  }

  private async createDataSourceOptions(): Promise<DataSourceOptions> {
    const baseOptions: Partial<DataSourceOptions> = {
      type: this.config.type as any,
      logging: this.config.logging ? ['query', 'error', 'warn'] : false,
      synchronize: false, // We handle this manually
      entities: this.config.entities || [],
      ...this.config.typeormOptions,
    };

    // Handle database URL configuration
    if (this.config.type === 'sqlite' || this.config.type === 'better-sqlite3') {
      return {
        ...baseOptions,
        database: this.databaseUrl.replace('file:', ''),
      } as DataSourceOptions;
    }

    // For other database types, parse the URL
    if (this.databaseUrl.startsWith('postgres://') || this.databaseUrl.startsWith('postgresql://')) {
      return {
        ...baseOptions,
        url: this.databaseUrl,
      } as DataSourceOptions;
    }

    if (this.databaseUrl.startsWith('mysql://')) {
      return {
        ...baseOptions,
        url: this.databaseUrl,
      } as DataSourceOptions;
    }

    // Default SQLite configuration
    return {
      ...baseOptions,
      type: 'sqlite',
      database: this.databaseUrl.includes(':memory:') ? ':memory:' : this.databaseUrl,
    } as DataSourceOptions;
  }

  private generateDatabaseUrl(): string {
    if (this.config.databaseUrl) {
      return this.config.databaseUrl;
    }

    // Generate unique SQLite database based on type
    if (this.config.type === 'sqlite' || this.config.type === 'better-sqlite3') {
      if (this.config.databaseUrl === ':memory:') {
        return ':memory:';
      }
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      return `file:./test-typeorm-${timestamp}-${random}.db`;
    }

    // For other databases, use memory or generate test database URL
    return ':memory:';
  }

  private async truncateAllTables(): Promise<void> {
    if (!this.dataSource) return;

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      
      try {
        // Get all table names
        const tables = await queryRunner.getTables();
        
        if (tables.length === 0) {
          logger.debug('No tables found to truncate');
          return;
        }

        // Disable foreign key constraints for SQLite
        if (this.config.type === 'sqlite' || this.config.type === 'better-sqlite3') {
          await queryRunner.query('PRAGMA foreign_keys = OFF');
        }

        // Truncate each table
        for (const table of tables) {
          const tableName = table.name;
          
          // Skip migration tables
          if (tableName.includes('migration') || tableName.includes('typeorm')) {
            continue;
          }

          if (this.config.type === 'sqlite' || this.config.type === 'better-sqlite3') {
            await queryRunner.query(`DELETE FROM "${tableName}"`);
          } else {
            await queryRunner.query(`TRUNCATE TABLE "${tableName}" CASCADE`);
          }
        }

        // Re-enable foreign key constraints for SQLite
        if (this.config.type === 'sqlite' || this.config.type === 'better-sqlite3') {
          await queryRunner.query('PRAGMA foreign_keys = ON');
        }

        logger.debug(`Truncated ${tables.length} tables`);
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      throw new Error(`Failed to truncate TypeORM tables: ${error}`);
    }
  }

  private async runMigrations(): Promise<void> {
    if (!this.dataSource) return;

    return await PerformanceTimer.measure('TypeORMAdapter.runMigrations', async () => {
      try {
        logger.info('Running TypeORM migrations...');
        
        const migrations = await this.dataSource.runMigrations();
        
        if (migrations.length > 0) {
          logger.success(`Successfully ran ${migrations.length} TypeORM migrations`);
        } else {
          logger.debug('No TypeORM migrations to run');
        }
      } catch (error) {
        logger.error('TypeORM migration failed:', error);
        throw ErrorHandler.migrationFailed(error);
      }
    });
  }

  private extractDbPath(databaseUrl: string): string | null {
    // Extract file path from database URL
    if (databaseUrl.startsWith('file:')) {
      return databaseUrl.replace('file:', '');
    }
    if (databaseUrl.endsWith('.db') || databaseUrl.endsWith('.sqlite')) {
      return databaseUrl;
    }
    return null;
  }
} 