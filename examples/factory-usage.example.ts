import { PrismaClient } from '@prisma/client';
import {
  TestDatabaseDecorator,
  createTestApp,
  getTestDatabase,
  defineFactory,
  FactoryManager,
  TestAppConfig,
  logger,
  LogLevel
} from '../src';

// Configure logging for examples
logger.configure({ level: LogLevel.DEBUG });

// Example entities (would come from Prisma generated types)
interface User {
  id: number;
  email: string;
  name: string;
  age: number;
  isActive: boolean;
  createdAt: Date;
}

interface Post {
  id: number;
  title: string;
  content: string;
  authorId: number;
  published: boolean;
  createdAt: Date;
}

interface Comment {
  id: number;
  content: string;
  postId: number;
  authorId: number;
  createdAt: Date;
}

// Example service
class BlogService {
  constructor(private prisma: PrismaClient) {}

  async createPost(data: { title: string; content: string; authorId: number }) {
    return this.prisma.post.create({ data }) as any;
  }

  async getPostsWithComments(authorId: number) {
    return this.prisma.post.findMany({
      where: { authorId },
      include: { comments: true }
    }) as any;
  }
}

// Define factories using the new Factory system
const UserFactory = defineFactory<User>('user', (faker) => ({
  email: faker.internet.email(),
  name: faker.person.fullName(),
  age: faker.number.int(18, 80),
  isActive: faker.datatype.boolean(),
  createdAt: faker.date.recent(),
}));

const PostFactory = defineFactory<Post>('post', (faker) => ({
  title: faker.lorem.sentence(),
  content: faker.lorem.paragraph(),
  published: faker.datatype.boolean(),
  createdAt: faker.date.recent(),
  // Note: authorId will be set when creating with relationships
}));

const CommentFactory = defineFactory<Comment>('comment', (faker) => ({
  content: faker.lorem.sentence(),
  createdAt: faker.date.recent(),
  // Note: postId and authorId will be set when creating
}));

// Example 1: Basic Factory Usage
@TestDatabaseDecorator({
  applyMigrations: true,
  cleanup: 'truncate',
  logging: true // Enable Prisma query logging
})
describe('Factory System - Basic Usage', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    const testDb = getTestDatabase();
    prisma = testDb.getClient();
    
    // Set up factories with the test client
    UserFactory.setClient(prisma);
    PostFactory.setClient(prisma);
    CommentFactory.setClient(prisma);
  });

  it('should create single user with factory', async () => {
    const user = await UserFactory.create();
    
    expect(user.email).toContain('@example.com');
    expect(user.name).toBeDefined();
    expect(user.age).toBeGreaterThanOrEqual(18);
    expect(user.id).toBeDefined();
  });

  it('should create user with overrides', async () => {
    const user = await UserFactory.create({
      email: 'specific@example.com',
      age: 25,
      isActive: true
    });
    
    expect(user.email).toBe('specific@example.com');
    expect(user.age).toBe(25);
    expect(user.isActive).toBe(true);
  });

  it('should create multiple users', async () => {
    const users = await UserFactory.createMany(5);
    
    expect(users).toHaveLength(5);
    expect(users.every(user => user.id)).toBe(true);
  });

  it('should build data without saving', async () => {
    const userData = UserFactory.build({
      email: 'test@example.com'
    });
    
    expect(userData.email).toBe('test@example.com');
    expect(userData.name).toBeDefined();
    // This data is not saved to the database
  });
});

