import dotenv from 'dotenv';

dotenv.config();

const DEPLOYED_URL = 'https://sukiyaapi.vercel.app';

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  message: string;
}

const results: CheckResult[] = [];

async function checkEndpoint(name: string, endpoint: string, expectedStatus: number = 200): Promise<CheckResult> {
  try {
    const startTime = Date.now();
    const response = await fetch(`${DEPLOYED_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const responseTime = Date.now() - startTime;
    const data = await response.json().catch(() => ({}));

    if (response.status === expectedStatus) {
      return {
        name,
        status: 'PASS',
        message: `✅ ${response.status} - ${responseTime}ms`,
      };
    } else if (response.status === 500) {
      return {
        name,
        status: 'FAIL',
        message: `❌ ${response.status} - Internal Server Error (likely missing DATABASE_URL in Vercel)`,
      };
    } else {
      return {
        name,
        status: 'WARN',
        message: `⚠️  ${response.status} - ${(data as any).error || response.statusText}`,
      };
    }
  } catch (error: any) {
    return {
      name,
      status: 'FAIL',
      message: `❌ Connection error: ${error.message}`,
    };
  }
}

async function checkLogin(): Promise<CheckResult> {
  try {
    const response = await fetch(`${DEPLOYED_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: 'admin', password: 'admin123' }),
    });

    const data = await response.json().catch(() => ({}));

    if (response.ok && (data as any).token) {
      return {
        name: 'Authentication (Login)',
        status: 'PASS',
        message: `✅ Login successful - Token received`,
      };
    } else if (response.status === 500) {
      return {
        name: 'Authentication (Login)',
        status: 'FAIL',
        message: `❌ 500 - Database connection error`,
      };
    } else {
      return {
        name: 'Authentication (Login)',
        status: 'WARN',
        message: `⚠️  ${response.status} - ${(data as any).error || 'Login failed'}`,
      };
    }
  } catch (error: any) {
    return {
      name: 'Authentication (Login)',
      status: 'FAIL',
      message: `❌ Connection error: ${error.message}`,
    };
  }
}

async function runChecks() {
  console.log('🔍 Verifying Vercel Deployment...\n');
  console.log(`📍 Deployed URL: ${DEPLOYED_URL}\n`);

  // Check health endpoint
  console.log('📊 Checking Health Endpoint...');
  results.push(await checkEndpoint('Health Check', '/health'));

  // Check menu endpoint
  console.log('\n📊 Checking Menu Endpoint...');
  results.push(await checkEndpoint('Menu API', '/api/menu'));

  // Check orders endpoint
  console.log('\n📊 Checking Orders Endpoint...');
  results.push(await checkEndpoint('Orders API', '/api/orders'));

  // Check users endpoint
  console.log('\n📊 Checking Users Endpoint...');
  results.push(await checkEndpoint('Users API', '/api/users'));

  // Check authentication
  console.log('\n📊 Checking Authentication...');
  results.push(await checkLogin());

  // Print Results
  console.log('\n' + '='.repeat(70));
  console.log('📊 Deployment Verification Results');
  console.log('='.repeat(70));

  results.forEach((result) => {
    const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${result.name.padEnd(35)} ${result.message}`);
  });

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const warnings = results.filter((r) => r.status === 'WARN').length;

  console.log('\n' + '='.repeat(70));
  console.log(`Total: ${results.length} | ✅ Passed: ${passed} | ❌ Failed: ${failed} | ⚠️  Warnings: ${warnings}`);
  console.log('='.repeat(70));

  if (failed > 0) {
    console.log('\n🔧 Fix Steps:');
    console.log('1. Go to Vercel Dashboard → Settings → Environment Variables');
    console.log('2. Add DATABASE_URL with format: mongodb+srv://user:pass@host.net/sukiyarestaurant?appName=Sukiya');
    console.log('3. Make sure database name (/sukiyarestaurant) is included');
    console.log('4. Redeploy the application');
    console.log('\nSee VERCEL_DEPLOYMENT.md for detailed instructions.');
  } else if (passed === results.length) {
    console.log('\n🎉 All checks passed! Deployment is working correctly.');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runChecks();

