import { clerkClient, getAuth } from "@clerk/express";
import { and, desc, eq, gte, ilike, or, sql } from "drizzle-orm";
import { Router, type IRouter, type NextFunction, type Request, type Response } from "express";
import {
  CreateCouponBody,
  CreateCouponResponse,
  CreatePayoutRequestBody,
  CreatePayoutRequestResponse,
  CreatePurchaseBody,
  CreatePurchaseResponse,
  GetAdminPayoutRequestsResponse,
  GetAdminPurchasesResponse,
  GetBrandsResponse,
  GetCouponPricingResponse,
  GetCouponsQueryParams,
  GetCouponsResponse,
  GetPayoutRequestsResponse,
  GetSellerCouponsResponse,
  GetSellerSummaryResponse,
  GetTransactionsResponse,
  ReviewPayoutRequestBody,
  ReviewPayoutRequestParams,
  ReviewPayoutRequestResponse,
  ReviewPurchaseBody,
  ReviewPurchaseParams,
  ReviewPurchaseResponse,
} from "@workspace/api-zod";
import {
  couponsTable,
  db,
  payoutRequestsTable,
  purchasesTable,
} from "@workspace/db";

const router: IRouter = Router();

const APPROVED_BRANDS = [
  { name: "AbhiBus", category: "Travel" },
  { name: "Amazon", category: "Shopping" },
  { name: "Ajio", category: "Fashion" },
  { name: "Adidas", category: "Fashion" },
  { name: "Airtel", category: "Telecom" },
  { name: "Barbeque Nation", category: "Food & drink" },
  { name: "BigBasket", category: "Groceries" },
  { name: "Blinkit", category: "Groceries" },
  { name: "boAt", category: "Electronics" },
  { name: "BookMyShow", category: "Entertainment" },
  { name: "Bewakoof", category: "Fashion" },
  { name: "Chaayos", category: "Food & drink" },
  { name: "Chumbak", category: "Lifestyle" },
  { name: "Cleartrip", category: "Travel" },
  { name: "Country Delight", category: "Groceries" },
  { name: "Croma", category: "Electronics" },
  { name: "Cult.fit", category: "Fitness" },
  { name: "DailyObjects", category: "Lifestyle" },
  { name: "Decathlon", category: "Sports & outdoors" },
  { name: "Domino's", category: "Food & drink" },
  { name: "Fabindia", category: "Fashion" },
  { name: "Ferns N Petals", category: "Shopping" },
  { name: "FirstCry", category: "Shopping" },
  { name: "FreshMenu", category: "Food & drink" },
  { name: "Heads Up For Tails", category: "Pets" },
  { name: "H&M", category: "Fashion" },
  { name: "IRCTC", category: "Travel" },
  { name: "ixigo", category: "Travel" },
  { name: "JioMart", category: "Groceries" },
  { name: "JioSaavn", category: "Entertainment" },
  { name: "KFC", category: "Food & drink" },
  { name: "Kapiva", category: "Wellness" },
  { name: "Lenskart", category: "Eyewear" },
  { name: "Levi's", category: "Fashion" },
  { name: "Mamaearth", category: "Beauty" },
  { name: "McDonald's", category: "Food & drink" },
  { name: "Meesho", category: "Shopping" },
  { name: "Flipkart", category: "Shopping" },
  { name: "Goibibo", category: "Travel" },
  { name: "Minimalist", category: "Beauty" },
  { name: "Mivi", category: "Electronics" },
  { name: "MakeMyTrip", category: "Travel" },
  { name: "Myntra", category: "Fashion" },
  { name: "Naturals Ice Cream", category: "Food & drink" },
  { name: "Noise", category: "Electronics" },
  { name: "Nykaa", category: "Beauty" },
  { name: "Nua", category: "Beauty" },
  { name: "Pizza Hut", category: "Food & drink" },
  { name: "Pepperfry", category: "Home & living" },
  { name: "Plum", category: "Beauty" },
  { name: "Puma", category: "Fashion" },
  { name: "Purplle", category: "Beauty" },
  { name: "redBus", category: "Travel" },
  { name: "Reliance Digital", category: "Electronics" },
  { name: "Reliance Trends", category: "Fashion" },
  { name: "Samsung", category: "Electronics" },
  { name: "SleepyCat", category: "Home & living" },
  { name: "Sleepy Owl Coffee", category: "Food & drink" },
  { name: "Snapdeal", category: "Shopping" },
  { name: "Spotify", category: "Entertainment" },
  { name: "SUGAR Cosmetics", category: "Beauty" },
  { name: "Tata CLiQ", category: "Shopping" },
  { name: "The Belgian Waffle", category: "Food & drink" },
  { name: "The Man Company", category: "Grooming" },
  { name: "The Souled Store", category: "Fashion" },
  { name: "Swiggy", category: "Food & drink" },
  { name: "Uber", category: "Travel" },
  { name: "Urban Company", category: "Services" },
  { name: "Vijay Sales", category: "Electronics" },
  { name: "Wakefit", category: "Home & living" },
  { name: "Westside", category: "Fashion" },
  { name: "WOW Skin Science", category: "Beauty" },
  { name: "Zouk", category: "Fashion" },
  { name: "Zepto", category: "Groceries" },
  { name: "Zomato", category: "Food & drink" },
];

