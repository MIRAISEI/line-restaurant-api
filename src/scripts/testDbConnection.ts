import { prisma, getMongoDb, connectDatabase, disconnectDatabase } from '../config/database';

async function testDatabaseConnection() {
  console.log('🔍 Testing database connection...\n');
  
  let prismaConnected = false;
  let mongoConnected = false;
  let prismaTestPassed = false;
  let mongoTestPassed = false;
  
  // Test 1: Prisma Connection
  console.log('📊 Test 1: Prisma Connection');
  try {
    await prisma.$connect();
    prismaConnected = true;
    console.log('✅ Prisma client connected successfully');
    
    // Test Prisma query - try to count documents in a collection
    try {
      const userCount = await prisma.user.count();
      const menuItemCount = await prisma.menuItem.count();
      const orderCount = await prisma.order.count();
      prismaTestPassed = true;
      console.log('✅ Prisma query test passed');
      console.log(`   Users: ${userCount}, Menu Items: ${menuItemCount}, Orders: ${orderCount}`);
    } catch (queryError: any) {
      const errorMsg = queryError?.message || String(queryError);
      if (errorMsg.includes('empty database name')) {
        console.error('❌ Prisma query failed: Database name missing in DATABASE_URL');
        console.error('   Fix: Add database name to your DATABASE_URL');
        console.error('   Example: mongodb+srv://user:pass@host.net/sukiyarestaurant');
      } else {
        console.error('❌ Prisma query failed:', errorMsg);
      }
    }
  } catch (error) {
    console.error('❌ Prisma connection failed:', error instanceof Error ? error.message : error);
  }
  
  console.log('');
  
  // Test 2: Native MongoDB Connection
  console.log('📊 Test 2: Native MongoDB Connection');
  try {
    const db = await getMongoDb();
    mongoConnected = true;
    console.log('✅ MongoDB native client connected successfully');
    
    // Test MongoDB query
    const collections = await db.listCollections().toArray();
    mongoTestPassed = true;
    console.log(`✅ MongoDB query test passed (found ${collections.length} collections)`);
    
    // Show database info
    const dbName = db.databaseName;
    const adminDb = db.admin();
    const serverStatus = await adminDb.serverStatus();
    
    console.log(`\n📋 Database Information:`);
    console.log(`   Database Name: ${dbName}`);
    console.log(`   MongoDB Version: ${serverStatus.version}`);
    console.log(`   Collections: ${collections.length}`);
    
    if (collections.length > 0) {
      console.log(`\n📚 Collections:`);
      for (const collection of collections) {
        const count = await db.collection(collection.name).countDocuments();
        console.log(`   - ${collection.name}: ${count} documents`);
      }
    }
  } catch (error) {
    console.error('❌ MongoDB connection failed:', error instanceof Error ? error.message : error);
  }
  
  console.log('');
  
  // Test 3: Environment Variables
  console.log('📊 Test 3: Environment Variables');
  const hasDatabaseUrl = !!process.env.DATABASE_URL;
  if (hasDatabaseUrl) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.error('❌ DATABASE_URL is not set in environment variables');
    } else {
      // Mask sensitive parts of the URL
      const maskedUrl = url.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@');
      console.log(`✅ DATABASE_URL is set: ${maskedUrl}`);
      
      // Check if database name is in URL
      const urlMatch = url.match(/mongodb(\+srv)?:\/\/[^\/]+\/([^?]+)/);
      if (urlMatch && urlMatch[2]) {
        console.log(`✅ Database name found in URL: ${urlMatch[2]}`);
      } else {
        console.warn('⚠️  Database name not found in DATABASE_URL');
        console.warn('   Prisma requires database name in connection string');
        console.warn('   Example: mongodb+srv://user:pass@host.net/sukiyarestaurant');
      }
    }
  } else {
    console.error('❌ DATABASE_URL is not set in environment variables');
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary:');
  console.log('='.repeat(50));
  console.log(`Prisma Connection:     ${prismaConnected ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Prisma Query Test:     ${prismaTestPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MongoDB Connection:     ${mongoConnected ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`MongoDB Query Test:     ${mongoTestPassed ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Environment Variables:  ${hasDatabaseUrl ? '✅ PASS' : '❌ FAIL'}`);
  console.log('='.repeat(50));
  
  const allTestsPassed = prismaConnected && prismaTestPassed && mongoConnected && mongoTestPassed && hasDatabaseUrl;
  
  if (allTestsPassed) {
    console.log('\n🎉 All database connection tests passed!');
  } else {
    console.log('\n⚠️  Some tests failed. Please check the errors above.');
  }
  
  // Cleanup
  await disconnectDatabase();
  
  process.exit(allTestsPassed ? 0 : 1);
}

testDatabaseConnection();

