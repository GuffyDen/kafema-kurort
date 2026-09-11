import "server-only";

import { randomBytes, scrypt } from "node:crypto";
import { isValidAuthPassword } from "@/lib/authValidation";

const cost = 65_536;
const blockSize = 8;
const parallelization = 1;

export async function hashAuthPassword(password: string) {
  if (!isValidAuthPassword(password)) {
    throw new Error("INVALID_PASSWORD");
  }

  const salt = randomBytes(16);
  const digest = await new Promise<Buffer>((resolve, reject) => {
    scrypt(
      password,
      salt,
      32,
      { N: cost, r: blockSize, p: parallelization, maxmem: 128 * 1024 * 1024 },
      (error, value) => (error ? reject(error) : resolve(value)),
    );
  });

  return `scrypt$${cost}$${blockSize}$${parallelization}$${salt.toString("base64url")}$${digest.toString("base64url")}`;
}
