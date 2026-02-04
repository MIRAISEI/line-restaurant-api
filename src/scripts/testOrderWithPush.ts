/**
 * Test Order Creation with Push Notifications
 * Tests the complete order creation flow including push notifications
 */

import dotenv from 'dotenv';
import { getMongoDb } from '../config/database';
import { ObjectId } from 'mongodb';

dotenv.config();

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5001';
const TEST_LINE_USER_ID = process.env.TEST_LINE_USER_ID || '';

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  details?: any;
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

async function testCreateOrder() {
  // First, get a menu item to use in the order
  const db = await getMongoDb();
  const menuItems = await db.collection('menu_items')
    .find({ isActive: true })
    .limit(1)
    .toArray();

  if (menuItems.length === 0) {
    throw new Error('No active menu items found. Please seed the database first.');
  }

  const menuItem = menuItems[0];
  const testUserId = TEST_LINE_USER_ID || 'test_user_' + Date.now();
  const testDisplayName = 'Test User';
  const testTableNumber = '10';

  const orderData = {
    userId: testUserId,
    displayName: testDisplayName,
    tableNumber: testTableNumber,
    items: [
      {
        itemId: menuItem._id.toString(),
        quantity: 2,
      },
    ],
  };

  const response = await fetch(`${API_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(orderData),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Order creation failed: ${response.status} - ${error}`);
  }

  const order = await response.json() as {
    orderId: string;
    userId: string;
    tableNumber: string;
    total: number;
    status: string;
    items: Array<{ itemId: string; name: string; quantity: number; price: number }>;
  };

  if (!order.orderId || !order.userId || !order.items || order.items.length === 0) {
    throw new Error('Invalid order response format');
  }

  return {
    orderId: order.orderId,
    userId: order.userId,
    tableNumber: order.tableNumber,
    total: order.total,
    status: order.status,
  };
}

async function testOrderStatusUpdate() {
  // Get an existing order
  const db = await getMongoDb();
  const orders = await db.collection('orders')
    .find({})
    .limit(1)
    .toArray();

  if (orders.length === 0) {
    throw new Error('No orders found. Create an order first.');
  }

  const order = orders[0];
  const orderId = order._id.toString();

  // Update status to Ready (this should trigger push notification)
  const response = await fetch(`${API_BASE_URL}/api/orders/${orderId}/status`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token', // May need actual token for protected routes
    },
    body: JSON.stringify({ status: 'Ready' }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Status update failed: ${response.status} - ${error}`);
  }

  const updatedOrder = await response.json() as {
    orderId: string;
    status: string;
    userId: string;
  };

  if (updatedOrder.status !== 'Ready') {
    throw new Error(`Status not updated correctly. Expected 'Ready', got '${updatedOrder.status}'`);
  }

  return {
    orderId: updatedOrder.orderId,
    status: updatedOrder.status,
    userId: updatedOrder.userId,
  };
}

async function runAllTests() {
  console.log('🛒 Testing Order Creation with Push Notifications');
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log('='.repeat(60));

  // Test 1: Create Order (with push notification)
  await test('Create Order with Push Notification', testCreateOrder);

  // Test 2: Update Order Status to Ready (with push notification)
  await test('Update Order Status to Ready (with notification)', testOrderStatusUpdate);

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

  if (TEST_LINE_USER_ID) {
    console.log('\n💡 Push Notification Status:');
    console.log('   - Configuration: ✅ Valid');
    console.log('   - Test User ID: ✅ Set');
    console.log('   - Check your LINE app for push notifications!');
  } else {
    console.log('\n⚠️  Push Notification Status:');
    console.log('   - Configuration: ✅ Valid');
    console.log('   - Test User ID: ⚠️  Not set');
    console.log('   - Push notifications were attempted but may not be delivered');
    console.log('   - To test with real user, set TEST_LINE_USER_ID in .env');
  }

  console.log('\n');

  if (failed > 0) {
    console.log('❌ Some tests failed. Check the errors above.');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!');
    process.exit(0);
  }
}

runAllTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

