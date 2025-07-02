/**
 * Mongoose Integration Examples for NestTestKit
 * 
 * This file demonstrates how to use NestTestKit with Mongoose for MongoDB testing.
 * It shows various patterns and features available for Mongoose users.
 */

import mongoose, { Schema, Document, Model, Connection } from 'mongoose';
import { Injectable } from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';

// NestTestKit imports for Mongoose
import {
  createMongooseTestApp,
  MongooseTestAppBuilder,
  MongooseTestDatabaseDecorator,
  getMongooseTestDatabase,
  defineMongooseFactory,
  MongooseFactoryManager,
  mongooseTestDatabaseManager,
} from '../src/index';

// ============================================================================
// EXAMPLE SCHEMAS AND INTERFACES
// ============================================================================

// User interface
interface IUser extends Document {
  email: string;
  name: string;
  isActive: boolean;
  posts: mongoose.Types.ObjectId[];
  createdAt: Date;
}

// Post interface
interface IPost extends Document {
  title: string;
  content: string;
  published: boolean;
  author: mongoose.Types.ObjectId;
  tags: string[];
  createdAt: Date;
}

// User schema
const UserSchema = new Schema<IUser>({
  email: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  isActive: { type: Boolean, default: true },
  posts: [{ type: Schema.Types.ObjectId, ref: 'Post' }],
  createdAt: { type: Date, default: Date.now }
});

// Post schema
const PostSchema = new Schema<IPost>({
  title: { type: String, required: true },
  content: { type: String, required: true },
  published: { type: Boolean, default: false },
  author: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  tags: [{ type: String }],
  createdAt: { type: Date, default: Date.now }
});

// ============================================================================
// EXAMPLE SERVICE
// ============================================================================

@Injectable()
export class UserService {
  constructor(
    @InjectModel('User') private userModel: Model<IUser>,
    @InjectModel('Post') private postModel: Model<IPost>,
    @InjectConnection() private connection: Connection
  ) {}

  async createUser(data: Partial<IUser>): Promise<IUser> {
    const user = new this.userModel(data);
    return await user.save();
  }

  async findUserById(id: string): Promise<IUser | null> {
    return await this.userModel.findById(id).populate('posts').exec();
  }

  async createPost(userId: string, data: Partial<IPost>): Promise<IPost> {
    const post = new this.postModel({
      ...data,
      author: userId
    });
    
    const savedPost = await post.save();
    
    // Add post to user's posts array
    await this.userModel.findByIdAndUpdate(
      userId,
      { $push: { posts: savedPost._id } }
    );
    
    return savedPost;
  }

  async getUserCount(): Promise<number> {
    return await this.userModel.countDocuments();
  }

  async getPublishedPosts(): Promise<IPost[]> {
    return await this.postModel.find({ published: true }).populate('author').exec();
  }
}

// ============================================================================
// FACTORY DEFINITIONS
// ============================================================================

const userFactory = defineMongooseFactory<IUser>('User', (faker) => ({
  email: faker.internet.email(),
  name: faker.person.fullName(),
  isActive: faker.datatype.boolean(),
  posts: [],
  createdAt: faker.date.recent()
}));

const postFactory = defineMongooseFactory<IPost>('Post', (faker) => ({
  title: faker.lorem.words(3),
  content: faker.lorem.paragraph(),
  published: faker.datatype.boolean(),
  author: new mongoose.Types.ObjectId(), // Will be overridden
  tags: [faker.lorem.word(), faker.lorem.word()],
  createdAt: faker.date.recent()
}));

// ============================================================================
// EXAMPLE SEEDERS
// ============================================================================

const userSeeder = {
  name: 'UserSeeder',
  async seed(connection: Connection) {
    const UserModel = connection.model<IUser>('User');
    
    const users = [
      { email: 'admin@example.com', name: 'Admin User', isActive: true },
      { email: 'user@example.com', name: 'Regular User', isActive: true },
    ];

    for (const userData of users) {
      const user = new UserModel(userData);
      await user.save();
    }
  },
};

// ============================================================================
// TEST EXAMPLES
// ============================================================================

