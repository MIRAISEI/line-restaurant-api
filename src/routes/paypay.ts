import { Router } from 'express';
import { getMongoDb } from '../config/database';
import paypayService from '../config/paypay';

const router = Router();

// GET /api/paypay/qr/:orderId
// Generates a PayPay Dynamic QR code for the order payment.
// If PayPay API is not configured, falls back to generating a QR code that points to the payment page.
router.get('/qr/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    // Try to use PayPay API if configured
    if (paypayService.isConfigured()) {
      try {
        // Fetch order details from database
        const db = await getMongoDb();
        const order = await db.collection('orders').findOne({
          orderId: orderId,
        });

        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        // Check if order is already paid
        if (order.paymentStatus === 'paid') {
          return res.status(400).json({
            error: 'Order is already paid',
            paymentStatus: 'paid',
          });
        }

        // Create PayPay QR code
        // Use orderId as merchantPaymentId (must be unique)
        const { qrCodeURL, codeId } = await paypayService.createQRCode(
          orderId, // merchantPaymentId
          order.total, // amount
          'JPY', // currency
          `Order ${orderId} - Table ${order.tableNumber}` // order description
        );

        return res.json({
          orderId,
          qrUrl: qrCodeURL,
          codeId,
          amount: order.total,
          currency: 'JPY',
          provider: 'paypay',
        });
      } catch (paypayError: any) {
        console.error('PayPay API error:', paypayError);
        // Fall through to fallback method if PayPay API fails
        // This allows the system to still work even if PayPay API has issues
      }
    }

    // Fallback: Generate QR code that points to payment page
    // This is used when PayPay API is not configured or fails
    const frontendBase = process.env.FRONTEND_BASE_URL || 'http://localhost:3000';
    const normalizedBase = frontendBase.endsWith('/') ? frontendBase.slice(0, -1) : frontendBase;
    const paymentUrl = `${normalizedBase}/payment/${encodeURIComponent(orderId)}`;

    // Use public QR generator to return a QR image URL
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(paymentUrl)}`;

    res.json({
      orderId,
      paymentUrl,
      qrUrl,
      provider: 'qrserver.com',
      note: paypayService.isConfigured()
        ? 'PayPay API failed, using fallback QR code'
        : 'PayPay API not configured, using fallback QR code',
    });
  } catch (error: any) {
    console.error('Error generating PayPay QR:', error);
    res.status(500).json({
      error: 'Failed to generate PayPay QR',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
    });
  }
});

// GET /api/paypay/status/:orderId
// Check if the payment for a QR code has been completed
router.get('/status/:orderId', async (req, res) => {
  try {
    const { orderId } = req.params;
    if (!orderId) {
      return res.status(400).json({ error: 'orderId is required' });
    }

    const db = await getMongoDb();

    // First check our local database status
    const order = await db.collection('orders').findOne({ orderId: orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    if (order.paymentStatus === 'paid') {
      return res.json({ status: 'paid', orderId });
    }

    // If not paid in our DB, check with PayPay API if configured
    if (paypayService.isConfigured()) {
      try {
        const paymentDetails = await paypayService.getPaymentDetails(orderId);

        // Result code for successful payment check
        if (paymentDetails?.resultInfo?.code === 'SUCCESS' && paymentDetails?.data?.status === 'COMPLETED') {
          // Update our DB if PayPay says it's paid
          await db.collection('orders').updateOne(
            { orderId: orderId },
            {
              $set: {
                paymentStatus: 'paid',
                updatedAt: new Date()
              }
            }
          );

          return res.json({
            status: 'paid',
            orderId,
            source: 'paypay_api'
          });
        }
      } catch (paypayError) {
        console.error('Error fetching PayPay status:', paypayError);
      }
    }

    return res.json({
      status: order.paymentStatus || 'pending',
      orderId
    });
  } catch (error: any) {
    console.error('Error checking payment status:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

export default router;

