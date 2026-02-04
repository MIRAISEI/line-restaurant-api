import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = process.env.API_URL || 'https://sukiyaapi.vercel.app';

interface TestResult {
  endpoint: string;
  method: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  statusCode?: number;
  message?: string;
  responseTime?: number;
}

const results: TestResult[] = [];

async function testEndpoint(
  method: string,
  endpoint: string,
  options: { body?: any; headers?: Record<string, string>; skip?: boolean } = {}
): Promise<TestResult> {
  const { body, headers = {}, skip = false } = options;

  if (skip) {
    return {
      endpoint,
      method,
      status: 'SKIP',
      message: 'Skipped (requires authentication or specific data)',
    };
  }

  const startTime = Date.now();
  try {
    const fetchOptions: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (body) {
      fetchOptions.body = JSON.stringify(body);
    }

    const response = await fetch(`${BASE_URL}${endpoint}`, fetchOptions);
    const responseTime = Date.now() - startTime;
    const data = await response.json().catch(() => ({})) as { error?: string };

    return {
      endpoint,
      method,
      status: response.ok ? 'PASS' : 'FAIL',
      statusCode: response.status,
      message: response.ok
        ? `✅ ${response.status} - ${response.statusText}`
        : `❌ ${response.status} - ${data.error || response.statusText}`,
      responseTime,
    };
  } catch (error: any) {
    const responseTime = Date.now() - startTime;
    return {
      endpoint,
      method,
      status: 'FAIL',
      message: `❌ Connection error: ${error.message}`,
      responseTime,
    };
  }
}

async function runTests() {
  console.log('🔍 Testing API Endpoints...\n');
  console.log(`📍 Base URL: ${BASE_URL}\n`);

  // Health Check
  console.log('📊 Testing Health Check...');
  results.push(await testEndpoint('GET', '/health'));

  // Menu Endpoints
  console.log('\n📊 Testing Menu Endpoints...');
  results.push(await testEndpoint('GET', '/api/menu'));
  results.push(await testEndpoint('GET', '/api/menu', {
    headers: { Authorization: 'Bearer test-token' },
  }));

  // Orders Endpoints
  console.log('\n📊 Testing Orders Endpoints...');
  results.push(await testEndpoint('GET', '/api/orders'));

  // Users Endpoints
  console.log('\n📊 Testing Users Endpoints...');
  results.push(await testEndpoint('GET', '/api/users'));

  // Auth Endpoints
  console.log('\n📊 Testing Auth Endpoints...');
  results.push(
    await testEndpoint('POST', '/api/auth/login', {
      body: { userId: 'admin', password: 'admin123' },
    })
  );

  // Test with invalid credentials
  results.push(
    await testEndpoint('POST', '/api/auth/login', {
      body: { userId: 'invalid', password: 'wrong' },
    })
  );

  // Test verify endpoint (will fail without valid token, but tests endpoint exists)
  results.push(
    await testEndpoint('POST', '/api/auth/verify', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
  );

  // Print Results
  console.log('\n' + '='.repeat(70));
  console.log('📊 Test Results Summary');
  console.log('='.repeat(70));

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  results.forEach((result) => {
    const statusIcon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⏭️';
    const time = result.responseTime ? ` (${result.responseTime}ms)` : '';
    const statusCode = result.statusCode ? ` [${result.statusCode}]` : '';
    console.log(
      `${statusIcon} ${result.method.padEnd(6)} ${result.endpoint.padEnd(40)} ${statusCode}${time}`
    );
    if (result.message && result.status === 'FAIL') {
      console.log(`   ${result.message}`);
    }
  });

  console.log('\n' + '='.repeat(70));
  console.log(`Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed} | ⏭️  Skipped: ${skipped}`);
  console.log('='.repeat(70));

  // Test successful login and get token
  if (passed > 0) {
    console.log('\n🔐 Testing authenticated endpoints...');
    try {
      const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 'admin', password: 'admin123' }),
      });

      if (loginResponse.ok) {
        const loginData = await loginResponse.json() as { token: string };
        const token = loginData.token;

        console.log('✅ Login successful, testing authenticated endpoints...\n');

        // Test authenticated menu endpoint
        const authMenuResult = await testEndpoint('GET', '/api/menu', {
          headers: { Authorization: `Bearer ${token}` },
        });
        results.push(authMenuResult);

        // Test verify endpoint with valid token
        const verifyResult = await testEndpoint('POST', '/api/auth/verify', {
          headers: { Authorization: `Bearer ${token}` },
        });
        results.push(verifyResult);

        console.log('\n📊 Authenticated Endpoints Results:');
        console.log(
          `   ${authMenuResult.status === 'PASS' ? '✅' : '❌'} GET /api/menu (with auth)`
        );
        console.log(
          `   ${verifyResult.status === 'PASS' ? '✅' : '❌'} POST /api/auth/verify (with valid token)`
        );
      }
    } catch (error) {
      console.log('⚠️  Could not test authenticated endpoints');
    }
  }

  const allPassed = failed === 0;
  process.exit(allPassed ? 0 : 1);
}

runTests();