describe('Mongoose with NestTestKit Examples', () => {

  // Example 1: Manual database setup
  describe('Manual Mongoose Setup', () => {
    let testDb: any;
    let connection: Connection;

    beforeAll(async () => {
      testDb = await mongooseTestDatabaseManager.create({
        useMemoryServer: true,
        models: [
          { name: 'User', schema: UserSchema, collection: 'users' },
          { name: 'Post', schema: PostSchema, collection: 'posts' }
        ]
      });
      
      connection = testDb.getConnection();
      MongooseFactoryManager.setConnection(connection);
    });

    afterAll(async () => {
      if (testDb) {
        await testDb.destroy();
      }
    });

    it('should create and query users', async () => {
      const UserModel = testDb.getModel<IUser>('User');
      
      const user = new UserModel({
        email: 'test@example.com',
        name: 'Test User',
        isActive: true
      });
      await user.save();

      const found = await UserModel.findOne({ email: 'test@example.com' });
      expect(found?.name).toBe('Test User');
    });

    it('should use Mongoose factories', async () => {
      const users = await userFactory.createMany(3);
      expect(users).toHaveLength(3);
      
      const user = users[0];
      const posts = await postFactory.createMany(2, { 
        author: user._id 
      });
      
      expect(posts).toHaveLength(2);
      expect(posts[0].author.toString()).toBe(user._id.toString());
    });

    it('should handle document relationships', async () => {
      const user = await userFactory.create();
      const post = await postFactory.create({ 
        author: user._id,
        published: true 
      });

      // Update user with post reference
      user.posts.push(post._id);
      await user.save();

      // Find user with populated posts
      const UserModel = testDb.getModel<IUser>('User');
      const foundUser = await UserModel.findById(user._id).populate('posts').exec();
      
      expect(foundUser?.posts).toHaveLength(1);
      expect((foundUser?.posts[0] as any).title).toBe(post.title);
    });
  });

  // Example 2: NestJS integration (simplified)
  describe('NestJS Integration', () => {
    let module: TestingModule;
    let connection: Connection;
    let userService: UserService;

    beforeAll(async () => {
      const result = await createMongooseTestApp({
        providers: [UserService],
        databaseConfig: {
          useMemoryServer: true,
          models: [
            { name: 'User', schema: UserSchema },
            { name: 'Post', schema: PostSchema }
          ]
        },
        seed: [userSeeder]
      });

      module = result.module;
      connection = result.connection;
      userService = module.get<UserService>(UserService);
      
      MongooseFactoryManager.setConnection(connection);
    });

    afterAll(async () => {
      if (module) {
        await module.close();
      }
    });

    it('should have seeded data', async () => {
      const count = await userService.getUserCount();
      expect(count).toBe(2); // From seeder
    });

    it('should create users through service', async () => {
      const user = await userService.createUser({
        email: 'service@example.com',
        name: 'Service User',
      });

      const found = await userService.findUserById(user._id.toString());
      expect(found?.email).toBe('service@example.com');
    });

    it('should handle posts and relationships', async () => {
      const user = await userService.createUser({
        email: 'author@example.com',
        name: 'Post Author',
      });

      const post = await userService.createPost(user._id.toString(), {
        title: 'Test Post',
        content: 'This is a test post',
        published: true
      });

      expect(post.author.toString()).toBe(user._id.toString());

      // Check if user has the post
      const foundUser = await userService.findUserById(user._id.toString());
      expect(foundUser?.posts).toHaveLength(1);
    });
  });

  // Example 3: Using decorators (commented out due to MongoDB Memory Server setup complexity)
  // @MongooseTestDatabaseDecorator({
  //   useMemoryServer: true,
  //   models: [
  //     { name: 'User', schema: UserSchema },
  //     { name: 'Post', schema: PostSchema }
  //   ]
  // })
  describe('Decorator Example', () => {
    let testDb: any;
    
    beforeAll(async () => {
      testDb = await mongooseTestDatabaseManager.create({
        useMemoryServer: true,
        models: [
          { name: 'User', schema: UserSchema },
          { name: 'Post', schema: PostSchema }
        ]
      });
    });

    afterAll(async () => {
      if (testDb) {
        await testDb.destroy();
      }
    });

    it('should access test database', async () => {
      const connection = testDb.getConnection();
      const UserModel = testDb.getModel<IUser>('User');
      
      const user = new UserModel({
        email: 'decorator@example.com',
        name: 'Decorator User'
      });
      await user.save();

      const count = await UserModel.countDocuments();
      expect(count).toBe(1);
    });
  });

  // Example 4: Factory patterns
  describe('Factory Patterns', () => {
    let testDb: any;

    beforeAll(async () => {
      testDb = await mongooseTestDatabaseManager.create({
        useMemoryServer: true,
        models: [
          { name: 'User', schema: UserSchema },
          { name: 'Post', schema: PostSchema }
        ]
      });
      
      MongooseFactoryManager.setConnection(testDb.getConnection());
    });

    afterAll(async () => {
      if (testDb) {
        await testDb.destroy();
      }
    });

    it('should create with overrides', async () => {
      const user = await userFactory.create({
        email: 'override@example.com',
        name: 'Override User'
      });
      
      expect(user.email).toBe('override@example.com');
      expect(user.name).toBe('Override User');
    });

    it('should build without saving', async () => {
      const userData = userFactory.build();
      expect(userData._id).toBeUndefined();
      expect(userData.email).toBeDefined();
    });

    it('should use batch creation', async () => {
      const users = await userFactory.createManyBatch(5);
      expect(users).toHaveLength(5);
      
      // All should have unique emails
      const emails = users.map(u => u.email);
      const uniqueEmails = new Set(emails);
      expect(uniqueEmails.size).toBe(5);
    });

    it('should find documents with factory helpers', async () => {
      await userFactory.create({ email: 'findme@example.com' });
      
      const found = await userFactory.findOne({ email: 'findme@example.com' });
      expect(found?.email).toBe('findme@example.com');
      
      const count = await userFactory.count({ isActive: true });
      expect(count).toBeGreaterThan(0);
    });
  });

  // Example 5: Cleanup strategies
  describe('Cleanup Strategies', () => {
    it('should handle truncate cleanup', async () => {
      const testDb = await mongooseTestDatabaseManager.create({
        useMemoryServer: true,
        models: [{ name: 'User', schema: UserSchema }],
        cleanup: 'truncate'
      });

      const UserModel = testDb.getModel<IUser>('User');
      
      const user = new UserModel({ 
        email: 'test@example.com', 
        name: 'Test' 
      });
      await user.save();
      
      expect(await UserModel.countDocuments()).toBe(1);
      
      await testDb.cleanup('truncate');
      expect(await UserModel.countDocuments()).toBe(0);
      
      await testDb.destroy();
    });

    it('should handle recreate cleanup', async () => {
      const testDb = await mongooseTestDatabaseManager.create({
        useMemoryServer: true,
        models: [{ name: 'User', schema: UserSchema }],
        cleanup: 'recreate'
      });

      const UserModel = testDb.getModel<IUser>('User');
      
      const user = new UserModel({ 
        email: 'test@example.com', 
        name: 'Test' 
      });
      await user.save();
      
      expect(await UserModel.countDocuments()).toBe(1);
      
      await testDb.cleanup('recreate');
      expect(await UserModel.countDocuments()).toBe(0);
      
      await testDb.destroy();
    });
  });
});

