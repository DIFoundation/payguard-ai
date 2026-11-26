import { z } from "zod";
import { isAddress } from "viem";

const addressSchema = z
  .string()
  .refine((v) => isAddress(v), { message: "Invalid Ethereum address" });

const uintString = z
  .string()
  .regex(/^\d+$/, "Must be a non-negative integer string")
  .refine((v) => BigInt(v) > 0n, { message: "Amount must be greater than zero" });

export const paymentRequestDataSchema = z.object({
  recipient: addressSchema,
  payer: addressSchema,
  chainId: z.number().int().positive(),
  token: addressSchema,
  amount: uintString,
  reference: z.string().max(200),
  purpose: z.string().max(500),
  expiresAt: z.string().regex(/^\d+$/),
  nonce: z.string().regex(/^0x[0-9a-fA-F]{64}$/),
});

export const signedRequestSchema = paymentRequestDataSchema.extend({
  signature: z.string().regex(/^0x[0-9a-fA-F]{130}$/),
  signer: addressSchema,
});

export const paymentDraftSchema = z.object({
  recipient: z.string(),
  amount: z.string(),
  token: z.string(),
  reference: z.string(),
  purpose: z.string(),
  expiresInHours: z.number().int().positive().optional(),
});

export type ParsedPaymentDraft = z.infer<typeof paymentDraftSchema>;
