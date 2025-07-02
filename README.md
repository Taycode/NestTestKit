# NestTestKit

A testing utility library for NestJS applications that provides seamless database testing with Prisma and SQLite.

## Features

🚀 **Zero Configuration** - Works out of the box with NestJS + Prisma  
⚡ **Fast SQLite Testing** - In-memory and file-based SQLite databases  
🔄 **Multiple Cleanup Strategies** - Transaction rollback, truncate, or recreate  
🌱 **Flexible Seeding** - Support for seeders with dependency resolution  
🏭 **Factory System** - Generate realistic test data with factories  
🏗️ **TypeScript First** - Full type safety and IntelliSense support  
🎯 **Decorator Based** - Clean, easy-to-use API with decorators  
📊 **Enhanced Logging** - Detailed debugging and performance monitoring  
🛡️ **Better Error Handling** - Helpful error messages with suggestions  

## Installation

```bash
npm install nest-test-kit

# Peer dependencies (if not already installed)
npm install @nestjs/common @nestjs/core @nestjs/testing @prisma/client prisma
```

## Quick Start

### 1. Basic Usage with @TestDatabase Decorator

```typescript
import { TestDatabaseDecorator, getTestDatabase } from 'nest-test-kit';
import { PrismaClient } from '@prisma/client';

@TestDatabaseDecorator({
  applyMigrations: true,
  cleanup: 'truncate'
})
describe('UserService', () => {
  let userService: UserService;
  let prisma: PrismaClient;

  beforeEach(async () => {
    const testDb = getTestDatabase();
    prisma = testDb.getClient();
    userService = new UserService(prisma);
  });

  it('should create a user', async () => {
    const user = await userService.create({
      email: 'test@example.com',
      name: 'Test User'
    });
    
    expect(user.email).toBe('test@example.com');
  });
});
```

### 2. Full NestJS Integration

```typescript
import { createTestApp, DatabaseSeeder } from 'nest-test-kit';

class UserSeeder implements DatabaseSeeder {
  name = 'users';
  
  async seed(client: PrismaClient) {
    await client.user.createMany({
      data: [
        { email: 'john@example.com', name: 'John' },
        { email: 'jane@example.com', name: 'Jane' }
      ]
    });
  }
}

describe('UserModule Integration', () => {
  let app: TestingModule;
  let userService: UserService;

  beforeEach(async () => {
    app = await createTestApp({
      imports: [UserModule],
      seed: [new UserSeeder()],
      databaseConfig: {
        applyMigrations: true
      }
    });
    
    userService = app.get<UserService>(UserService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should find seeded users', async () => {
    const users = await userService.findAll();
    expect(users).toHaveLength(2);
  });
});
```

### 3. Factory System for Test Data

```typescript
import { defineFactory, FactoryManager } from 'nest-test-kit';

// Define factories
const UserFactory = defineFactory<User>('user', (faker) => ({
  email: faker.internet.email(),
  name: faker.person.fullName(),
  age: faker.number.int(18, 80),
  isActive: faker.datatype.boolean(),
}));

describe('With Factories', () => {
  beforeEach(() => {
    UserFactory.setClient(prisma);
  });

  it('creates realistic test data', async () => {
    // Create single user
    const user = await UserFactory.create();
    
    // Create with overrides
    const admin = await UserFactory.create({
      email: 'admin@example.com',
      isActive: true
    });
    
    // Create multiple users
    const users = await UserFactory.createMany(10);
    
    expect(users).toHaveLength(10);
  });
});
```

### 4. Transaction-Based Isolation

```typescript
@TestDatabaseDecorator({ cleanup: 'transaction' })
describe('Transaction Tests', () => {
  @WithTransaction()
  it('changes are rolled back', async () => {
    // All database changes in this test are automatically rolled back
    await userService.create({ email: 'temp@example.com' });
    // This data won't exist in other tests
  });
});
```

## Configuration Options

### TestDatabaseConfig

```typescript
interface TestDatabaseConfig {
  /** Database URL (defaults to SQLite file) */
  databaseUrl?: string;
  
  /** Cleanup strategy between tests */
  cleanup?: 'transaction' | 'truncate' | 'recreate';
  
  /** Apply Prisma migrations */
  applyMigrations?: boolean;
  
  /** Path to Prisma schema */
  schemaPath?: string;
  
  /** Enable query logging */
  logging?: boolean;
  
  /** Custom Prisma client options */
  prismaOptions?: any;
}
```

### Cleanup Strategies

| Strategy | Speed | Isolation | Description |
|----------|-------|-----------|-------------|
| `transaction` | ⚡ Fastest | 🏆 Perfect | Wraps tests in transactions, rolls back changes |
| `truncate` | 🚀 Fast | ✅ Good | Deletes all data between tests |
| `recreate` | 🐌 Slower | 🏆 Perfect | Recreates database for each test |

## Advanced Usage

### Custom Seeders with Dependencies

