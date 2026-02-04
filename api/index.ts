import serverless from 'serverless-http';
import app from '../src/server';

// Wrap Express app with serverless-http for proper Vercel integration
// serverless-http handles:
// - Async middleware execution
// - Error propagation to Vercel
// - Proper request/response transformation
// - Binary content handling
const handler = serverless(app);

// Export the handler for Vercel
export default handler;
