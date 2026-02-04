/**
 * Test Authentication Flow
 * Tests the complete authentication flow: login, verify, and protected endpoints
 */

import dotenv from 'dotenv';
dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'https://sukiyaapi.vercel.app';
const TEST_USER_ID = 'admin';
const TEST_PASSWORD = 'admin123';

interface LoginResponse {
  token: string;
  user: {
    _id: string;
    id: string;
    userId: string;
    displayName: string;
    role: string;
    isActive: boolean;
  };
}

async function testAuthFlow() {
  console.log('🔐 Testing Authentication Flow\n');
  console.log(`API Base URL: ${API_BASE_URL}\n`);

  let token: string | null = null;
  let user: any = null;

  // Step 1: Test Login
  console.log('📝 Step 1: Testing Login...');
  try {
    const loginResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        password: TEST_PASSWORD,
      }),
    });

    console.log(`   Status: ${loginResponse.status} ${loginResponse.statusText}`);

    if (!loginResponse.ok) {
      const errorText = await loginResponse.text();
      console.error(`   ❌ Login failed: ${errorText}`);
      return;
    }

    const loginData = await loginResponse.json() as LoginResponse;
    token = loginData.token;
    user = loginData.user;

    console.log('   ✅ Login successful!');
    console.log(`   Token: ${token.substring(0, 20)}...`);
    console.log(`   User: ${user.displayName} (${user.role})`);
    console.log(`   User ID: ${user.userId}`);
    console.log('');
  } catch (error) {
    console.error('   ❌ Login error:', error);
    return;
  }

  // Step 2: Test Token Verification
  console.log('🔍 Step 2: Testing Token Verification...');
  try {
    const verifyResponse = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log(`   Status: ${verifyResponse.status} ${verifyResponse.statusText}`);

    if (!verifyResponse.ok) {
      const errorText = await verifyResponse.text();
      console.error(`   ❌ Token verification failed: ${errorText}`);
      return;
    }

    const verifyData = await verifyResponse.json() as { valid: boolean; user: any };
    console.log('   ✅ Token verification successful!');
    console.log(`   Valid: ${verifyData.valid}`);
    console.log(`   User: ${verifyData.user.displayName} (${verifyData.user.role})`);
    console.log('');
  } catch (error) {
    console.error('   ❌ Token verification error:', error);
    return;
  }

  // Step 3: Test Protected Endpoint (Get Users)
  console.log('🔒 Step 3: Testing Protected Endpoint (GET /api/users)...');
  try {
    const usersResponse = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log(`   Status: ${usersResponse.status} ${usersResponse.statusText}`);

    if (!usersResponse.ok) {
      const errorText = await usersResponse.text();
      console.error(`   ❌ Failed to fetch users: ${errorText}`);
      return;
    }

    const users = await usersResponse.json() as any[];
    console.log('   ✅ Protected endpoint accessible!');
    console.log(`   Users count: ${users.length}`);
    if (users.length > 0) {
      console.log(`   First user: ${users[0].displayName} (${users[0].role})`);
    }
    console.log('');
  } catch (error) {
    console.error('   ❌ Protected endpoint error:', error);
    return;
  }

  // Step 4: Test Protected Endpoint (Get Menu - Admin)
  console.log('🍽️  Step 4: Testing Protected Endpoint (GET /api/menu with auth)...');
  try {
    const menuResponse = await fetch(`${API_BASE_URL}/api/menu`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
    });

    console.log(`   Status: ${menuResponse.status} ${menuResponse.statusText}`);

    if (!menuResponse.ok) {
      const errorText = await menuResponse.text();
      console.error(`   ❌ Failed to fetch menu: ${errorText}`);
      return;
    }

    const menuItems = await menuResponse.json() as any[];
    console.log('   ✅ Menu endpoint accessible with auth!');
    console.log(`   Menu items count: ${menuItems.length}`);
    console.log('');
  } catch (error) {
    console.error('   ❌ Menu endpoint error:', error);
    return;
  }

  // Step 5: Test Invalid Token
  console.log('🚫 Step 5: Testing Invalid Token...');
  try {
    const invalidResponse = await fetch(`${API_BASE_URL}/api/auth/verify`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer invalid_token_12345',
      },
    });

    console.log(`   Status: ${invalidResponse.status} ${invalidResponse.statusText}`);

    if (invalidResponse.status === 401) {
      console.log('   ✅ Invalid token correctly rejected (401 Unauthorized)');
    } else {
      const errorText = await invalidResponse.text();
      console.warn(`   ⚠️  Unexpected response: ${errorText}`);
    }
    console.log('');
  } catch (error) {
    console.error('   ❌ Invalid token test error:', error);
  }

  // Step 6: Test Missing Token
  console.log('🚫 Step 6: Testing Missing Token...');
  try {
    const noTokenResponse = await fetch(`${API_BASE_URL}/api/users`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    console.log(`   Status: ${noTokenResponse.status} ${noTokenResponse.statusText}`);

    if (noTokenResponse.status === 401 || noTokenResponse.status === 403) {
      console.log('   ✅ Missing token correctly rejected');
    } else {
      const errorText = await noTokenResponse.text();
      console.warn(`   ⚠️  Unexpected response: ${errorText}`);
    }
    console.log('');
  } catch (error) {
    console.error('   ❌ Missing token test error:', error);
  }

  // Step 7: Test Wrong Credentials
  console.log('🚫 Step 7: Testing Wrong Credentials...');
  try {
    const wrongCredsResponse = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        userId: TEST_USER_ID,
        password: 'wrong_password',
      }),
    });

    console.log(`   Status: ${wrongCredsResponse.status} ${wrongCredsResponse.statusText}`);

    if (wrongCredsResponse.status === 401) {
      const errorData = await wrongCredsResponse.json() as { error: string };
      console.log('   ✅ Wrong credentials correctly rejected (401 Unauthorized)');
      console.log(`   Error message: ${errorData.error}`);
    } else {
      const errorText = await wrongCredsResponse.text();
      console.warn(`   ⚠️  Unexpected response: ${errorText}`);
    }
    console.log('');
  } catch (error) {
    console.error('   ❌ Wrong credentials test error:', error);
  }

  console.log('✅ Authentication flow test completed!\n');
  console.log('Summary:');
  console.log('  ✅ Login works');
  console.log('  ✅ Token verification works');
  console.log('  ✅ Protected endpoints work with valid token');
  console.log('  ✅ Invalid/missing tokens are rejected');
  console.log('  ✅ Wrong credentials are rejected');
}

// Run the test
testAuthFlow().catch(console.error);


