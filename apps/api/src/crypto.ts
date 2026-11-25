import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export interface SealedSecret {
  cipher: string;
  iv: string;
  tag: string;
  keyVersion: number;
}

export class SecretBox {
  readonly keyVersion = 1;

  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error("主密钥必须是 32 字节");
  }

  static load(explicit: string | undefined, dataDir: string): { box: SecretBox; created: boolean } {
    if (explicit) {
      const raw = explicit.trim();
      const buf = /^[0-9a-f]{64}$/i.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
      if (buf.length !== 32) throw new Error("DNSIT_MASTER_KEY 必须是 32 字节（base64 或 64 位 hex）");
      return { box: new SecretBox(buf), created: false };
    }
    const keyFile = path.join(dataDir, "master.key");
    if (fs.existsSync(keyFile)) {
      const buf = Buffer.from(fs.readFileSync(keyFile, "utf8").trim(), "base64");
      if (buf.length !== 32) throw new Error(`主密钥文件损坏：${keyFile}`);
      return { box: new SecretBox(buf), created: false };
    }
    const buf = crypto.randomBytes(32);
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(keyFile, buf.toString("base64"), { mode: 0o600 });
    return { box: new SecretBox(buf), created: true };
  }

  encrypt(plaintext: string, aad: string): SealedSecret {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(aad, "utf8"));
    const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    return {
      cipher: enc.toString("base64"),
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      keyVersion: this.keyVersion,
    };
  }

  decrypt(sealed: SealedSecret, aad: string): string {
    const decipher = crypto.createDecipheriv("aes-256-gcm", this.key, Buffer.from(sealed.iv, "base64"));
    decipher.setAAD(Buffer.from(aad, "utf8"));
    decipher.setAuthTag(Buffer.from(sealed.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(sealed.cipher, "base64")), decipher.final()]).toString("utf8");
  }
}

export function maskAccessKey(id: string): string {
  if (id.length <= 10) return `${id.slice(0, 2)}****${id.slice(-2)}`;
  return `${id.slice(0, 4)}****${id.slice(-4)}`;
}

export function redactSecrets(text: string): string {
  return text
    .replace(/LTAI[A-Za-z0-9]{8,}/g, "LTAI****")
    .replace(/AKID[A-Za-z0-9]{8,}/g, "AKID****");
}
