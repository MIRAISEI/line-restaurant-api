export interface CreateOrderRequest {
  userId: string;
  displayName: string;
  tableNumber: string;
  items: Array<{
    itemId: string;
    quantity: number;
    addons?: Array<{
      itemId: string;
      quantity: number;
    }>;
  }>;
  paymentMethod?: 'paypay' | 'manual' | 'paypay_now' | 'paypay_after';
}

export interface OrderResponse {
  _id: string;
  orderId: string;
  userId: string;
  displayName: string;
  tableNumber: string;
  lineUserId?: string;
  paymentMethod?: 'paypay' | 'manual';
  paymentStatus?: 'pending' | 'paid' | null;
  items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    price: number;
    parentItemId?: string;
  }>;
  total: number;
  status: 'Received' | 'Preparing' | 'Ready' | 'Completed';
  createdAt: string;
  updatedAt: string;
}

export interface MenuItemResponse {
  _id: string;
  nameEn: string;
  nameJp: string;
  price: number;
  imageUrl: string;
  category: string;
  subcategory?: string | null;
  isActive: boolean;
  isAddon?: boolean;
  allowedAddons?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface CreateMenuItemRequest {
  nameEn: string;
  nameJp: string;
  price: number;
  imageUrl: string;
  category: string;
  subcategory?: string | null;
  isActive?: boolean;
  isAddon?: boolean;
  allowedAddons?: string[];
}

export interface UpdateMenuItemRequest {
  nameEn?: string;
  nameJp?: string;
  price?: number;
  imageUrl?: string;
  category?: string;
  subcategory?: string | null;
  isActive?: boolean;
  isAddon?: boolean;
  allowedAddons?: string[];
}

export interface UpdateOrderStatusRequest {
  status: 'Received' | 'Preparing' | 'Ready' | 'Completed';
}

export interface NotifyRequest {
  userId: string;
  orderId: string;
  tableNumber: string;
}
