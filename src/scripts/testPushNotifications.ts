/**
 * Test Push Notifications Script
 * Tests LINE push notification functionality
 */

import dotenv from 'dotenv';
import { sendPushMessage, sendOrderConfirmation, getLineClient, validateLineConfig } from '../config/line';

dotenv.config();

async function testPushNotifications() {
  console.log('🔔 Testing LINE Push Notifications\n');
  console.log('='.repeat(60));

  // Test 1: Check LINE Configuration
  console.log('\n📋 Test 1: Checking LINE Configuration');
  try {
    validateLineConfig();
    console.log('✅ LINE configuration is valid');
    console.log('   - LINE_CHANNEL_ACCESS_TOKEN: Set');
    console.log('   - LINE_CHANNEL_SECRET: Set');
  } catch (error: any) {
    console.log('❌ LINE configuration is missing');
    console.log(`   Error: ${error.message}`);
    console.log('\n⚠️  To enable push notifications:');
    console.log('   1. Get LINE Channel Access Token from LINE Developers Console');
    console.log('   2. Get LINE Channel Secret from LINE Developers Console');
    console.log('   3. Add to .env file:');
    console.log('      LINE_CHANNEL_ACCESS_TOKEN=your_token_here');
    console.log('      LINE_CHANNEL_SECRET=your_secret_here');
    console.log('\n   Note: Push notifications will be skipped if not configured.');
    process.exit(0);
  }

  // Test 2: Check LINE Client Initialization
  console.log('\n📋 Test 2: Checking LINE Client Initialization');
  const client = getLineClient();
  if (client) {
    console.log('✅ LINE client initialized successfully');
  } else {
    console.log('❌ LINE client failed to initialize');
    process.exit(1);
  }

  // Test 3: Test Push Message (requires valid LINE userId)
  console.log('\n📋 Test 3: Testing Push Message');
  const testUserId = process.env.TEST_LINE_USER_ID;
  
  if (!testUserId) {
    console.log('⚠️  TEST_LINE_USER_ID not set in environment');
    console.log('   Skipping actual push message test');
    console.log('   To test with real user:');
    console.log('   1. Add TEST_LINE_USER_ID=your_line_user_id to .env');
    console.log('   2. Make sure the user has added your LINE bot as a friend');
    console.log('   3. Run this script again');
  } else {
    console.log(`   Testing with userId: ${testUserId.substring(0, 10)}...`);
    try {
      await sendPushMessage(
        testUserId,
        '🧪 Test message from Sukiya Restaurant API. If you receive this, push notifications are working!'
      );
      console.log('✅ Push message sent successfully!');
      console.log('   Check your LINE app to see the message.');
    } catch (error: any) {
      console.log('❌ Failed to send push message');
      console.log(`   Error: ${error.message}`);
      if (error.response) {
        console.log(`   Status: ${error.response.status}`);
        console.log(`   Response: ${JSON.stringify(error.response.data)}`);
      }
    }
  }

  // Test 4: Test Order Confirmation
  console.log('\n📋 Test 4: Testing Order Confirmation');
  if (!testUserId) {
    console.log('⚠️  TEST_LINE_USER_ID not set, skipping order confirmation test');
  } else {
    console.log(`   Testing with userId: ${testUserId.substring(0, 10)}...`);
    try {
      await sendOrderConfirmation(testUserId, 'ORD12345', '5');
      console.log('✅ Order confirmation sent successfully!');
      console.log('   Check your LINE app to see the bilingual confirmation message.');
    } catch (error: any) {
      console.log('❌ Failed to send order confirmation');
      console.log(`   Error: ${error.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 Test Summary');
  console.log('='.repeat(60));
  console.log('✅ Configuration: Valid');
  console.log('✅ Client: Initialized');
  if (testUserId) {
    console.log('✅ Push Messages: Tested');
    console.log('✅ Order Confirmation: Tested');
  } else {
    console.log('⚠️  Push Messages: Skipped (no TEST_LINE_USER_ID)');
    console.log('⚠️  Order Confirmation: Skipped (no TEST_LINE_USER_ID)');
  }
  console.log('\n💡 Tips:');
  console.log('   - Push notifications require users to add your LINE bot as a friend');
  console.log('   - Get LINE userId from webhook events or LINE Login');
  console.log('   - Test with a real LINE account that has added your bot');
  console.log('\n');
}

testPushNotifications().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