const PRICING = [
  { basis: "discount", label: "10%–49% off", minValue: 10, maxValue: 49, salePrice: 10, commission: 7, sellerEarnings: 3 },
  { basis: "discount", label: "50%–100% off", minValue: 50, maxValue: 100, salePrice: 50, commission: 35, sellerEarnings: 15 },
  { basis: "worth", label: "Coupon worth ₹0–₹100", minValue: 0, maxValue: 100, salePrice: 20, commission: 14, sellerEarnings: 6 },
  { basis: "worth", label: "Coupon worth ₹101–₹500", minValue: 101, maxValue: 500, salePrice: 60, commission: 42, sellerEarnings: 18 },
  { basis: "worth", label: "Coupon worth ₹501–₹1,000", minValue: 501, maxValue: 1000, salePrice: 100, commission: 70, sellerEarnings: 30 },
] as const;

function todayInIndia(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());
}

function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }
  res.locals.userId = userId;
  next();
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const { userId } = getAuth(req);
  if (!userId) {
    res.status(401).json({ error: "Sign in to continue." });
    return;
  }

  const allowedEmail = process.env.HELPAY_ADMIN_EMAIL?.trim().toLowerCase();
  if (!allowedEmail) {
    res.status(503).json({ error: "Reviewer access is not configured." });
    return;
  }

  try {
    const user = await clerkClient.users.getUser(userId);
    const primaryEmail = user.emailAddresses.find(
      (address) => address.id === user.primaryEmailAddressId,
    )?.emailAddress;
    if (!primaryEmail || primaryEmail.toLowerCase() !== allowedEmail) {
      res.status(403).json({ error: "Reviewer access is required." });
      return;
    }
    res.locals.userId = userId;
    next();
  } catch (error) {
    req.log.error({ error }, "Unable to verify helpay reviewer account");
    res.status(503).json({ error: "Reviewer access could not be verified." });
  }
}

function userIdFrom(res: Response): string {
  return res.locals.userId as string;
}

function toAdminPurchase(purchase: typeof purchasesTable.$inferSelect, coupon: typeof couponsTable.$inferSelect) {
  return {
    id: purchase.id,
    couponId: coupon.id,
    brand: coupon.brand,
    title: coupon.title,
    paymentReference: purchase.paymentReference,
    amount: purchase.amount,
    sellerEarnings: purchase.sellerEarnings,
    commission: purchase.commission,
    status: purchase.status,
    createdAt: purchase.createdAt.toISOString(),
  };
}

function toAdminPayout(payout: typeof payoutRequestsTable.$inferSelect) {
  return {
    id: payout.id,
    sellerId: payout.sellerId,
    upiId: payout.upiId,
    amount: payout.amount,
    status: payout.status,
    createdAt: payout.createdAt.toISOString(),
  };
}

function toListing(coupon: typeof couponsTable.$inferSelect) {
  return {
    id: coupon.id,
    brand: coupon.brand,
    category: coupon.category,
    title: coupon.title,
    discountPercent: coupon.discountPercent,
    couponValue: coupon.couponValue,
    expiryDate: coupon.expiryDate,
    salePrice: coupon.salePrice,
    commission: coupon.commission,
    sellerEarnings: coupon.sellerEarnings,
    status: coupon.status,
  };
}

router.get("/brands", (_req, res): void => {
  res.json(GetBrandsResponse.parse(APPROVED_BRANDS));
});

router.get("/pricing", (_req, res): void => {
  res.json(GetCouponPricingResponse.parse(PRICING));
});

