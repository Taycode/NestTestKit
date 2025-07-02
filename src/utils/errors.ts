/**
 * Base error class for NestTestKit
 */
export class NestTestKitError extends Error {
  public readonly code: string;
  public readonly details?: Record<string, any>;

  constructor(message: string, code: string, details?: Record<string, any>) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
    
    // Maintain proper stack trace for debugging
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Convert error to a JSON-serializable object
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      details: this.details,
      stack: this.stack,
    };
  }
}

/**
 * Database-related errors
 */
export class DatabaseError extends NestTestKitError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'DATABASE_ERROR', details);
  }
}

/**
 * Configuration-related errors
 */
export class ConfigurationError extends NestTestKitError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'CONFIGURATION_ERROR', details);
  }
}

/**
 * Migration-related errors
 */
export class MigrationError extends NestTestKitError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'MIGRATION_ERROR', details);
  }
}

/**
 * Seeding-related errors
 */
export class SeedingError extends NestTestKitError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'SEEDING_ERROR', details);
  }
}

/**
 * Factory-related errors
 */
export class FactoryError extends NestTestKitError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'FACTORY_ERROR', details);
  }
}

/**
 * Transaction-related errors
 */
export class TransactionError extends NestTestKitError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'TRANSACTION_ERROR', details);
  }
}

/**
 * Test setup-related errors
 */
export class TestSetupError extends NestTestKitError {
  constructor(message: string, details?: Record<string, any>) {
    super(message, 'TEST_SETUP_ERROR', details);
  }
}

/**
 * Error handler utility
 */
export class ErrorHandler {
  /**
   * Handle and format errors for better debugging
   */
  static handle(error: any, context?: string): NestTestKitError {
    if (error instanceof NestTestKitError) {
      return error;
    }

    // Handle Prisma errors
    if (error.code && error.code.startsWith('P')) {
      return new DatabaseError(
        `Prisma error: ${error.message}`,
        {
          prismaCode: error.code,
          originalError: error,
          context,
        }
      );
    }

    // Handle SQLite errors
    if (error.code && (error.code === 'SQLITE_ERROR' || error.code.includes('SQLITE'))) {
      return new DatabaseError(
        `SQLite error: ${error.message}`,
        {
          sqliteCode: error.code,
          originalError: error,
          context,
        }
      );
    }

    // Handle Node.js errors
    if (error.code && error.code.startsWith('E')) {
      return new ConfigurationError(
        `System error: ${error.message}`,
        {
          nodeCode: error.code,
          originalError: error,
          context,
        }
      );
    }

    // Generic error
    return new NestTestKitError(
      error.message || 'Unknown error occurred',
      'UNKNOWN_ERROR',
      {
        originalError: error,
        context,
      }
    );
  }

  /**
   * Create helpful error messages with suggestions
   */
  static createHelpfulError(
    type: 'database' | 'configuration' | 'migration' | 'seeding' | 'factory' | 'transaction' | 'setup',
    message: string,
    suggestions: string[] = []
  ): NestTestKitError {
    const errorMap = {
      database: DatabaseError,
      configuration: ConfigurationError,
      migration: MigrationError,
      seeding: SeedingError,
      factory: FactoryError,
      transaction: TransactionError,
      setup: TestSetupError,
    };

    const ErrorClass = errorMap[type];
    const fullMessage = suggestions.length > 0 
      ? `${message}\n\nSuggestions:\n${suggestions.map(s => `- ${s}`).join('\n')}`
      : message;

    return new ErrorClass(fullMessage, { suggestions });
  }

  /**
   * Common error scenarios with helpful messages
   */
  static prismaClientNotSet(): FactoryError {
    return this.createHelpfulError(
      'factory',
      'Prisma client not set on factory',
      [
        'Call factory.setClient(client) before using the factory',
        'Use FactoryManager.setClient(client) to set client for all factories',
        'Ensure you are calling factories within a test context where client is available'
      ]
    );
  }

  static migrationFailed(originalError: any): MigrationError {
    return this.createHelpfulError(
      'migration',
      `Failed to apply database migrations: ${originalError.message}`,
      [
        'Check that your Prisma schema file exists and is valid',
        'Ensure you have the necessary permissions to create/modify the database',
        'Try running "npx prisma generate" to update your Prisma client',
        'Check that your DATABASE_URL is correctly formatted'
      ]
    );
  }

  static seederDependencyError(seederName: string, missingDep: string): SeedingError {
    return this.createHelpfulError(
      'seeding',
      `Seeder '${seederName}' depends on '${missingDep}' which was not found`,
      [
        `Make sure the '${missingDep}' seeder is defined and included in your seeder list`,
        'Check for circular dependencies in your seeder dependency chain',
        'Verify that seeder names match exactly (case-sensitive)'
      ]
    );
  }

  static testDatabaseNotFound(): TestSetupError {
    return this.createHelpfulError(
      'setup',
      'Test database not available',
      [
        'Make sure to use @TestDatabase decorator on your test class',
        'Or call getTestDatabase() only within a test context',
        'Ensure the test database was properly initialized'
      ]
    );
  }

  static invalidCleanupStrategy(strategy: string): ConfigurationError {
    return this.createHelpfulError(
      'configuration',
      `Invalid cleanup strategy: ${strategy}`,
      [
        'Use "transaction", "truncate", or "recreate"',
        'Check your TestDatabaseConfig configuration',
        'Transaction strategy requires transaction support in your database'
      ]
    );
  }
} 