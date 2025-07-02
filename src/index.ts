// Core interfaces and types
export * from './core/interfaces';

// Main classes
export { TestDatabase, TestDatabaseManager, testDatabaseManager } from './core/test-database-manager';
export { TestAppBuilder, createTestApp, createTestAppBuilder } from './core/test-app-builder';

// TypeORM classes
export { 
  TypeORMTestDatabase, 
  TypeORMTestDatabaseManager, 
  typeormTestDatabaseManager,
  TypeORMSeeder 
} from './core/typeorm-test-database-manager';
export { 
  TypeORMTestAppBuilder, 
  createTypeORMTestApp, 
  createTypeORMTestAppBuilder,
  TypeORMTestAppConfig 
} from './core/typeorm-test-app-builder';

// Mongoose classes
export { 
  MongooseTestDatabase, 
  MongooseTestDatabaseManager, 
  mongooseTestDatabaseManager,
  MongooseSeeder 
} from './core/mongoose-test-database-manager';
export { 
  MongooseTestAppBuilder, 
  SimpleMongooseTestAppBuilder,
  createMongooseTestApp, 
  createMongooseTestAppBuilder,
  createSimpleMongooseTestAppBuilder,
  MongooseTestAppConfig 
} from './core/mongoose-test-app-builder';

// Adapters
export { PrismaAdapter } from './adapters/prisma-adapter';
export { TypeORMAdapter, TypeORMConfig } from './adapters/typeorm-adapter';
export { MongooseAdapter, MongooseConfig } from './adapters/mongoose-adapter';

// Decorators
export { 
  TestDatabase as TestDatabaseDecorator, 
  TestDatabaseEach, 
  WithTransaction, 
  getTestDatabase 
} from './decorators/test-database.decorator';
export { 
  TypeORMTestDatabase as TypeORMTestDatabaseDecorator, 
  TypeORMTestDatabaseEach, 
  WithTypeORMTransaction, 
  getTypeORMTestDatabase 
} from './decorators/typeorm-test-database.decorator';
export { 
  MongooseTestDatabase as MongooseTestDatabaseDecorator, 
  MongooseTestDatabaseEach, 
  WithMongooseSession, 
  getMongooseTestDatabase 
} from './decorators/mongoose-test-database.decorator';

// Factory system
export { 
  Factory, 
  defineFactory, 
  FactoryManager,
  type FactoryDefinition
} from './factories/factory';
export { 
  BaseFactory, 
  FactoryBuilder,
  type FactoryOptions,
  type FactoryBuildResult
} from './factories/base-factory';
export { 
  TypeORMFactory, 
  TypeORMFactoryManager, 
  defineTypeORMFactory,
  type TypeORMFactoryDefinition 
} from './factories/typeorm-factory';
export { 
  MongooseFactory, 
  MongooseFactoryManager, 
  defineMongooseFactory,
  type MongooseFactoryDefinition 
} from './factories/mongoose-factory';

// Utilities
export { 
  Logger, 
  logger, 
  PerformanceTimer,
  LogLevel,
  type LoggerConfig
} from './utils/logger';
export { 
  NestTestKitError,
  DatabaseError,
  ConfigurationError,
  MigrationError,
  SeedingError,
  FactoryError,
  TransactionError,
  TestSetupError,
  ErrorHandler
} from './utils/errors';

// Re-export common types for convenience
export type { PrismaClient } from '@prisma/client';
export type { DataSource, Repository, EntityTarget } from 'typeorm';
export type { Connection, Model, Document } from 'mongoose'; 