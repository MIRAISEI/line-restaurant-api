import serverless from "serverless-http";
import app from "../../src/server";

// Export the handler for Netlify
export const handler = serverless(app);
