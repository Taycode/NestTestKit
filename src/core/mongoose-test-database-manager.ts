import mongoose, { Connection, Model, Document, Schema } from 'mongoose';
import * as tmp from 'tmp';
import * as fs from 'fs-extra';
import { 
  TestDatabaseManager as ITestDatabaseManager, 
  TestDatabase as ITestDatabase, 
  TestDatabaseConfig, 
  DatabaseSeeder,
  CleanupStrategy 
} from './interfaces';
import { MongooseAdapter, MongooseConfig } from '../adapters/mongoose-adapter';
import { logger } from '../utils/logger';
import { ErrorHandler } from '../utils/errors';

/**
 * Mongoose-specific seeder interface
 */
export interface MongooseSeeder extends DatabaseSeeder {
  /** Execute seeding with Mongoose connection */
  seed(connection: Connection): Promise<void>;
}

/**
 * Mongoose implementation of TestDatabase interface
 */
export class MongooseTestDatabase implements ITestDatabase {
  public readonly id: string;
  public readonly databaseUrl: string;
  private adapter: MongooseAdapter;
  private config: MongooseConfig;
  private isInitialized = false;

  constructor(id: string, databaseUrl: string, config: MongooseConfig) {
    this.id = id;
    this.databaseUrl = databaseUrl;
    this.config = config;
    this.adapter = new MongooseAdapter();
  }

  async initialize(): Promise<void> {
    await this.adapter.initialize({
      ...this.config,
      databaseUrl: this.databaseUrl,
    });
    this.isInitialized = true;
  }

  getClient(): any {
    // For Mongoose, we return the Connection (equivalent to PrismaClient)
    return this.getConnection();
  }

  /**
   * Get the Mongoose Connection
   */
  getConnection(): Connection {
    if (!this.isInitialized) {
      throw new Error('MongooseTestDatabase not initialized. Call initialize() first.');
    }
    return this.adapter.getConnection() as any;
  }

  /**
   * Get a registered Mongoose model
   */
  getModel<T extends Document>(name: string): Model<T> {
    return this.adapter.getModel<T>(name);
  }

  /**
   * Register a new model dynamically
   */
  registerModel<T extends Document>(name: string, schema: Schema, collection?: string): Model<T> {
    return this.adapter.registerModel<T>(name, schema, collection);
  }

  /**
   * Get all registered model names
   */
  getRegisteredModelNames(): string[] {
    return this.adapter.getRegisteredModelNames();
  }

  async seed(seeders: DatabaseSeeder[] | MongooseSeeder[] | ((connection: Connection) => Promise<void>)): Promise<void> {
    const connection = this.getConnection();

    if (typeof seeders === 'function') {
      await seeders(connection);
      return;
    }

    // Sort seeders by dependencies
    const sortedSeeders = this.resolveDependencies(seeders);
    
    for (const seeder of sortedSeeders) {
      try {
        // Check if it's a Mongoose seeder or generic seeder
        if ('seed' in seeder && seeder.seed.length === 1) {
          // MongooseSeeder with Connection parameter
          await (seeder as MongooseSeeder).seed(connection);
        } else {
          // Generic seeder - pass Connection as client
          await seeder.seed(connection as any);
        }
        logger.debug(`Completed Mongoose seeder: ${seeder.name}`);
      } catch (error: any) {
        logger.error(`Failed to run Mongoose seeder ${seeder.name}:`, error);
        throw ErrorHandler.handle(error, `MongooseSeeder:${seeder.name}`);
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
 * Mongoose-specific database manager
 */
export class MongooseTestDatabaseManager implements ITestDatabaseManager {
  private databases = new Map<string, MongooseTestDatabase>();
  private static instance: MongooseTestDatabaseManager;

  static getInstance(): MongooseTestDatabaseManager {
    if (!MongooseTestDatabaseManager.instance) {
      MongooseTestDatabaseManager.instance = new MongooseTestDatabaseManager();
    }
    return MongooseTestDatabaseManager.instance;
  }

  async create(config: MongooseConfig = {}): Promise<MongooseTestDatabase> {
    const id = this.generateId();
    const databaseUrl = await this.generateDatabaseUrl(config);

    const testDb = new MongooseTestDatabase(id, databaseUrl, config);
    await testDb.initialize();

    this.databases.set(id, testDb);
    logger.debug(`Created Mongoose test database: ${id}`);
    return testDb;
  }

  get(id: string): MongooseTestDatabase | undefined {
    return this.databases.get(id);
  }

  async destroy(id: string): Promise<void> {
    const testDb = this.databases.get(id);
    if (testDb) {
      await testDb.destroy();
      this.databases.delete(id);
      logger.debug(`Destroyed Mongoose test database: ${id}`);
    }
  }

  async destroyAll(): Promise<void> {
    const destroyPromises = Array.from(this.databases.keys()).map(id => this.destroy(id));
    await Promise.all(destroyPromises);
    logger.debug('Destroyed all Mongoose test databases');
  }

  private generateId(): string {
    return `mongoose-test-db-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  }

  private async generateDatabaseUrl(config: MongooseConfig): Promise<string> {
    if (config.mongoUri) {
      return config.mongoUri;
    }

    // For Mongoose, we'll use MongoDB Memory Server by default
    // The actual URL will be generated in the adapter
    return 'memory://default';
  }
}

// Export singleton instance
export const mongooseTestDatabaseManager = MongooseTestDatabaseManager.getInstance(); 