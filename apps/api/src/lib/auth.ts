import jwt from "jsonwebtoken";
import { requiredEnv } from "./env.js";

interface LoginTokenPayload {
  email: string;
  purpose: "login";
}

interface SessionTokenPayload {
  userId: string;
  email: string;
  purpose: "session";
}

const signingSecret = () => requiredEnv("JWT_SIGNING_SECRET");

export function createLoginToken(email: string, ttlMinutes: number): string {
  const payload: LoginTokenPayload = {
    email,
    purpose: "login"
  };

  return jwt.sign(payload, signingSecret(), {
    expiresIn: `${ttlMinutes}m`
  });
}

export function verifyLoginToken(token: string): LoginTokenPayload {
  const decoded = jwt.verify(token, signingSecret()) as LoginTokenPayload;
  if (decoded.purpose !== "login") {
    throw new Error("Invalid login token purpose");
  }

  return decoded;
}

export function createSessionToken(userId: string, email: string): string {
  const payload: SessionTokenPayload = {
    userId,
    email,
    purpose: "session"
  };

  return jwt.sign(payload, signingSecret(), { expiresIn: "7d" });
}

export function verifySessionToken(header?: string): SessionTokenPayload {
  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const token = header.slice("Bearer ".length);
  const decoded = jwt.verify(token, signingSecret()) as SessionTokenPayload;
  if (decoded.purpose !== "session") {
    throw new Error("Invalid session token purpose");
  }

  return decoded;
}
