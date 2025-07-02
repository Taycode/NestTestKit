/**
 * Integration tests for Prisma functionality
 * Run this to test if Prisma integration works correctly
 */
import { testDatabaseManager, defineFactory } from '../src/index';

// Mock Prisma schema for testing
const mockPrismaClient = {
  user: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    deleteMany: jest.fn(),
  },
  $disconnect: jest.fn(),
  $executeRaw: jest.fn(),
};

describe('Prisma Integration Tests', () => {
  it('should create test database manager', async () => {
    const testDb = await testDatabaseManager.create({
      databaseUrl: ':memory:',
      logging: false
    });

    expect(testDb).toBeDefined();
    expect(testDb.id).toBeDefined();
    expect(testDb.databaseUrl).toContain(':memory:');

    await testDb.destroy();
  });

  it('should handle cleanup strategies', async () => {
    const testDb = await testDatabaseManager.create({
      databaseUrl: ':memory:',
      cleanup: 'truncate',
      logging: false
    });

    // Test cleanup (with mocked client)
    await testDb.cleanup('truncate');
    
    expect(testDb.isReady()).toBe(true);
    await testDb.destroy();
  });

  it('should support factory system', () => {
    const UserFactory = defineFactory('User', (faker) => ({
      email: faker.internet.email(),
      name: faker.person.fullName(),
      age: faker.number.int(18, 80),
    }));

    // Test factory definition
    expect(UserFactory).toBeDefined();
    
    // Test build without client
    const userData = UserFactory.build();
    expect(userData.email).toBeDefined();
    expect(userData.name).toBeDefined();
    expect(userData.age).toBeGreaterThanOrEqual(18);
    expect(userData.age).toBeLessThanOrEqual(80);
  });

  it('should generate unique data with factories', () => {
    const UserFactory = defineFactory('User', (faker) => ({
      email: faker.internet.email(),
      name: faker.person.fullName(),
    }));

    const user1 = UserFactory.build();
    const user2 = UserFactory.build();

    // Should generate different data
    expect(user1.email).not.toBe(user2.email);
    expect(user1.name).not.toBe(user2.name);
  });
}); 