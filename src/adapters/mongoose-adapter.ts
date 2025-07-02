import mongoose, { Connection, Model, Document, Schema } from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import * as fs from 'fs-extra';
import { DatabaseAdapter, TestDatabaseConfig, CleanupStrategy } from '../core/interfaces';
import { logger, PerformanceTimer } from '../utils/logger';
import { ErrorHandler, DatabaseError, ConfigurationError } from '../utils/errors';

/**
 * Mongoose-specific configuration
 */
export interface MongooseConfig extends TestDatabaseConfig {
  /** MongoDB connection URI (defaults to memory server) */
  mongoUri?: string;
  
  /** Use MongoDB Memory Server (default: true) */
  useMemoryServer?: boolean;
  
  /** MongoDB Memory Server options */
  memoryServerOptions?: {
    instance?: {
      port?: number;
      ip?: string;
      storageEngine?: string;
    };
    binary?: {
      version?: string;
      downloadDir?: string;
    };
  };
  
  /** Mongoose connection options */
  mongooseOptions?: mongoose.ConnectOptions;
  
  /** Models to register */
  models?: Array<{ name: string; schema: Schema; collection?: string }>;
  
  /** Auto-drop database on cleanup */
  dropDatabase?: boolean;
  
  /** Connection timeout in ms */
  connectionTimeout?: number;
}

/**
 * Mongoose adapter for MongoDB testing
 */
export class MongooseAdapter implements DatabaseAdapter {
  private connection: Connection | null = null;
  private memoryServer: MongoMemoryServer | null = null;
  private config: MongooseConfig = {};
  private mongoUri: string = '';
  private registeredModels: Map<string, Model<any>> = new Map();

  async initialize(config: TestDatabaseConfig): Promise<void> {
    return await PerformanceTimer.measure('MongooseAdapter.initialize', async () => {
      try {
        this.config = {
          useMemoryServer: true,
          dropDatabase: true,
          cleanup: 'truncate',
          logging: false,
          connectionTimeout: 10000,
          models: [],
          mongooseOptions: {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 45000,
          },
          ...config,
        } as MongooseConfig;

        // Set up MongoDB URI
        await this.setupMongoUri();
        
        // Create connection
        await this.createConnection();
        
        // Register models
        await this.registerModels();

        logger.success('Successfully connected to MongoDB test database');

      } catch (error) {
        logger.error('Failed to initialize MongooseAdapter', error);
        throw ErrorHandler.handle(error, 'MongooseAdapter.initialize');
      }
    });
  }

  async getConnection(): Promise<Connection> {
    if (!this.connection) {
      throw new Error('MongooseAdapter not initialized. Call initialize() first.');
    }
    return this.connection;
  }

  async cleanup(strategy: CleanupStrategy): Promise<void> {
    if (!this.connection) return;

    return await PerformanceTimer.measure(`MongooseAdapter.cleanup:${strategy}`, async () => {
      try {
        logger.debug(`Starting MongoDB cleanup with strategy: ${strategy}`);

        switch (strategy) {
          case 'transaction':
            // MongoDB transactions are more complex and require replica sets
            // For testing, we'll fall back to truncate
            logger.debug('Transaction cleanup not supported for MongoDB, using truncate');
            await this.truncateAllCollections();
            break;

          case 'truncate':
            await this.truncateAllCollections();
            logger.debug('Truncated all MongoDB collections');
            break;

          case 'recreate':
            await this.dropAndRecreateDatabase();
            logger.debug('Recreated MongoDB database');
            break;

          default:
            throw ErrorHandler.invalidCleanupStrategy(strategy);
        }

        logger.success(`MongoDB cleanup completed with strategy: ${strategy}`);
      } catch (error) {
        logger.error(`MongoDB cleanup failed with strategy: ${strategy}`, error);
        throw ErrorHandler.handle(error, `MongooseAdapter.cleanup:${strategy}`);
      }
    });
  }

  async close(): Promise<void> {
    try {
      // Close connection
      if (this.connection) {
        await this.connection.close();
        this.connection = null;
        logger.debug('Closed MongoDB connection');
      }

      // Stop memory server
      if (this.memoryServer) {
        await this.memoryServer.stop();
        this.memoryServer = null;
        logger.debug('Stopped MongoDB Memory Server');
      }

      // Clear registered models
      this.registeredModels.clear();

    } catch (error: any) {
      logger.warn('Error while closing MongoDB connection:', error);
    }
  }

  async executeRaw(query: string, params?: any[]): Promise<any> {
    if (!this.connection) {
      throw new Error('MongooseAdapter not initialized');
    }

    // For MongoDB, we execute commands directly
    try {
      return await this.connection.db.command({ eval: query, args: params || [] });
    } catch (error: any) {
      throw new Error(`Failed to execute MongoDB command: ${error}`);
    }
  }

  async applyMigrations(): Promise<void> {
    // MongoDB with Mongoose typically doesn't use migrations
    // Schema changes are handled automatically
    logger.debug('MongoDB migrations not applicable - schema changes handled automatically');
  }

  async reset(): Promise<void> {
    if (!this.connection) return;

    return await PerformanceTimer.measure('MongooseAdapter.reset', async () => {
      try {
        // Drop the entire database
        await this.connection.db.dropDatabase();
        
        // Re-register models (they will recreate collections as needed)
        await this.registerModels();

        logger.success('Successfully reset MongoDB database');
      } catch (error) {
        throw new Error(`Failed to reset MongoDB database: ${error}`);
      }
    });
  }

