import { PrismaClient } from '@prisma/client';
import * as tmp from 'tmp';
import * as fs from 'fs-extra';
import { 
  TestDatabaseManager as ITestDatabaseManager, 
  TestDatabase as ITestDatabase, 
  TestDatabaseConfig, 
  DatabaseSeeder,
  CleanupStrategy 
} from './interfaces';
import { PrismaAdapter } from '../adapters/prisma-adapter';

/**
 * Implementation of TestDatabase interface
 */
export class TestDatabase implements ITestDatabase {
  public readonly id: string;
  public readonly databaseUrl: string;
  private adapter: PrismaAdapter;
  private config: TestDatabaseConfig;
  private isInitialized = false;

  constructor(id: string, databaseUrl: string, config: TestDatabaseConfig) {
    this.id = id;
    this.databaseUrl = databaseUrl;
    this.config = config;
    this.adapter = new PrismaAdapter();
  }

  async initialize(): Promise<void> {
    await this.adapter.initialize({
      ...this.config,
      databaseUrl: this.databaseUrl,
    });
    this.isInitialized = true;
  }

  getClient(): PrismaClient {
    if (!this.isInitialized) {
      throw new Error('TestDatabase not initialized. Call initialize() first.');
    }
    return this.adapter.getConnection() as any;
  }

  async seed(seeders: DatabaseSeeder[] | ((client: PrismaClient) => Promise<void>)): Promise<void> {
    const client = this.getClient();

    if (typeof seeders === 'function') {
      await seeders(client);
      return;
    }

    // Sort seeders by dependencies
    const sortedSeeders = this.resolveDependencies(seeders);
    
    for (const seeder of sortedSeeders) {
      try {
        await seeder.seed(client);
      } catch (error) {
        throw new Error(`Failed to run seeder ${seeder.name}: ${error}`);
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
        throw new Error(`Circular dependency detected in seeders: ${seederName}`);
      }

      const seeder = seederMap.get(seederName);
      if (!seeder) {
        throw new Error(`Seeder not found: ${seederName}`);
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
 * Manager for creating and managing test databases
 */
export class TestDatabaseManager implements ITestDatabaseManager {
  private databases = new Map<string, TestDatabase>();
  private static instance: TestDatabaseManager;

  static getInstance(): TestDatabaseManager {
    if (!TestDatabaseManager.instance) {
      TestDatabaseManager.instance = new TestDatabaseManager();
    }
    return TestDatabaseManager.instance;
  }

  async create(config: TestDatabaseConfig = {}): Promise<TestDatabase> {
    const id = this.generateId();
    const databaseUrl = await this.generateDatabaseUrl(config);

    const testDb = new TestDatabase(id, databaseUrl, config);
    await testDb.initialize();

    this.databases.set(id, testDb);
    return testDb;
  }

  get(id: string): TestDatabase | undefined {
    return this.databases.get(id);
  }

  async destroy(id: string): Promise<void> {
    const testDb = this.databases.get(id);
    if (testDb) {
      await testDb.destroy();
      this.databases.delete(id);
    }
  }

  async destroyAll(): Promise<void> {
    const destroyPromises = Array.from(this.databases.keys()).map(id => this.destroy(id));
    await Promise.all(destroyPromises);
  }

  private generateId(): string {
    return `test-db-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private async generateDatabaseUrl(config: TestDatabaseConfig): Promise<string> {
    if (config.databaseUrl) {
      return config.databaseUrl;
    }

    // Create temporary SQLite database file
    const tmpFile = tmp.fileSync({ 
      prefix: 'nest-test-db-',
      postfix: '.sqlite',
      keep: false // Will be cleaned up when process exits
    });

    return `file:${tmpFile.name}`;
  }
}

// Export singleton instance
export const testDatabaseManager = TestDatabaseManager.getInstance(); 