router.get("/coupons", async (req, res): Promise<void> => {
  const parsedQuery = GetCouponsQueryParams.safeParse(req.query);
  if (!parsedQuery.success) {
    res.status(400).json({ error: parsedQuery.error.message });
    return;
  }

  const filters = [
    eq(couponsTable.status, "available"),
    gte(couponsTable.expiryDate, todayInIndia()),
  ];
  if (parsedQuery.data.brand) {
    filters.push(eq(couponsTable.brand, parsedQuery.data.brand));
  }
  if (parsedQuery.data.search?.trim()) {
    const search = `%${parsedQuery.data.search.trim()}%`;
    filters.push(or(ilike(couponsTable.title, search), ilike(couponsTable.brand, search))!);
  }

  const coupons = await db
    .select()
    .from(couponsTable)
    .where(and(...filters))
    .orderBy(desc(couponsTable.createdAt));
  res.json(GetCouponsResponse.parse(coupons.map(toListing)));
});

router.post("/coupons", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateCouponBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const input = parsed.data;
  const brand = APPROVED_BRANDS.find((item) => item.name === input.brand);
  if (!brand) {
    res.status(400).json({ error: "Choose a brand from the approved list." });
    return;
  }

  const expiryDate = input.expiryDate.toISOString().slice(0, 10);
  if (expiryDate < todayInIndia()) {
    res.status(400).json({ error: "The coupon expiry date must be today or later." });
    return;
  }

  let rule: (typeof PRICING)[number] | undefined;
  if (input.category === "discount") {
    if (
      input.discountPercent == null ||
      input.discountPercent < 10 ||
      input.discountPercent > 100 ||
      input.couponValue != null
    ) {
      res.status(400).json({ error: "Discount coupons must be 10%–100% off." });
      return;
    }
    rule =
      input.discountPercent < 50
        ? PRICING[0]
        : PRICING[1];
  } else {
    if (
      input.couponValue == null ||
      input.couponValue < 0 ||
      input.couponValue > 1000 ||
      input.discountPercent != null
    ) {
      res.status(400).json({ error: "Coupon value must be between ₹0 and ₹1,000." });
      return;
    }
    rule =
      input.couponValue <= 100
        ? PRICING[2]
        : input.couponValue <= 500
          ? PRICING[3]
          : PRICING[4];
  }

  const [coupon] = await db
    .insert(couponsTable)
    .values({
      sellerId: userIdFrom(res),
      brand: brand.name,
      category: input.category,
      title: input.title.trim(),
      code: input.code.trim(),
      discountPercent: input.category === "discount" ? input.discountPercent! : null,
      couponValue: input.category === "worth" ? input.couponValue! : null,
      expiryDate,
      salePrice: rule.salePrice,
      commission: rule.commission,
      sellerEarnings: rule.sellerEarnings,
      status: "available",
    })
    .returning();

  res.status(201).json(CreateCouponResponse.parse(toListing(coupon)));
});

router.get("/seller/coupons", requireAuth, async (_req, res): Promise<void> => {
  const sellerId = userIdFrom(res);
  const coupons = await db
    .select()
    .from(couponsTable)
    .where(eq(couponsTable.sellerId, sellerId))
    .orderBy(desc(couponsTable.createdAt));

  res.json(
    GetSellerCouponsResponse.parse(
      coupons.map((coupon) => ({
        ...toListing(coupon),
        code: coupon.code,
        paymentStatus:
          coupon.status === "reserved" ? "pending" : coupon.status === "sold" ? "verified" : null,
      })),
    ),
  );
});

router.get("/seller/summary", requireAuth, async (_req, res): Promise<void> => {
  const sellerId = userIdFrom(res);
  const [earned] = await db
    .select({
      total: sql<number>`coalesce(sum(${purchasesTable.sellerEarnings}), 0)::int`,
    })
    .from(purchasesTable)
    .where(and(eq(purchasesTable.sellerId, sellerId), eq(purchasesTable.status, "verified")));
  const [pending] = await db
    .select({
      total: sql<number>`coalesce(sum(${purchasesTable.sellerEarnings}), 0)::int`,
    })
    .from(purchasesTable)
    .where(and(eq(purchasesTable.sellerId, sellerId), eq(purchasesTable.status, "pending")));
  const [sold] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(purchasesTable)
    .where(and(eq(purchasesTable.sellerId, sellerId), eq(purchasesTable.status, "verified")));
  const [requested] = await db
    .select({ total: sql<number>`coalesce(sum(${payoutRequestsTable.amount}), 0)::int` })
    .from(payoutRequestsTable)
    .where(
      and(
        eq(payoutRequestsTable.sellerId, sellerId),
        sql`${payoutRequestsTable.status} <> 'rejected'`,
      ),
    );
  const totalEarned = Number(earned?.total ?? 0);
  const summary = {
    totalEarned,
    availableToClaim: Math.max(0, totalEarned - Number(requested?.total ?? 0)),
    pendingPayments: Number(pending?.total ?? 0),
    couponsSold: Number(sold?.count ?? 0),
  };

  res.json(GetSellerSummaryResponse.parse(summary));
});

