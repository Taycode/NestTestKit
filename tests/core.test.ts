/**
 * Core functionality tests
 * These tests don't require external ORM dependencies
 */
import { defineFactory, FactoryManager, logger } from '../src/index';

describe('Core NestTestKit Tests', () => {
  
  describe('Factory System Core', () => {
    afterEach(() => {
      FactoryManager.clear();
    });

    it('should create factory definitions', () => {
      const UserFactory = defineFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
        age: faker.number.int(18, 80),
        isActive: faker.datatype.boolean(),
      }));

      expect(UserFactory).toBeDefined();
      expect(typeof UserFactory.build).toBe('function');
      expect(typeof UserFactory.create).toBe('function');
      expect(typeof UserFactory.createMany).toBe('function');
    });

    it('should generate realistic test data', () => {
      const UserFactory = defineFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
        age: faker.number.int(18, 80),
        isActive: faker.datatype.boolean(),
        uuid: faker.datatype.uuid(),
      }));

      const userData = UserFactory.build();

      expect(userData.email).toMatch(/^[\w.-]+@[\w.-]+\.\w+$/);
      expect(userData.name).toBeDefined();
      expect(userData.age).toBeGreaterThanOrEqual(18);
      expect(userData.age).toBeLessThanOrEqual(80);
      expect(typeof userData.isActive).toBe('boolean');
      expect(userData.uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    });

    it('should generate unique data for each call', () => {
      const UserFactory = defineFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
        uuid: faker.datatype.uuid(),
      }));

      const user1 = UserFactory.build();
      const user2 = UserFactory.build();
      const user3 = UserFactory.build();

      // All should be different
      expect(user1.email).not.toBe(user2.email);
      expect(user1.name).not.toBe(user2.name);
      expect(user1.uuid).not.toBe(user2.uuid);
      
      expect(user2.email).not.toBe(user3.email);
      expect(user2.name).not.toBe(user3.name);
      expect(user2.uuid).not.toBe(user3.uuid);
    });

    it('should support overrides', () => {
      const UserFactory = defineFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
        role: 'user',
      }));

      const adminUser = UserFactory.build({ 
        email: 'admin@example.com',
        role: 'admin' 
      });

      expect(adminUser.email).toBe('admin@example.com');
      expect(adminUser.role).toBe('admin');
      expect(adminUser.name).toBeDefined(); // Should still be generated
    });

    it('should build multiple items', () => {
      const UserFactory = defineFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
      }));

      const users = UserFactory.buildMany(5);
      
      expect(users).toHaveLength(5);
      
      // All should have unique emails
      const emails = users.map(u => u.email);
      const uniqueEmails = new Set(emails);
      expect(uniqueEmails.size).toBe(5);
    });
  });

  describe('Factory Manager', () => {
    afterEach(() => {
      FactoryManager.clear();
    });

    it('should register and retrieve factories', () => {
      const UserFactory = defineFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
      }));

      FactoryManager.register('user', UserFactory);
      
      const retrievedFactory = FactoryManager.get('user');
      expect(retrievedFactory).toBe(UserFactory);
    });

    it('should define factories through manager', () => {
      const UserFactory = FactoryManager.define('user', 'User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
      }));

      expect(UserFactory).toBeDefined();
      
      const retrievedFactory = FactoryManager.get('user');
      expect(retrievedFactory).toBe(UserFactory);
    });

    it('should list factory names', () => {
      FactoryManager.define('user', 'User', (faker) => ({ email: faker.internet.email() }));
      FactoryManager.define('post', 'Post', (faker) => ({ title: faker.lorem.words(3) }));

      const factoryNames = FactoryManager.getFactoryNames();
      expect(factoryNames).toContain('user');
      expect(factoryNames).toContain('post');
      expect(factoryNames).toHaveLength(2);
    });

    it('should clear all factories', () => {
      FactoryManager.define('user', 'User', (faker) => ({ email: faker.internet.email() }));
      FactoryManager.define('post', 'Post', (faker) => ({ title: faker.lorem.words(3) }));

      expect(FactoryManager.getFactoryNames()).toHaveLength(2);
      
      FactoryManager.clear();
      expect(FactoryManager.getFactoryNames()).toHaveLength(0);
    });

    it('should throw error for unknown factory', () => {
      expect(() => {
        FactoryManager.get('nonexistent');
      }).toThrow("Factory 'nonexistent' not found");
    });
  });

  describe('Faker Integration', () => {
    it('should provide comprehensive faker functionality', () => {
      const TestFactory = defineFactory('Test', (faker) => ({
        // Person data
        firstName: faker.person.firstName(),
        lastName: faker.person.lastName(),
        fullName: faker.person.fullName(),
        
        // Internet data
        email: faker.internet.email(),
        username: faker.internet.username(),
        url: faker.internet.url(),
        
        // Lorem data
        word: faker.lorem.word(),
        words: faker.lorem.words(3),
        sentence: faker.lorem.sentence(),
        paragraph: faker.lorem.paragraph(),
        
        // Numbers
        int: faker.number.int(1, 100),
        float: faker.number.float(0, 1),
        
        // Dates
        recent: faker.date.recent(),
        future: faker.date.future(),
        past: faker.date.past(),
        
        // Data types
        boolean: faker.datatype.boolean(),
        uuid: faker.datatype.uuid(),
      }));

      const testData = TestFactory.build();

      // Verify all fields are generated
      expect(testData.firstName).toBeDefined();
      expect(testData.lastName).toBeDefined();
      expect(testData.fullName).toBeDefined();
      expect(testData.email).toBeDefined();
      expect(testData.username).toBeDefined();
      expect(testData.url).toBeDefined();
      expect(testData.word).toBeDefined();
      expect(testData.words).toBeDefined();
      expect(testData.sentence).toBeDefined();
      expect(testData.paragraph).toBeDefined();
      expect(typeof testData.int).toBe('number');
      expect(typeof testData.float).toBe('number');
      expect(testData.recent instanceof Date).toBe(true);
      expect(testData.future instanceof Date).toBe(true);
      expect(testData.past instanceof Date).toBe(true);
      expect(typeof testData.boolean).toBe('boolean');
      expect(testData.uuid).toBeDefined();
    });
  });

  describe('Logger', () => {
    it('should provide logger functionality', () => {
      expect(logger).toBeDefined();
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.success).toBe('function');
    });
  });
}); 