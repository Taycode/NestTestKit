import mongoose, { Connection, Model, Document, Schema } from 'mongoose';
import { logger } from '../utils/logger';
import { ErrorHandler, FactoryError } from '../utils/errors';

/**
 * Factory definition function for Mongoose documents
 */
export type MongooseFactoryDefinition<T> = (faker: any) => Partial<T>;

/**
 * Mongoose Factory class for generating test documents
 */
export class MongooseFactory<T extends Document = any> {
  private definition: MongooseFactoryDefinition<T>;
  private modelName: string;
  private connection?: Connection;

  constructor(modelName: string, definition: MongooseFactoryDefinition<T>) {
    this.modelName = modelName;
    this.definition = definition;
  }

  /**
   * Set the Mongoose Connection
   */
  setConnection(connection: Connection): this {
    this.connection = connection;
    return this;
  }

  /**
   * Get the model for this factory
   */
  private getModel(): Model<T> {
    if (!this.connection) {
      throw new FactoryError('Connection not set. Call factory.setConnection(connection) first.', {
        suggestions: [
          'Call factory.setConnection(connection) before using the factory',
          'Use MongooseFactoryManager.setConnection(connection) to set Connection for all factories',
          'Ensure you are calling factories within a test context where Connection is available'
        ]
      });
    }

    try {
      return this.connection.model<T>(this.modelName);
    } catch (error: any) {
      throw new FactoryError(`Model '${this.modelName}' not found in connection.`, {
        suggestions: [
          `Register the ${this.modelName} model before using the factory`,
          'Check if the model name is correct',
          'Ensure the schema is properly defined and registered'
        ]
      });
    }
  }

  /**
   * Build document data without saving
   */
  build(overrides: Partial<T> = {}): Partial<T> {
    const faker = createFaker();
    const data = this.definition(faker);
    return { ...data, ...overrides };
  }

  /**
   * Build multiple documents
   */
  buildMany(count: number, overrides: Partial<T> = {}): Partial<T>[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }

  /**
   * Create and save one document
   */
  async create(overrides: Partial<T> = {}): Promise<T> {
    if (!this.connection) {
      throw new FactoryError('Connection not set. Call factory.setConnection(connection) first.', {
        suggestions: [
          'Call factory.setConnection(connection) before using the factory',
          'Use MongooseFactoryManager.setConnection(connection) to set Connection for all factories',
          'Ensure you are calling factories within a test context where Connection is available'
        ]
      });
    }

    try {
      const data = this.build(overrides);
      const Model = this.getModel();
      
      logger.debug(`Creating ${this.modelName} with Mongoose factory`);
      
      // Create and save document
      const document = new Model(data);
      const result = await document.save();
      
      logger.debug(`Successfully created ${this.modelName} with id: ${result._id}`);
      return result;
    } catch (error: any) {
      logger.error(`Failed to create ${this.modelName} with factory`, error);
      throw ErrorHandler.handle(error, `MongooseFactory.create:${this.modelName}`);
    }
  }

  /**
   * Create and save multiple documents
   */
  async createMany(count: number, overrides: Partial<T> = {}): Promise<T[]> {
    if (!this.connection) {
      throw new FactoryError('Connection not set. Call factory.setConnection(connection) first.');
    }

    try {
      logger.debug(`Creating ${count} ${this.modelName} documents with Mongoose factory`);
      const results: T[] = [];
      
      for (let i = 0; i < count; i++) {
        const item = await this.create(overrides);
        results.push(item);
      }
      
      logger.success(`Successfully created ${count} ${this.modelName} documents`);
      return results;
    } catch (error: any) {
      logger.error(`Failed to create ${count} ${this.modelName} documents`, error);
      throw ErrorHandler.handle(error, `MongooseFactory.createMany:${this.modelName}`);
    }
  }

  /**
   * Create multiple documents in a batch (more efficient)
   */
  async createManyBatch(count: number, overrides: Partial<T> = {}): Promise<T[]> {
    if (!this.connection) {
      throw new FactoryError('Connection not set. Call factory.setConnection(connection) first.');
    }

    try {
      logger.debug(`Batch creating ${count} ${this.modelName} documents`);
      
      const Model = this.getModel();
      const dataArray = this.buildMany(count, overrides);
      
      // Batch insert
      const results = await Model.insertMany(dataArray);
      
      logger.success(`Successfully batch created ${count} ${this.modelName} documents`);
      return results as T[];
    } catch (error: any) {
      logger.error(`Failed to batch create ${count} ${this.modelName} documents`, error);
      throw ErrorHandler.handle(error, `MongooseFactory.createManyBatch:${this.modelName}`);
    }
  }

