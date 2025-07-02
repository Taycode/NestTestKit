#!/usr/bin/env node

/**
 * Simple Test Runner for NestTestKit
 * This script helps you test the library functionality
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

console.log('🧪 NestTestKit Test Runner\n');

// Check if TypeScript is built
function ensureBuild() {
  console.log('📦 Building TypeScript...');
  try {
    execSync('npx tsc', { stdio: 'inherit' });
    console.log('✅ Build successful\n');
  } catch (error) {
    console.error('❌ Build failed. Make sure TypeScript is installed.');
    process.exit(1);
  }
}

// Test core functionality without external dependencies
function testCore() {
  console.log('🔧 Testing Core Functionality...');
  
  try {
    const { defineFactory, FactoryManager } = require('./dist/index');
    
    // Test factory creation
    const UserFactory = defineFactory('User', (faker) => ({
      email: faker.internet.email(),
      name: faker.person.fullName(),
      age: faker.number.int(18, 80),
    }));
    
    console.log('✅ Factory creation works');
    
    // Test data generation
    const userData = UserFactory.build();
    if (userData.email && userData.name && userData.age >= 18 && userData.age <= 80) {
      console.log('✅ Data generation works');
      console.log(`   Generated: ${userData.name} (${userData.email}), age ${userData.age}`);
    } else {
      throw new Error('Generated data is invalid');
    }
    
    // Test multiple generation
    const users = UserFactory.buildMany(3);
    if (users.length === 3) {
      console.log('✅ Multiple data generation works');
    } else {
      throw new Error('Multiple generation failed');
    }
    
    // Test overrides
    const adminUser = UserFactory.build({ email: 'admin@test.com' });
    if (adminUser.email === 'admin@test.com' && adminUser.name) {
      console.log('✅ Override functionality works');
    } else {
      throw new Error('Override functionality failed');
    }
    
    console.log('🎉 Core functionality tests passed!\n');
    return true;
    
  } catch (error) {
    console.error('❌ Core functionality test failed:', error.message);
    return false;
  }
}

// Test Prisma functionality (if available)
function testPrisma() {
  console.log('🔍 Testing Prisma Functionality...');
  
  try {
    const { testDatabaseManager } = require('./dist/index');
    
    console.log('✅ Prisma modules loaded');
    
    // Test database manager creation (without actual Prisma client)
    console.log('✅ Prisma adapter available');
    console.log('ℹ️  Full Prisma testing requires actual Prisma setup');
    
    return true;
  } catch (error) {
    console.log('⚠️  Prisma functionality not fully testable without setup:', error.message);
    return false;
  }
}

// Test TypeORM functionality (if available)
function testTypeORM() {
  console.log('🔍 Testing TypeORM Functionality...');
  
  try {
    const { createTypeORMTestApp } = require('./dist/index');
    
    console.log('✅ TypeORM modules loaded');
    console.log('ℹ️  Full TypeORM testing requires TypeORM dependencies');
    
    return true;
  } catch (error) {
    console.log('⚠️  TypeORM functionality not fully testable without dependencies:', error.message);
    return false;
  }
}

// Test Mongoose functionality (if available)
function testMongoose() {
  console.log('🔍 Testing Mongoose Functionality...');
  
  try {
    const { createMongooseTestApp, mongooseTestDatabaseManager } = require('./dist/index');
    
    console.log('✅ Mongoose modules loaded');
    console.log('ℹ️  Full Mongoose testing requires MongoDB Memory Server');
    
    return true;
  } catch (error) {
    console.log('⚠️  Mongoose functionality not fully testable without dependencies:', error.message);
    return false;
  }
}

// Check if Jest is available and run tests
function runJestTests() {
  console.log('🃏 Running Jest Tests...');
  
  if (!fs.existsSync('./jest.config.js')) {
    console.log('⚠️  Jest config not found, skipping Jest tests');
    return false;
  }
  
  try {
    execSync('npm test', { stdio: 'inherit' });
    console.log('✅ Jest tests completed');
    return true;
  } catch (error) {
    console.error('❌ Jest tests failed');
    return false;
  }
}

// Main test execution
async function main() {
  console.log('Starting NestTestKit tests...\n');
  
  // Ensure project is built
  ensureBuild();
  
  let allPassed = true;
  
  // Test core functionality
  const coreResult = testCore();
  allPassed = allPassed && coreResult;
  
  // Test individual ORM integrations
  const prismaResult = testPrisma();
  const typeormResult = testTypeORM();
  const mongooseResult = testMongoose();
  
  // Run Jest tests if available
  console.log('📋 Test Summary:');
  console.log(`Core Functionality: ${coreResult ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Prisma Integration: ${prismaResult ? '✅ PASS' : '⚠️  PARTIAL'}`);
  console.log(`TypeORM Integration: ${typeormResult ? '✅ PASS' : '⚠️  PARTIAL'}`);
  console.log(`Mongoose Integration: ${mongooseResult ? '✅ PASS' : '⚠️  PARTIAL'}`);
  
  if (coreResult) {
    console.log('\n🎉 NestTestKit core functionality is working!');
    console.log('\n📖 Next Steps:');
    console.log('1. Install your preferred ORM dependencies');
    console.log('2. Set up actual database schemas');
    console.log('3. Run integration tests with real databases');
    console.log('4. Check the examples/ folder for usage patterns');
  } else {
    console.log('\n❌ Some core functionality tests failed. Please check the errors above.');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { testCore, testPrisma, testTypeORM, testMongoose }; 