// ============================================================================
// ADVANCED EXAMPLES
// ============================================================================

describe('Advanced Mongoose Features', () => {
  
  it('should handle complex queries and aggregations', async () => {
    const testDb = await mongooseTestDatabaseManager.create({
      useMemoryServer: true,
      models: [
        { name: 'User', schema: UserSchema },
        { name: 'Post', schema: PostSchema }
      ]
    });

    try {
      const connection = testDb.getConnection();
      MongooseFactoryManager.setConnection(connection);

      // Create test data
      const users = await userFactory.createMany(3);
      
      for (const user of users) {
        await postFactory.createMany(2, { 
          author: user._id, 
          published: true 
        });
        
        await postFactory.create({ 
          author: user._id, 
          published: false 
        });
      }

      // Complex aggregation query
      const PostModel = testDb.getModel<IPost>('Post');
      const publishedPostStats = await PostModel.aggregate([
        { $match: { published: true } },
        { $group: { 
          _id: '$author', 
          postCount: { $sum: 1 },
          titles: { $push: '$title' }
        }},
        { $sort: { postCount: -1 } }
      ]);

      expect(publishedPostStats).toHaveLength(3);
      expect(publishedPostStats[0].postCount).toBe(2);

      // Text search (if index exists)
      const searchResults = await PostModel.find({
        $or: [
          { title: { $regex: 'test', $options: 'i' } },
          { content: { $regex: 'test', $options: 'i' } }
        ]
      });

      expect(Array.isArray(searchResults)).toBe(true);

    } finally {
      await testDb.destroy();
    }
  });

  it('should handle MongoDB-specific features', async () => {
    const testDb = await mongooseTestDatabaseManager.create({
      useMemoryServer: true,
      models: [
        { name: 'User', schema: UserSchema },
        { name: 'Post', schema: PostSchema }
      ]
    });

    try {
      const connection = testDb.getConnection();
      MongooseFactoryManager.setConnection(connection);

      // Test ObjectId generation and comparison
      const user = await userFactory.create();
      expect(mongoose.Types.ObjectId.isValid(user._id)).toBe(true);

      // Test array operations
      const post1 = await postFactory.create({ author: user._id });
      const post2 = await postFactory.create({ author: user._id });

      const UserModel = testDb.getModel<IUser>('User');
      await UserModel.findByIdAndUpdate(user._id, {
        $push: { posts: { $each: [post1._id, post2._id] } }
      });

      const updatedUser = await UserModel.findById(user._id);
      expect(updatedUser?.posts).toHaveLength(2);

      // Test date queries
      const recentPosts = await testDb.getModel<IPost>('Post').find({
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      });

      expect(recentPosts.length).toBeGreaterThan(0);

    } finally {
      await testDb.destroy();
    }
  });

  it('should handle multiple database instances', async () => {
    const db1 = await mongooseTestDatabaseManager.create({
      useMemoryServer: true,
      models: [{ name: 'User', schema: UserSchema }]
    });

    const db2 = await mongooseTestDatabaseManager.create({
      useMemoryServer: true,
      models: [{ name: 'User', schema: UserSchema }]
    });

    try {
      const UserModel1 = db1.getModel<IUser>('User');
      const UserModel2 = db2.getModel<IUser>('User');

      // Create data in both databases
      const user1 = new UserModel1({ email: 'db1@example.com', name: 'DB1 User' });
      await user1.save();

      const user2 = new UserModel2({ email: 'db2@example.com', name: 'DB2 User' });
      await user2.save();

      // Verify isolation
      expect(await UserModel1.countDocuments()).toBe(1);
      expect(await UserModel2.countDocuments()).toBe(1);

      const foundInDb1 = await UserModel1.findOne({ email: 'db2@example.com' });
      expect(foundInDb1).toBeNull(); // Should not exist in db1

    } finally {
      await db1.destroy();
      await db2.destroy();
    }
  });
});

