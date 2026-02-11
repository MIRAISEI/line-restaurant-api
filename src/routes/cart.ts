import { Router, Response } from 'express';
import { prisma } from '../config/database';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/user/cart - Get user's cart
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in token' });
        }

        const cart = await prisma.cart.findUnique({
            where: { userId },
            include: {
                items: {
                    include: {
                        menuItem: true
                    }
                },
            },
        });

        if (!cart) {
            return res.json([]);
        }

        // Map to frontend format
        const formattedItems = cart.items.map((item: any) => ({
            id: item.menuItemId,
            title: item.menuItem.nameEn,
            price: item.price,
            totalAmount: item.totalAmount,
            quantity: item.quantity,
            image: item.menuItem.imageUrl,
            description: "",
            isAvailable: item.menuItem.isActive,
            category: item.menuItem.category,
            addons: item.addons || undefined,
        }));

        res.json(formattedItems);
    } catch (error) {
        console.error('Error fetching cart:', error);
        res.status(500).json({ error: 'Failed to fetch cart' });
    }
});

// POST /api/user/cart/sync - Sync client cart to DB
router.post('/sync', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { items } = req.body;

        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in token' });
        }

        if (!Array.isArray(items)) {
            return res.status(400).json({ error: 'Items must be an array' });
        }

        // Use a transaction to ensure atomicity
        await prisma.$transaction(async (tx) => {
            // 1. Find or create the cart
            const cart = await tx.cart.upsert({
                where: { userId },
                update: {},
                create: { userId },
            });

            // 2. Delete existing items
            await tx.cartItem.deleteMany({
                where: { cartId: cart.id },
            });

            // 3. Create new items if any
            if (items.length > 0) {
                await tx.cartItem.createMany({
                    data: items.map((item: any) => ({
                        cartId: cart.id,
                        menuItemId: item.id,
                        quantity: item.quantity,
                        price: item.price,
                        totalAmount: item.totalAmount,
                        addons: item.addons || undefined,
                    })),
                });
            }
        });

        res.json({ success: true });
    } catch (error) {
        console.error('Error syncing cart:', error);
        res.status(500).json({ error: 'Failed to sync cart' });
    }
});

// DELETE /api/user/cart - Clear cart
router.delete('/', authenticate, async (req: AuthRequest, res: Response) => {
    try {
        const userId = req.user?.userId;
        if (!userId) {
            return res.status(401).json({ error: 'User ID not found in token' });
        }

        const cart = await prisma.cart.findUnique({
            where: { userId },
        });

        if (cart) {
            await prisma.cartItem.deleteMany({
                where: { cartId: cart.id },
            });
        }

        res.json({ success: true });
    } catch (error) {
        console.error('Error clearing cart:', error);
        res.status(500).json({ error: 'Failed to clear cart' });
    }
});

export default router;
