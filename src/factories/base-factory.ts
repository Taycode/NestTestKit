import { PrismaClient } from '@prisma/client';

/**
 * Factory definition function type
 */
export type FactoryDefinition<T> = (faker?: any, index?: number) => Partial<T>;

/**
 * Factory options for customizing generation
 */
export interface FactoryOptions {
  /** Override specific fields */
  overrides?: Record<string, any>;
  /** Use specific faker seed for reproducible data */
  seed?: number;
  /** Custom context for generation */
  context?: Record<string, any>;
}

/**
 * Factory build result
 */
export interface FactoryBuildResult<T> {
  /** Generated data (not yet saved) */
  data: T;
  /** Save the entity to database */
  save(): Promise<T>;
  /** Build multiple entities */
  buildMany(count: number, options?: FactoryOptions): FactoryBuildResult<T>[];
}

/**
 * Base factory class for generating test data
 */
export abstract class BaseFactory<T = any> {
  protected definition: FactoryDefinition<T>;
  protected client: PrismaClient;
  protected modelName: string;

  constructor(modelName: string, definition: FactoryDefinition<T>, client?: PrismaClient) {
    this.modelName = modelName;
    this.definition = definition;
    this.client = client!; // Will be set when used
  }

  /**
   * Set the Prisma client for database operations
   */
  setClient(client: PrismaClient): this {
    this.client = client;
    return this;
  }

  /**
   * Build entity data without saving to database
   */
  build(options: FactoryOptions = {}): T {
    const faker = this.getFaker(options.seed);
    const baseData = this.definition(faker, 0);
    
    return {
      ...baseData,
      ...options.overrides,
    } as T;
  }

  /**
   * Build multiple entities without saving
   */
  buildMany(count: number, options: FactoryOptions = {}): T[] {
    const faker = this.getFaker(options.seed);
    
    return Array.from({ length: count }, (_, index) => {
      const baseData = this.definition(faker, index);
      return {
        ...baseData,
        ...options.overrides,
      } as T;
    });
  }

  /**
   * Create and save a single entity
   */
  async create(options: FactoryOptions = {}): Promise<T> {
    if (!this.client) {
      throw new Error('Prisma client not set. Use setClient() or call from within a test context.');
    }

    const data = this.build(options);
    return await (this.client as any)[this.modelName].create({ data });
  }

  /**
   * Create and save multiple entities
   */
  async createMany(count: number, options: FactoryOptions = {}): Promise<T[]> {
    if (!this.client) {
      throw new Error('Prisma client not set. Use setClient() or call from within a test context.');
    }

    const dataArray = this.buildMany(count, options);
    
    // Use createMany for better performance if no overrides per item
    if (!options.overrides && count > 1) {
      await (this.client as any)[this.modelName].createMany({ data: dataArray });
      // Return the created entities (note: this is a simplified approach)
      return dataArray;
    }

    // Create individually if overrides or special handling needed
    const created: T[] = [];
    for (const data of dataArray) {
      const entity = await (this.client as any)[this.modelName].create({ data });
      created.push(entity);
    }
    
    return created;
  }

  /**
   * Define relationships and associations
   */
  with<K extends keyof T>(
    field: K,
    factory: BaseFactory<any> | (() => any),
    options: FactoryOptions = {}
  ): this {
    const originalDefinition = this.definition;
    
    this.definition = (faker, index) => {
      const baseData = originalDefinition(faker, index);
      
      let relationData;
      if (typeof factory === 'function') {
        relationData = factory();
      } else {
        relationData = factory.build(options);
      }
      
      return {
        ...baseData,
        [field]: relationData,
      };
    };
    
    return this;
  }

  /**
   * Create factory with trait (predefined modifications)
   */
  trait(traitName: string, modifications: Partial<T> | FactoryDefinition<T>): this {
    const originalDefinition = this.definition;
    
    this.definition = (faker, index) => {
      const baseData = originalDefinition(faker, index);
      
      if (typeof modifications === 'function') {
        const traitData = modifications(faker, index);
        return { ...baseData, ...traitData };
      }
      
      return { ...baseData, ...modifications };
    };
    
    return this;
  }

  /**
   * Get faker instance (with optional seed)
   */
  private getFaker(seed?: number) {
    // For now, return a simple faker-like object
    // In a real implementation, you'd use @faker-js/faker
    const random = seed ? this.seededRandom(seed) : Math.random;
    
    return {
      name: {
        firstName: () => this.pickRandom(['John', 'Jane', 'Bob', 'Alice', 'Charlie'], random),
        lastName: () => this.pickRandom(['Doe', 'Smith', 'Johnson', 'Brown', 'Davis'], random),
        fullName: () => `${this.pickRandom(['John', 'Jane', 'Bob'], random)} ${this.pickRandom(['Doe', 'Smith'], random)}`,
      },
      internet: {
        email: () => `user${Math.floor(random() * 10000)}@example.com`,
        username: () => `user${Math.floor(random() * 10000)}`,
      },
      lorem: {
        sentence: () => 'Lorem ipsum dolor sit amet consectetur.',
        paragraph: () => 'Lorem ipsum dolor sit amet consectetur adipiscing elit.',
      },
      number: {
        int: (min = 1, max = 1000) => Math.floor(random() * (max - min + 1)) + min,
      },
      date: {
        recent: () => new Date(Date.now() - random() * 30 * 24 * 60 * 60 * 1000),
        future: () => new Date(Date.now() + random() * 30 * 24 * 60 * 60 * 1000),
      },
    };
  }

  private pickRandom<T>(array: T[], random = Math.random): T {
    return array[Math.floor(random() * array.length)];
  }

  private seededRandom(seed: number) {
    let m = seed;
    return () => {
      m = (m * 9301 + 49297) % 233280;
      return m / 233280;
    };
  }
}

/**
 * Factory builder helper
 */
export class FactoryBuilder {
  private static factories = new Map<string, BaseFactory<any>>();

  /**
   * Define a new factory
   */
  static define<T>(modelName: string, definition: FactoryDefinition<T>): BaseFactory<T> {
    const factory = new (class extends BaseFactory<T> {})(modelName, definition);
    this.factories.set(modelName, factory);
    return factory;
  }

  /**
   * Get a defined factory
   */
  static get<T>(modelName: string): BaseFactory<T> {
    const factory = this.factories.get(modelName);
    if (!factory) {
      throw new Error(`Factory for model '${modelName}' not found. Define it first using FactoryBuilder.define().`);
    }
    return factory;
  }

  /**
   * Set Prisma client for all factories
   */
  static setClient(client: PrismaClient): void {
    for (const factory of this.factories.values()) {
      factory.setClient(client);
    }
  }

  /**
   * Clear all factories (useful for testing)
   */
  static clear(): void {
    this.factories.clear();
  }
} 