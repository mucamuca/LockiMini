import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/async.js';
import { validate } from '../middleware/validate.js';
import {
  addToCart,
  clearCart,
  getCartView,
  removeCartItem,
  resolveCart,
  updateCartItem,
} from '../services/cart.js';

export const cartRouter = Router();

cartRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, res);
    res.json({ cart: await getCartView(cart.id) });
  }),
);

const addSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(99).default(1),
});

cartRouter.post(
  '/items',
  validate(addSchema),
  asyncHandler(async (req, res) => {
    const { productId, quantity } = req.body as z.infer<typeof addSchema>;
    const cart = await resolveCart(req, res);
    res.json({ cart: await addToCart(cart.id, productId, quantity) });
  }),
);

const updateSchema = z.object({ quantity: z.coerce.number().int().min(0).max(99) });

cartRouter.patch(
  '/items/:itemId',
  validate(updateSchema),
  asyncHandler(async (req, res) => {
    const { quantity } = req.body as z.infer<typeof updateSchema>;
    const cart = await resolveCart(req, res);
    res.json({ cart: await updateCartItem(cart.id, req.params.itemId, quantity) });
  }),
);

cartRouter.delete(
  '/items/:itemId',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, res);
    res.json({ cart: await removeCartItem(cart.id, req.params.itemId) });
  }),
);

cartRouter.delete(
  '/',
  asyncHandler(async (req, res) => {
    const cart = await resolveCart(req, res);
    res.json({ cart: await clearCart(cart.id) });
  }),
);
