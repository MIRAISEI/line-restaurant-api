import { getMongoDb } from '../config/database';
import { ObjectId } from 'mongodb';
import bcrypt from 'bcrypt';

interface UserPassword {
  userId: string;
  password: string;
  role: 'Admin' | 'Manager';
}

async function setUserPasswords() {
  try {
    console.log('🔐 Setting up user passwords...');
    
    const db = await getMongoDb();
    
    // Dummy credentials for each role type
    const userPasswords: UserPassword[] = [
      {
        userId: 'admin001',
        password: 'admin123',
        role: 'Admin',
      },
      {
        userId: 'manager001',
        password: 'manager123',
        role: 'Manager',
      },
      {
        userId: 'staff001',
        password: 'staff123',
        role: 'Manager', // Note: Staff can't login, but we'll set password anyway
      },
      {
        userId: 'staff002',
        password: 'staff123',
        role: 'Manager', // Note: Staff can't login, but we'll set password anyway
      },
    ];
    
    // Also create additional test users if they don't exist
    const testUsers = [
      {
        userId: 'admin',
        displayName: 'Admin User',
        email: 'admin@restaurant.com',
        role: 'Admin',
        password: 'admin123',
      },
      {
        userId: 'manager',
        displayName: 'Manager User',
        email: 'manager@restaurant.com',
        role: 'Manager',
        password: 'manager123',
      },
      {
        userId: 'staff',
        displayName: 'Staff User',
        email: 'staff@restaurant.com',
        role: 'Staff',
        password: 'staff123',
      },
    ];
    
    // Create test users if they don't exist
    for (const userData of testUsers) {
      const existingUser = await db.collection('users').findOne({
        userId: userData.userId
      });
      
      if (!existingUser) {
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const now = new Date();
        
        const user = {
          _id: new ObjectId(),
          userId: userData.userId,
          displayName: userData.displayName,
          email: userData.email,
          phone: null,
          role: userData.role,
          password: hashedPassword,
          totalOrders: 0,
          totalSpent: 0,
          lastOrderDate: null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        };
        
        await db.collection('users').insertOne(user);
        console.log(`✅ Created user: ${userData.userId} (${userData.role}) - Password: ${userData.password}`);
      } else {
        // Update password if user exists
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        await db.collection('users').updateOne(
          { _id: existingUser._id },
          { 
            $set: { 
              password: hashedPassword,
              updatedAt: new Date()
            } 
          }
        );
        console.log(`✅ Updated password for: ${userData.userId} (${userData.role}) - Password: ${userData.password}`);
      }
    }
    
    // Set passwords for existing users (including staff)
    for (const userPassword of userPasswords) {
      const user = await db.collection('users').findOne({
        userId: userPassword.userId
      });
      
      if (user) {
        const hashedPassword = await bcrypt.hash(userPassword.password, 10);
        await db.collection('users').updateOne(
          { _id: user._id },
          { 
            $set: { 
              password: hashedPassword,
              updatedAt: new Date()
            } 
          }
        );
        console.log(`✅ Set password for: ${userPassword.userId} (${user.role}) - Password: ${userPassword.password}`);
      } else {
        console.log(`⚠️  User ${userPassword.userId} not found, skipping...`);
      }
    }
    
    // Also set password for staff user if created above
    const staffUser = await db.collection('users').findOne({
      userId: 'staff'
    });
    if (staffUser) {
      const hashedPassword = await bcrypt.hash('staff123', 10);
      await db.collection('users').updateOne(
        { _id: staffUser._id },
        { 
          $set: { 
            password: hashedPassword,
            updatedAt: new Date()
          } 
        }
      );
      console.log(`✅ Set password for: staff (Staff) - Password: staff123`);
    }
    
    console.log('\n🎉 Password setup complete!');
    console.log('\n📋 Test Credentials:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('👤 ADMIN USER:');
    console.log('   Username: admin');
    console.log('   Password: admin123');
    console.log('');
    console.log('👤 MANAGER USER:');
    console.log('   Username: manager');
    console.log('   Password: manager123');
    console.log('');
    console.log('👤 STAFF USER (Cannot login to admin panel):');
    console.log('   Username: staff');
    console.log('   Password: staff123');
    console.log('   Note: Staff role cannot access admin login');
    console.log('');
    console.log('👤 ALTERNATIVE ADMIN:');
    console.log('   Username: admin001');
    console.log('   Password: admin123');
    console.log('');
    console.log('👤 ALTERNATIVE MANAGER:');
    console.log('   Username: manager001');
    console.log('   Password: manager123');
    console.log('');
    console.log('👤 ALTERNATIVE STAFF (Cannot login):');
    console.log('   Username: staff001');
    console.log('   Password: staff123');
    console.log('   Username: staff002');
    console.log('   Password: staff123');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error setting passwords:', error);
    process.exit(1);
  }
}

setUserPasswords();

