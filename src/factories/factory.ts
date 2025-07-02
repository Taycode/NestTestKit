import { PrismaClient } from '@prisma/client';
import { logger } from '../utils/logger';
import { ErrorHandler, FactoryError } from '../utils/errors';

/**
 * Factory definition function
 */
export type FactoryDefinition<T> = (faker: any) => Partial<T>;

/**
 * Simple Factory class for generating test data
 */
export class Factory<T = any> {
  private definition: FactoryDefinition<T>;
  private modelName: string;
  private client?: PrismaClient;

  constructor(modelName: string, definition: FactoryDefinition<T>) {
    this.modelName = modelName;
    this.definition = definition;
  }

  /**
   * Set the Prisma client
   */
  setClient(client: PrismaClient): this {
    this.client = client;
    return this;
  }

  /**
   * Build data without saving
   */
  build(overrides: Partial<T> = {}): T {
    const faker = createFaker();
    const data = this.definition(faker);
    return { ...data, ...overrides } as T;
  }

  /**
   * Build multiple items
   */
  buildMany(count: number, overrides: Partial<T> = {}): T[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }

  /**
   * Create and save one item
   */
  async create(overrides: Partial<T> = {}): Promise<T> {
    if (!this.client) {
      throw ErrorHandler.prismaClientNotSet();
    }

    try {
      const data = this.build(overrides);
      logger.debug(`Creating ${this.modelName} with factory`);
      const result = await (this.client as any)[this.modelName].create({ data });
      logger.debug(`Successfully created ${this.modelName} with id: ${result.id || 'unknown'}`);
      return result;
    } catch (error) {
      logger.error(`Failed to create ${this.modelName} with factory`, error);
      throw ErrorHandler.handle(error, `Factory.create:${this.modelName}`);
    }
  }

  /**
   * Create and save multiple items
   */
  async createMany(count: number, overrides: Partial<T> = {}): Promise<T[]> {
    if (!this.client) {
      throw ErrorHandler.prismaClientNotSet();
    }

    try {
      logger.debug(`Creating ${count} ${this.modelName} entities with factory`);
      const results: T[] = [];
      
      for (let i = 0; i < count; i++) {
        const item = await this.create(overrides);
        results.push(item);
      }
      
      logger.success(`Successfully created ${count} ${this.modelName} entities`);
      return results;
    } catch (error) {
      logger.error(`Failed to create ${count} ${this.modelName} entities`, error);
      throw ErrorHandler.handle(error, `Factory.createMany:${this.modelName}`);
    }
  }
}

/**
 * Create a factory for a Prisma model
 */
export function defineFactory<T>(
  modelName: string, 
  definition: FactoryDefinition<T>
): Factory<T> {
  return new Factory(modelName, definition);
}

/**
 * Create a simple faker object for generating test data
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
    },
  };
}

/**
 * Factory helper with automatic client management
 */
export class FactoryManager {
  private static client: PrismaClient;
  private static factories = new Map<string, Factory<any>>();

  /**
   * Set the global Prisma client for all factories
   */
  static setClient(client: PrismaClient): void {
    this.client = client;
    logger.debug(`Setting Prisma client for ${this.factories.size} registered factories`);
    // Update all existing factories
    this.factories.forEach(factory => factory.setClient(client));
    logger.success('Successfully set Prisma client for all factories');
  }

  /**
   * Register a factory
   */
  static register<T>(name: string, factory: Factory<T>): void {
    if (this.client) {
      factory.setClient(this.client);
    }
    this.factories.set(name, factory);
  }

  /**
   * Get a registered factory
   */
  static get<T>(name: string): Factory<T> {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`Factory '${name}' not found. Register it first.`);
    }
    return factory;
  }

  /**
   * Create a factory and register it
   */
  static define<T>(
    name: string,
    modelName: string,
    definition: FactoryDefinition<T>
  ): Factory<T> {
    const factory = defineFactory(modelName, definition);
    this.register(name, factory);
    return factory;
  }

  /**
   * Clear all factories
   */
  static clear(): void {
    this.factories.clear();
  }
} 