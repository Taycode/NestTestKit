/**
 * TypeORM Integration Examples for NestTestKit
 * 
 * This file demonstrates how to use NestTestKit with TypeORM for database testing.
 * It shows various patterns and features available for TypeORM users.
 */

import { 
  Entity, 
  PrimaryGeneratedColumn, 
  Column, 
  ManyToOne, 
  OneToMany,
  DataSource,
  Repository 
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';

// NestTestKit imports for TypeORM
import {
  createTypeORMTestApp,
  TypeORMTestAppBuilder,
  TypeORMTestDatabaseDecorator,
  getTypeORMTestDatabase,
  defineTypeORMFactory,
  TypeORMFactoryManager,
  typeormTestDatabaseManager,
} from '../src/index';

// ============================================================================
// EXAMPLE ENTITIES
// ============================================================================

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ unique: true })
  email!: string;

  @Column()
  name!: string;

  @Column({ default: true })
  isActive!: boolean;

  @OneToMany(() => Post, post => post.author)
  posts!: Post[];
}

@Entity('posts')
export class Post {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column()
  title!: string;

  @Column('text')
  content!: string;

  @Column({ default: false })
  published!: boolean;

  @ManyToOne(() => User, user => user.posts)
  author!: User;

  @Column()
  authorId!: number;
}

// ============================================================================
// EXAMPLE SERVICE
// ============================================================================

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Post)
    private postRepository: Repository<Post>
  ) {}

  async createUser(data: Partial<User>): Promise<User> {
    const user = this.userRepository.create(data);
    return await this.userRepository.save(user);
  }

  async findUserById(id: number): Promise<User | null> {
    return await this.userRepository.findOne({ 
      where: { id },
      relations: ['posts']
    });
  }

  async createPost(userId: number, data: Partial<Post>): Promise<Post> {
    const post = this.postRepository.create({
      ...data,
      authorId: userId
    });
    return await this.postRepository.save(post);
  }

  async getUserCount(): Promise<number> {
    return await this.userRepository.count();
  }
}

// ============================================================================
// FACTORY DEFINITIONS
// ============================================================================

const userFactory = defineTypeORMFactory(User, (faker) => ({
  email: faker.internet.email(),
  name: faker.person.fullName(),
  isActive: faker.datatype.boolean(),
}));

const postFactory = defineTypeORMFactory(Post, (faker) => ({
  title: faker.lorem.words(3),
  content: faker.lorem.paragraph(),
  published: faker.datatype.boolean(),
}));

// ============================================================================
// EXAMPLE SEEDERS
// ============================================================================

const userSeeder = {
  name: 'UserSeeder',
  async seed(dataSource: DataSource) {
    const repository = dataSource.getRepository(User);
    
    const users = [
      { email: 'admin@example.com', name: 'Admin User', isActive: true },
      { email: 'user@example.com', name: 'Regular User', isActive: true },
    ];

    for (const userData of users) {
      const user = repository.create(userData);
      await repository.save(user);
    }
  },
};

// ============================================================================
// TEST EXAMPLES
// ============================================================================