// ============================================================================
// FACTORY MANAGER EXAMPLES
// ============================================================================

describe('Mongoose Factory Manager', () => {
  let testDb: any;

  beforeAll(async () => {
    testDb = await mongooseTestDatabaseManager.create({
      useMemoryServer: true,
      models: [
        { name: 'User', schema: UserSchema },
        { name: 'Post', schema: PostSchema }
      ]
    });
    
    MongooseFactoryManager.setConnection(testDb.getConnection());
  });

  afterAll(async () => {
    if (testDb) {
      await testDb.destroy();
    }
  });

  beforeAll(() => {
    // Register factories with manager
    MongooseFactoryManager.register('user', userFactory);
    MongooseFactoryManager.register('post', postFactory);
  });

  it('should access factories through manager', async () => {
    const userFromManager = MongooseFactoryManager.get<IUser>('user');
    const user = await userFromManager.create();
    
    expect(user._id).toBeDefined();
    expect(user.email).toBeDefined();
  });

  it('should define factory through manager', async () => {
    const commentFactory = MongooseFactoryManager.define(
      'comment', 
      'Post', // Reuse Post model for this example
      (faker) => ({
        title: `Comment: ${faker.lorem.words(2)}`,
        content: faker.lorem.sentence(),
        published: true,
        author: new mongoose.Types.ObjectId(),
        tags: ['comment'],
        createdAt: faker.date.recent()
      })
    );
    
    const comment = await commentFactory.create();
    expect(comment.title).toMatch(/^Comment:/);
    expect(comment.tags).toContain('comment');
  });
}); 