import { Request, Response } from "express";
import mongoose from "mongoose";
import crypto from "crypto";
import { verifyUserToken } from "../middleware/auth.js";
import User from "../models/User.js";
import Product from "../models/Product.js";
import Service from "../models/Service.js";
import Therapist from "../models/Therapist.js";
import Customer from "../models/Customer.js";
import Transaction from "../models/Transaction.js";

const VALID_BRANCHES = ["NAO_STUDIO", "DIAEL_BEAUTY"];
const VALID_PAYMENT_METHODS = ["cash", "card", "bank_transfer", "e_wallet"];
const VALID_DISCOUNT_TYPES = ["percent", "flat"];
const MAX_QUANTITY_PER_LINE = 999; // sanity ceiling, not a real business limit

function isPositiveInteger(n: any): boolean {
  return typeof n === "number" && Number.isInteger(n) && n > 0 && n <= MAX_QUANTITY_PER_LINE;
}

function isFiniteNonNegative(n: any): boolean {
  return typeof n === "number" && Number.isFinite(n) && n >= 0;
}

/**
 * Validates a single cart line item. Returns an error string, or null if valid.
 * This is the fix for the critical gap where quantity/discount values were
 * taken from the client with no bounds checking (negative quantities,
 * >100% "percent" discounts, etc could zero out or invert a sale).
 */
function validateCartItem(item: any): string | null {
  if (!item || typeof item !== "object") return "Invalid cart item.";
  if (item.type !== "product" && item.type !== "service") {
    return `Invalid item type "${item.type}".`;
  }
  if (!item.id || typeof item.id !== "string") return "Cart item is missing an id.";
  if (!isPositiveInteger(item.quantity)) {
    return `Invalid quantity for item ${item.id}: must be a positive integer.`;
  }
  const discountType = item.discountType || "flat";
  if (!VALID_DISCOUNT_TYPES.includes(discountType)) {
    return `Invalid discountType for item ${item.id}.`;
  }
  const discountValue = item.discountValue || 0;
  if (!isFiniteNonNegative(discountValue)) {
    return `Invalid discountValue for item ${item.id}: must be a non-negative number.`;
  }
  if (discountType === "percent" && discountValue > 100) {
    return `Invalid discountValue for item ${item.id}: percent discount cannot exceed 100.`;
  }
  return null;
}

/**
 * POST /api/processCheckout
 *
 * Mongoose port of the original Firestore `runTransaction` logic, hardened
 * against the critical issues found in the production audit:
 *  - full server-side input validation (quantities, discounts, enums)
 *  - idempotency key to prevent duplicate processing on retry/double-submit
 *  - collision-safe transaction IDs (crypto.randomUUID instead of 4-digit)
 *  - customer stats keyed by customerId, not free-text name matching
 */