  /**
   * Get a registered Mongoose model
   */
  getModel<T extends Document>(name: string): Model<T> {
    const model = this.registeredModels.get(name);
    if (!model) {
      throw new Error(`Model '${name}' not found. Make sure it's registered in the config.`);
    }
    return model;
  }

  /**
   * Register a new model dynamically
   */
  registerModel<T extends Document>(name: string, schema: Schema, collection?: string): Model<T> {
    if (!this.connection) {
      throw new Error('MongooseAdapter not initialized');
    }

    const model = this.connection.model<T>(name, schema, collection);
    this.registeredModels.set(name, model);
    return model;
  }

  /**
   * Get all registered model names
   */
  getRegisteredModelNames(): string[] {
    return Array.from(this.registeredModels.keys());
  }

  private async setupMongoUri(): Promise<void> {
    if (this.config.mongoUri) {
      this.mongoUri = this.config.mongoUri;
      logger.debug(`Using provided MongoDB URI: ${this.mongoUri}`);
      return;
    }

    if (this.config.useMemoryServer) {
      // Start MongoDB Memory Server
      logger.debug('Starting MongoDB Memory Server...');
      
      this.memoryServer = await MongoMemoryServer.create({
        instance: this.config.memoryServerOptions?.instance,
        binary: this.config.memoryServerOptions?.binary,
      });

      this.mongoUri = this.memoryServer.getUri();
      logger.success(`MongoDB Memory Server started on: ${this.mongoUri}`);
    } else {
      throw new ConfigurationError(
        'No MongoDB URI provided and memory server is disabled',
        {
          suggestions: [
            'Set mongoUri in config',
            'Enable useMemoryServer: true',
            'Install mongodb-memory-server: npm install mongodb-memory-server'
          ]
        }
      );
    }
  }

  private async createConnection(): Promise<void> {
    try {
      logger.debug(`Connecting to MongoDB: ${this.mongoUri}`);
      
      // Create a new connection (not using default mongoose connection)
      this.connection = mongoose.createConnection(this.mongoUri, {
        ...this.config.mongooseOptions,
        maxPoolSize: 5, // Limit connection pool for testing
        minPoolSize: 1,
        maxIdleTimeMS: 30000,
        serverSelectionTimeoutMS: this.config.connectionTimeout,
      });

      // Wait for connection to be ready
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error(`MongoDB connection timeout after ${this.config.connectionTimeout}ms`));
        }, this.config.connectionTimeout);

        this.connection!.once('open', () => {
          clearTimeout(timeout);
          resolve();
        });

        this.connection!.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      logger.info('Connected to MongoDB test database');

    } catch (error: any) {
      throw new DatabaseError(
        `Failed to connect to MongoDB: ${error}`,
        {
          suggestions: [
            'Check if MongoDB is running',
            'Verify the connection URI',
            'Install mongodb-memory-server for testing',
            'Check network connectivity'
          ]
        }
      );
    }
  }

  private async registerModels(): Promise<void> {
    if (!this.config.models || this.config.models.length === 0) {
      logger.debug('No models to register');
      return;
    }

    for (const modelConfig of this.config.models) {
      try {
        const model = this.registerModel(
          modelConfig.name,
          modelConfig.schema,
          modelConfig.collection
        );
        
        logger.debug(`Registered MongoDB model: ${modelConfig.name}`);
      } catch (error) {
        logger.error(`Failed to register model ${modelConfig.name}:`, error);
        throw new ConfigurationError(
          `Failed to register model ${modelConfig.name}: ${error}`,
          {
            suggestions: [
              'Check if the schema is valid',
              'Ensure model names are unique',
              'Verify collection names are valid'
            ]
          }
        );
      }
    }

    logger.success(`Registered ${this.config.models.length} MongoDB models`);
  }

  private async truncateAllCollections(): Promise<void> {
    if (!this.connection) return;

    try {
      const collections = await this.connection.db.listCollections().toArray();
      
      if (collections.length === 0) {
        logger.debug('No collections found to truncate');
        return;
      }

      // Delete all documents from each collection
      const deletePromises = collections.map(async (collection: any) => {
        const collectionName = collection.name;
        
        // Skip system collections
        if (collectionName.startsWith('system.')) {
          return;
        }

        try {
          await this.connection!.db.collection(collectionName).deleteMany({});
          logger.debug(`Truncated collection: ${collectionName}`);
        } catch (error) {
          logger.warn(`Failed to truncate collection ${collectionName}:`, error);
        }
      });

      await Promise.all(deletePromises);
      logger.debug(`Truncated ${collections.length} collections`);

    } catch (error) {
      throw new Error(`Failed to truncate MongoDB collections: ${error}`);
    }
  }

  private async dropAndRecreateDatabase(): Promise<void> {
    if (!this.connection) return;

    try {
      // Drop the entire database
      await this.connection.db.dropDatabase();
      logger.debug('Dropped MongoDB database');

      // Re-register models (collections will be recreated on first use)
      await this.registerModels();
      logger.debug('Re-registered models after database recreation');

    } catch (error) {
      throw new Error(`Failed to recreate MongoDB database: ${error}`);
    }
  }
} 