/**
 * PayPay API Integration
 * Handles authentication and QR code generation for PayPay payments
 */

interface PayPayAccessToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
  expires_at?: number;
}

interface PayPayQRCodeRequest {
  merchantPaymentId: string;
  amount: {
    amount: number;
    currency: string;
  };
  codeType?: string;
  redirectUrl?: string;
  redirectType?: string;
  userAgent?: string;
}

interface PayPayQRCodeResponse {
  resultInfo: {
    code: string;
    message: string;
    codeId: string;
  };
  data?: {
    codeId: string;
    url: string;
    deeplink?: string;
    expiryDate?: number;
    merchantPaymentId: string;
    amount: {
      amount: number;
      currency: string;
    };
    orderDescription?: string;
    orderItems?: any[];
    metadata?: any;
    codeType?: string;
    storeInfo?: string;
    storeId?: string;
    terminalId?: string;
    requestedAt?: number;
    redirectUrl?: string;
    redirectType?: string;
    isAuthorization?: boolean;
    authorizationExpiry?: number;
  };
}

class PayPayService {
  private apiKey: string;
  private apiSecret: string;
  private merchantId: string;
  private baseUrl: string;
  private accessToken: PayPayAccessToken | null = null;

  constructor() {
    this.apiKey = process.env.PAYPAY_KEY_ID || '';
    this.apiSecret = process.env.PAYPAY_KEY_SECRET || '';
    this.merchantId = process.env.PAYPAY_MERCHANT_ID || '';

    // Use sandbox URL if in development, production URL otherwise
    const isProduction = process.env.PAYPAY_ENVIRONMENT === 'production';
    this.baseUrl = isProduction
      ? 'https://api.paypay.ne.jp'
      : 'https://stg-api.sandbox.paypay.ne.jp';
  }

  /**
   * Check if PayPay is configured
   * Merchant ID is optional for some PayPay account types
   */
  isConfigured(): boolean {
    return !!(this.apiKey && this.apiSecret);
  }

  /**
   * Get OAuth2 access token for PayPay API
   */
  private async getAccessToken(): Promise<string> {
    // Check if we have a valid cached token
    if (this.accessToken && this.accessToken.expires_at) {
      const now = Math.floor(Date.now() / 1000);
      if (now < this.accessToken.expires_at - 60) { // Refresh 60 seconds before expiry
        return this.accessToken.access_token;
      }
    }

    if (!this.apiKey || !this.apiSecret) {
      throw new Error('PayPay API credentials are not configured');
    }

    try {
      // Create Basic Auth header
      const credentials = Buffer.from(`${this.apiKey}:${this.apiSecret}`).toString('base64');

      const response = await fetch(`${this.baseUrl}/v2/oauth2/token`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${credentials}`,
        },
        body: 'grant_type=client_credentials',
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PayPay OAuth failed: ${response.status} - ${errorText}`);
      }

      const tokenData = await response.json() as PayPayAccessToken;

      // Calculate expiry timestamp
      tokenData.expires_at = Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600);

      this.accessToken = tokenData;
      return tokenData.access_token;
    } catch (error: any) {
      console.error('Error getting PayPay access token:', error);
      throw new Error(`Failed to authenticate with PayPay: ${error.message}`);
    }
  }

  /**
   * Generate a PayPay Dynamic QR code for payment
   */
  async createQRCode(
    merchantPaymentId: string,
    amount: number,
    currency: string = 'JPY',
    orderDescription?: string
  ): Promise<{ qrCodeURL: string; codeId: string }> {
    if (!this.isConfigured()) {
      throw new Error('PayPay API is not configured. Please set PAYPAY_API_KEY and PAYPAY_API_SECRET');
    }

    try {
      const accessToken = await this.getAccessToken();

      const requestBody: PayPayQRCodeRequest = {
        merchantPaymentId,
        amount: {
          amount,
          currency,
        },
        codeType: 'ORDER_QR',
      };

      // Build headers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      };

      // Add merchant ID header if configured (required for some account types)
      if (this.merchantId) {
        headers['X-ASSUME-MERCHANT'] = this.merchantId;
      }

      const response = await fetch(`${this.baseUrl}/v2/codes`, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody),
      });

      const responseData = await response.json() as PayPayQRCodeResponse;

      if (!response.ok || responseData.resultInfo.code !== 'SUCCESS') {
        const errorMessage = responseData.resultInfo.message || `PayPay API error: ${response.status}`;
        throw new Error(errorMessage);
      }

      if (!responseData.data || !responseData.data.url) {
        throw new Error('PayPay API did not return a QR code URL');
      }

      return {
        qrCodeURL: responseData.data.url,
        codeId: responseData.data.codeId,
      };
    } catch (error: any) {
      console.error('Error creating PayPay QR code:', error);
      throw new Error(`Failed to create PayPay QR code: ${error.message}`);
    }
  }

  /**
   * Get payment details by merchantPaymentId
   */
  async getPaymentDetails(merchantPaymentId: string): Promise<any> {
    if (!this.isConfigured()) {
      throw new Error('PayPay API is not configured');
    }

    try {
      const accessToken = await this.getAccessToken();

      // Build headers
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${accessToken}`,
      };

      // Add merchant ID header if configured
      if (this.merchantId) {
        headers['X-ASSUME-MERCHANT'] = this.merchantId;
      }

      const response = await fetch(`${this.baseUrl}/v2/codes/payments/${merchantPaymentId}`, {
        method: 'GET',
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PayPay API error: ${response.status} - ${errorText}`);
      }

      return await response.json();
    } catch (error: any) {
      console.error('Error getting PayPay payment details:', error);
      throw new Error(`Failed to get PayPay payment details: ${error.message}`);
    }
  }
}

// Export singleton instance
export const paypayService = new PayPayService();
export default paypayService;