export async function processCheckout(req: Request, res: Response) {
  try {
    const {
      cart,
      invoiceDiscountValue,
      invoiceDiscountType,
      paymentMethod,
      customerName,
      customerId,
      branch,
      cashierName,
      idempotencyKey,
    } = req.body;

    const authHeader = req.headers.authorization;
    const caller = await verifyUserToken(authHeader);
    if (!caller) {
      return res.status(401).json({ error: "Unauthorized: Invalid auth token." });
    }

    // Fetch caller's actual role and branch to verify permissions
    const userData = await User.findById(caller.uid);
    if (!userData) {
      return res.status(403).json({ error: "Forbidden: User profile not found." });
    }

    const role = userData.role;
    if (role !== "HKA_MANAGEMENT" && role !== "SALON_MANAGER") {
      return res
        .status(403)
        .json({ error: "Forbidden: Anda tidak memiliki wewenang untuk melakukan checkout." });
    }

    const userBranch = userData.branch;
    if (!VALID_BRANCHES.includes(branch)) {
      return res.status(400).json({ error: `Invalid branch "${branch}".` });
    }
    if (userBranch !== "ALL" && userBranch !== branch) {
      return res
        .status(403)
        .json({ error: `Forbidden: Anda tidak berwenang mencatat transaksi untuk branch "${branch}".` });
    }

    // --- Input validation (fixes critical gap: unvalidated cart contents) ---
    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart must be a non-empty array." });
    }
    if (!VALID_PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: `Invalid paymentMethod "${paymentMethod}".` });
    }
    const invoiceDiscType = invoiceDiscountType || "flat";
    if (!VALID_DISCOUNT_TYPES.includes(invoiceDiscType)) {
      return res.status(400).json({ error: `Invalid invoiceDiscountType "${invoiceDiscountType}".` });
    }
    const invoiceDiscValue = invoiceDiscountValue || 0;
    if (!isFiniteNonNegative(invoiceDiscValue)) {
      return res.status(400).json({ error: "Invalid invoiceDiscountValue: must be a non-negative number." });
    }
    if (invoiceDiscType === "percent" && invoiceDiscValue > 100) {
      return res.status(400).json({ error: "Invalid invoiceDiscountValue: percent discount cannot exceed 100." });
    }
    for (const item of cart) {
      const err = validateCartItem(item);
      if (err) return res.status(400).json({ error: err });
    }

    // --- Idempotency: require a client-generated key so retries/double
    // submits never process the same sale twice. ---
    if (!idempotencyKey || typeof idempotencyKey !== "string") {
      return res.status(400).json({ error: "Missing required idempotencyKey." });
    }

    // --- Idempotency fast-path (outside the session; a pure read used only
    // to short-circuit obvious repeats before paying the cost of opening a
    // transaction). The authoritative guarantee against a duplicate sale is
    // the unique index on `idempotencyKey` plus the in-transaction re-check
    // below, not this pre-check alone. ---
    const existingTx = await Transaction.findOne({ idempotencyKey });
    if (existingTx) {
      return res.status(200).json({ success: true, id: existingTx._id, deduplicated: true });
    }

    const session = await mongoose.startSession();
    const MAX_TRANSIENT_RETRIES = 3;
    let createdTxId = "";

    try {
      let attempt = 0;

      // eslint-disable-next-line no-constant-condition
      while (true) {
        attempt++;
        try {
          // ACID: explicit transaction boundary on a single shared session.
          // 'majority' write concern + 'snapshot' read concern guarantee the
          // commit is durable and reads inside the transaction see a
          // consistent snapshot, matching MongoDB's recommended settings
          // for financial/inventory transactions on a replica set (Atlas).
          session.startTransaction({
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority" },
          });

          // Re-check idempotency INSIDE the transaction/session. This closes
          // the race where two concurrent requests with the same key both
          // pass the fast-path check above before either has committed.
          const dupInSession = await Transaction.findOne({ idempotencyKey }).session(session);
          if (dupInSession) {
            await session.abortTransaction();
            return res.status(200).json({ success: true, id: dupInSession._id, deduplicated: true });
          }

          let recalculatedSubtotal = 0;
          let itemDiscountsTotal = 0;
          const verifiedItems: any[] = [];

          const productItems = cart.filter((i: any) => i.type === "product");
          const serviceItems = cart.filter((i: any) => i.type === "service");

          // Read services & products inside the transaction
          const serviceDocs = await Service.find({
            _id: { $in: serviceItems.map((i: any) => i.id) },
          }).session(session);
          const serviceMap = new Map(serviceDocs.map((d) => [d._id, d]));

          const productDocs = await Product.find({
            _id: { $in: productItems.map((i: any) => i.id) },
          }).session(session);
          const productMap = new Map(productDocs.map((d) => [d._id, d]));

          const therapistUpdates = new Map<string, number>(); // therapistId -> serviceValue accumulation

          for (const item of serviceItems) {
            const serviceData = serviceMap.get(item.id);
            if (!serviceData) {
              throw new Error(`Service ${item.id} not found.`);
            }

            const itemPrice = serviceData.price;
            const itemQty = item.quantity;
            const itemSubtotal = itemPrice * itemQty;

            recalculatedSubtotal += itemSubtotal;

            let itemDiscount = 0;
            const discVal = item.discountValue || 0;
            const discType = item.discountType || "flat";
            if (discType === "percent") {
              itemDiscount = (itemPrice * itemQty * discVal) / 100;
            } else {
              // Flat discount can never exceed the line's own subtotal - stops
              // an oversized flat discount on one line from bleeding into
              // (effectively crediting) the rest of the invoice.
              itemDiscount = Math.min(discVal * itemQty, itemSubtotal);
            }
            itemDiscountsTotal += itemDiscount;

            verifiedItems.push({
              id: item.id,
              name: serviceData.name,
              price: itemPrice,
              quantity: itemQty,
              type: "service",
              therapistId: item.therapistId,
              discountValue: item.discountValue || 0,
              discountType: item.discountType || "flat",
            });

            if (item.therapistId) {
              therapistUpdates.set(
                item.therapistId,
                (therapistUpdates.get(item.therapistId) || 0) + itemSubtotal
              );
            }
          }

          const productStockUpdates: { id: string; newStock: number }[] = [];

          for (const item of productItems) {
            const productData = productMap.get(item.id);
            if (!productData) {
              throw new Error(`Product ${item.id} not found in inventory.`);
            }
            if (productData.stock < item.quantity) {
              throw new Error(
                `Stok produk "${productData.name}" tidak mencukupi (Tersisa: ${productData.stock}, Diminta: ${item.quantity}).`
              );
            }

            const itemPrice = productData.price;
            const itemQty = item.quantity;
            const itemSubtotal = itemPrice * itemQty;

            recalculatedSubtotal += itemSubtotal;

            let itemDiscount = 0;
            const discVal = item.discountValue || 0;
            const discType = item.discountType || "flat";
            if (discType === "percent") {
              itemDiscount = (itemPrice * itemQty * discVal) / 100;
            } else {
              itemDiscount = Math.min(discVal * itemQty, itemSubtotal);
            }
            itemDiscountsTotal += itemDiscount;

            verifiedItems.push({
              id: item.id,
              name: productData.name,
              price: itemPrice,
              quantity: itemQty,
              type: "product",
              discountValue: item.discountValue || 0,
              discountType: item.discountType || "flat",
            });

            productStockUpdates.push({
              id: item.id,
              newStock: productData.stock - item.quantity, // already validated >= 0 above
            });
          }

          // Read therapists that need updating
          const therapistDocs = await Therapist.find({
            _id: { $in: Array.from(therapistUpdates.keys()) },
          }).session(session);
          const therapistMap = new Map(therapistDocs.map((d) => [d._id, d]));

          // Read customer - prefer a stable customerId over free-text name
          // matching, which risked merging/misattributing stats between
          // different customers who happen to share a name.
          let customerDoc = null;
          if (customerId) {
            customerDoc = await Customer.findById(customerId).session(session);
          } else if (customerName) {
            customerDoc = await Customer.findOne({ name: customerName }).session(session);
          }

          // Calculations
          const intermediateSubtotal = Math.max(0, recalculatedSubtotal - itemDiscountsTotal);
          let invoiceDiscountAmount = 0;
          if (invoiceDiscType === "percent") {
            invoiceDiscountAmount = (intermediateSubtotal * invoiceDiscValue) / 100;
          } else {
            invoiceDiscountAmount = Math.min(invoiceDiscValue, intermediateSubtotal);
          }

          const totalDiscount = itemDiscountsTotal + invoiceDiscountAmount;
          const finalTotal = Math.max(0, recalculatedSubtotal - totalDiscount);

          // --- Perform writes (all on the single shared session: any error
          // from this point on aborts the transaction and rolls back every
          // write below - product stock, therapist commission, customer
          // stats, and the transaction document itself - atomically). ---

          // 1. Update product stocks
          for (const update of productStockUpdates) {
            await Product.updateOne(
              { _id: update.id },
              { $set: { stock: update.newStock } }
            ).session(session);
          }

          // 2. Update therapist sales & commissions
          for (const [therapistId, serviceValue] of therapistUpdates.entries()) {
            const therData = therapistMap.get(therapistId);
            if (therData) {
              const commissionRate = therData.commissionRate || 0;
              const currentSales = therData.currentSales || 0;
              const totalCommissionEarned = therData.totalCommissionEarned || 0;
              const addedComm = Math.round(serviceValue * commissionRate);

              await Therapist.updateOne(
                { _id: therapistId },
                {
                  $set: {
                    currentSales: currentSales + serviceValue,
                    totalCommissionEarned: totalCommissionEarned + addedComm,
                  },
                }
              ).session(session);
            }
          }

          // 3. Update customer stats (visits/spend - this app's loyalty
          // tracking; there is no separate points ledger in the schema)
          if (customerDoc) {
            await Customer.updateOne(
              { _id: customerDoc._id },
              {
                $set: {
                  visitsCount: (customerDoc.visitsCount || 0) + 1,
                  totalSpend: (customerDoc.totalSpend || 0) + finalTotal,
                  lastVisit: new Date().toISOString().substring(0, 10),
                },
              }
            ).session(session);
          }

          // 4. Create transaction doc - collision-safe ID (was a 4-digit
          // random number with a real collision risk at this app's volume).
          const txId = "TX-" + crypto.randomUUID().split("-")[0].toUpperCase();
          const dateStr = new Date().toISOString().substring(0, 19).replace("T", " ");

          await Transaction.create(
            [
              {
                _id: txId,
                customerName: customerDoc?.name || customerName || "",
                customerId: customerDoc?._id,
                branch,
                items: verifiedItems,
                subtotal: recalculatedSubtotal,
                discount: totalDiscount,
                total: finalTotal,
                paymentMethod,
                date: dateStr,
                cashierName: cashierName || caller.email,
                idempotencyKey,
              },
            ],
            { session }
          );

          // Commit only if every operation above succeeded with no thrown error.
          await session.commitTransaction();
          createdTxId = txId;
          break; // success - exit the retry loop
        } catch (err: any) {
          // Abort on ANY failure so nothing from this attempt is left
          // partially applied (transaction doc, stock, commission, customer
          // stats all roll back together since they share this session).
          await session.abortTransaction().catch(() => {
            /* abort can fail if the transaction never started / already
               ended - safe to ignore, endSession() below still runs. */
          });

          // A duplicate-key error on idempotencyKey means a concurrent
          // request with the same key committed first - treat it as an
          // already-processed success rather than a hard failure.
          if (err?.code === 11000 && err?.keyPattern?.idempotencyKey) {
            const existing = await Transaction.findOne({ idempotencyKey });
            if (existing) {
              return res.status(200).json({ success: true, id: existing._id, deduplicated: true });
            }
          }

          // Retry ONLY on MongoDB's own transient transaction errors
          // (e.g. replica set primary stepdown, transient write conflicts) -
          // never on business-logic errors like insufficient stock, which
          // must surface to the caller immediately.
          const isTransient =
            typeof err?.hasErrorLabel === "function" && err.hasErrorLabel("TransientTransactionError");
          if (isTransient && attempt < MAX_TRANSIENT_RETRIES) {
            continue;
          }

          throw err;
        }
      }

      return res.status(200).json({ success: true, id: createdTxId });
    } finally {
      await session.endSession();
    }
  } catch (err: any) {
    // A duplicate-key error on idempotencyKey means a concurrent request
    // with the same key won the race - treat it as an already-processed
    // success rather than a hard failure.
    if (err?.code === 11000 && err?.keyPattern?.idempotencyKey) {
      const existing = await Transaction.findOne({ idempotencyKey: req.body?.idempotencyKey });
      if (existing) {
        return res.status(200).json({ success: true, id: existing._id, deduplicated: true });
      }
    }
    console.error("Error in processCheckout:", err);
    return res.status(500).json({ error: err.message || "Error processing checkout" });
  }
}