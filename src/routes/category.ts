import { Router } from 'express';
import { prisma, getMongoDb } from '../config/database';
import { ObjectId } from 'mongodb';

const router = Router();

// GET /api/categories - Get categories (all for admin, only active for public)
router.get('/', async (req, res) => {
  try {
    // Check if request has authorization header (admin request)
    const authHeader = req.headers.authorization;
    const isAdminRequest = authHeader && authHeader.startsWith('Bearer ');

    // Use native MongoDB driver for reads
    const db = await getMongoDb();

    // For admin requests, return all categories. For public requests, return only active categories.
    const query = isAdminRequest ? {} : { isActive: true };

    const categories = await db.collection('categories')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    // Normalize response to match Prisma format
    const normalizedCategories = categories.map((category: any) => ({
      id: category._id.toString(),
      _id: category._id.toString(),
      name: category.name,
      nameEn: category.nameEn || category.name || '',
      nameJp: category.nameJp || category.name || '',
      imageUrl: category.imageUrl,
      isActive: category.isActive !== undefined ? category.isActive : true,
      createdAt: category.createdAt instanceof Date ? category.createdAt.toISOString() : new Date(category.createdAt).toISOString(),
      updatedAt: category.updatedAt instanceof Date ? category.updatedAt.toISOString() : new Date(category.updatedAt).toISOString(),
    }));

    res.json(normalizedCategories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Failed to fetch categories' });
  }
});

// POST /api/categories - Create a new category
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/categories - Request received');
    console.log('Request body:', JSON.stringify(req.body, null, 2));

    const { name, nameEn, nameJp, imageUrl, isActive } = req.body;

    // Validate required fields (at least one name field)
    if ((!name && !nameEn) || !imageUrl) {
      const missingFields = [];
      if (!name && !nameEn) missingFields.push('name or nameEn');
      if (!imageUrl) missingFields.push('imageUrl');

      return res.status(400).json({
        error: 'Missing required fields',
        missingFields: missingFields
      });
    }

    console.log('Attempting to create category in database...');

    // Use native MongoDB driver for writes (no replica set required)
    const db = await getMongoDb();
    const now = new Date();
    const categoryData = {
      _id: new ObjectId(),
      name: (nameEn || name).trim(),
      nameEn: (nameEn || name).trim(),
      nameJp: (nameJp || name || nameEn).trim(),
      imageUrl: imageUrl.trim(),
      isActive: isActive !== undefined ? isActive : true,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('categories').insertOne(categoryData);

    // Convert to Prisma format for response
    const category = {
      id: categoryData._id.toString(),
      _id: categoryData._id.toString(),
      name: categoryData.name,
      nameEn: categoryData.nameEn,
      nameJp: categoryData.nameJp,
      imageUrl: categoryData.imageUrl,
      isActive: categoryData.isActive,
      createdAt: categoryData.createdAt,
      updatedAt: categoryData.updatedAt,
    };

    console.log('✅ Category created successfully:', category.id);
    return res.status(201).json(category);
  } catch (error: any) {
    console.error('❌ Error creating category:');
    console.error('  Error message:', error?.message);

    if (error?.stack) {
      console.error('  Error stack:', error.stack);
    }

    // Handle duplicate category names
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Category with this name already exists'
      });
    }

    // Handle Prisma connection errors
    if (error.code === 'P1001' || error.message?.includes('connect')) {
      return res.status(503).json({
        error: 'Database connection failed. Please check if MongoDB is running.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }

    const errorResponse: any = {
      error: error?.message || 'Failed to create category',
      code: error?.code || 'UNKNOWN_ERROR'
    };

    // Add details in development mode
    if (process.env.NODE_ENV === 'development') {
      if (error?.name) errorResponse.name = error.name;
      if (error?.stack) {
        const stackLines = error.stack.split('\n').slice(0, 5);
        errorResponse.stack = stackLines.join('\n');
      }
    }

    console.error('📤 Sending error response:', JSON.stringify(errorResponse, null, 2));

    if (!res.headersSent) {
      return res.status(500).json(errorResponse);
    } else {
      console.error('⚠️  Response already sent, cannot send error response');
    }
  }
});

// PATCH /api/categories/:id - Update a category
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid category ID format' });
    }

    const updates = { ...req.body };
    updates.updatedAt = new Date();

    // Use native MongoDB driver for writes (no replica set required)
    const db = await getMongoDb();
    const result = await db.collection('categories').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'Category not found' });
    }

    // Convert to Prisma format for response
    const category = {
      id: result._id.toString(),
      _id: result._id.toString(),
      name: result.name,
      nameEn: result.nameEn || result.name || '',
      nameJp: result.nameJp || result.name || '',
      imageUrl: result.imageUrl,
      isActive: result.isActive,
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };

    res.json(category);
  } catch (error: any) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Failed to update category' });
  }
});

// DELETE /api/categories/:id - Hard delete a category (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid category ID format' });
    }

    // Use native MongoDB driver for writes (no replica set required)
    const db = await getMongoDb();
    const result = await db.collection('categories').findOneAndDelete(
      { _id: new ObjectId(id) }
    );

    if (!result) {
      return res.status(404).json({ error: 'Category not found' });
    }

    res.json({ message: 'Category deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Failed to delete category' });
  }
});

export default router;