```typescript
class RoleSeeder implements DatabaseSeeder {
  name = 'roles';
  
  async seed(client: PrismaClient) {
    await client.role.createMany({
      data: [{ name: 'admin' }, { name: 'user' }]
    });
  }
}

class UserSeeder implements DatabaseSeeder {
  name = 'users';
  dependencies = ['roles']; // Runs after RoleSeeder
  
  async seed(client: PrismaClient) {
    const adminRole = await client.role.findFirst({ where: { name: 'admin' } });
    await client.user.create({
      data: { email: 'admin@example.com', roleId: adminRole.id }
    });
  }
}
```

### Custom Seeding Functions

```typescript
app = await createTestApp({
  imports: [UserModule],
  seed: async (client: PrismaClient) => {
    // Custom seeding logic
    await client.user.create({
      data: { email: 'custom@example.com' }
    });
  }
});
```

### Manual Database Management

```typescript
import { testDatabaseManager } from 'nest-test-kit';

describe('Manual Management', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await testDatabaseManager.create({
      databaseUrl: 'file:./custom-test.db',
      applyMigrations: true
    });
  });

  afterAll(async () => {
    await testDb.destroy();
  });

  it('uses custom database', async () => {
    const client = testDb.getClient();
    // Use client directly
  });
});
```

## Best Practices

### 1. Choose the Right Cleanup Strategy

- Use **`transaction`** for unit tests and when you need maximum speed
- Use **`truncate`** for integration tests with moderate isolation needs  
- Use **`recreate`** when you need complete isolation and don't mind slower tests

### 2. Organize Your Seeders

```typescript
// seeders/index.ts
export const commonSeeders = [
  new RoleSeeder(),
  new UserSeeder(),
  new CompanySeeder()
];

// In your tests
beforeEach(async () => {
  app = await createTestApp({
    imports: [MyModule],
    seed: commonSeeders
  });
});
```

### 3. Use Environment-Specific Configuration

```typescript
const testConfig = {
  databaseUrl: process.env.TEST_DATABASE_URL || 'file:./test.db',
  applyMigrations: process.env.CI === 'true',
  logging: process.env.NODE_ENV === 'debug'
};
```

### 4. Enhanced Logging and Error Handling

```typescript
import { logger, LogLevel, ErrorHandler } from 'nest-test-kit';

// Configure logging level
logger.configure({ level: LogLevel.DEBUG });

// Errors provide helpful suggestions
try {
  await someOperation();
} catch (error) {
  // NestTestKit errors include helpful suggestions
  if (error instanceof NestTestKitError) {
    console.log(error.suggestions); // Helpful tips for fixing the issue
  }
}
```

## TypeORM Support (Phase 3)

NestTestKit now supports **TypeORM** alongside Prisma! Use the same patterns with TypeORM entities.

### Quick TypeORM Example

```typescript
import { createTypeORMTestApp, defineTypeORMFactory } from 'nest-test-kit';
import { User } from './entities/user.entity';

// Define a factory for TypeORM entities
const userFactory = defineTypeORMFactory(User, (faker) => ({
  email: faker.internet.email(),
  name: faker.person.fullName(),
}));

describe('UserService with TypeORM', () => {
  let app: TestingModule;
  let userService: UserService;

  beforeEach(async () => {
    app = await createTypeORMTestApp({
      imports: [TypeOrmModule.forFeature([User])],
      providers: [UserService],
      databaseConfig: {
        type: 'sqlite',
        entities: [User],
        synchronize: true,
      }
    });

    userService = app.get<UserService>(UserService);
    
    // Set up factories
    const dataSource = app.get<DataSource>(DataSource);
    TypeORMFactoryManager.setDataSource(dataSource);
  });

  it('should create user with factory', async () => {
    const user = await userFactory.create();
    const found = await userService.findById(user.id);
    expect(found).toBeDefined();
  });
});
```

### TypeORM Database Types

```typescript
// SQLite (default)
databaseConfig: { type: 'sqlite' }

// PostgreSQL
databaseConfig: { 
  type: 'postgres',
  databaseUrl: 'postgresql://user:pass@localhost:5432/testdb'
}

// MySQL
databaseConfig: { 
  type: 'mysql',
  databaseUrl: 'mysql://user:pass@localhost:3306/testdb'
}
```

See [`examples/typeorm-usage.example.ts`](./examples/typeorm-usage.example.ts) for comprehensive TypeORM examples.

## Requirements

- Node.js 16+
- NestJS 9+
- **For Prisma**: Prisma 5+
- **For TypeORM**: TypeORM 0.3+, @nestjs/typeorm 10+
- SQLite (included)

## Roadmap

- ✅ **Phase 1**: Prisma + SQLite support
- ✅ **Phase 2**: Factory system, enhanced error handling, and logging  
- ✅ **Phase 3**: TypeORM adapter with multi-database support (SQLite, PostgreSQL, MySQL)
- ⏳ **Phase 4**: Mongoose + MongoDB Memory Server
- ⏳ **Phase 5**: CLI tools and VS Code extension

## Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details.

## License

MIT © [Your Name] 