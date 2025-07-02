# NestTestDB - Architecture Plan

## Library Name: **NestTestDB**

*Alternative names: TestNestDB, NestTestKit, QuickTestDB*

## Overview

NestTestDB is a testing utility library for NestJS applications that provides seamless database testing with SQLite, automatic setup/teardown, and minimal configuration.

## Core Architecture

### 1. Main Components

#### TestDatabaseManager
- **Purpose**: Central orchestrator for database lifecycle
- **Responsibilities**:
  - Create temporary SQLite databases
  - Manage database connections
  - Handle cleanup and teardown
  - Maintain database isolation between tests

#### TestAppBuilder
- **Purpose**: NestJS application configuration for testing
- **Responsibilities**:
  - Override production database configuration
  - Inject test database connection
  - Handle module imports and providers
  - Configure TypeORM/Prisma/Mongoose adapters

#### DatabaseSeeder
- **Purpose**: Populate test database with initial data
- **Responsibilities**:
  - Execute SQL scripts or entity fixtures
  - Support for factory patterns
  - Handle relational data dependencies
  - Provide common test data sets

#### TestTransactionManager
- **Purpose**: Manage database state between tests
- **Responsibilities**:
  - Wrap tests in transactions (optional)
  - Rollback changes after each test
  - Maintain data isolation
  - Handle nested transactions

### 2. Core APIs

#### Primary API
```typescript
// Simple usage
@TestDatabase()
describe('UserService', () => {
  let app: TestingModule;
  let userService: UserService;

  beforeEach(async () => {
    app = await createTestApp({
      imports: [UserModule],
      seed: ['users', 'roles'] // predefined seeders
    });
    userService = app.get<UserService>(UserService);
  });

  afterEach(async () => {
    await app.close();
  });
});

// Advanced usage
describe('UserService Advanced', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await TestDatabase.create({
      entities: [User, Role, Permission],
      migrations: true,
      logging: false
    });
  });

  afterAll(async () => {
    await testDb.destroy();
  });
});
```

#### Configuration API
```typescript
// nest-test-db.config.ts
export const testConfig: TestDatabaseConfig = {
  type: 'sqlite',
  database: ':memory:', // or temp file
  synchronize: true,
  logging: false,
  entities: [User, Role, Permission],
  seeders: {
    users: UserSeeder,
    roles: RoleSeeder
  },
  cleanup: 'transaction' // 'truncate' | 'recreate' | 'transaction'
};
```

### 3. Database Adapter Pattern

#### BaseAdapter (Abstract)
- Define common interface for all database adapters
- Handle connection management
- Provide cleanup strategies

#### TypeORMAdapter
- Integrate with TypeORM
- Handle entity management
- Support for multiple database types (with SQLite as default)

#### PrismaAdapter
- Integrate with Prisma ORM
- Handle schema management
- Support for Prisma migrations

#### MongooseAdapter
- For MongoDB testing (using MongoDB Memory Server)
- Handle schema definitions
- Provide document fixtures

### 4. Seeding System

#### Seeder Interface
```typescript
interface DatabaseSeeder {
  seed(connection: any): Promise<void>;
  dependencies?: string[]; // other seeders this depends on
}
```

#### Factory System
```typescript
// User factory
const UserFactory = Factory.define(User, (faker) => ({
  name: faker.person.fullName(),
  email: faker.internet.email(),
  createdAt: new Date()
}));

// Usage in tests
const users = await UserFactory.createMany(10);
```

### 5. File Structure

```
src/
├── core/
│   ├── test-database-manager.ts
│   ├── test-app-builder.ts
│   └── interfaces/
├── adapters/
│   ├── base-adapter.ts
│   ├── typeorm-adapter.ts
│   ├── prisma-adapter.ts
│   └── mongoose-adapter.ts
├── seeders/
│   ├── base-seeder.ts
│   ├── factory.ts
│   └── seeder-manager.ts
├── decorators/
│   ├── test-database.decorator.ts
│   └── with-transaction.decorator.ts
├── utils/
│   ├── temp-file-manager.ts
│   └── connection-helper.ts
└── index.ts
```