  /**
   * Find documents using the model
   */
  async find(filter: any = {}): Promise<T[]> {
    const Model = this.getModel();
    return await Model.find(filter);
  }

  /**
   * Find one document using the model
   */
  async findOne(filter: any = {}): Promise<T | null> {
    const Model = this.getModel();
    return await Model.findOne(filter);
  }

  /**
   * Count documents using the model
   */
  async count(filter: any = {}): Promise<number> {
    const Model = this.getModel();
    return await Model.countDocuments(filter);
  }
}

/**
 * Create a Mongoose factory for a model
 */
export function defineMongooseFactory<T extends Document>(
  modelName: string, 
  definition: MongooseFactoryDefinition<T>
): MongooseFactory<T> {
  return new MongooseFactory(modelName, definition);
}

/**
 * Factory manager for Mongoose factories
 */
export class MongooseFactoryManager {
  private static connection: Connection;
  private static factories = new Map<string, MongooseFactory<any>>();

  /**
   * Set the global Connection for all Mongoose factories
   */
  static setConnection(connection: Connection): void {
    this.connection = connection;
    logger.debug(`Setting Connection for ${this.factories.size} registered Mongoose factories`);
    // Update all existing factories
    this.factories.forEach(factory => factory.setConnection(connection));
    logger.success('Successfully set Connection for all Mongoose factories');
  }

  /**
   * Register a Mongoose factory
   */
  static register<T extends Document>(name: string, factory: MongooseFactory<T>): void {
    if (this.connection) {
      factory.setConnection(this.connection);
    }
    this.factories.set(name, factory);
  }

  /**
   * Get a registered Mongoose factory
   */
  static get<T extends Document>(name: string): MongooseFactory<T> {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Mongoose Factory '${name}' not found. Register it first.`);
    }
    return factory;
  }

  /**
   * Create a factory and register it
   */
  static define<T extends Document>(
    name: string,
    modelName: string,
    definition: MongooseFactoryDefinition<T>
  ): MongooseFactory<T> {
    const factory = defineMongooseFactory(modelName, definition);
    this.register(name, factory);
    return factory;
  }

  /**
   * Clear all Mongoose factories
   */
  static clear(): void {
    this.factories.clear();
  }

  /**
   * Get all registered factory names
   */
  static getFactoryNames(): string[] {
    return Array.from(this.factories.keys());
  }
}

/**
 * Create a simple faker object for generating test data
 * (Same as the one in regular factory, but extracted for reuse)
 */
function createFaker() {
  const randomInt = (min: number, max: number) => 
    Math.floor(Math.random() * (max - min + 1)) + min;
    
  const pickRandom = <T>(array: T[]) => 
    array[Math.floor(Math.random() * array.length)];

  return {
    person: {
      firstName: () => pickRandom(['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Frank', 'Grace']),
      lastName: () => pickRandom(['Doe', 'Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Miller', 'Moore']),
      fullName: () => {
        const first = pickRandom(['John', 'Jane', 'Bob', 'Alice', 'Charlie', 'Diana', 'Frank', 'Grace']);
        const last = pickRandom(['Doe', 'Smith', 'Johnson', 'Brown', 'Davis', 'Wilson', 'Miller', 'Moore']);
        return `${first} ${last}`;
      },
    },
    internet: {
      email: () => `user${randomInt(1000, 9999)}@example.com`,
      username: () => `user${randomInt(100, 999)}`,
      url: () => `https://example${randomInt(1, 10)}.com`,
    },
    lorem: {
      word: () => pickRandom(['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit']),
      words: (count = 3) => Array.from({ length: count }, () => 
        pickRandom(['lorem', 'ipsum', 'dolor', 'sit', 'amet', 'consectetur', 'adipiscing', 'elit'])).join(' '),
      sentence: () => 'Lorem ipsum dolor sit amet consectetur adipiscing elit.',
      paragraph: () => 'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    },
    number: {
      int: (min = 1, max = 1000) => randomInt(min, max),
      float: (min = 0, max = 100) => Math.random() * (max - min) + min,
    },
    date: {
      recent: (days = 30) => new Date(Date.now() - Math.random() * days * 24 * 60 * 60 * 1000),
      future: (days = 30) => new Date(Date.now() + Math.random() * days * 24 * 60 * 60 * 1000),
      past: (days = 30) => new Date(Date.now() - Math.random() * days * 24 * 60 * 60 * 1000),
    },
    datatype: {
      boolean: () => Math.random() > 0.5,
      uuid: () => 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      }),
      objectId: () => new mongoose.Types.ObjectId().toString(),
    },
  };
} 