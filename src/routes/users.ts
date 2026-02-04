import { Router } from 'express';
import { prisma, getMongoDb } from '../config/database';
import { ObjectId } from 'mongodb';

const router = Router();

// GET /api/users - Get all users
router.get('/', async (req, res) => {
  try {
    // Get users from database using raw MongoDB to avoid enum validation issues
    const db = await getMongoDb();
    const users = await db.collection('users')
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    // Also aggregate order data to update stats
    const orders = await prisma.order.findMany({
      select: {
        userId: true,
        total: true,
        createdAt: true,
      },
    });

    // Calculate stats per user
    const userStats = new Map<string, { totalOrders: number; totalSpent: number; lastOrderDate?: Date }>();
    orders.forEach((order) => {
      if (!userStats.has(order.userId)) {
        userStats.set(order.userId, { totalOrders: 0, totalSpent: 0 });
      }
      const stats = userStats.get(order.userId)!;
      stats.totalOrders += 1;
      stats.totalSpent += order.total;
      if (!stats.lastOrderDate || order.createdAt > stats.lastOrderDate) {
        stats.lastOrderDate = order.createdAt;
      }
    });

    // Merge user data with stats
    const usersWithStats = users.map((user: any) => {
      const stats = userStats.get(user.userId) || { totalOrders: 0, totalSpent: 0 };
      // Normalize role: convert to proper case (Customer, Staff, Manager, Admin)
      const normalizedRole = user.role 
        ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
        : 'Customer';
      
      return {
        _id: user._id.toString(),
        id: user._id.toString(),
        userId: user.userId,
        displayName: user.displayName,
        email: user.email,
        phone: user.phone,
        role: normalizedRole.toLowerCase(),
        totalOrders: stats.totalOrders,
        totalSpent: stats.totalSpent,
        lastOrderDate: stats.lastOrderDate?.toISOString(),
        createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : new Date().toISOString(),
        isActive: user.isActive !== undefined ? user.isActive : true,
      };
    });

    res.json(usersWithStats);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST /api/users - Create a new user
router.post('/', async (req, res) => {
  try {
    const { userId, displayName, email, phone, role } = req.body;

    // Validate required fields
    if (!userId || !displayName) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        missingFields: !userId ? ['userId'] : ['displayName']
      });
    }

    // Check if user already exists using raw MongoDB
    const db = await getMongoDb();
    const existingUser = await db.collection('users').findOne({
      userId: userId.trim()
    });

    if (existingUser) {
      return res.status(409).json({ error: 'User with this userId already exists' });
    }

    // Use native MongoDB driver for writes (db already initialized above)
    const now = new Date();
    // Normalize role: convert to proper case (Customer, Staff, Manager, Admin)
    const normalizedRole = role 
      ? role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
      : 'Customer';
    
    const userData = {
      _id: new ObjectId(),
      userId: userId.trim(),
      displayName: displayName.trim(),
      email: email?.trim() || null,
      phone: phone?.trim() || null,
      role: normalizedRole,
      totalOrders: 0,
      totalSpent: 0,
      lastOrderDate: null,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('users').insertOne(userData);

    // Convert to Prisma format for response
    const user = {
      _id: userData._id.toString(),
      id: userData._id.toString(),
      userId: userData.userId,
      displayName: userData.displayName,
      email: userData.email,
      phone: userData.phone,
      role: userData.role.toLowerCase(),
      totalOrders: userData.totalOrders,
      totalSpent: userData.totalSpent,
      lastOrderDate: null,
      createdAt: userData.createdAt.toISOString(),
      updatedAt: userData.updatedAt.toISOString(),
      isActive: userData.isActive,
    };

    res.status(201).json(user);
  } catch (error: any) {
    console.error('Error creating user:', error);
    res.status(500).json({ 
      error: 'Failed to create user',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// PATCH /api/users/:id - Update user (role, etc.)
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Use native MongoDB driver for writes
    const db = await getMongoDb();
    const updateData: any = {
      updatedAt: new Date(),
    };

    if (updates.role !== undefined) {
      updateData.role = updates.role.charAt(0).toUpperCase() + updates.role.slice(1).toLowerCase();
    }
    if (updates.isActive !== undefined) {
      updateData.isActive = updates.isActive;
    }
    if (updates.displayName !== undefined) {
      updateData.displayName = updates.displayName.trim();
    }
    if (updates.email !== undefined) {
      updateData.email = updates.email?.trim() || null;
    }
    if (updates.phone !== undefined) {
      updateData.phone = updates.phone?.trim() || null;
    }

    const result = await db.collection('users').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updateData },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get order stats
    const orders = await prisma.order.findMany({
      where: { userId: result.userId },
      select: {
        total: true,
        createdAt: true,
      },
    });

    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
    const lastOrderDate = orders[0]?.createdAt || null;

    // Normalize role: convert to proper case (Customer, Staff, Manager, Admin)
    const normalizedRole = result.role 
      ? result.role.charAt(0).toUpperCase() + result.role.slice(1).toLowerCase()
      : 'Customer';

    // Transform to match frontend format
    const user = {
      _id: result._id.toString(),
      id: result._id.toString(),
      userId: result.userId,
      displayName: result.displayName,
      email: result.email,
      phone: result.phone,
      role: normalizedRole.toLowerCase(),
      totalOrders,
      totalSpent,
      lastOrderDate: lastOrderDate?.toISOString(),
      createdAt: result.createdAt ? new Date(result.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: result.updatedAt ? new Date(result.updatedAt).toISOString() : new Date().toISOString(),
      isActive: result.isActive !== undefined ? result.isActive : true,
    };

    res.json(user);
  } catch (error: any) {
    console.error('Error updating user:', error);
    res.status(500).json({ 
      error: 'Failed to update user',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// GET /api/users/userId/:userId - Get user by userId
router.get('/userId/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // Use raw MongoDB to avoid enum validation issues
    const db = await getMongoDb();
    const user = await db.collection('users').findOne({
      userId: userId.trim()
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get order stats
    const orders = await prisma.order.findMany({
      where: { userId: user.userId },
      select: {
        total: true,
        createdAt: true,
      },
    });

    const totalOrders = orders.length;
    const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
    const lastOrderDate = orders[0]?.createdAt || null;

    // Normalize role: convert to proper case (Customer, Staff, Manager, Admin)
    const normalizedRole = user.role 
      ? user.role.charAt(0).toUpperCase() + user.role.slice(1).toLowerCase()
      : 'Customer';

    // Transform to match frontend format
    const userWithStats = {
      _id: user._id.toString(),
      id: user._id.toString(),
      userId: user.userId,
      displayName: user.displayName,
      email: user.email,
      phone: user.phone,
      role: normalizedRole.toLowerCase(),
      totalOrders,
      totalSpent,
      lastOrderDate: lastOrderDate?.toISOString(),
      createdAt: user.createdAt ? new Date(user.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: user.updatedAt ? new Date(user.updatedAt).toISOString() : new Date().toISOString(),
      isActive: user.isActive !== undefined ? user.isActive : true,
    };

    res.json(userWithStats);
  } catch (error: any) {
    console.error('Error fetching user by userId:', error);
    res.status(500).json({ 
      error: 'Failed to fetch user',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// DELETE /api/users/:id - Hard delete user (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid user ID format' });
    }

    // Use native MongoDB driver for writes
    const db = await getMongoDb();
    const result = await db.collection('users').findOneAndDelete(
      { _id: new ObjectId(id) }
    );

    if (!result) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ message: 'User deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting user:', error);
    res.status(500).json({ 
      error: 'Failed to delete user',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;




