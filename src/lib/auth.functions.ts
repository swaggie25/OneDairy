import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { APP_ROLES } from "./roles";

const requestSchema = z.object({
  phone: z.string().min(10),
  role: z.enum(APP_ROLES),
});

const verifySchema = z.object({
  phone: z.string().min(10),
  code: z.string().min(4),
  fullName: z.string().optional(),
});

export const requestOtp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => requestSchema.parse(data))
  .handler(async ({ data }) => {
    const { issueOtp } = await import("./auth-otp.server");
    const result = await issueOtp(data.phone, data.role);
    return { phone: result.phone, devCode: result.code, devMode: result.devMode };
  });

export const verifyOtp = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => verifySchema.parse(data))
  .handler(async ({ data }) => {
    const { verifyOtpAndSignIn } = await import("./auth-otp.server");
    return await verifyOtpAndSignIn(data.phone, data.code, data.fullName);
  });
