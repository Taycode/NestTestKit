/**
 * Integration tests for Mongoose functionality
 * These tests require MongoDB Memory Server
 */
import { mongooseTestDatabaseManager, defineMongooseFactory, MongooseFactoryManager } from '../src/index';
import mongoose, { Schema } from 'mongoose';

// Test schema
const UserSchema = new Schema({
  email: { type: String, required: true },
  name: { type: String, required: true },
  age: { type: Number, min: 0, max: 120 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

const PostSchema = new Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  published: { type: Boolean, default: false }
});

describe('Mongoose Integration Tests', () => {
  
  describe('Database Manager', () => {
    it('should create MongoDB memory server database', async () => {
      const testDb = await mongooseTestDatabaseManager.create({
        useMemoryServer: true,
        models: [
          { name: 'User', schema: UserSchema },
          { name: 'Post', schema: PostSchema }
        ],
        logging: false
      });

      expect(testDb).toBeDefined();
      expect(testDb.id).toBeDefined();
      expect(testDb.getConnection()).toBeDefined();
      
      // Test model registration
      const registeredModels = testDb.getRegisteredModelNames();
      expect(registeredModels).toContain('User');
      expect(registeredModels).toContain('Post');

      await testDb.destroy();
    }, 15000); // MongoDB Memory Server can take time to start

    it('should handle cleanup strategies', async () => {
      const testDb = await mongooseTestDatabaseManager.create({
        useMemoryServer: true,
        models: [{ name: 'User', schema: UserSchema }],
        cleanup: 'truncate',
        logging: false
      });

      try {
        const UserModel = testDb.getModel('User');
        
        // Create test data
        const user = new UserModel({
          email: 'test@example.com',
          name: 'Test User',
          age: 25
        });
        await user.save();

        expect(await UserModel.countDocuments()).toBe(1);

        // Test cleanup
        await testDb.cleanup('truncate');
        expect(await UserModel.countDocuments()).toBe(0);

      } finally {
        await testDb.destroy();
      }
    }, 15000);
  });

  describe('Factory System', () => {
    let testDb: any;

    beforeAll(async () => {
      testDb = await mongooseTestDatabaseManager.create({
        useMemoryServer: true,
        models: [
          { name: 'User', schema: UserSchema },
          { name: 'Post', schema: PostSchema }
        ],
        logging: false
      });
    }, 15000);

    afterAll(async () => {
      if (testDb) {
        await testDb.destroy();
      }
    });

    it('should create Mongoose factory', () => {
      const userFactory = defineMongooseFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
        age: faker.number.int(18, 80),
        isActive: faker.datatype.boolean()
      }));

      expect(userFactory).toBeDefined();
      
      // Test build without connection
      const userData = userFactory.build();
      expect(userData.email).toBeDefined();
      expect(userData.name).toBeDefined();
      expect(userData.age).toBeGreaterThanOrEqual(18);
      expect(userData.age).toBeLessThanOrEqual(80);
      expect(typeof userData.isActive).toBe('boolean');
    });

    it('should create documents with factory', async () => {
      const userFactory = defineMongooseFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
        age: faker.number.int(18, 80)
      }));

      userFactory.setConnection(testDb.getConnection());

      const user = await userFactory.create({
        email: 'factory@example.com'
      });

      expect(user._id).toBeDefined();
      expect(user.email).toBe('factory@example.com');
      expect(user.name).toBeDefined();
      expect(user.age).toBeGreaterThanOrEqual(18);
    });

    it('should create multiple documents in batch', async () => {
      const userFactory = defineMongooseFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName()
      }));

      userFactory.setConnection(testDb.getConnection());

      const users = await userFactory.createManyBatch(3);
      expect(users).toHaveLength(3);
      
      // Check all have unique emails
      const emails = users.map(u => u.email);
      const uniqueEmails = new Set(emails);
      expect(uniqueEmails.size).toBe(3);
    });

    it('should handle factory manager', async () => {
      MongooseFactoryManager.setConnection(testDb.getConnection());

      const userFactory = MongooseFactoryManager.define(
        'testUser',
        'User',
        (faker) => ({
          email: faker.internet.email(),
          name: faker.person.fullName()
        })
      );

      const user = await userFactory.create();
      expect(user._id).toBeDefined();
      expect(user.email).toBeDefined();

      // Test retrieval
      const retrievedFactory = MongooseFactoryManager.get('testUser');
      expect(retrievedFactory).toBe(userFactory);
    });
  });

  describe('Document Operations', () => {
    let testDb: any;
    let userFactory: any;

    beforeAll(async () => {
      testDb = await mongooseTestDatabaseManager.create({
        useMemoryServer: true,
        models: [
          { name: 'User', schema: UserSchema },
          { name: 'Post', schema: PostSchema }
        ],
        logging: false
      });

      userFactory = defineMongooseFactory('User', (faker) => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
        age: faker.number.int(18, 80)
      }));

      userFactory.setConnection(testDb.getConnection());
    }, 15000);

    afterAll(async () => {
      if (testDb) {
        await testDb.destroy();
      }
    });

    it('should handle MongoDB queries', async () => {
      const users = await userFactory.createMany(5);
      
      // Test finding
      const found = await userFactory.findOne({ 
        email: users[0].email 
      });
      expect(found?.email).toBe(users[0].email);

      // Test count
      const count = await userFactory.count();
      expect(count).toBeGreaterThanOrEqual(5);

      // Test find all
      const allUsers = await userFactory.find();
      expect(allUsers.length).toBeGreaterThanOrEqual(5);
    });

    it('should handle relationships', async () => {
      const user = await userFactory.create();
      
      const postFactory = defineMongooseFactory('Post', (faker) => ({
        title: faker.lorem.words(3),
        content: faker.lorem.paragraph(),
        author: user._id,
        published: faker.datatype.boolean()
      }));
      
      postFactory.setConnection(testDb.getConnection());
      
      const post = await postFactory.create();
      expect(post.author.toString()).toBe(user._id.toString());
      
      // Test population
      const PostModel = testDb.getModel('Post');
      const populatedPost = await PostModel.findById(post._id).populate('author').exec();
      expect(populatedPost?.author).toBeDefined();
    });
  });
}); 