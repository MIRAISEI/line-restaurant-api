/**
 * Complete Authentication Test Script
 * Tests all authentication endpoints and database connections
 */

import dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'https://sukiyaapi.vercel.app';
const TEST_USER_ID = process.env.TEST_USER_ID || 'admin';
const TEST_PASSWORD = process.env.TEST_PASSWORD || 'admin123';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
}

interface LoginResponse {
  token: string;
  user: {
    userId: string;
    [key: string]: any;
  };
}

interface VerifyResponse {
  valid: boolean;
  user: {
    userId: string;
    [key: string]: any;
  };
}

const results: TestResult[] = [];

async function test(name: string, testFn: () => Promise<any>): Promise<void> {
  try {
    console.log(`\n🧪 Testing: ${name}`);
    const result = await testFn();
    results.push({ name, passed: true, details: result });
    console.log(`   ✅ PASSED`);
  } catch (error: any) {
    results.push({ name, passed: false, error: error.message, details: error });
    console.log(`   ❌ FAILED: ${error.message}`);
  }
}

async function testDatabaseConnection() {
  const { getMongoDb } = await import('../config/database');
  const db = await getMongoDb();
  await db.admin().ping();
  const collections = await db.listCollections().toArray();
  return { collections: collections.length };
}

async function testEnvironmentVariables() {
  const required = ['DATABASE_URL'];
  const optional = ['JWT_SECRET', 'JWT_EXPIRES_IN'];
  
  const missing: string[] = [];
  const present: string[] = [];
  
  required.forEach(key => {
    if (!process.env[key]) {
      missing.push(key);
    } else {
      present.push(key);
    }
  });
  
  optional.forEach(key => {
    if (process.env[key]) {
      present.push(key);
    }
  });
  
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }
  
  return { present, missing: [] };
}

async function testLogin() {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: TEST_USER_ID, password: TEST_PASSWORD }),
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Login failed: ${response.status} - ${error}`);
  }
  
  const data = await response.json() as LoginResponse;
  if (!data.token || !data.user) {
    throw new Error('Invalid login response format');
  }
  
  return { token: data.token.substring(0, 20) + '...', userId: data.user.userId };
}

async function testVerifyToken(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Verify failed: ${response.status} - ${error}`);
  }
  
  const data = await response.json() as VerifyResponse;
  if (!data.valid || !data.user) {
    throw new Error('Invalid verify response format');
  }
  
  return { valid: data.valid, userId: data.user.userId };
}

async function testInvalidToken() {
  const response = await fetch(`${API_BASE_URL}/api/auth/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer invalid_token_12345',
    },
  });
  
  if (response.status !== 401) {
    throw new Error(`Expected 401, got ${response.status}`);
  }
  
  return { status: response.status };
}

async function testWrongCredentials() {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId: TEST_USER_ID, password: 'wrong_password' }),
  });
  
  if (response.status !== 401) {
    throw new Error(`Expected 401, got ${response.status}`);
  }
  
  return { status: response.status };
}

async function testProtectedEndpoint(token: string) {
  const response = await fetch(`${API_BASE_URL}/api/users`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Protected endpoint failed: ${response.status} - ${error}`);
  }
  
  const data = await response.json();
  return { userCount: Array.isArray(data) ? data.length : 0 };
}

async function runAllTests() {
  console.log('🔐 Complete Authentication Test Suite');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`Test User: ${TEST_USER_ID}`);
  console.log('='.repeat(60));
  
  let loginToken: string | null = null;
  
  // Test 1: Environment Variables
  await test('Environment Variables', testEnvironmentVariables);
  
  // Test 2: Database Connection
  await test('Database Connection', testDatabaseConnection);
  
  // Test 3: Login
  await test('Login', async () => {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: TEST_USER_ID, password: TEST_PASSWORD }),
    });
    
    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Login failed: ${response.status} - ${error}`);
    }
    
    const data = await response.json() as LoginResponse;
    if (!data.token || !data.user) {
      throw new Error('Invalid login response format');
    }
    
    loginToken = data.token; // Store full token for subsequent tests
    return { token: data.token.substring(0, 20) + '...', userId: data.user.userId };
  });
  
  // Test 4: Verify Token (only if login succeeded)
  if (loginToken) {
    await test('Verify Token', () => testVerifyToken(loginToken as string));
    await test('Protected Endpoint', () => testProtectedEndpoint(loginToken as string));
  }
  
  // Test 5: Invalid Token
  await test('Invalid Token Rejection', testInvalidToken);
  
  // Test 6: Wrong Credentials
  await test('Wrong Credentials Rejection', testWrongCredentials);
  
  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  results.forEach(result => {
    const icon = result.passed ? '✅' : '❌';
    console.log(`${icon} ${result.name}`);
    if (!result.passed && result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);
  console.log('='.repeat(60));
  
  if (failed > 0) {
    console.log('\n❌ Some tests failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed!');
    process.exit(0);
  }
}

runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

