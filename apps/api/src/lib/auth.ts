import jwt from "jsonwebtoken";
import { getRuntimeConfig } from "./ssm-config.js";

export interface LoginTokenPayload {
  email: string;
  purpose: "login";
}

export interface SessionTokenPayload {
  userId: string;
  email: string;
  purpose: "session";
}

async function signingSecret(): Promise<string> {
  const config = await getRuntimeConfig();
  return config.secrets.jwtSigningSecret;
}

export async function createLoginToken(email: string, ttlMinutes: number): Promise<string> {
  const payload: LoginTokenPayload = {
    email,
    purpose: "login"
  };

  return jwt.sign(payload, await signingSecret(), {
    expiresIn: `${ttlMinutes}m`
  });
}

export async function verifyLoginToken(token: string): Promise<LoginTokenPayload> {
  const decoded = jwt.verify(token, await signingSecret()) as LoginTokenPayload;
  if (decoded.purpose !== "login") {
    throw new Error("Invalid login token purpose");
  }

  return decoded;
}

export async function createSessionToken(userId: string, email: string): Promise<string> {
  const payload: SessionTokenPayload = {
    userId,
    email,
    purpose: "session"
  };

  return jwt.sign(payload, await signingSecret(), { expiresIn: "7d" });
}

export async function verifySessionToken(header?: string): Promise<SessionTokenPayload> {
  if (!header || !header.startsWith("Bearer ")) {
    throw new Error("Missing bearer token");
  }

  const token = header.slice("Bearer ".length);
  const decoded = jwt.verify(token, await signingSecret()) as SessionTokenPayload;
  if (decoded.purpose !== "session") {
    throw new Error("Invalid session token purpose");
  }

  return decoded;
}
