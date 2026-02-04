import { Router } from 'express';
import { prisma, getMongoDb } from '../config/database';
import { ObjectId } from 'mongodb';

const router = Router();

// GET /api/menu - Get menu items (all items for admin, only active for public)
router.get('/', async (req, res) => {
  try {
    // Check if request has authorization header (admin request)
    const authHeader = req.headers.authorization;
    const isAdminRequest = authHeader && authHeader.startsWith('Bearer ');

    // Use native MongoDB driver for reads to ensure all fields are included (including isAddon)
    const db = await getMongoDb();
    
    // For admin requests, return all items. For public requests, return only active items.
    const query = isAdminRequest ? {} : { isActive: true };

    const menuItems = await db.collection('menu_items')
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    // Normalize response to match Prisma format
    const normalizedItems = menuItems.map((item: any) => ({
      id: item._id.toString(),
      _id: item._id.toString(),
      nameEn: item.nameEn,
      nameJp: item.nameJp,
      price: item.price,
      imageUrl: item.imageUrl,
      category: item.category,
      subcategory: item.subcategory || null,
      isActive: item.isActive !== undefined ? item.isActive : true,
      isAddon: item.isAddon !== undefined ? item.isAddon : false,
      allowedAddons: item.allowedAddons || [],
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : new Date(item.createdAt).toISOString(),
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : new Date(item.updatedAt).toISOString(),
    }));

    res.json(normalizedItems);
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ error: 'Failed to fetch menu items' });
  }
});

// POST /api/menu - Create a new menu item
router.post('/', async (req, res) => {
  try {
    console.log('POST /api/menu - Request received');
    console.log('Request body:', JSON.stringify(req.body, null, 2));
    
    const { nameEn, nameJp, price, imageUrl, category, subcategory, isActive, isAddon, allowedAddons } = req.body;

    // Validate required fields
    if (!nameEn || !nameJp || price === undefined || !imageUrl || !category) {
      const missingFields = [];
      if (!nameEn) missingFields.push('nameEn');
      if (!nameJp) missingFields.push('nameJp');
      if (price === undefined) missingFields.push('price');
      if (!imageUrl) missingFields.push('imageUrl');
      if (!category) missingFields.push('category');
      
      return res.status(400).json({ 
        error: 'Missing required fields',
        missingFields: missingFields
      });
    }

    // Validate price is a valid number
    const parsedPrice = parseFloat(price);
    if (isNaN(parsedPrice) || parsedPrice < 0) {
      return res.status(400).json({ error: 'Price must be a valid positive number' });
    }

    console.log('Attempting to create menu item in database...');
    
    // Use native MongoDB driver for writes (no replica set required)
    const db = await getMongoDb();
    const now = new Date();
    const menuItemData = {
      _id: new ObjectId(),
      nameEn: nameEn.trim(),
      nameJp: nameJp.trim(),
      price: parsedPrice,
      imageUrl: imageUrl.trim(),
      category: category.trim(),
      subcategory: subcategory?.trim() || null,
      isActive: isActive !== undefined ? isActive : true,
      isAddon: isAddon !== undefined ? isAddon : false,
      allowedAddons: Array.isArray(allowedAddons) ? allowedAddons : [],
      createdAt: now,
      updatedAt: now,
    };
    
    await db.collection('menu_items').insertOne(menuItemData);
    
    // Convert to Prisma format for response
    const menuItem = {
      id: menuItemData._id.toString(),
      _id: menuItemData._id.toString(),
      nameEn: menuItemData.nameEn,
      nameJp: menuItemData.nameJp,
      price: menuItemData.price,
      imageUrl: menuItemData.imageUrl,
      category: menuItemData.category,
      subcategory: menuItemData.subcategory,
      isActive: menuItemData.isActive,
      isAddon: menuItemData.isAddon,
      allowedAddons: menuItemData.allowedAddons,
      createdAt: menuItemData.createdAt,
      updatedAt: menuItemData.updatedAt,
    };

    console.log('✅ Menu item created successfully:', menuItem.id);
    return res.status(201).json(menuItem);
  } catch (error: any) {
    console.error('❌ Error creating menu item:');
    console.error('  Error type:', typeof error);
    console.error('  Error code:', error?.code);
    console.error('  Error name:', error?.name);
    console.error('  Error message:', error?.message);
    
    // Try to serialize error safely
    let errorString = 'Unknown error';
    try {
      errorString = JSON.stringify(error, Object.getOwnPropertyNames(error), 2);
    } catch (stringifyError) {
      errorString = `Error: ${error?.message || error?.toString() || 'Unknown'}`;
      if (error?.code) errorString += ` (Code: ${error.code})`;
    }
    console.error('  Full error object:', errorString);
    
    if (error?.stack) {
      console.error('  Error stack:', error.stack);
    }
    
    // Log Prisma-specific properties
    if (error?.meta) {
      console.error('  Prisma meta:', JSON.stringify(error.meta, null, 2));
    }
    
    // Handle Prisma-specific errors
    if (error.code === 'P2002') {
      return res.status(409).json({ 
        error: 'Menu item with this name already exists',
        details: error.meta?.target 
      });
    }
    
    if (error.code === 'P2003') {
      return res.status(400).json({ 
        error: 'Invalid reference in menu item data',
        details: error.meta?.field_name 
      });
    }

    // Handle Prisma connection errors
    if (error.code === 'P1001' || error.message?.includes('connect')) {
      return res.status(503).json({ 
        error: 'Database connection failed. Please check if MongoDB is running.',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
    
    // Handle MongoDB replica set requirement
    if (error.code === 'P2031') {
      return res.status(503).json({ 
        error: 'MongoDB must be configured as a replica set. See setup instructions in the backend README.',
        code: 'P2031',
        details: process.env.NODE_ENV === 'development' ? 'Run MongoDB as a single-node replica set for development' : undefined
      });
    }

    // Return more detailed error message
    // Safely extract error message
    let errorMessage = 'Failed to create menu item';
    try {
      errorMessage = error?.message || error?.toString() || errorMessage;
    } catch (e) {
      errorMessage = 'Failed to create menu item (error details unavailable)';
    }
    
    const errorResponse: any = { 
      error: errorMessage,
      code: error?.code || 'UNKNOWN_ERROR'
    };
    
    // Add details in development mode
    if (process.env.NODE_ENV === 'development') {
      if (error?.name) errorResponse.name = error.name;
      if (error?.stack) {
        // Only include first few lines of stack to avoid huge responses
        const stackLines = error.stack.split('\n').slice(0, 5);
        errorResponse.stack = stackLines.join('\n');
      }
      if (error?.meta) {
        errorResponse.meta = error.meta;
      }
    }
    
    console.error('📤 Sending error response:', JSON.stringify(errorResponse, null, 2));
    
    // Ensure response hasn't been sent already
    if (!res.headersSent) {
      return res.status(500).json(errorResponse);
    } else {
      console.error('⚠️  Response already sent, cannot send error response');
    }
  }
});

// PATCH /api/menu/:id - Update a menu item
router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid menu item ID format' });
    }

    const updates = { ...req.body };
    if (updates.price !== undefined) {
      updates.price = parseFloat(updates.price);
    }
    updates.updatedAt = new Date();

    // Use native MongoDB driver for writes (no replica set required)
    const db = await getMongoDb();
    const result = await db.collection('menu_items').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: updates },
      { returnDocument: 'after' }
    );

    if (!result) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    // Convert to Prisma format for response
    const menuItem = {
      id: result._id.toString(),
      _id: result._id.toString(),
      nameEn: result.nameEn,
      nameJp: result.nameJp,
      price: result.price,
      imageUrl: result.imageUrl,
      category: result.category,
      subcategory: result.subcategory || null,
      isActive: result.isActive,
      isAddon: result.isAddon || false,
      allowedAddons: result.allowedAddons || [],
      createdAt: result.createdAt,
      updatedAt: result.updatedAt,
    };

    res.json(menuItem);
  } catch (error: any) {
    console.error('Error updating menu item:', error);
    res.status(500).json({ error: 'Failed to update menu item' });
  }
});