router.get("/transactions", requireAuth, async (_req, res): Promise<void> => {
  const currentUserId = userIdFrom(res);
  const rows = await db
    .select({
      purchase: purchasesTable,
      coupon: couponsTable,
    })
    .from(purchasesTable)
    .innerJoin(couponsTable, eq(purchasesTable.couponId, couponsTable.id))
    .where(or(eq(purchasesTable.buyerId, currentUserId), eq(purchasesTable.sellerId, currentUserId)))
    .orderBy(desc(purchasesTable.createdAt));

  res.json(
    GetTransactionsResponse.parse(
      rows.map(({ purchase, coupon }) => {
        const direction = purchase.buyerId === currentUserId ? "purchase" : "sale";
        return {
          id: purchase.id,
          couponId: purchase.couponId,
          title: coupon.title,
          brand: coupon.brand,
          amount: purchase.amount,
          sellerEarnings: purchase.sellerEarnings,
          commission: purchase.commission,
          status: purchase.status,
          direction,
          paymentReference: direction === "purchase" ? purchase.paymentReference : null,
          couponCode:
            direction === "purchase" && purchase.status === "verified" ? coupon.code : null,
          createdAt: purchase.createdAt.toISOString(),
        };
      }),
    ),
  );
});

router.post("/purchases", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePurchaseBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const buyerId = userIdFrom(res);
  const result = await db.transaction(async (tx) => {
    const [coupon] = await tx
      .select()
      .from(couponsTable)
      .where(
        and(
          eq(couponsTable.id, parsed.data.couponId),
          eq(couponsTable.status, "available"),
          gte(couponsTable.expiryDate, todayInIndia()),
        ),
      )
      .for("update");

    if (!coupon || coupon.sellerId === buyerId) {
      return undefined;
    }

    const [purchase] = await tx
      .insert(purchasesTable)
      .values({
        couponId: coupon.id,
        buyerId,
        sellerId: coupon.sellerId,
        paymentReference: parsed.data.paymentReference.trim(),
        amount: coupon.salePrice,
        commission: coupon.commission,
        sellerEarnings: coupon.sellerEarnings,
        status: "pending",
      })
      .returning();
    await tx
      .update(couponsTable)
      .set({ status: "reserved" })
      .where(eq(couponsTable.id, coupon.id));

    return { coupon, purchase };
  });

  if (!result) {
    res.status(400).json({ error: "This coupon is unavailable or cannot be purchased by its seller." });
    return;
  }

  res.status(201).json(
    CreatePurchaseResponse.parse({
      id: result.purchase.id,
      couponId: result.coupon.id,
      title: result.coupon.title,
      brand: result.coupon.brand,
      amount: result.purchase.amount,
      sellerEarnings: result.purchase.sellerEarnings,
      commission: result.purchase.commission,
      status: result.purchase.status,
      direction: "purchase",
      paymentReference: result.purchase.paymentReference,
      createdAt: result.purchase.createdAt.toISOString(),
    }),
  );
});

router.get("/payout-requests", requireAuth, async (_req, res): Promise<void> => {
  const sellerId = userIdFrom(res);
  const requests = await db
    .select()
    .from(payoutRequestsTable)
    .where(eq(payoutRequestsTable.sellerId, sellerId))
    .orderBy(desc(payoutRequestsTable.createdAt));
  res.json(
    GetPayoutRequestsResponse.parse(
      requests.map((request) => ({
        id: request.id,
        amount: request.amount,
        status: request.status,
        createdAt: request.createdAt.toISOString(),
      })),
    ),
  );
});

