import { Router } from 'express';
import { requireAdmin } from '../../middleware/auth.js';
import { adminCategoriesRouter, adminProductsRouter } from './products.js';
import { adminStockRouter } from './stock.js';
import { adminOrdersRouter } from './orders.js';
import { adminCouponsRouter, adminCustomersRouter, adminDashboardRouter } from './dashboard.js';

export const adminRouter = Router();

// Uma unica porta de entrada: nada abaixo daqui roda sem papel ADMIN.
adminRouter.use(requireAdmin);

adminRouter.use('/dashboard', adminDashboardRouter);
adminRouter.use('/products', adminProductsRouter);
adminRouter.use('/categories', adminCategoriesRouter);
adminRouter.use('/stock', adminStockRouter);
adminRouter.use('/orders', adminOrdersRouter);
adminRouter.use('/customers', adminCustomersRouter);
adminRouter.use('/coupons', adminCouponsRouter);
