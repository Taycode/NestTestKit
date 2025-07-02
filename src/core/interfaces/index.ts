import { PrismaClient } from '@prisma/client';

/**
 * Cleanup strategy for test databases
 */
export type CleanupStrategy = 'transaction' | 'truncate' | 'recreate';

/**
 * Configuration for test database setup
 */
export interface TestDatabaseConfig {
  /** Database connection URL. Defaults to SQLite in memory */
  databaseUrl?: string;
  
  /** Cleanup strategy between tests */
  cleanup?: CleanupStrategy;
  
  /** Whether to apply Prisma migrations */
  applyMigrations?: boolean;
  
  /** Path to Prisma schema file */
  schemaPath?: string;
  
  /** Enable query logging */
  logging?: boolean;
  
  /** Custom Prisma client options */
  prismaOptions?: any;
  
  /** Seeders to run during setup */
  seeders?: string[] | DatabaseSeeder[];
}

/**
 * Configuration for creating test NestJS applications
 */
export interface TestAppConfig {
  /** Modules to import into the test app */
  imports?: any[];
  
  /** Additional providers for testing */
  providers?: any[];
  
  /** Controllers to include */
  controllers?: any[];
  
  /** Seed data to populate before tests */
  seed?: string[] | DatabaseSeeder[] | ((client: PrismaClient) => Promise<void>);
  
  /** Override the default test database config */
  databaseConfig?: Partial<TestDatabaseConfig>;
}

/**
 * Interface for database adapters
 */
export interface DatabaseAdapter {
  /** Initialize the adapter with configuration */
  initialize(config: TestDatabaseConfig): Promise<void>;
  
  /** Get the database connection/client */
  getConnection(): Promise<any>;
  
  /** Clean up the database between tests */
  cleanup(strategy: CleanupStrategy): Promise<void>;
  
  /** Close the database connection */
  close(): Promise<void>;
  
  /** Execute raw SQL or queries */
  executeRaw(query: string, params?: any[]): Promise<any>;
  
  /** Apply database migrations */
  applyMigrations?(): Promise<void>;
  
  /** Reset the database to initial state */
  reset(): Promise<void>;
}

/**
 * Interface for database seeders
 */
export interface DatabaseSeeder {
  /** Unique name for the seeder */
  name: string;
  
  /** Other seeders this depends on */
  dependencies?: string[];
  
  /** Execute the seeding logic */
  seed(client: PrismaClient): Promise<void>;
}

/**
 * Interface for the test database manager
 */
export interface TestDatabaseManager {
  /** Create a new test database instance */
  create(config?: TestDatabaseConfig): Promise<TestDatabase>;
  
  /** Get an existing test database by ID */
  get(id: string): TestDatabase | undefined;
  
  /** Destroy a test database */
  destroy(id: string): Promise<void>;
  
  /** Destroy all test databases */
  destroyAll(): Promise<void>;
}

/**
 * Interface for individual test database instances
 */
export interface TestDatabase {
  /** Unique identifier for this test database */
  readonly id: string;
  
  /** Database connection URL */
  readonly databaseUrl: string;
  
  /** Get the Prisma client for this database */
  getClient(): PrismaClient;
  
  /** Run seeders */
  seed(seeders: DatabaseSeeder[] | ((client: PrismaClient) => Promise<void>)): Promise<void>;
  
  /** Clean up the database */
  cleanup(strategy?: CleanupStrategy): Promise<void>;
  
  /** Destroy this test database */
  destroy(): Promise<void>;
  
  /** Check if database is ready */
  isReady(): boolean;
} 