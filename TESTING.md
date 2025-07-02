# Testing NestTestKit

This guide shows you multiple ways to test NestTestKit and verify that everything works correctly.

## 🚀 Quick Start Testing

### Option 1: Run the Simple Test Runner

```bash
# Make the test runner executable
chmod +x test-runner.js

# Run the simple test suite
node test-runner.js
```

This will:
- ✅ Build the TypeScript project
- ✅ Test core factory functionality
- ✅ Check that all ORM modules load correctly
- ✅ Show you a summary of what's working

### Option 2: Use Jest Test Suite

```bash
# Install dependencies
npm install

# Install testing dependencies (optional for full testing)
npm install --save-dev @prisma/client prisma
npm install --save-dev @nestjs/typeorm typeorm
npm install --save-dev @nestjs/mongoose mongoose mongodb-memory-server

# Build the project
npm run build

# Run Jest tests
npm test

# Run tests in watch mode
npm run test:watch
```

## 🧪 Testing Individual ORMs

### Testing Prisma Integration

Create a simple test file:

```typescript
// test-prisma.ts
import { testDatabaseManager, defineFactory } from './dist/index';

async function testPrisma() {
  // Test factory system (no database needed)
  const UserFactory = defineFactory('User', (faker) => ({
    email: faker.internet.email(),
    name: faker.person.fullName(),
    age: faker.number.int(18, 80),
  }));

  const user = UserFactory.build();
  console.log('Generated user:', user);

  // Test database manager creation
  const testDb = await testDatabaseManager.create({
    databaseUrl: ':memory:',
    logging: false
  });

  console.log('Test database created:', testDb.id);
  await testDb.destroy();
  console.log('✅ Prisma integration test passed!');
}

testPrisma().catch(console.error);
```

Run it:
```bash
npx ts-node test-prisma.ts
```

### Testing Mongoose Integration

```typescript
// test-mongoose.ts
import { mongooseTestDatabaseManager, defineMongooseFactory } from './dist/index';
import { Schema } from 'mongoose';

async function testMongoose() {
  // Test factory system
  const userFactory = defineMongooseFactory('User', (faker) => ({
    email: faker.internet.email(),
    name: faker.person.fullName(),
  }));

  const userData = userFactory.build();
  console.log('Generated user data:', userData);

  // Test MongoDB Memory Server (requires mongodb-memory-server)
  try {
    const UserSchema = new Schema({
      email: String,
      name: String
    });

    const testDb = await mongooseTestDatabaseManager.create({
      useMemoryServer: true,
      models: [{ name: 'User', schema: UserSchema }],
      logging: false
    });

    console.log('MongoDB test database created:', testDb.id);
    
    userFactory.setConnection(testDb.getConnection());
    const user = await userFactory.create();
    console.log('Created user in MongoDB:', user.email);

    await testDb.destroy();
    console.log('✅ Mongoose integration test passed!');
  } catch (error) {
    console.log('⚠️ Full Mongoose test requires mongodb-memory-server');
    console.log('Install with: npm install mongodb-memory-server');
  }
}

testMongoose().catch(console.error);
```

### Testing TypeORM Integration

```typescript
// test-typeorm.ts
import { defineTypeORMFactory } from './dist/index';

// Mock entity for testing
class User {
  id?: number;
  email?: string;
  name?: string;
}

async function testTypeORM() {
  // Test factory system
  const userFactory = defineTypeORMFactory(User, (faker) => ({
    email: faker.internet.email(),
    name: faker.person.fullName(),
  }));

  const userData = userFactory.build();
  console.log('Generated user data:', userData);
  console.log('✅ TypeORM factory test passed!');
}

testTypeORM().catch(console.error);
```

## 🎯 Testing in Real NestJS Applications

### Create a Test Application

```typescript
// test-nestjs-app.ts
import { Test, TestingModule } from '@nestjs/testing';
import { createTestApp } from './dist/index';

async function testNestJSIntegration() {
  // Test simple NestJS module creation
  const module: TestingModule = await Test.createTestingModule({
    providers: [],
  }).compile();

  console.log('✅ NestJS module created successfully');
  await module.close();
}

testNestJSIntegration().catch(console.error);
```

## 🔍 Manual Testing Steps

### 1. Build Verification
```bash
npm run build
ls -la dist/  # Should show compiled JavaScript files
```

### 2. Import Testing
```bash
node -e "
const nesttestkit = require('./dist/index');
console.log('Available exports:', Object.keys(nesttestkit));
console.log('✅ All modules imported successfully');
"
```

### 3. Factory System Testing
```bash
node -e "
const { defineFactory } = require('./dist/index');
const factory = defineFactory('Test', (faker) => ({ email: faker.internet.email() }));
const data = factory.build();
console.log('Generated data:', data);
console.log('✅ Factory system works');
"
```

## 🐛 Troubleshooting

### Common Issues and Solutions

#### Build Errors
```bash
# Make sure TypeScript is installed
npm install typescript --save-dev

# Clean and rebuild
rm -rf dist/
npm run build
```

#### Missing Dependencies
```bash
# For Prisma testing
npm install @prisma/client prisma

# For TypeORM testing  
npm install @nestjs/typeorm typeorm reflect-metadata

# For Mongoose testing
npm install @nestjs/mongoose mongoose mongodb-memory-server
```

#### Import Errors
```bash
# Check if dist/ folder exists
ls -la dist/

# Check exports
node -e "console.log(Object.keys(require('./dist/index')))"
```

## 📊 Test Coverage Areas

When testing NestTestKit, verify these areas:

### ✅ Core Functionality
- [x] Factory definitions work
- [x] Data generation is realistic and unique
- [x] Override functionality works
- [x] Multiple data generation works

### ✅ Prisma Integration
- [x] Database manager creation
- [x] SQLite support
- [x] Cleanup strategies
- [x] Seeding functionality

### ✅ TypeORM Integration
- [x] Entity factory creation
- [x] Multiple database support
- [x] Repository pattern
- [x] Migration handling

### ✅ Mongoose Integration
- [x] MongoDB Memory Server setup
- [x] Schema registration
- [x] Document factory creation
- [x] Connection management

### ✅ NestJS Integration
- [x] Module creation
- [x] Dependency injection
- [x] Service testing
- [x] E2E test support

## 🎉 Success Indicators

You'll know NestTestKit is working correctly when:

1. **Build succeeds** - TypeScript compiles without errors
2. **Core factories work** - Can generate realistic test data
3. **ORM modules load** - No import errors for your chosen ORM
4. **Database connections work** - Can create and destroy test databases
5. **NestJS integration works** - Can create test modules and applications

## 📞 Getting Help

If tests fail:

1. **Check the error messages** - They often contain helpful suggestions
2. **Verify dependencies** - Make sure all peer dependencies are installed
3. **Check Node.js version** - NestTestKit requires Node.js 16+
4. **Review examples** - Check the `examples/` folder for working patterns
5. **Run the simple test runner** - `node test-runner.js` for basic verification

The most important test is that core functionality works - if that passes, you're ready to start using NestTestKit in your projects! 