router.post("/payout-requests", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePayoutRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const upiId = parsed.data.upiId.trim();
  if (!/^[A-Za-z0-9._-]{2,256}@[A-Za-z0-9._-]{2,64}$/.test(upiId)) {
    res.status(400).json({ error: "Enter a valid UPI ID for your payout." });
    return;
  }
  const sellerId = userIdFrom(res);
  const payout = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${sellerId}))`);
    const [earned] = await tx
      .select({
        total: sql<number>`coalesce(sum(${purchasesTable.sellerEarnings}), 0)::int`,
      })
      .from(purchasesTable)
      .where(and(eq(purchasesTable.sellerId, sellerId), eq(purchasesTable.status, "verified")));
    const [requested] = await tx
      .select({ total: sql<number>`coalesce(sum(${payoutRequestsTable.amount}), 0)::int` })
      .from(payoutRequestsTable)
      .where(
        and(
          eq(payoutRequestsTable.sellerId, sellerId),
          sql`${payoutRequestsTable.status} <> 'rejected'`,
        ),
      );
    const amount = Number(earned?.total ?? 0) - Number(requested?.total ?? 0);
    if (amount <= 0) {
      return undefined;
    }

    const [created] = await tx
      .insert(payoutRequestsTable)
      .values({ sellerId, upiId, amount, status: "pending" })
      .returning();
    return created;
  });

  if (!payout) {
    res.status(400).json({ error: "There are no verified earnings available to claim." });
    return;
  }

  res.status(201).json(
    CreatePayoutRequestResponse.parse({
      id: payout.id,
      amount: payout.amount,
      status: payout.status,
      createdAt: payout.createdAt.toISOString(),
    }),
  );
});

router.get("/admin/purchases", requireAdmin, async (_req, res): Promise<void> => {
  const rows = await db
    .select({ purchase: purchasesTable, coupon: couponsTable })
    .from(purchasesTable)
    .innerJoin(couponsTable, eq(purchasesTable.couponId, couponsTable.id))
    .where(eq(purchasesTable.status, "pending"))
    .orderBy(desc(purchasesTable.createdAt));
  res.json(
    GetAdminPurchasesResponse.parse(
      rows.map(({ purchase, coupon }) => toAdminPurchase(purchase, coupon)),
    ),
  );
});

router.patch("/admin/purchases/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = ReviewPurchaseParams.safeParse(req.params);
  const parsed = ReviewPurchaseBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const result = await db.transaction(async (tx) => {
    const [row] = await tx
      .select({ purchase: purchasesTable, coupon: couponsTable })
      .from(purchasesTable)
      .innerJoin(couponsTable, eq(purchasesTable.couponId, couponsTable.id))
      .where(eq(purchasesTable.id, params.data.id))
      .for("update");
    if (!row || row.purchase.status !== "pending") {
      return undefined;
    }

    await tx
      .update(purchasesTable)
      .set({ status: parsed.data.status })
      .where(eq(purchasesTable.id, row.purchase.id));
    await tx
      .update(couponsTable)
      .set({ status: parsed.data.status === "verified" ? "sold" : "available" })
      .where(eq(couponsTable.id, row.coupon.id));

    return {
      purchase: { ...row.purchase, status: parsed.data.status },
      coupon: { ...row.coupon, status: parsed.data.status === "verified" ? "sold" : "available" },
    };
  });

  if (!result) {
    res.status(404).json({ error: "Pending purchase not found." });
    return;
  }
  res.json(ReviewPurchaseResponse.parse(toAdminPurchase(result.purchase, result.coupon)));
});

router.get("/admin/payout-requests", requireAdmin, async (_req, res): Promise<void> => {
  const requests = await db
    .select()
    .from(payoutRequestsTable)
    .where(eq(payoutRequestsTable.status, "pending"))
    .orderBy(desc(payoutRequestsTable.createdAt));
  res.json(
    GetAdminPayoutRequestsResponse.parse(requests.map(toAdminPayout)),
  );
});

router.patch("/admin/payout-requests/:id", requireAdmin, async (req, res): Promise<void> => {
  const params = ReviewPayoutRequestParams.safeParse(req.params);
  const parsed = ReviewPayoutRequestBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [payout] = await db
    .update(payoutRequestsTable)
    .set({ status: parsed.data.status })
    .where(
      and(
        eq(payoutRequestsTable.id, params.data.id),
        eq(payoutRequestsTable.status, "pending"),
      ),
    )
    .returning();
  if (!payout) {
    res.status(404).json({ error: "Pending payout request not found." });
    return;
  }
  res.json(ReviewPayoutRequestResponse.parse(toAdminPayout(payout)));
});

export default router;
