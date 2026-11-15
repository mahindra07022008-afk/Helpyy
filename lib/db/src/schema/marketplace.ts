import { createInsertSchema } from "drizzle-zod";
import { date, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { z } from "zod/v4";

export const couponsTable = pgTable(
  "helpay_coupons",
  {
    id: serial("id").primaryKey(),
    sellerId: text("seller_id").notNull(),
    brand: text("brand").notNull(),
    category: text("category").notNull(),
    title: text("title").notNull(),
    code: text("code").notNull(),
    discountPercent: integer("discount_percent"),
    couponValue: integer("coupon_value"),
    expiryDate: date("expiry_date", { mode: "string" }).notNull(),
    salePrice: integer("sale_price").notNull(),
    commission: integer("commission").notNull(),
    sellerEarnings: integer("seller_earnings").notNull(),
    status: text("status").notNull().default("available"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("helpay_coupons_status_expiry_idx").on(table.status, table.expiryDate)],
);

export const purchasesTable = pgTable(
  "helpay_purchases",
  {
    id: serial("id").primaryKey(),
    couponId: integer("coupon_id")
      .notNull()
      .references(() => couponsTable.id),
    buyerId: text("buyer_id").notNull(),
    sellerId: text("seller_id").notNull(),
    paymentReference: text("payment_reference").notNull(),
    amount: integer("amount").notNull(),
    commission: integer("commission").notNull(),
    sellerEarnings: integer("seller_earnings").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("helpay_purchases_buyer_created_idx").on(table.buyerId, table.createdAt),
    index("helpay_purchases_seller_created_idx").on(table.sellerId, table.createdAt),
  ],
);

export const payoutRequestsTable = pgTable(
  "helpay_payout_requests",
  {
    id: serial("id").primaryKey(),
    sellerId: text("seller_id").notNull(),
    upiId: text("upi_id").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("helpay_payout_seller_created_idx").on(table.sellerId, table.createdAt)],
);

export const insertCouponSchema = createInsertSchema(couponsTable).omit({
  id: true,
  createdAt: true,
});
export const insertPurchaseSchema = createInsertSchema(purchasesTable).omit({
  id: true,
  createdAt: true,
});
export const insertPayoutRequestSchema = createInsertSchema(payoutRequestsTable).omit({
  id: true,
  createdAt: true,
});

export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof couponsTable.$inferSelect;
export type InsertPurchase = z.infer<typeof insertPurchaseSchema>;
export type Purchase = typeof purchasesTable.$inferSelect;
export type InsertPayoutRequest = z.infer<typeof insertPayoutRequestSchema>;
export type PayoutRequestRecord = typeof payoutRequestsTable.$inferSelect;