## Key Features

### 1. Zero Configuration
- Works out of the box with common NestJS + TypeORM setups
- Automatic entity discovery
- Smart defaults for SQLite configuration

### 2. Multiple Cleanup Strategies
- **Transaction Rollback**: Fastest, wrap each test in transaction
- **Truncate Tables**: Medium speed, clear all data between tests
- **Database Recreation**: Slowest but most thorough

### 3. Flexible Seeding
- Predefined seeders for common scenarios
- Factory pattern for dynamic data generation
- Dependency resolution between seeders
- Support for SQL scripts and entity-based seeding

### 4. Isolation Options
- **Per-test databases**: Complete isolation, slower
- **Shared database with cleanup**: Faster, good isolation
- **Transaction-based**: Fastest, requires discipline

### 5. Development Experience
- TypeScript first with full type safety
- Decorator-based configuration
- Detailed error messages and debugging
- Integration with popular testing frameworks (Jest, Vitest)

## Implementation Phases

### Phase 1: Core Foundation
- TestDatabaseManager with SQLite support
- Basic TestAppBuilder
- TypeORM adapter
- Simple seeding system

### Phase 2: Enhanced Features
- Transaction-based cleanup
- Factory system for test data
- Decorator-based configuration
- Better error handling and logging

### Phase 3: Extended Support
- Prisma adapter
- Mongoose adapter (with MongoDB Memory Server)
- Advanced seeding with dependencies
- Performance optimizations

### Phase 4: Developer Experience
- CLI tools for generating seeders
- VSCode extension for test database management
- Documentation and examples
- Migration from existing test setups

## Usage Examples

### Basic Integration Test
```typescript
@TestDatabase({
  entities: [User, Post],
  seed: ['users']
})
describe('PostService Integration', () => {
  let app: TestingModule;
  let postService: PostService;

  beforeEach(async () => {
    app = await createTestApp({
      imports: [PostModule, UserModule]
    });
    postService = app.get<PostService>(PostService);
  });

  it('should create post for user', async () => {
    const post = await postService.create({
      title: 'Test Post',
      content: 'Test content',
      userId: 1 // from seeded data
    });
    
    expect(post.id).toBeDefined();
    expect(post.title).toBe('Test Post');
  });
});
```

### Advanced Custom Seeding
```typescript
describe('Complex Business Logic', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await TestDatabase.create({
      entities: [User, Company, Project, Task],
      cleanup: 'transaction'
    });

    // Custom seeding
    await testDb.seed(async (connection) => {
      const company = await CompanyFactory.create();
      const users = await UserFactory.createMany(5, { companyId: company.id });
      const projects = await ProjectFactory.createMany(3, { companyId: company.id });
      
      for (const project of projects) {
        await TaskFactory.createMany(10, { projectId: project.id });
      }
    });
  });

  // Tests run with consistent, complex data setup
});
```

## Benefits

1. **Reduced Boilerplate**: Minimal setup code for database tests
2. **Fast Execution**: SQLite in-memory databases for speed
3. **Reliable Isolation**: Each test runs with clean state
4. **Flexible Data Setup**: Multiple seeding strategies
5. **Production-like Testing**: Real database operations, not mocks
6. **Easy Migration**: Drop-in replacement for existing test setups

## Technical Considerations

### Performance
- Use SQLite WAL mode for better concurrent access
- Connection pooling for shared database scenarios
- Lazy loading of heavy seeders

### Memory Management
- Automatic cleanup of temporary files
- Connection management to prevent leaks
- Garbage collection of large datasets

### Error Handling
- Clear error messages for configuration issues
- Debugging tools for seed data problems
- Graceful fallback for failed database operations

This architecture provides a solid foundation for a comprehensive NestJS testing library that solves the common database testing pain points while remaining flexible and performant.