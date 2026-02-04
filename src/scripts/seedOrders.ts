import { getMongoDb } from '../config/database';
import { ObjectId } from 'mongodb';
import { generateOrderId } from '../utils/orderId';

interface DummyOrder {
  orderId: string;
  userId: string;
  displayName: string;
  tableNumber: string;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    price: number;
  }>;
  total: number;
  status: 'Received' | 'Preparing' | 'Ready' | 'Completed';
}

async function seedOrders() {
  try {
    console.log('🌱 Starting order seeding...');
    
    const db = await getMongoDb();
    
    // Get existing menu items
    const menuItems = await db.collection('menu_items').find({ isActive: true }).limit(10).toArray();
    
    if (menuItems.length === 0) {
      console.log('⚠️  No menu items found. Creating sample menu items first...');
      
      // Create some sample menu items
      const sampleMenuItems = [
        {
          _id: new ObjectId(),
          nameEn: 'Sukiyaki Set',
          nameJp: 'すき焼きセット',
          price: 1500,
          imageUrl: 'https://via.placeholder.com/150',
          category: 'Main Course',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          nameEn: 'Teriyaki Chicken',
          nameJp: '照り焼きチキン',
          price: 1200,
          imageUrl: 'https://via.placeholder.com/150',
          category: 'Main Course',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          nameEn: 'Miso Soup',
          nameJp: '味噌汁',
          price: 300,
          imageUrl: 'https://via.placeholder.com/150',
          category: 'Appetizer',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          nameEn: 'Green Tea',
          nameJp: '緑茶',
          price: 200,
          imageUrl: 'https://via.placeholder.com/150',
          category: 'Drink',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          _id: new ObjectId(),
          nameEn: 'Ice Cream',
          nameJp: 'アイスクリーム',
          price: 400,
          imageUrl: 'https://via.placeholder.com/150',
          category: 'Dessert',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      
      await db.collection('menu_items').insertMany(sampleMenuItems);
      console.log(`✅ Created ${sampleMenuItems.length} sample menu items`);
      
      // Refresh menu items
      const refreshedMenuItems = await db.collection('menu_items').find({ isActive: true }).limit(10).toArray();
      menuItems.push(...refreshedMenuItems);
    }
    
    console.log(`📋 Found ${menuItems.length} menu items`);
    
    // Generate dummy orders
    const dummyOrders: DummyOrder[] = [
      {
        orderId: generateOrderId(),
        userId: 'user001',
        displayName: 'Tanaka Taro',
        tableNumber: 'T-05',
        items: [
          {
            itemId: menuItems[0]._id.toString(),
            name: menuItems[0].nameEn,
            quantity: 2,
            price: menuItems[0].price,
          },
          {
            itemId: menuItems[2]._id.toString(),
            name: menuItems[2].nameEn,
            quantity: 1,
            price: menuItems[2].price,
          },
        ],
        total: (menuItems[0].price * 2) + menuItems[2].price,
        status: 'Received',
      },
      {
        orderId: generateOrderId(),
        userId: 'user002',
        displayName: 'Sato Hanako',
        tableNumber: 'T-12',
        items: [
          {
            itemId: menuItems[1]._id.toString(),
            name: menuItems[1].nameEn,
            quantity: 1,
            price: menuItems[1].price,
          },
          {
            itemId: menuItems[3]._id.toString(),
            name: menuItems[3].nameEn,
            quantity: 2,
            price: menuItems[3].price,
          },
        ],
        total: menuItems[1].price + (menuItems[3].price * 2),
        status: 'Preparing',
      },
      {
        orderId: generateOrderId(),
        userId: 'user003',
        displayName: 'Yamada Ichiro',
        tableNumber: 'T-08',
        items: [
          {
            itemId: menuItems[0]._id.toString(),
            name: menuItems[0].nameEn,
            quantity: 1,
            price: menuItems[0].price,
          },
          {
            itemId: menuItems[2]._id.toString(),
            name: menuItems[2].nameEn,
            quantity: 1,
            price: menuItems[2].price,
          },
          {
            itemId: menuItems[4]._id.toString(),
            name: menuItems[4].nameEn,
            quantity: 1,
            price: menuItems[4].price,
          },
        ],
        total: menuItems[0].price + menuItems[2].price + menuItems[4].price,
        status: 'Ready',
      },
      {
        orderId: generateOrderId(),
        userId: 'user004',
        displayName: 'Watanabe Yuki',
        tableNumber: 'T-15',
        items: [
          {
            itemId: menuItems[1]._id.toString(),
            name: menuItems[1].nameEn,
            quantity: 2,
            price: menuItems[1].price,
          },
          {
            itemId: menuItems[4]._id.toString(),
            name: menuItems[4].nameEn,
            quantity: 1,
            price: menuItems[4].price,
          },
        ],
        total: (menuItems[1].price * 2) + menuItems[4].price,
        status: 'Completed',
      },
      {
        orderId: generateOrderId(),
        userId: 'user005',
        displayName: 'Kobayashi Kenji',
        tableNumber: 'T-03',
        items: [
          {
            itemId: menuItems[0]._id.toString(),
            name: menuItems[0].nameEn,
            quantity: 1,
            price: menuItems[0].price,
          },
          {
            itemId: menuItems[3]._id.toString(),
            name: menuItems[3].nameEn,
            quantity: 1,
            price: menuItems[3].price,
          },
        ],
        total: menuItems[0].price + menuItems[3].price,
        status: 'Received',
      },
    ];
    
    // Create orders using native MongoDB driver
    const now = new Date();
    const createdOrders = [];
    
    for (const orderData of dummyOrders) {
      const orderId = new ObjectId();
      const order = {
        _id: orderId,
        orderId: orderData.orderId,
        userId: orderData.userId,
        displayName: orderData.displayName,
        tableNumber: orderData.tableNumber,
        total: orderData.total,
        status: orderData.status,
        createdAt: now,
        updatedAt: now,
      };
      
      // Insert order
      await db.collection('orders').insertOne(order);
      
      // Insert order items
      const orderItems = orderData.items.map((item) => ({
        _id: new ObjectId(),
        orderId: orderId,
        itemId: new ObjectId(item.itemId),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
      }));
      
      await db.collection('order_items').insertMany(orderItems);
      
      createdOrders.push(order);
      console.log(`✅ Created order: ${orderData.orderId} (${orderData.status}) - Table ${orderData.tableNumber}`);
    }
    
    console.log(`\n🎉 Successfully created ${createdOrders.length} orders!`);
    console.log('\n📊 Order Summary:');
    createdOrders.forEach((order) => {
      console.log(`  - ${order.orderId}: ${order.status} (Table ${order.tableNumber}) - ¥${order.total}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error seeding orders:', error);
    process.exit(1);
  }
}

seedOrders();

