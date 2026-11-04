// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  decryptCredentials,
  encryptCredentials,
  generateKey,
  isValidKey,
} from "./crypto.ts";

describe("auth crypto", () => {
  it("生成并校验 32 字节密钥", () => {
    const key = generateKey();
    expect(key).toHaveLength(32);
    expect(isValidKey(key)).toBe(true);
    expect(isValidKey(Buffer.alloc(16))).toBe(false);
  });

  it("AES-256-GCM 加密解密往返", () => {
    const key = generateKey();
    const plain = JSON.stringify({ username: "20370001", password: "secret" });
    const envelope = encryptCredentials(plain, key);

    expect(envelope.version).toBe(1);
    expect(envelope.alg).toBe("AES-256-GCM");
    expect(decryptCredentials(envelope, key)).toBe(plain);
  });

  it("篡改密文或使用错误密钥时抛错", () => {
    const key = generateKey();
    const envelope = encryptCredentials("secret", key);
    const tampered = {
      ...envelope,
      data: Buffer.from("tampered").toString("base64"),
    };

    expect(() => decryptCredentials(tampered, key)).toThrow();
    expect(() => decryptCredentials(envelope, generateKey())).toThrow();
  });

  it("不支持的版本或算法抛错", () => {
    const key = generateKey();
    const envelope = encryptCredentials("secret", key);
    expect(() =>
      decryptCredentials({ ...envelope, version: 2 as 1 }, key),
    ).toThrow();
    expect(() =>
      decryptCredentials(
        { ...envelope, alg: "AES-128-GCM" as "AES-256-GCM" },
        key,
      ),
    ).toThrow();
  });

  it("非法 iv/tag 长度抛错", () => {
    const key = generateKey();
    const envelope = encryptCredentials("secret", key);
    expect(() => decryptCredentials({ ...envelope, iv: "x" }, key)).toThrow();
    expect(() => decryptCredentials({ ...envelope, tag: "x" }, key)).toThrow();
  });
});