describe('TypeORM with NestTestKit Examples', () => {

  // Example 1: Manual database setup
  describe('Manual TypeORM Setup', () => {
    let testDb: any;
    let dataSource: DataSource;

    beforeAll(async () => {
      testDb = await typeormTestDatabaseManager.create({
        type: 'sqlite',
        databaseUrl: ':memory:',
        entities: [User, Post],
        synchronize: true,
      });
      
      dataSource = testDb.getDataSource();
      TypeORMFactoryManager.setDataSource(dataSource);
    });

    afterAll(async () => {
      if (testDb) {
        await testDb.destroy();
      }
    });

    it('should create and query users', async () => {
      const userRepo = dataSource.getRepository(User);
      
      const user = userRepo.create({
        email: 'test@example.com',
        name: 'Test User',
        isActive: true
      });
      await userRepo.save(user);

      const found = await userRepo.findOne({ 
        where: { email: 'test@example.com' } 
      });
      
      expect(found?.name).toBe('Test User');
    });

    it('should use TypeORM factories', async () => {
      const users = await userFactory.createMany(3);
      expect(users).toHaveLength(3);
      
      const user = users[0];
      const posts = await postFactory.createMany(2, { 
        authorId: user.id 
      });
      
      expect(posts).toHaveLength(2);
      expect(posts[0].authorId).toBe(user.id);
    });
  });

  // Example 2: Full NestJS integration
  describe('NestJS Integration', () => {
    let module: TestingModule;
    let userService: UserService;

    beforeAll(async () => {
      module = await createTypeORMTestApp({
        imports: [
          TypeOrmModule.forFeature([User, Post])
        ],
        providers: [UserService],
        databaseConfig: {
          type: 'sqlite',
          databaseUrl: ':memory:',
          entities: [User, Post],
          synchronize: true,
        },
        seed: [userSeeder]
      });

      userService = module.get<UserService>(UserService);
      
      const dataSource = module.get<DataSource>(DataSource);
      TypeORMFactoryManager.setDataSource(dataSource);
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

      const found = await userService.findUserById(user.id);
      expect(found?.email).toBe('service@example.com');
    });
  });

  // Example 3: Using decorators
  // @TypeORMTestDatabaseDecorator({
  //   type: 'sqlite',
  //   databaseUrl: ':memory:',
  //   entities: [User, Post],
  //   synchronize: true,
  // })
  describe('Decorator Example', () => {
    it('should access test database via decorator', async () => {
      const testDb = getTypeORMTestDatabase();
      const dataSource = testDb.getDataSource();
      
      const userRepo = dataSource.getRepository(User);
      const user = userRepo.create({
        email: 'decorator@example.com',
        name: 'Decorator User'
      });
      await userRepo.save(user);

      const count = await userRepo.count();
      expect(count).toBe(1);
    });
  });

  // Example 4: Builder pattern
  describe('Builder Pattern', () => {
    let builder: TypeORMTestAppBuilder;
    let module: TestingModule;

    beforeAll(async () => {
      builder = new TypeORMTestAppBuilder({
        imports: [TypeOrmModule.forFeature([User, Post])],
        providers: [UserService],
        databaseConfig: {
          type: 'sqlite',
          entities: [User, Post],
          synchronize: true,
        }
      });

      module = await builder.create();
    });

    afterAll(async () => {
      await builder.cleanup();
    });

    it('should provide service and database access', async () => {
      const userService = module.get<UserService>(UserService);
      const testDatabase = builder.getTestDatabase();
      
      const user = await userService.createUser({
        email: 'builder@example.com',
        name: 'Builder User'
      });

      const dataSource = testDatabase!.getDataSource();
      const directUser = await dataSource.getRepository(User)
        .findOne({ where: { email: 'builder@example.com' } });

      expect(user.id).toBe(directUser?.id);
    });
  });

  // Example 5: Factory patterns
  describe('Factory Patterns', () => {
    let testDb: any;

    beforeAll(async () => {
      testDb = await typeormTestDatabaseManager.create({
        type: 'sqlite',
        entities: [User, Post],
        synchronize: true
      });
      
      TypeORMFactoryManager.setDataSource(testDb.getDataSource());
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
      expect(userData.id).toBeUndefined();
      expect(userData.email).toBeDefined();
    });

    it('should create related entities', async () => {
      const user = await userFactory.create();
      const posts = await postFactory.createMany(2, { 
        authorId: user.id,
        published: true 
      });
      
      expect(posts).toHaveLength(2);
      expect(posts.every(p => p.authorId === user.id)).toBe(true);
    });
  });

  // Example 6: Cleanup strategies
  describe('Cleanup Strategies', () => {
    it('should handle truncate cleanup', async () => {
      const testDb = await typeormTestDatabaseManager.create({
        type: 'sqlite',
        entities: [User],
        synchronize: true,
        cleanup: 'truncate'
      });

      const userRepo = testDb.getDataSource().getRepository(User);
      
      await userRepo.save(userRepo.create({ 
        email: 'test@example.com', 
        name: 'Test' 
      }));
      
      expect(await userRepo.count()).toBe(1);
      
      await testDb.cleanup('truncate');
      expect(await userRepo.count()).toBe(0);
      
      await testDb.destroy();
    });
  });
});

// ============================================================================
// ADVANCED EXAMPLES
// ============================================================================

describe('Advanced TypeORM Features', () => {
  
  it('should handle multiple database types', async () => {
    // SQLite in-memory
    const memoryDb = await typeormTestDatabaseManager.create({
      type: 'sqlite',
      databaseUrl: ':memory:',
      entities: [User],
      synchronize: true
    });

    // SQLite file-based  
    const fileDb = await typeormTestDatabaseManager.create({
      type: 'sqlite',
      entities: [User],
      synchronize: true
    });

    try {
      const memoryRepo = memoryDb.getDataSource().getRepository(User);
      const fileRepo = fileDb.getDataSource().getRepository(User);

      await memoryRepo.save(memoryRepo.create({ 
        email: 'memory@example.com', 
        name: 'Memory User' 
      }));
      
      await fileRepo.save(fileRepo.create({ 
        email: 'file@example.com', 
        name: 'File User' 
      }));

      expect(await memoryRepo.count()).toBe(1);
      expect(await fileRepo.count()).toBe(1);

      // Verify isolation
      const memoryUser = await memoryRepo.findOne({ 
        where: { email: 'file@example.com' } 
      });
      expect(memoryUser).toBeNull();

    } finally {
      await memoryDb.destroy();
      await fileDb.destroy();
    }
  });

  it('should handle complex queries and relations', async () => {
    const testDb = await typeormTestDatabaseManager.create({
      type: 'sqlite',
      entities: [User, Post],
      synchronize: true
    });

    try {
      const dataSource = testDb.getDataSource();
      TypeORMFactoryManager.setDataSource(dataSource);

      // Create user and posts
      const user = await userFactory.create({ name: 'Author' });
      await postFactory.createMany(3, { 
        authorId: user.id, 
        published: true 
      });
      await postFactory.create({ 
        authorId: user.id, 
        published: false 
      });

      // Complex query
      const userWithPosts = await dataSource
        .getRepository(User)
        .findOne({
          where: { id: user.id },
          relations: ['posts']
        });

      expect(userWithPosts?.posts).toHaveLength(4);

      // Query published posts only
      const publishedPosts = await dataSource
        .getRepository(Post)
        .find({
          where: { 
            authorId: user.id, 
            published: true 
          }
        });

      expect(publishedPosts).toHaveLength(3);

    } finally {
      await testDb.destroy();
    }
  });
}); 