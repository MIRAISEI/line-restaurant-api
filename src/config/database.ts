import { PrismaClient } from '@prisma/client';
import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

// Prisma client with connection pooling for serverless
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  // Optimize for serverless environments
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Native MongoDB client for write operations (avoids replica set requirement)
// Serverless-optimized: Cache connections globally to prevent multiple connections per invocation
let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;
let isConnected = false; // Global connection state flag for serverless

export async function getMongoDb(): Promise<Db> {
  // Return existing connection if available and connected
  if (isConnected && mongoDb && mongoClient) {
    try {
      // Ping to check if connection is still alive
      await mongoDb.admin().ping();
      return mongoDb;
    } catch (error) {
      // Connection is dead, reset and reconnect
      console.warn('MongoDB connection lost, reconnecting...');
      isConnected = false;
      mongoClient = null;
      mongoDb = null;
    }
  }
  
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set in environment variables');
  }
  
  // Extract database name from connection string
  let dbName = 'sukiyarestaurant';
  try {
    const url = new URL(process.env.DATABASE_URL.replace('mongodb://', 'http://'));
    dbName = url.pathname.slice(1) || dbName;
  } catch {
    // If URL parsing fails, try to extract from connection string directly
    const match = process.env.DATABASE_URL.match(/\/([^?]+)/);
    if (match) {
      dbName = match[1];
    }
  }
  
  // Remove replica set requirement from connection string
  const cleanUrl = process.env.DATABASE_URL
    .replace(/[?&]replicaSet=[^&]*/g, '')
    .replace(/[?&]retryWrites=[^&]*/g, '')
    .replace(/[?&]w=[^&]*/g, '');
  
  try {
    mongoClient = new MongoClient(cleanUrl, {
      serverSelectionTimeoutMS: 3000, // 3 second timeout (reduced for serverless)
      connectTimeoutMS: 5000, // 5 second connection timeout (reduced for serverless)
      maxPoolSize: 1, // Single connection for serverless
      minPoolSize: 0, // No minimum pool
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db(dbName);
    isConnected = true; // Mark as connected for serverless caching
    
    console.log('✅ Connected to MongoDB via native driver');
    return mongoDb;
  } catch (error: any) {
    // Reset on connection failure
    isConnected = false;
    mongoClient = null;
    mongoDb = null;
    console.error('❌ Failed to connect to MongoDB:', error?.message || error);
    throw new Error(`MongoDB connection failed: ${error?.message || 'Unknown error'}`);
  }
}

// Serverless-optimized: Cache Prisma connection state
let prismaConnected = false;

export async function connectDatabase(): Promise<void> {
  // Skip if already connected (important for serverless)
  if (prismaConnected && isConnected) {
    return;
  }
  
  try {
    if (!prismaConnected) {
      await prisma.$connect();
      prismaConnected = true;
      console.log('✅ Connected to MongoDB via Prisma (read operations)');
    }
    
    // Also connect native client for writes
    if (!isConnected) {
      await getMongoDb();
    }
  } catch (error) {
    console.error('❌ Failed to connect to database:', error);
    prismaConnected = false;
    isConnected = false;
    throw error;
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    if (prismaConnected) {
      await prisma.$disconnect();
      prismaConnected = false;
    }
    if (mongoClient) {
      await mongoClient.close();
      mongoClient = null;
      mongoDb = null;
      isConnected = false;
    }
    console.log('✅ Disconnected from database');
  } catch (error) {
    console.error('❌ Error disconnecting from database:', error);
    // Reset state even on error
    prismaConnected = false;
    isConnected = false;
    throw error;
  }
}

process.on('beforeExit', async () => {
  await disconnectDatabase();
});
