import { DataSource, EntityTarget, Repository } from 'typeorm';
import { logger } from '../utils/logger';
import { ErrorHandler, FactoryError } from '../utils/errors';

/**
 * Factory definition function for TypeORM entities
 */
export type TypeORMFactoryDefinition<T> = (faker: any) => Partial<T>;

/**
 * TypeORM Factory class for generating test entities
 */
export class TypeORMFactory<T = any> {
  private definition: TypeORMFactoryDefinition<T>;
  private entityTarget: EntityTarget<T>;
  private dataSource?: DataSource;

  constructor(entityTarget: EntityTarget<T>, definition: TypeORMFactoryDefinition<T>) {
    this.entityTarget = entityTarget;
    this.definition = definition;
  }

  /**
   * Set the TypeORM DataSource
   */
  setDataSource(dataSource: DataSource): this {
    this.dataSource = dataSource;
    return this;
  }

  /**
   * Get the repository for this entity
   */
  private getRepository(): Repository<T> {
    if (!this.dataSource) {
      throw ErrorHandler.prismaClientNotSet(); // Reuse error, but for TypeORM
    }
    return this.dataSource.getRepository(this.entityTarget);
  }

  /**
   * Build entity data without saving
   */
  build(overrides: Partial<T> = {}): T {
    const faker = createFaker();
    const data = this.definition(faker);
    return { ...data, ...overrides } as T;
  }

  /**
   * Build multiple entities
   */
  buildMany(count: number, overrides: Partial<T> = {}): T[] {
    return Array.from({ length: count }, () => this.build(overrides));
  }

  /**
   * Create and save one entity
   */
  async create(overrides: Partial<T> = {}): Promise<T> {
    if (!this.dataSource) {
      throw new FactoryError('DataSource not set. Call factory.setDataSource(dataSource) first.', {
        suggestions: [
          'Call factory.setDataSource(dataSource) before using the factory',
          'Use TypeORMFactoryManager.setDataSource(dataSource) to set DataSource for all factories',
          'Ensure you are calling factories within a test context where DataSource is available'
        ]
      });
    }

    try {
      const data = this.build(overrides);
      const repository = this.getRepository();
      
      logger.debug(`Creating ${this.entityTarget.toString()} with TypeORM factory`);
      
      // Create entity instance
      const entity = repository.create(data);
      const result = await repository.save(entity);
      
      logger.debug(`Successfully created ${this.entityTarget.toString()} with id: ${(result as any).id || 'unknown'}`);
      return result;
    } catch (error) {
      logger.error(`Failed to create ${this.entityTarget.toString()} with factory`, error);
      throw ErrorHandler.handle(error, `TypeORMFactory.create:${this.entityTarget.toString()}`);
    }
  }

  /**
   * Create and save multiple entities
   */
  async createMany(count: number, overrides: Partial<T> = {}): Promise<T[]> {
    if (!this.dataSource) {
      throw new FactoryError('DataSource not set. Call factory.setDataSource(dataSource) first.');
    }

    try {
      logger.debug(`Creating ${count} ${this.entityTarget.toString()} entities with TypeORM factory`);
      const results: T[] = [];
      
      for (let i = 0; i < count; i++) {
        const item = await this.create(overrides);
        results.push(item);
      }
      
      logger.success(`Successfully created ${count} ${this.entityTarget.toString()} entities`);
      return results;
    } catch (error) {
      logger.error(`Failed to create ${count} ${this.entityTarget.toString()} entities`, error);
      throw ErrorHandler.handle(error, `TypeORMFactory.createMany:${this.entityTarget.toString()}`);
    }
  }

  /**
   * Create multiple entities in a batch (more efficient)
   */
  async createManyBatch(count: number, overrides: Partial<T> = {}): Promise<T[]> {
    if (!this.dataSource) {
      throw new FactoryError('DataSource not set. Call factory.setDataSource(dataSource) first.');
    }

    try {
      logger.debug(`Batch creating ${count} ${this.entityTarget.toString()} entities`);
      
      const repository = this.getRepository();
      const dataArray = this.buildMany(count, overrides);
      
      // Create entity instances
      const entities = dataArray.map(data => repository.create(data));
      
      // Batch save
      const results = await repository.save(entities);
      
      logger.success(`Successfully batch created ${count} ${this.entityTarget.toString()} entities`);
      return results;
    } catch (error) {
      logger.error(`Failed to batch create ${count} ${this.entityTarget.toString()} entities`, error);
      throw ErrorHandler.handle(error, `TypeORMFactory.createManyBatch:${this.entityTarget.toString()}`);
    }
  }
}

/**
 * Create a TypeORM factory for an entity
 */
export function defineTypeORMFactory<T>(
  entityTarget: EntityTarget<T>, 
  definition: TypeORMFactoryDefinition<T>
): TypeORMFactory<T> {
  return new TypeORMFactory(entityTarget, definition);
}

/**
 * Factory manager for TypeORM factories
 */
export class TypeORMFactoryManager {
  private static dataSource: DataSource;
  private static factories = new Map<string, TypeORMFactory<any>>();

  /**
   * Set the global DataSource for all TypeORM factories
   */
  static setDataSource(dataSource: DataSource): void {
    this.dataSource = dataSource;
    logger.debug(`Setting DataSource for ${this.factories.size} registered TypeORM factories`);
    // Update all existing factories
    this.factories.forEach(factory => factory.setDataSource(dataSource));
    logger.success('Successfully set DataSource for all TypeORM factories');
  }

  /**
   * Register a TypeORM factory
   */
  static register<T>(name: string, factory: TypeORMFactory<T>): void {
    if (this.dataSource) {
      factory.setDataSource(this.dataSource);
    }
    this.factories.set(name, factory);
  }

  /**
   * Get a registered TypeORM factory
   */
  static get<T>(name: string): TypeORMFactory<T> {
    const factory = this.factories.get(name);
    if (!factory) {
      throw new Error(`TypeORM Factory '${name}' not found. Register it first.`);
    }
    return factory;
  }

  /**
   * Create a factory and register it
   */
  static define<T>(
    name: string,
    entityTarget: EntityTarget<T>,
    definition: TypeORMFactoryDefinition<T>
  ): TypeORMFactory<T> {
    const factory = defineTypeORMFactory(entityTarget, definition);
    this.register(name, factory);
    return factory;
  }

  /**
   * Clear all TypeORM factories
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
    },
  };
} 