/**
 * Verify Authentication Dependencies
 * Checks if all required packages and configurations are in place
 */

import dotenv from 'dotenv';
dotenv.config();

interface VerificationResult {
  item: string;
  status: '✅' | '❌' | '⚠️';
  message: string;
}

const results: VerificationResult[] = [];

// Check 1: bcrypt package
try {
  const bcrypt = require('bcrypt');
  results.push({
    item: 'bcrypt package',
    status: '✅',
    message: `Installed (version check: ${bcrypt ? 'available' : 'not found'})`
  });
} catch (error) {
  results.push({
    item: 'bcrypt package',
    status: '❌',
    message: 'NOT INSTALLED - Run: npm install bcrypt'
  });
}

// Check 2: jsonwebtoken package
try {
  const jwt = require('jsonwebtoken');
  results.push({
    item: 'jsonwebtoken package',
    status: '✅',
    message: `Installed (version check: ${jwt ? 'available' : 'not found'})`
  });
} catch (error) {
  results.push({
    item: 'jsonwebtoken package',
    status: '❌',
    message: 'NOT INSTALLED - Run: npm install jsonwebtoken'
  });
}

// Check 3: @types/bcrypt (check package.json instead)
try {
  const fs = require('fs');
  const path = require('path');
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const hasBcryptTypes = packageJson.devDependencies && packageJson.devDependencies['@types/bcrypt'];
  results.push({
    item: '@types/bcrypt',
    status: hasBcryptTypes ? '✅' : '⚠️',
    message: hasBcryptTypes 
      ? `Installed (${packageJson.devDependencies['@types/bcrypt']})` 
      : 'Not in package.json (optional for runtime, but recommended)'
  });
} catch (error) {
  results.push({
    item: '@types/bcrypt',
    status: '⚠️',
    message: 'Could not verify (check package.json manually)'
  });
}

// Check 4: @types/jsonwebtoken
try {
  const fs = require('fs');
  const path = require('path');
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const hasJwtTypes = packageJson.devDependencies && packageJson.devDependencies['@types/jsonwebtoken'];
  results.push({
    item: '@types/jsonwebtoken',
    status: hasJwtTypes ? '✅' : '⚠️',
    message: hasJwtTypes 
      ? `Installed (${packageJson.devDependencies['@types/jsonwebtoken']})` 
      : 'Not in package.json (optional for runtime, but recommended)'
  });
} catch (error) {
  results.push({
    item: '@types/jsonwebtoken',
    status: '⚠️',
    message: 'Could not verify (check package.json manually)'
  });
}

// Check 5: @types/ms
try {
  const fs = require('fs');
  const path = require('path');
  const packageJson = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
  const hasMsTypes = packageJson.devDependencies && packageJson.devDependencies['@types/ms'];
  results.push({
    item: '@types/ms',
    status: hasMsTypes ? '✅' : '⚠️',
    message: hasMsTypes 
      ? `Installed (${packageJson.devDependencies['@types/ms']})` 
      : 'Not in package.json (optional for runtime, but recommended)'
  });
} catch (error) {
  results.push({
    item: '@types/ms',
    status: '⚠️',
    message: 'Could not verify (check package.json manually)'
  });
}

// Check 6: JWT_SECRET environment variable
const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret && jwtSecret !== 'your-secret-key-change-in-production') {
  results.push({
    item: 'JWT_SECRET',
    status: '✅',
    message: `Set (length: ${jwtSecret.length} characters)`
  });
} else if (jwtSecret === 'your-secret-key-change-in-production') {
  results.push({
    item: 'JWT_SECRET',
    status: '⚠️',
    message: 'Using default value - CHANGE IN PRODUCTION!'
  });
} else {
  results.push({
    item: 'JWT_SECRET',
    status: '⚠️',
    message: 'Not set - using default (not secure for production)'
  });
}

// Check 7: JWT_EXPIRES_IN environment variable
const jwtExpiresIn = process.env.JWT_EXPIRES_IN;
if (jwtExpiresIn) {
  results.push({
    item: 'JWT_EXPIRES_IN',
    status: '✅',
    message: `Set to: ${jwtExpiresIn}`
  });
} else {
  results.push({
    item: 'JWT_EXPIRES_IN',
    status: '⚠️',
    message: 'Not set - using default: 7d'
  });
}

// Check 8: Test bcrypt functionality
async function testBcrypt() {
  try {
    const bcrypt = require('bcrypt');
    const testHash = await bcrypt.hash('test', 10);
    const testCompare = await bcrypt.compare('test', testHash);
    if (testCompare) {
      results.push({
        item: 'bcrypt functionality',
        status: '✅',
        message: 'Working correctly (hash and compare tested)'
      });
    } else {
      results.push({
        item: 'bcrypt functionality',
        status: '❌',
        message: 'Hash/compare test failed'
      });
    }
  } catch (error: any) {
    results.push({
      item: 'bcrypt functionality',
      status: '❌',
      message: `Error: ${error.message}`
    });
  }
}

// Check 9: Test JWT functionality
function testJWT() {
  try {
    const jwt = require('jsonwebtoken');
    const testSecret = 'test-secret';
    const testPayload = { userId: 'test', id: '123' };
    const testToken = jwt.sign(testPayload, testSecret, { expiresIn: '1h' });
    const decoded = jwt.verify(testToken, testSecret);
    
    if (decoded && (decoded as any).userId === 'test') {
      results.push({
        item: 'JWT functionality',
        status: '✅',
        message: 'Working correctly (sign and verify tested)'
      });
    } else {
      results.push({
        item: 'JWT functionality',
        status: '❌',
        message: 'Token verification test failed'
      });
    }
  } catch (error: any) {
    results.push({
      item: 'JWT functionality',
      status: '❌',
      message: `Error: ${error.message}`
    });
  }
}

// Check 10: DATABASE_URL (required for auth to work)
const databaseUrl = process.env.DATABASE_URL;
if (databaseUrl) {
  const hasDbName = databaseUrl.includes('/sukiyarestaurant') || databaseUrl.match(/\/([^?]+)/);
  results.push({
    item: 'DATABASE_URL',
    status: hasDbName ? '✅' : '⚠️',
    message: hasDbName 
      ? 'Set and includes database name' 
      : 'Set but database name might be missing'
  });
} else {
  results.push({
    item: 'DATABASE_URL',
    status: '❌',
    message: 'NOT SET - Required for authentication to work'
  });
}

// Run async tests and print results
async function runVerification() {
  await testBcrypt();
  testJWT();

  // Print results
  console.log('\n🔐 Authentication Dependencies Verification\n');
  console.log('='.repeat(60));

  results.forEach((result) => {
    console.log(`${result.status} ${result.item}`);
    console.log(`   ${result.message}`);
  });

  console.log('\n' + '='.repeat(60));

  // Summary
  const passed = results.filter(r => r.status === '✅').length;
  const warnings = results.filter(r => r.status === '⚠️').length;
  const failed = results.filter(r => r.status === '❌').length;

  console.log(`\n📊 Summary:`);
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ⚠️  Warnings: ${warnings}`);
  console.log(`   ❌ Failed: ${failed}`);

  if (failed > 0) {
    console.log(`\n❌ Some critical dependencies are missing!`);
    process.exit(1);
  } else if (warnings > 0) {
    console.log(`\n⚠️  Some optional items need attention.`);
    process.exit(0);
  } else {
    console.log(`\n✅ All checks passed!`);
    process.exit(0);
  }
}

runVerification().catch(console.error);