// Example 2: Factory Manager with Global Setup
describe('Factory System - Global Manager', () => {
  let app: any;
  let blogService: BlogService;

  beforeEach(async () => {
    // Register factories with the manager
    FactoryManager.register('user', UserFactory);
    FactoryManager.register('post', PostFactory);
    FactoryManager.register('comment', CommentFactory);

    app = await createTestApp({
      providers: [BlogService],
      databaseConfig: {
        applyMigrations: true,
        cleanup: 'truncate',
      },
    });

    const testDb = getTestDatabase();
    const prisma = testDb.getClient();
    
    // Set client for all factories at once
    FactoryManager.setClient(prisma);
    
    blogService = app.get<BlogService>(BlogService);
  });

  afterEach(async () => {
    await app.close();
  });

  it('should create complex relationships with factories', async () => {
    // Create author
    const author = await FactoryManager.get<User>('user').create({
      name: 'John Doe',
      email: 'john@example.com'
    });

    // Create posts for the author
    const posts = await FactoryManager.get<Post>('post').createMany(3, {
      authorId: author.id,
      published: true
    });

    // Create comments for each post
    for (const post of posts) {
      await FactoryManager.get<Comment>('comment').createMany(2, {
        postId: post.id,
        authorId: author.id
      });
    }

    // Verify the data structure
    const postsWithComments = await blogService.getPostsWithComments(author.id);
    
    expect(postsWithComments).toHaveLength(3);
    expect(postsWithComments.every((post: any) => post.comments.length === 2)).toBe(true);
  });
});

// Example 3: Advanced Factory Patterns
@TestDatabaseDecorator({ cleanup: 'truncate' })
describe('Factory System - Advanced Patterns', () => {
  let prisma: PrismaClient;

  beforeEach(async () => {
    const testDb = getTestDatabase();
    prisma = testDb.getClient();
    FactoryManager.setClient(prisma);
  });

  it('should create test data with realistic patterns', async () => {
    // Create admin users
    const admins = await UserFactory.createMany(2, {
      name: 'Admin User',
      isActive: true,
      age: 30
    });

    // Create regular users
    const regularUsers = await UserFactory.createMany(10, {
      isActive: true
    });

    // Create published posts from different authors
    const publishedPosts = [];
    for (const user of [...admins, ...regularUsers.slice(0, 3)]) {
      const posts = await PostFactory.createMany(2, {
        authorId: user.id,
        published: true
      });
      publishedPosts.push(...posts);
    }

    // Create draft posts
    const draftPosts = await PostFactory.createMany(5, {
      authorId: regularUsers[0].id,
      published: false
    });

    // Verify the test data structure
    expect(admins).toHaveLength(2);
    expect(regularUsers).toHaveLength(10);
    expect(publishedPosts).toHaveLength(10); // 2 admins + 3 users, 2 posts each
    expect(draftPosts).toHaveLength(5);
    
    // All created users should be active
    const allUsers = [...admins, ...regularUsers];
    expect(allUsers.every(user => user.isActive)).toBe(true);
  });

  it('should handle factory errors gracefully', async () => {
    // Try to use factory without setting client
    const isolatedFactory = defineFactory<User>('user_isolated', (faker) => ({
      email: faker.internet.email(),
      name: faker.person.fullName(),
    }));

    // This should throw a helpful error
    await expect(isolatedFactory.create()).rejects.toThrow(/Prisma client not set/);
  });
});

// Example 4: Integration with Seeding
describe('Factory Integration with Seeding', () => {
  let app: any;

  beforeEach(async () => {
    app = await createTestApp({
      providers: [BlogService],
      seed: async (client: PrismaClient) => {
        // Use factories within custom seeding
        UserFactory.setClient(client);
        PostFactory.setClient(client);

        // Create admin user
        const admin = await UserFactory.create({
          email: 'admin@example.com',
          name: 'System Admin',
          isActive: true
        });

        // Create some initial posts
        await PostFactory.createMany(3, {
          authorId: admin.id,
          published: true
        });
      },
      databaseConfig: {
        applyMigrations: true,
        cleanup: 'truncate',
      }
    });
  });

  afterEach(async () => {
    await app.close();
  });

  it('should have seeded data available', async () => {
    const testDb = getTestDatabase();
    const prisma = testDb.getClient();

    // Check that seeded data exists
    const admin = await prisma.user.findFirst({
      where: { email: 'admin@example.com' }
    });

    const posts = await prisma.post.findMany({
      where: { authorId: admin.id }
    });

    expect(admin).toBeDefined();
    expect(admin.name).toBe('System Admin');
    expect(posts).toHaveLength(3);
  });
}); 