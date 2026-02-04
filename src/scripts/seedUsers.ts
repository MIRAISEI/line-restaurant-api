import { getMongoDb } from '../config/database';
import { ObjectId } from 'mongodb';

interface DummyUser {
  userId: string;
  displayName: string;
  email?: string;
  phone?: string;
  role: 'Customer' | 'Staff' | 'Manager' | 'Admin';
  isActive: boolean;
}

async function seedUsers() {
  try {
    console.log('🌱 Starting user seeding...');
    
    const db = await getMongoDb();
    
    // Generate dummy users
    const dummyUsers: DummyUser[] = [
      {
        userId: 'user001',
        displayName: 'Tanaka Taro',
        email: 'tanaka.taro@example.com',
        phone: '+81-90-1234-5678',
        role: 'Customer',
        isActive: true,
      },
      {
        userId: 'user002',
        displayName: 'Sato Hanako',
        email: 'sato.hanako@example.com',
        phone: '+81-90-2345-6789',
        role: 'Customer',
        isActive: true,
      },
      {
        userId: 'user003',
        displayName: 'Yamada Ichiro',
        email: 'yamada.ichiro@example.com',
        phone: '+81-90-3456-7890',
        role: 'Customer',
        isActive: true,
      },
      {
        userId: 'user004',
        displayName: 'Watanabe Yuki',
        email: 'watanabe.yuki@example.com',
        phone: '+81-90-4567-8901',
        role: 'Customer',
        isActive: true,
      },
      {
        userId: 'user005',
        displayName: 'Kobayashi Kenji',
        email: 'kobayashi.kenji@example.com',
        phone: '+81-90-5678-9012',
        role: 'Customer',
        isActive: true,
      },
      {
        userId: 'staff001',
        displayName: 'Suzuki Akira',
        email: 'suzuki.akira@restaurant.com',
        phone: '+81-90-6789-0123',
        role: 'Staff',
        isActive: true,
      },
      {
        userId: 'staff002',
        displayName: 'Takahashi Emi',
        email: 'takahashi.emi@restaurant.com',
        phone: '+81-90-7890-1234',
        role: 'Staff',
        isActive: true,
      },
      {
        userId: 'manager001',
        displayName: 'Ito Masato',
        email: 'ito.masato@restaurant.com',
        phone: '+81-90-8901-2345',
        role: 'Manager',
        isActive: true,
      },
      {
        userId: 'admin001',
        displayName: 'Nakamura Admin',
        email: 'admin@restaurant.com',
        phone: '+81-90-9012-3456',
        role: 'Admin',
        isActive: true,
      },
      {
        userId: 'user006',
        displayName: 'Kato Rina',
        email: 'kato.rina@example.com',
        phone: '+81-90-0123-4567',
        role: 'Customer',
        isActive: false,
      },
    ];
    
    // Create users using native MongoDB driver
    const now = new Date();
    const createdUsers = [];
    
    for (const userData of dummyUsers) {
      // Check if user already exists
      const existingUser = await db.collection('users').findOne({
        userId: userData.userId
      });
      
      if (existingUser) {
        console.log(`⏭️  User ${userData.userId} already exists, skipping...`);
        continue;
      }
      
      const user = {
        _id: new ObjectId(),
        userId: userData.userId,
        displayName: userData.displayName,
        email: userData.email || null,
        phone: userData.phone || null,
        role: userData.role,
        totalOrders: 0,
        totalSpent: 0,
        lastOrderDate: null,
        isActive: userData.isActive,
        createdAt: now,
        updatedAt: now,
      };
      
      await db.collection('users').insertOne(user);
      
      createdUsers.push(user);
      console.log(`✅ Created user: ${userData.userId} (${userData.role}) - ${userData.displayName}`);
    }
    
    console.log(`\n🎉 Successfully created ${createdUsers.length} users!`);
    console.log('\n📊 User Summary:');
    createdUsers.forEach((user) => {
      console.log(`  - ${user.userId}: ${user.role} - ${user.displayName} ${user.email ? `(${user.email})` : ''}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding users:', error);
    process.exit(1);
  }
}

seedUsers();














