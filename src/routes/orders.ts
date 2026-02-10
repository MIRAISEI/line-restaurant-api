import { Router } from 'express';
import { prisma, getMongoDb } from '../config/database';
import { ObjectId } from 'mongodb';
import { sendOrderConfirmation, sendPushMessage } from '../config/line';
import { generateOrderId } from '../utils/orderId';
import type { CreateOrderRequest } from '../types';

const router = Router();

// POST /api/orders - Create new order
router.post('/', async (req, res) => {
  try {
    const { userId, displayName, tableNumber, items, paymentMethod }: CreateOrderRequest = req.body;

    // Validate required fields
    if (!userId || !displayName || !tableNumber || !items || items.length === 0) {
      return res.status(400).json({
        error: 'Missing required fields',
        missingFields: [
          !userId ? 'userId' : null,
          !displayName ? 'displayName' : null,
          !tableNumber ? 'tableNumber' : null,
          !items || items.length === 0 ? 'items' : null,
        ].filter(Boolean),
      });
    }

    // Use native MongoDB driver for writes
    const db = await getMongoDb();
    const now = new Date();
    const orderId = generateOrderId();

    // Fetch user to get LINE user ID
    const user = await db.collection('users').findOne({
      userId: userId.trim()
    });
    const lineUserId = user?.lineUserId || null;

    // Collect all item IDs (main items + addons)
    const allItemIds = new Set<string>();
    items.forEach(item => {
      allItemIds.add(item.itemId);
      if (item.addons) {
        item.addons.forEach(addon => allItemIds.add(addon.itemId));
      }
    });

    // Fetch menu items to get prices and names
    const menuItems = await db.collection('menu_items')
      .find({ _id: { $in: Array.from(allItemIds).map(id => new ObjectId(id)) } })
      .toArray();

    // Create a map for quick lookup
    const menuItemsMap = new Map(menuItems.map(item => [item._id.toString(), item]));

    // Calculate total and prepare order items
    let total = 0;
    const orderItems = [];
    const orderObjectId = new ObjectId();

    for (const item of items) {
      const menuItem = menuItemsMap.get(item.itemId);
      if (!menuItem) {
        return res.status(400).json({ error: `Menu item not found: ${item.itemId}` });
      }
      if (!menuItem.isActive) {
        return res.status(400).json({ error: `Menu item is not active: ${item.itemId}` });
      }

      const itemPrice = menuItem.price * item.quantity;
      total += itemPrice;

      // Add main item
      const mainItemId = new ObjectId();
      orderItems.push({
        _id: mainItemId,
        orderId: orderObjectId,
        itemId: new ObjectId(item.itemId),
        name: menuItem.nameEn || menuItem.nameJp,
        quantity: item.quantity,
        price: menuItem.price,
        parentItemId: null, // Main items have no parent
      });

      // Add addons if any
      if (item.addons && item.addons.length > 0) {
        // Get parent item's allowedAddons
        const parentAllowedAddons = menuItem.allowedAddons || [];

        for (const addon of item.addons) {
          const addonMenuItem = menuItemsMap.get(addon.itemId);
          if (!addonMenuItem) {
            return res.status(400).json({ error: `Addon menu item not found: ${addon.itemId}` });
          }
          if (!addonMenuItem.isActive) {
            return res.status(400).json({ error: `Addon menu item is not active: ${addon.itemId}` });
          }
          if (!addonMenuItem.isAddon) {
            return res.status(400).json({ error: `Item ${addon.itemId} is not marked as an addon` });
          }

          // Check if addon is allowed for this parent item
          if (parentAllowedAddons.length > 0 && !parentAllowedAddons.includes(addon.itemId)) {
            return res.status(400).json({
              error: `Addon ${addon.itemId} is not allowed for menu item ${item.itemId}`
            });
          }

          const addonPrice = addonMenuItem.price * addon.quantity;
          total += addonPrice;

          orderItems.push({
            _id: new ObjectId(),
            orderId: orderObjectId,
            itemId: new ObjectId(addon.itemId),
            name: addonMenuItem.nameEn || addonMenuItem.nameJp,
            quantity: addon.quantity,
            price: addonMenuItem.price,
            parentItemId: mainItemId, // Link addon to parent item
          });
        }
      }
    }

    // Create order
    // Payment status: 'paid' for paypay_now, 'pending' for paypay_after or paypay (legacy), null for manual
    let finalPaymentMethod = paymentMethod || 'manual';
    let paymentStatus: 'pending' | 'paid' | null;

    if (finalPaymentMethod === 'paypay_now') {
      paymentStatus = 'pending'; // Start as pending even if we'll show QR immediately
      finalPaymentMethod = 'paypay';
    } else if (finalPaymentMethod === 'paypay_after') {
      paymentStatus = 'pending';
      finalPaymentMethod = 'paypay';
    } else if (finalPaymentMethod === 'paypay') {
      paymentStatus = 'pending';
    } else {
      // manual payment has no status tracker usually
      paymentStatus = null;
    }

    const order = {
      _id: orderObjectId,
      orderId: orderId,
      userId: userId.trim(),
      displayName: displayName.trim(),
      tableNumber: tableNumber.trim(),
      lineUserId: lineUserId, // Store LINE user ID if available
      total: total,
      paymentMethod: finalPaymentMethod, // 'paypay' or 'manual'
      paymentStatus: paymentStatus, // 'pending' | 'paid' | null
      status: 'Received',
      createdAt: now,
      updatedAt: now,
    };

    // Insert order and order items
    await db.collection('orders').insertOne(order);
    if (orderItems.length > 0) {
      await db.collection('order_items').insertMany(orderItems);
    }

    // Update user statistics
    await db.collection('users').updateOne(
      { userId: userId },
      {
        $inc: { totalOrders: 1, totalSpent: total },
        $set: { lastOrderDate: now, updatedAt: now },
      }
    );

    // Send push notification (non-blocking)
    try {
      await sendOrderConfirmation(userId, orderId, tableNumber);
      console.log(`✅ Push notification sent for order ${orderId}`);
    } catch (pushError: any) {
      console.warn(`⚠️  Failed to send push notification for order ${orderId}:`, pushError.message);
      // Don't fail the order creation if push notification fails
    }

    // Transform to match frontend format
    const transformedOrder = {
      _id: order._id.toString(),
      id: order._id.toString(),
      orderId: order.orderId,
      userId: order.userId,
      displayName: order.displayName,
      tableNumber: order.tableNumber,
      lineUserId: order.lineUserId || undefined,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus || null,
      items: orderItems.map((item) => ({
        itemId: item.itemId.toString(),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        parentItemId: item.parentItemId ? item.parentItemId.toString() : undefined,
      })),
      total: order.total,
      status: order.status,
      createdAt: order.createdAt.toISOString(),
      updatedAt: order.updatedAt.toISOString(),
    };

    res.status(201).json(transformedOrder);
  } catch (error: any) {
    console.error('Error creating order:', error);
    res.status(500).json({
      error: 'Failed to create order',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// GET /api/orders - Get all orders
router.get('/', async (req, res) => {
  try {
    // Use native MongoDB driver for more reliable querying
    const db = await getMongoDb();

    // Fetch orders
    const orders = await db.collection('orders')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Fetch all order items
    const orderItemsMap = new Map();
    if (orders.length > 0) {
      const orderIds = orders.map(order => order._id);
      const orderItems = await db.collection('order_items')
        .find({ orderId: { $in: orderIds } })
        .toArray();

      // Group items by orderId
      orderItems.forEach(item => {
        const orderIdStr = item.orderId.toString();
        if (!orderItemsMap.has(orderIdStr)) {
          orderItemsMap.set(orderIdStr, []);
        }
        orderItemsMap.get(orderIdStr).push(item);
      });
    }

    // Transform to match frontend format
    const transformedOrders = orders.map((order) => {
      const orderIdStr = order._id.toString();
      const items = (orderItemsMap.get(orderIdStr) || []).map((item: any) => ({
        itemId: item.itemId.toString(),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        parentItemId: item.parentItemId ? item.parentItemId.toString() : undefined,
      }));

      return {
        _id: order._id.toString(),
        id: order._id.toString(),
        orderId: order.orderId,
        userId: order.userId,
        displayName: order.displayName,
        tableNumber: order.tableNumber,
        lineUserId: order.lineUserId || undefined,
        paymentMethod: order.paymentMethod || 'manual',
        paymentStatus: order.paymentStatus || null,
        items: items,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : new Date(order.createdAt).toISOString(),
        updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : new Date(order.updatedAt).toISOString(),
      };
    });

    res.json(transformedOrders);
  } catch (error: any) {
    console.error('Error fetching orders:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
    });
    res.status(500).json({
      error: 'Failed to fetch orders',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// GET /api/orders/:orderId - Get single order by orderId
router.get('/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId || orderId.trim() === '') {
      return res.status(400).json({ error: 'Order ID is required' });
    }

    // Use native MongoDB driver
    const db = await getMongoDb();

    // Find order by orderId (not _id)
    const order = await db.collection('orders').findOne({
      orderId: orderId
    });

    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Fetch order items
    const orderItems = await db.collection('order_items')
      .find({ orderId: order._id })
      .toArray();

    // Transform to match frontend format
    const transformedOrder = {
      _id: order._id.toString(),
      id: order._id.toString(),
      orderId: order.orderId,
      userId: order.userId,
      displayName: order.displayName,
      tableNumber: order.tableNumber,
      lineUserId: order.lineUserId || undefined,
      paymentMethod: order.paymentMethod || 'manual',
      paymentStatus: order.paymentStatus || null,
      items: orderItems.map((item) => ({
        itemId: item.itemId.toString(),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        parentItemId: item.parentItemId ? item.parentItemId.toString() : undefined,
      })),
      total: order.total,
      status: order.status,
      createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : new Date(order.createdAt).toISOString(),
      updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : new Date(order.updatedAt).toISOString(),
    };

    res.json(transformedOrder);
  } catch (error: any) {
    console.error('Error fetching order:', error);
    res.status(500).json({
      error: 'Failed to fetch order',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/orders/user/:userId - Get orders for a specific user
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId || userId.trim() === '') {
      return res.status(400).json({ error: 'User ID is required' });
    }

    // Use native MongoDB driver
    const db = await getMongoDb();

    // Fetch orders for this user
    const orders = await db.collection('orders')
      .find({ userId: userId })
      .sort({ createdAt: -1 })
      .toArray();

    // Fetch all order items for these orders
    const orderItemsMap = new Map();
    if (orders.length > 0) {
      const orderIds = orders.map(order => order._id);
      const orderItems = await db.collection('order_items')
        .find({ orderId: { $in: orderIds } })
        .toArray();

      // Group items by orderId
      orderItems.forEach(item => {
        const orderIdStr = item.orderId.toString();
        if (!orderItemsMap.has(orderIdStr)) {
          orderItemsMap.set(orderIdStr, []);
        }
        orderItemsMap.get(orderIdStr).push(item);
      });
    }

    // Transform to match frontend format
    const transformedOrders = orders.map((order) => {
      const orderIdStr = order._id.toString();
      const items = (orderItemsMap.get(orderIdStr) || []).map((item: any) => ({
        itemId: item.itemId.toString(),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        parentItemId: item.parentItemId ? item.parentItemId.toString() : undefined,
      }));

      return {
        _id: order._id.toString(),
        id: order._id.toString(),
        orderId: order.orderId,
        userId: order.userId,
        displayName: order.displayName,
        tableNumber: order.tableNumber,
        lineUserId: order.lineUserId || undefined,
        paymentMethod: order.paymentMethod || 'manual',
        paymentStatus: order.paymentStatus || null,
        items: items,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : new Date(order.createdAt).toISOString(),
        updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : new Date(order.updatedAt).toISOString(),
      };
    });

    res.json(transformedOrders);
  } catch (error: any) {
    console.error('Error fetching user orders:', error);
    res.status(500).json({
      error: 'Failed to fetch user orders',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/orders - Get all orders
router.get('/', async (req, res) => {
  try {
    // Use native MongoDB driver for more reliable querying
    const db = await getMongoDb();

    // Fetch orders
    const orders = await db.collection('orders')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Fetch all order items
    const orderItemsMap = new Map();
    if (orders.length > 0) {
      const orderIds = orders.map(order => order._id);
      const orderItems = await db.collection('order_items')
        .find({ orderId: { $in: orderIds } })
        .toArray();

      // Group items by orderId
      orderItems.forEach(item => {
        const orderIdStr = item.orderId.toString();
        if (!orderItemsMap.has(orderIdStr)) {
          orderItemsMap.set(orderIdStr, []);
        }
        orderItemsMap.get(orderIdStr).push(item);
      });
    }

    // Transform to match frontend format
    const transformedOrders = orders.map((order) => {
      const orderIdStr = order._id.toString();
      const items = (orderItemsMap.get(orderIdStr) || []).map((item: any) => ({
        itemId: item.itemId.toString(),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        parentItemId: item.parentItemId ? item.parentItemId.toString() : undefined,
      }));

      return {
        _id: order._id.toString(),
        id: order._id.toString(),
        orderId: order.orderId,
        userId: order.userId,
        displayName: order.displayName,
        tableNumber: order.tableNumber,
        lineUserId: order.lineUserId || undefined,
        paymentMethod: order.paymentMethod || 'manual',
        paymentStatus: order.paymentStatus || null,
        items: items,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt instanceof Date ? order.createdAt.toISOString() : new Date(order.createdAt).toISOString(),
        updatedAt: order.updatedAt instanceof Date ? order.updatedAt.toISOString() : new Date(order.updatedAt).toISOString(),
      };
    });

    res.json(transformedOrders);
  } catch (error: any) {
    console.error('Error fetching orders:', error);
    console.error('Error details:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
    });
    res.status(500).json({
      error: 'Failed to fetch orders',
      details: process.env.NODE_ENV === 'development' ? error?.message : undefined
    });
  }
});

// PATCH /api/orders/:id/status - Update order status
router.patch('/:id/status', async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    if (!status || !['Received', 'Preparing', 'Ready', 'Completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    // Use native MongoDB driver for writes (no replica set required)
    const db = await getMongoDb();
    const orderObjectId = new ObjectId(id);

    const result = await db.collection('orders').findOneAndUpdate(
      { _id: orderObjectId },
      {
        $set: {
          status: status,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Fetch order items using native MongoDB driver
    const orderItems = await db.collection('order_items').find({
      orderId: orderObjectId
    }).toArray();

    // Transform to match frontend format
    const transformedOrder = {
      _id: result._id.toString(),
      id: result._id.toString(), // Include both id and _id for consistency
      orderId: result.orderId,
      userId: result.userId,
      displayName: result.displayName,
      tableNumber: result.tableNumber,
      lineUserId: result.lineUserId || undefined,
      paymentMethod: result.paymentMethod || 'manual',
      paymentStatus: result.paymentStatus || null,
      items: orderItems.map((item) => ({
        itemId: item.itemId.toString(),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        parentItemId: item.parentItemId ? item.parentItemId.toString() : undefined,
      })),
      total: result.total,
      status: result.status,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    };

    // Send push notification when order is ready
    if (status === 'Ready') {
      try {
        const readyMessageEn = `🍱 Your order ${result.orderId} from Table ${result.tableNumber} is ready! Please come to pick it up.`;
        const readyMessageJp = `🍱 テーブル ${result.tableNumber} のご注文 ${result.orderId} の準備ができました。お受け取りにお越しください。`;
        const readyMessage = `${readyMessageEn}\n\n${readyMessageJp}`;

        await sendPushMessage(result.userId, readyMessage);
        console.log(`✅ Ready notification sent for order ${result.orderId}`);
      } catch (pushError: any) {
        console.warn(`⚠️  Failed to send ready notification for order ${result.orderId}:`, pushError.message);
        // Don't fail the status update if push notification fails
      }
    }

    res.json(transformedOrder);
  } catch (error: any) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      error: 'Failed to update order status',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /api/orders/:id/payment - Process payment for an order
router.patch('/:id/payment', async (req, res) => {
  try {
    const { id } = req.params;
    const { paymentStatus } = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid order ID format' });
    }

    if (!paymentStatus || !['pending', 'paid'].includes(paymentStatus)) {
      return res.status(400).json({ error: 'Invalid payment status. Must be "pending" or "paid"' });
    }

    // Use native MongoDB driver for writes
    const db = await getMongoDb();
    const orderObjectId = new ObjectId(id);

    const result = await db.collection('orders').findOneAndUpdate(
      { _id: orderObjectId },
      {
        $set: {
          paymentStatus: paymentStatus,
          updatedAt: new Date()
        }
      },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // Fetch order items using native MongoDB driver
    const orderItems = await db.collection('order_items').find({
      orderId: orderObjectId
    }).toArray();

    // Transform to match frontend format
    const transformedOrder = {
      _id: result._id.toString(),
      id: result._id.toString(),
      orderId: result.orderId,
      userId: result.userId,
      displayName: result.displayName,
      tableNumber: result.tableNumber,
      lineUserId: result.lineUserId || undefined,
      paymentMethod: result.paymentMethod || 'manual',
      paymentStatus: result.paymentStatus || null,
      items: orderItems.map((item) => ({
        itemId: item.itemId.toString(),
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        parentItemId: item.parentItemId ? item.parentItemId.toString() : undefined,
      })),
      total: result.total,
      status: result.status,
      createdAt: result.createdAt.toISOString(),
      updatedAt: result.updatedAt.toISOString(),
    };

    res.json(transformedOrder);
  } catch (error: any) {
    console.error('Error processing payment:', error);
    res.status(500).json({
      error: 'Failed to process payment',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;