// DELETE /api/menu/:id - Hard delete a menu item (admin only)
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ error: 'Invalid menu item ID format' });
    }

    // Use native MongoDB driver for writes (no replica set required)
    const db = await getMongoDb();
    const result = await db.collection('menu_items').findOneAndDelete(
      { _id: new ObjectId(id) }
    );

    if (!result) {
      return res.status(404).json({ error: 'Menu item not found' });
    }

    res.json({ message: 'Menu item deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting menu item:', error);
    res.status(500).json({ error: 'Failed to delete menu item' });
  }
});

// GET /api/menu/addons - Get addon-eligible menu items for a specific parent item
router.get('/addons', async (req, res) => {
  try {
    const { parentItemId } = req.query;
    
    // Use native MongoDB driver to fetch addon-eligible items
    const db = await getMongoDb();
    
    let addonItems;
    
    if (parentItemId) {
      // Get the parent menu item to check its allowedAddons
      const parentItem = await db.collection('menu_items')
        .findOne({ _id: new ObjectId(parentItemId as string) });
      
      if (!parentItem) {
        return res.status(404).json({ error: 'Parent menu item not found' });
      }
      
      // If parent item has allowedAddons defined, only return those addons
      // Otherwise, return all addons (backward compatibility)
      const allowedAddonIds = parentItem.allowedAddons || [];
      
      if (allowedAddonIds.length > 0) {
        // Convert string IDs to ObjectIds for query
        const allowedObjectIds = allowedAddonIds
          .filter((id: string) => ObjectId.isValid(id))
          .map((id: string) => new ObjectId(id));
        
        addonItems = await db.collection('menu_items')
          .find({
            _id: { $in: allowedObjectIds },
            isAddon: true,
            isActive: true,
          })
          .sort({ createdAt: -1 })
          .toArray();
      } else {
        // No restrictions - return all addons (backward compatibility)
        addonItems = await db.collection('menu_items')
          .find({
            isAddon: true,
            isActive: true,
          })
          .sort({ createdAt: -1 })
          .toArray();
      }
    } else {
      // No parent item specified - return all addons (backward compatibility)
      addonItems = await db.collection('menu_items')
        .find({
          isAddon: true,
          isActive: true,
        })
        .sort({ createdAt: -1 })
        .toArray();
    }

    // Normalize response to match Prisma format
    const normalizedItems = addonItems.map((item: any) => ({
      id: item._id.toString(),
      _id: item._id.toString(),
      nameEn: item.nameEn,
      nameJp: item.nameJp,
      price: item.price,
      imageUrl: item.imageUrl,
      category: item.category,
      subcategory: item.subcategory || null,
      isActive: item.isActive !== undefined ? item.isActive : true,
      isAddon: item.isAddon !== undefined ? item.isAddon : false,
      createdAt: item.createdAt instanceof Date ? item.createdAt.toISOString() : new Date(item.createdAt).toISOString(),
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : new Date(item.updatedAt).toISOString(),
    }));

    res.json(normalizedItems);
  } catch (error) {
    console.error('Error fetching addon items:', error);
    res.status(500).json({ error: 'Failed to fetch addon items' });
  }
});

export default router;


