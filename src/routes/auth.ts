import { Router } from 'express';
import bcrypt from 'bcrypt';
import jwt, { SignOptions } from 'jsonwebtoken';
import type { StringValue } from 'ms';
import { prisma, getMongoDb } from '../config/database';
import { ObjectId } from 'mongodb';
import { lineLoginConfig } from '../config/line';
import crypto from 'crypto';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

// POST /api/auth/login - Admin login
router.post('/login', async (req, res, next) => {
  try {
    const { userId, password } = req.body;

    // Validate required fields
    if (!userId || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        missingFields: !userId ? ['userId'] : ['password']
      });
    }

    // Find user by userId using native MongoDB driver to get password field
    let db;
    try {
      db = await getMongoDb();
    } catch (dbError: any) {
      console.error('Database connection error during login:', dbError);
      return res.status(503).json({ 
        error: 'Database connection failed',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    const user = await db.collection('users').findOne({
      userId: userId.trim()
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // Check if user has admin, manager, or staff role (case-insensitive check)
    const userRole = user.role?.toString().toLowerCase();
    if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'staff') {
      return res.status(403).json({ error: 'Access denied. Admin, Manager, or Staff role required' });
    }

    // Check if user has a password set
    if (!user.password) {
      return res.status(401).json({ 
        error: 'Password not set for this account. Please set a password first.' 
      });
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const expiresInValue: StringValue = (JWT_EXPIRES_IN as StringValue) || ('7d' as StringValue);
    const signOptions: SignOptions = {
      expiresIn: expiresInValue,
    };

    const token = jwt.sign(
      { 
        userId: user.userId,
        id: user._id.toString(), // Use _id from MongoDB document
        role: user.role,
        displayName: user.displayName
      },
      JWT_SECRET,
      signOptions
    );

    // Return user data (without password) and token
    res.json({
      token,
      user: {
        _id: user._id.toString(),
        id: user._id.toString(),
        userId: user.userId,
        displayName: user.displayName,
        email: user.email || undefined,
        phone: user.phone || undefined,
        role: user.role.toLowerCase(),
        isActive: user.isActive,
        createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : new Date(user.createdAt).toISOString(),
        updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : new Date(user.updatedAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error during login:', error);
    console.error('Error stack:', error?.stack);
    console.error('Error message:', error?.message);
    // Pass error to Express error handler
    next(error);
  }
});

// POST /api/auth/verify - Verify token
router.post('/verify', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7);
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as any;
      
      // Get MongoDB connection
      let db;
      try {
        db = await getMongoDb();
      } catch (dbError: any) {
        console.error('Database connection error during verify:', dbError);
        return res.status(503).json({ 
          error: 'Database connection failed',
          details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
        });
      }

      // Verify user still exists and is active using MongoDB native driver (consistent with login)
      const user = await db.collection('users').findOne({
        _id: new ObjectId(decoded.id)
      });

      if (!user) {
        return res.status(401).json({ error: 'User not found' });
      }

      if (!user.isActive) {
        return res.status(401).json({ error: 'User account is inactive' });
      }

      // Return user data (without password) - consistent format with login
      res.json({
        valid: true,
        user: {
          _id: user._id.toString(),
          id: user._id.toString(),
          userId: user.userId,
          displayName: user.displayName,
          email: user.email || undefined,
          phone: user.phone || undefined,
          role: user.role.toLowerCase(),
          isActive: user.isActive,
          lineUserId: user.lineUserId || undefined,
          createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : new Date(user.createdAt).toISOString(),
          updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : new Date(user.updatedAt).toISOString(),
        },
      });
    } catch (jwtError: any) {
      // Handle JWT verification errors
      if (jwtError.name === 'TokenExpiredError') {
        return res.status(401).json({ error: 'Token has expired' });
      }
      if (jwtError.name === 'JsonWebTokenError') {
        return res.status(401).json({ error: 'Invalid token' });
      }
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
  } catch (error: any) {
    console.error('Error verifying token:', error);
    // Pass error to Express error handler
    next(error);
  }
});

// POST /api/auth/set-password - Set password for admin user (for initial setup)
router.post('/set-password', async (req, res, next) => {
  try {
    const { userId, password } = req.body;

    if (!userId || !password) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        missingFields: !userId ? ['userId'] : ['password']
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { userId: userId.trim() },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Check if user has admin, manager, or staff role (case-insensitive check)
    const userRole = user.role?.toString().toLowerCase();
    if (userRole !== 'admin' && userRole !== 'manager' && userRole !== 'staff') {
      return res.status(403).json({ error: 'Access denied. Admin, Manager, or Staff role required' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Update user password using native MongoDB driver
    const db = await getMongoDb();
    await db.collection('users').updateOne(
      { _id: new ObjectId(user.id) },
      { 
        $set: { 
          password: hashedPassword,
          updatedAt: new Date()
        } 
      }
    );

    res.json({ message: 'Password set successfully' });
  } catch (error: any) {
    console.error('Error setting password:', error);
    // Pass error to Express error handler
    next(error);
  }
});

// LINE Login OAuth endpoints

// GET /api/auth/line/login - Generate LINE login URL
router.get('/line/login', async (req, res, next) => {
  try {
    const { channelId, channelSecret, callbackUrl } = lineLoginConfig;

    if (!channelId || !channelSecret || !callbackUrl) {
      return res.status(500).json({ 
        error: 'LINE Login configuration is incomplete',
        missing: {
          channelId: !channelId,
          channelSecret: !channelSecret,
          callbackUrl: !callbackUrl
        }
      });
    }

    // Generate state parameter for CSRF protection
    const state = crypto.randomBytes(32).toString('hex');
    
    // Store state in session or return it to client to verify later
    // For now, we'll return it and the client should send it back in the callback
    
    // Build LINE Login URL
    const lineLoginUrl = new URL('https://access.line.me/oauth2/v2.1/authorize');
    lineLoginUrl.searchParams.set('response_type', 'code');
    lineLoginUrl.searchParams.set('client_id', channelId);
    lineLoginUrl.searchParams.set('redirect_uri', callbackUrl);
    lineLoginUrl.searchParams.set('state', state);
    lineLoginUrl.searchParams.set('scope', 'profile openid email');
    lineLoginUrl.searchParams.set('nonce', crypto.randomBytes(16).toString('hex'));

    res.json({
      loginUrl: lineLoginUrl.toString(),
      state: state
    });
  } catch (error: any) {
    console.error('Error generating LINE login URL:', error);
    next(error);
  }
});

// GET /api/auth/line/callback - Handle LINE OAuth callback
router.get('/line/callback', async (req, res, next) => {
  try {
    const { code, state, error, error_description } = req.query;

    if (error) {
      return res.status(400).json({ 
        error: 'LINE Login failed',
        error_description: error_description || error
      });
    }

    if (!code) {
      return res.status(400).json({ error: 'Authorization code is missing' });
    }

    const { channelId, channelSecret, callbackUrl } = lineLoginConfig;

    if (!channelId || !channelSecret || !callbackUrl) {
      return res.status(500).json({ error: 'LINE Login configuration is incomplete' });
    }

    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code as string,
        redirect_uri: callbackUrl,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });

    if (!tokenResponse.ok) {
      const errorData = await tokenResponse.json().catch(() => ({}));
      console.error('LINE token exchange failed:', errorData);
      return res.status(400).json({ 
        error: 'Failed to exchange authorization code',
        details: errorData
      });
    }

    const tokenData = await tokenResponse.json() as { access_token?: string; id_token?: string };
    const { access_token, id_token } = tokenData;

    if (!access_token || !id_token) {
      return res.status(400).json({ error: 'Invalid token response from LINE' });
    }

    // Verify and decode ID token to get user info
    // For simplicity, we'll call LINE's verify endpoint
    const verifyResponse = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        id_token: id_token,
        client_id: channelId,
      }),
    });

    if (!verifyResponse.ok) {
      const errorData = await verifyResponse.json().catch(() => ({}));
      console.error('LINE ID token verification failed:', errorData);
      return res.status(400).json({ 
        error: 'Failed to verify ID token',
        details: errorData
      });
    }

    const userInfo = await verifyResponse.json() as { sub?: string; name?: string; picture?: string; email?: string };
    
    // Get user profile from LINE
    const profileResponse = await fetch('https://api.line.me/v2/profile', {
      headers: {
        'Authorization': `Bearer ${access_token}`,
      },
    });

    if (!profileResponse.ok) {
      const errorData = await profileResponse.json().catch(() => ({}));
      console.error('LINE profile fetch failed:', errorData);
      return res.status(400).json({ 
        error: 'Failed to fetch user profile',
        details: errorData
      });
    }

    const profile = await profileResponse.json() as { userId?: string; displayName?: string; pictureUrl?: string };
    
    // Combine user info from ID token and profile
    const lineUserId = userInfo.sub || profile.userId;
    
    if (!lineUserId) {
      return res.status(400).json({ error: 'Failed to get LINE user ID' });
    }
    
    const displayName = profile.displayName || userInfo.name || 'LINE User';
    const pictureUrl = profile.pictureUrl || userInfo.picture;
    const email = userInfo.email;

    // Get MongoDB connection
    let db;
    try {
      db = await getMongoDb();
    } catch (dbError: any) {
      console.error('Database connection error during LINE login:', dbError);
      return res.status(503).json({ 
        error: 'Database connection failed',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    // Find or create user by LINE user ID
    let user = await db.collection('users').findOne({
      lineUserId: lineUserId
    });

    if (!user) {
      // Create new user with LINE login
      const newUser = {
        userId: `line_${lineUserId.substring(0, 12)}`, // Generate a userId from LINE ID
        lineUserId: lineUserId,
        displayName: displayName,
        email: email || undefined,
        pictureUrl: pictureUrl || undefined,
        role: 'customer',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        totalOrders: 0,
        totalSpent: 0,
      };

      const insertResult = await db.collection('users').insertOne(newUser);
      user = { ...newUser, _id: insertResult.insertedId };
    } else {
      // Update existing user's LINE info
      await db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            displayName: displayName,
            email: email || user.email,
            pictureUrl: pictureUrl || user.pictureUrl,
            updatedAt: new Date(),
          }
        }
      );
      
      // Refresh user data
      user = await db.collection('users').findOne({
        _id: user._id
      });
    }

    // Check if user exists (should always exist at this point, but TypeScript needs this check)
    if (!user) {
      return res.status(500).json({ error: 'Failed to create or retrieve user' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // LINE login is only allowed for customers
    // Admin, Manager, and Staff must use regular userId/password login
    const userRole = user.role?.toString().toLowerCase();
    if (userRole !== 'customer') {
      return res.status(403).json({ 
        error: 'LINE login is only available for customers. Admin, Manager, and Staff must use regular login with userId and password.' 
      });
    }

    // Generate JWT token
    const expiresInValue: StringValue = (JWT_EXPIRES_IN as StringValue) || ('7d' as StringValue);
    const signOptions: SignOptions = {
      expiresIn: expiresInValue,
    };

    const token = jwt.sign(
      { 
        userId: user.userId,
        id: user._id.toString(),
        role: user.role,
        displayName: user.displayName
      },
      JWT_SECRET,
      signOptions
    );

    // Return user data and token
    res.json({
      token,
      user: {
        _id: user._id.toString(),
        id: user._id.toString(),
        userId: user.userId,
        displayName: user.displayName,
        email: user.email || undefined,
        phone: user.phone || undefined,
        role: user.role.toLowerCase(),
        isActive: user.isActive,
        pictureUrl: user.pictureUrl || undefined,
        lineUserId: user.lineUserId || undefined,
        createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : new Date(user.createdAt).toISOString(),
        updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : new Date(user.updatedAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error during LINE login callback:', error);
    next(error);
  }
});

// POST /api/auth/liff - Handle LIFF authentication (LINE app)
// This endpoint receives LINE profile data directly from LIFF (no OAuth flow needed)
router.post('/liff', async (req, res, next) => {
  try {
    const { userId, displayName, pictureUrl } = req.body;

    // Validate required fields
    if (!userId) {
      return res.status(400).json({ error: 'LINE user ID is required' });
    }

    if (!displayName) {
      return res.status(400).json({ error: 'Display name is required' });
    }

    // Get MongoDB connection
    let db;
    try {
      db = await getMongoDb();
    } catch (dbError: any) {
      console.error('Database connection error during LIFF login:', dbError);
      return res.status(503).json({ 
        error: 'Database connection failed',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    // Find or create user by LINE user ID
    let user = await db.collection('users').findOne({
      lineUserId: userId
    });

    if (!user) {
      // Create new user with LINE login
      const newUser = {
        userId: `line_${userId.substring(0, 12)}`, // Generate a userId from LINE ID
        lineUserId: userId,
        displayName: displayName,
        pictureUrl: pictureUrl || undefined,
        role: 'customer',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        totalOrders: 0,
        totalSpent: 0,
      };

      const insertResult = await db.collection('users').insertOne(newUser);
      user = { ...newUser, _id: insertResult.insertedId };
    } else {
      // Update existing user's LINE info
      await db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            displayName: displayName,
            pictureUrl: pictureUrl || user.pictureUrl,
            updatedAt: new Date(),
          }
        }
      );
      
      // Refresh user data
      user = await db.collection('users').findOne({
        _id: user._id
      });
    }

    // Check if user exists (should always exist at this point, but TypeScript needs this check)
    if (!user) {
      return res.status(500).json({ error: 'Failed to create or retrieve user' });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({ error: 'Account is inactive' });
    }

    // LIFF login is only allowed for customers
    // Admin, Manager, and Staff must use regular userId/password login
    const userRole = user.role?.toString().toLowerCase();
    if (userRole !== 'customer') {
      return res.status(403).json({ 
        error: 'LIFF login is only available for customers. Admin, Manager, and Staff must use regular login with userId and password.' 
      });
    }

    // Generate JWT token
    const expiresInValue: StringValue = (JWT_EXPIRES_IN as StringValue) || ('7d' as StringValue);
    const signOptions: SignOptions = {
      expiresIn: expiresInValue,
    };

    const token = jwt.sign(
      { 
        userId: user.userId,
        id: user._id.toString(),
        role: user.role,
        displayName: user.displayName
      },
      JWT_SECRET,
      signOptions
    );

    // Return user data and token
    res.json({
      token,
      user: {
        _id: user._id.toString(),
        id: user._id.toString(),
        userId: user.userId,
        displayName: user.displayName,
        email: user.email || undefined,
        phone: user.phone || undefined,
        role: user.role.toLowerCase(),
        isActive: user.isActive,
        pictureUrl: user.pictureUrl || undefined,
        lineUserId: user.lineUserId || undefined,
        createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : new Date(user.createdAt).toISOString(),
        updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : new Date(user.updatedAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error during LIFF authentication:', error);
    next(error);
  }
});

// POST /api/auth/table - Login with table ID (for restaurant customers)
router.post('/table', async (req, res, next) => {
  try {
    const { tableId } = req.body;

    // Validate required fields
    if (!tableId) {
      return res.status(400).json({ error: 'Table ID is required' });
    }

    const tableIdTrimmed = tableId.trim();
    if (!tableIdTrimmed) {
      return res.status(400).json({ error: 'Table ID cannot be empty' });
    }

    // Get MongoDB connection
    let db;
    try {
      db = await getMongoDb();
    } catch (dbError: any) {
      console.error('Database connection error during table login:', dbError);
      return res.status(503).json({ 
        error: 'Database connection failed',
        details: process.env.NODE_ENV === 'development' ? dbError.message : undefined
      });
    }

    // Find or create user by table ID
    // Table ID format: table_<tableNumber>
    const tableUserId = `table_${tableIdTrimmed}`;
    
    let user = await db.collection('users').findOne({
      userId: tableUserId
    });

    if (!user) {
      // Create new user for this table
      const newUser = {
        userId: tableUserId,
        displayName: `Table ${tableIdTrimmed}`,
        role: 'customer',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        totalOrders: 0,
        totalSpent: 0,
      };

      const insertResult = await db.collection('users').insertOne(newUser);
      user = { ...newUser, _id: insertResult.insertedId };
    } else {
      // Check if user is active
      if (!user.isActive) {
        return res.status(401).json({ error: 'Account is inactive' });
      }

      // Update last access time
      await db.collection('users').updateOne(
        { _id: user._id },
        {
          $set: {
            updatedAt: new Date(),
          }
        }
      );
      
      // Refresh user data
      user = await db.collection('users').findOne({
        _id: user._id
      });
    }

    // Check if user exists (should always exist at this point, but TypeScript needs this check)
    if (!user) {
      return res.status(500).json({ error: 'Failed to create or retrieve user' });
    }

    // Table login is only allowed for customers
    const userRole = user.role?.toString().toLowerCase();
    if (userRole !== 'customer') {
      return res.status(403).json({ 
        error: 'Table login is only available for customers.' 
      });
    }

    // Generate JWT token
    const expiresInValue: StringValue = (JWT_EXPIRES_IN as StringValue) || ('7d' as StringValue);
    const signOptions: SignOptions = {
      expiresIn: expiresInValue,
    };

    const token = jwt.sign(
      { 
        userId: user.userId,
        id: user._id.toString(),
        role: user.role,
        displayName: user.displayName,
        tableId: tableIdTrimmed, // Include table ID in token for easy access
      },
      JWT_SECRET,
      signOptions
    );

    // Return user data and token
    res.json({
      token,
      user: {
        _id: user._id.toString(),
        id: user._id.toString(),
        userId: user.userId,
        displayName: user.displayName,
        email: user.email || undefined,
        phone: user.phone || undefined,
        role: user.role.toLowerCase(),
        isActive: user.isActive,
        tableId: tableIdTrimmed,
        createdAt: user.createdAt instanceof Date ? user.createdAt.toISOString() : new Date(user.createdAt).toISOString(),
        updatedAt: user.updatedAt instanceof Date ? user.updatedAt.toISOString() : new Date(user.updatedAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('Error during table login:', error);
    next(error);
  }
});

// GET /api/auth/qr/:tableId - Generate QR code URL for table login
router.get('/qr/:tableId', async (req, res, next) => {
  try {
    const { tableId } = req.params;

    if (!tableId) {
      return res.status(400).json({ error: 'Table ID is required' });
    }

    const tableIdTrimmed = tableId.trim();
    if (!tableIdTrimmed) {
      return res.status(400).json({ error: 'Table ID cannot be empty' });
    }

    // Get frontend base URL
    const frontendBase = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
    const normalizedBase = frontendBase.endsWith('/') ? frontendBase.slice(0, -1) : frontendBase;
    
    // Create login URL with table ID
    const loginUrl = `${normalizedBase}/login/qr?tableId=${encodeURIComponent(tableIdTrimmed)}`;

    // Generate QR code image URL
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(loginUrl)}`;

    res.json({
      tableId: tableIdTrimmed,
      loginUrl,
      qrUrl,
      provider: 'qrserver.com',
    });
  } catch (error: any) {
    console.error('Error generating table login QR code:', error);
    next(error);
  }
});

export default router;

