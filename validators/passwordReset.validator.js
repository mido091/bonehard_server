import { z } from 'zod';

export const requestResetSchema = z.object({
  email: z.string().trim().email().max(190),
});

export const verifyOtpSchema = z.object({
  email:  z.string().trim().email().max(190),
  otp:    z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const resetPasswordSchema = z.object({
  email:       z.string().trim().email().max(190),
  resetToken:  z.string().min(10).max(200),
  newPassword: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(200)
    .regex(/[A-Z]/, 'Password must include at least one uppercase letter')
    .regex(/[a-z]/, 'Password must include at least one lowercase letter')
    .regex(/[0-9]/, 'Password must include at least one number'),
});
