import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { connectDatabase, disconnectDatabase } from './config/database';
import { validateLineConfig } from './config/line';
import menuRoutes from './routes/menu';
import orderRoutes from './routes/orders';
import userRoutes from './routes/users';
import authRoutes from './routes/auth';
import paypayRoutes from './routes/paypay';
import categoryRoutes from './routes/category';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5001;

// CORS configuration
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: false
}));

app.use(express.json());


// Health check endpoint (no database required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    message: 'Backend API is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'unknown'
  });
});

// API routes
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/users', userRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/paypay', paypayRoutes);
app.use('/api/categories', categoryRoutes);

// 404 handler for API routes (must be after all routes, before error handler)
// Fixed for Vercel: Use middleware pattern instead of /api/* to avoid breaking Vercel routing
app.use((req, res, next) => {
  if (req.originalUrl.startsWith('/api')) {
    console.log(`⚠️  404 - Route not found: ${req.method} ${req.originalUrl}`);
    return res.status(404).json({
      error: 'Route not found',
      method: req.method,
      path: req.originalUrl,
      availableRoutes: [
        'GET /api/menu',
        'POST /api/menu',
        'PATCH /api/menu/:id',
        'DELETE /api/menu/:id',
        'GET /api/orders',
        'PATCH /api/orders/:id/status',
        'GET /api/paypay/qr/:orderId',
        'GET /api/users',
        'POST /api/users',
        'PATCH /api/users/:id',
        'DELETE /api/users/:id',
        'GET /api/categories',
        'POST /api/categories',
        'PATCH /api/categories/:id',
        'DELETE /api/categories/:id',
        'POST /api/auth/login',
        'POST /api/auth/verify',
        'POST /api/auth/set-password',
        'GET /api/auth/line/login',
        'GET /api/auth/qr/:tableId',
        'POST /api/auth/table',
        'GET /api/auth/line/callback'
      ]
    });
  }
  next();
});

// Global error handler middleware (must be last - Express recognizes 4-param handlers as error handlers)
app.use((err: any, req: Request, res: Response, next: any) => {
  console.error('❌ Unhandled error in Express:', err);
  console.error('Error stack:', err?.stack);
  console.error('Error message:', err?.message);
  console.error('Request path:', req.path);
  console.error('Request method:', req.method);

  // Don't send response if headers already sent
  if (res.headersSent) {
    console.error('⚠️  Response already sent, cannot send error response');
    return next(err);
  }

  // Determine status code
  const status = err.status || err.statusCode || 500;

  // Build error response
  const errorResponse: any = {
    error: err.message || 'Internal Server Error'
  };

  // Add details in development mode
  if (process.env.NODE_ENV === 'development') {
    errorResponse.details = err.message;
    errorResponse.type = err.name;
    if (err.stack) {
      // Only include first few lines of stack to avoid huge responses
      const stackLines = err.stack.split('\n').slice(0, 5);
      errorResponse.stack = stackLines.join('\n');
    }
    if (err.code) {
      errorResponse.code = err.code;
    }
  }

  res.status(status).json(errorResponse);
});

async function startServer() {
  try {
    try {
      validateLineConfig();
      console.log('✅ LINE configuration validated');
    } catch (error) {
      console.warn('⚠️  LINE configuration not set. Push notifications will not work.');
      console.warn('   Set LINE_CHANNEL_ACCESS_TOKEN and LINE_CHANNEL_SECRET in .env');
    }

    await connectDatabase();

    app.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`📋 Health check: http://localhost:${PORT}/health`);
      console.log(`📊 Database: Connected to MongoDB`);
      console.log(`\n📡 API Routes:`);
      console.log(`   GET    /api/menu`);
      console.log(`   POST   /api/menu`);
      console.log(`   PATCH  /api/menu/:id`);
      console.log(`   DELETE /api/menu/:id`);
      console.log(`   GET    /api/orders`);
      console.log(`   PATCH  /api/orders/:id/status`);
      console.log(`   GET    /api/paypay/qr/:orderId`);
      console.log(`   GET    /api/users`);
      console.log(`   POST   /api/users`);
      console.log(`   PATCH  /api/users/:id`);
      console.log(`   DELETE /api/users/:id`);
      console.log(`   GET    /api/categories`);
      console.log(`   POST   /api/categories`);
      console.log(`   PATCH  /api/categories/:id`);
      console.log(`   DELETE /api/categories/:id`);
      console.log(`   POST   /api/auth/login`);
      console.log(`   POST   /api/auth/verify`);
      console.log(`   POST   /api/auth/set-password`);
      console.log(`   GET    /api/auth/line/login`);
      console.log(`   GET    /api/auth/line/callback`);
    }).on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use.`);
        console.error(`   Another process is using this port.`);
        console.error(`   To fix this:`);
        console.error(`   1. Stop the other process using port ${PORT}`);
        console.error(`   2. Or change PORT in .env to a different port`);
        console.error(`   3. On Windows, find and kill the process:`);
        console.error(`      netstat -ano | findstr :${PORT}`);
        console.error(`      taskkill /PID <PID> /F`);
      } else {
        console.error('❌ Failed to start server:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  await disconnectDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  await disconnectDatabase();
  process.exit(0);
});

// Export app for Vercel serverless functions
export default app;

// Only start server if not in Vercel environment
if (process.env.VERCEL !== '1') {
  startServer();
}

