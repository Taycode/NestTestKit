import { DataSource, EntityTarget, Repository } from 'typeorm';
import * as tmp from 'tmp';
import * as fs from 'fs-extra';
import { 
  TestDatabaseManager as ITestDatabaseManager, 
  TestDatabase as ITestDatabase, 
  TestDatabaseConfig, 
  DatabaseSeeder,
  CleanupStrategy 
} from './interfaces';
import { TypeORMAdapter, TypeORMConfig } from '../adapters/typeorm-adapter';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';

/**
 * TypeORM-specific seeder interface
 */
export interface TypeORMSeeder extends DatabaseSeeder {
  /** Execute seeding with TypeORM DataSource */
  seed(dataSource: DataSource): Promise<void>;
}

/**
 * TypeORM implementation of TestDatabase interface
 */
export class TypeORMTestDatabase implements ITestDatabase {
  public readonly id: string;
  public readonly databaseUrl: string;
  private adapter: TypeORMAdapter;
  private config: TypeORMConfig;
  private isInitialized = false;

  constructor(id: string, databaseUrl: string, config: TypeORMConfig) {
    this.id = id;
    this.databaseUrl = databaseUrl;
    this.config = config;
    this.adapter = new TypeORMAdapter();
  }

  async initialize(): Promise<void> {
    await this.adapter.initialize({
      ...this.config,
      databaseUrl: this.databaseUrl,
    });
    this.isInitialized = true;
  }

  getClient(): any {
    // For TypeORM, we return the DataSource (equivalent to PrismaClient)
    return this.getDataSource();
  }

  /**
   * Get the TypeORM DataSource
   */
  getDataSource(): DataSource {
    if (!this.isInitialized) {
      throw new Error('TypeORMTestDatabase not initialized. Call initialize() first.');
    }
    return this.adapter.getConnection() as any;
  }

  /**
   * Get a repository for an entity
   */
  getRepository<Entity>(entityTarget: EntityTarget<Entity>): Repository<Entity> {
    return this.adapter.getRepository(entityTarget);
  }

  /**
   * Get the entity manager
   */
  getEntityManager() {
    return this.adapter.getEntityManager();
  }

  async seed(seeders: DatabaseSeeder[] | TypeORMSeeder[] | ((dataSource: DataSource) => Promise<void>)): Promise<void> {
    const dataSource = this.getDataSource();

    if (typeof seeders === 'function') {
      await seeders(dataSource);
      return;
    }

    // Sort seeders by dependencies
    const sortedSeeders = this.resolveDependencies(seeders);
    
    for (const seeder of sortedSeeders) {
      try {
        // Check if it's a TypeORM seeder or generic seeder
        if ('seed' in seeder && seeder.seed.length === 1) {
          // TypeORMSeeder with DataSource parameter
          await (seeder as TypeORMSeeder).seed(dataSource);
        } else {
          // Generic seeder - pass DataSource as client
          await seeder.seed(dataSource as any);
        }
        logger.debug(`Completed TypeORM seeder: ${seeder.name}`);
      } catch (error) {
        logger.error(`Failed to run TypeORM seeder ${seeder.name}:`, error);
        throw ErrorHandler.handle(error, `TypeORMSeeder:${seeder.name}`);
      }
    }
  }

  async cleanup(strategy?: CleanupStrategy): Promise<void> {
    const cleanupStrategy = strategy || this.config.cleanup || 'truncate';
    await this.adapter.cleanup(cleanupStrategy);
  }

  async destroy(): Promise<void> {
    if (this.adapter) {
      await this.adapter.close();
    }
    
    // Clean up database file if it's a file-based SQLite database
    if (this.databaseUrl.startsWith('file:') && !this.databaseUrl.includes(':memory:')) {
      const dbPath = this.databaseUrl.replace('file:', '');
      if (await fs.pathExists(dbPath)) {
        await fs.remove(dbPath);
      }
    }
  }

  isReady(): boolean {
    return this.isInitialized;
  }

  private resolveDependencies(seeders: DatabaseSeeder[]): DatabaseSeeder[] {
    const resolved: DatabaseSeeder[] = [];
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const seederMap = new Map<string, DatabaseSeeder>();
    seeders.forEach(seeder => seederMap.set(seeder.name, seeder));

    const visit = (seederName: string) => {
      if (visited.has(seederName)) return;
      if (visiting.has(seederName)) {
        throw ErrorHandler.seederDependencyError(seederName, 'circular dependency detected');
      }

      const seeder = seederMap.get(seederName);
      if (!seeder) {
        throw ErrorHandler.seederDependencyError('unknown', seederName);
      }

      visiting.add(seederName);

      // Visit dependencies first
      if (seeder.dependencies) {
        for (const dep of seeder.dependencies) {
          visit(dep);
        }
      }

      visiting.delete(seederName);
      visited.add(seederName);
      resolved.push(seeder);
    };

    for (const seeder of seeders) {
      visit(seeder.name);
    }

    return resolved;
  }
}

/**
 * TypeORM-specific database manager
 */
export class TypeORMTestDatabaseManager implements ITestDatabaseManager {
  private databases = new Map<string, TypeORMTestDatabase>();
  private static instance: TypeORMTestDatabaseManager;

  static getInstance(): TypeORMTestDatabaseManager {
    if (!TypeORMTestDatabaseManager.instance) {
      TypeORMTestDatabaseManager.instance = new TypeORMTestDatabaseManager();
    }
    return TypeORMTestDatabaseManager.instance;
  }

  async create(config: TypeORMConfig = {}): Promise<TypeORMTestDatabase> {
    const id = this.generateId();
    const databaseUrl = await this.generateDatabaseUrl(config);

    const testDb = new TypeORMTestDatabase(id, databaseUrl, config);
    await testDb.initialize();

    this.databases.set(id, testDb);
    logger.debug(`Created TypeORM test database: ${id}`);
    return testDb;
  }

  get(id: string): TypeORMTestDatabase | undefined {
    return this.databases.get(id);
  }

  async destroy(id: string): Promise<void> {
    const testDb = this.databases.get(id);
    if (testDb) {
      await testDb.destroy();
      this.databases.delete(id);
      logger.debug(`Destroyed TypeORM test database: ${id}`);
    }
  }

  async destroyAll(): Promise<void> {
    const destroyPromises = Array.from(this.databases.keys()).map(id => this.destroy(id));
    await Promise.all(destroyPromises);
    logger.debug('Destroyed all TypeORM test databases');
  }

  private generateId(): string {
    return `typeorm-test-db-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private async generateDatabaseUrl(config: TypeORMConfig): Promise<string> {
    if (config.databaseUrl) {
      return config.databaseUrl;
    }

    // Default to SQLite for TypeORM testing
    const dbType = config.type || 'sqlite';

    if (dbType === 'sqlite' || dbType === 'better-sqlite3') {
      if (config.databaseUrl === ':memory:') {
        return ':memory:';
      }

      // Create temporary SQLite database file
      const tmpFile = tmp.fileSync({ 
        prefix: 'nest-test-typeorm-',
        postfix: '.sqlite',
        keep: false // Will be cleaned up when process exits
      });

      return `file:${tmpFile.name}`;
    }

    // For other database types, return memory URL or default
    return ':memory:';
  }
}

// Export singleton instance
export const typeormTestDatabaseManager = TypeORMTestDatabaseManager.getInstance(); 