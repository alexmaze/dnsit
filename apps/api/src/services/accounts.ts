import type { AccountSummary, ProviderKind } from "@dnsit/shared";
import { maskAccessKey } from "../crypto.js";
import type { AppContext } from "../context.js";
import { HttpError, ProviderError } from "../errors.js";
import { createProvider } from "../providers/index.js";
import type { DnsProvider } from "../providers/index.js";
import {
  countZonesForAccount,
  deleteAccountRow,
  getAccountRow,
  insertAccount,
  listAccountRows,
  toAccountSummary,
  updateAccountRow,
} from "../repo.js";
import type { AccountRow } from "../repo.js";

export function providerForAccount(ctx: AppContext, account: AccountRow): DnsProvider {
  const secret = ctx.box.decrypt(
    {
      cipher: account.secret_cipher,
      iv: account.secret_iv,
      tag: account.secret_tag,
      keyVersion: account.key_version,
    },
    account.id,
  );
  return createProvider(
    account.provider,
    { accessKeyId: account.access_key_id, accessKeySecret: secret },
    {
      accountId: account.id,
      aliyunQps: ctx.config.aliyunQps,
      tencentQps: ctx.config.tencentQps,
    },
  );
}

function summarise(ctx: AppContext, row: AccountRow): AccountSummary {
  return toAccountSummary(row, countZonesForAccount(ctx.db, row.id), maskAccessKey(row.access_key_id));
}

export function listAccounts(ctx: AppContext): AccountSummary[] {
  return listAccountRows(ctx.db).map((row) => summarise(ctx, row));
}

export function getAccount(ctx: AppContext, id: string): AccountRow {
  const row = getAccountRow(ctx.db, id);
  if (!row) throw new HttpError(404, "ACCOUNT_NOT_FOUND", "账号不存在");
  return row;
}

export async function createAccount(
  ctx: AppContext,
  payload: {
    provider: ProviderKind;
    name: string;
    accessKeyId: string;
    accessKeySecret: string;
    readonly?: boolean;
  },
): Promise<AccountSummary> {
  const existing = listAccountRows(ctx.db).find(
    (row) => row.provider === payload.provider && row.name.toLowerCase() === payload.name.toLowerCase(),
  );
  if (existing) throw new HttpError(409, "ACCOUNT_EXISTS", `已存在同名账号：${payload.name}`);

  const probeId = `probe_${Date.now()}`;
  const probe = createProvider(
    payload.provider,
    { accessKeyId: payload.accessKeyId, accessKeySecret: payload.accessKeySecret },
    { accountId: probeId, aliyunQps: ctx.config.aliyunQps, tencentQps: ctx.config.tencentQps },
  );
  try {
    await probe.verify();
  } catch (error) {
    if (error instanceof ProviderError) {
      throw error.toHttp();
    }
    throw error;
  }

  const id = `acc_${crypto.randomUUID().replace(/-/g, "").slice(0, 20)}`;
  const sealed = ctx.box.encrypt(payload.accessKeySecret, id);
  const row = insertAccount(ctx.db, {
    id,
    provider: payload.provider,
    name: payload.name,
    accessKeyId: payload.accessKeyId,
    sealed,
    readonly: payload.readonly ?? false,
  });
  updateAccountRow(ctx.db, row.id, { status: "ok", last_verified_at: new Date().toISOString(), last_error: null });
  return summarise(ctx, getAccountRow(ctx.db, row.id)!);
}

export async function patchAccount(
  ctx: AppContext,
  id: string,
  patch: { name?: string; accessKeyId?: string; accessKeySecret?: string; readonly?: boolean },
): Promise<AccountSummary> {
  const existing = getAccount(ctx, id);
  const nextName = patch.name ?? existing.name;
  const nextKeyId = patch.accessKeyId ?? existing.access_key_id;

  if (patch.accessKeySecret || patch.accessKeyId) {
    const secret = patch.accessKeySecret ?? ctx.box.decrypt(
      { cipher: existing.secret_cipher, iv: existing.secret_iv, tag: existing.secret_tag, keyVersion: existing.key_version },
      existing.id,
    );
    const probe = createProvider(
      existing.provider,
      { accessKeyId: nextKeyId, accessKeySecret: secret },
      { accountId: existing.id, aliyunQps: ctx.config.aliyunQps, tencentQps: ctx.config.tencentQps },
    );
    try {
      await probe.verify();
    } catch (error) {
      if (error instanceof ProviderError) throw error.toHttp();
      throw error;
    }
    const sealed = ctx.box.encrypt(secret, existing.id);
    updateAccountRow(ctx.db, id, {
      name: nextName,
      access_key_id: nextKeyId,
      secret_cipher: sealed.cipher,
      secret_iv: sealed.iv,
      secret_tag: sealed.tag,
      key_version: sealed.keyVersion,
      status: "ok",
      last_verified_at: new Date().toISOString(),
      last_error: null,
      ...(patch.readonly === undefined ? {} : { is_readonly: patch.readonly ? 1 : 0 }),
    });
  } else {
    updateAccountRow(ctx.db, id, {
      name: nextName,
      ...(patch.readonly === undefined ? {} : { is_readonly: patch.readonly ? 1 : 0 }),
    });
  }
  return summarise(ctx, getAccountRow(ctx.db, id)!);
}

export function removeAccount(ctx: AppContext, id: string): void {
  getAccount(ctx, id);
  deleteAccountRow(ctx.db, id);
}

export async function verifyAccount(ctx: AppContext, id: string): Promise<AccountSummary> {
  const row = getAccount(ctx, id);
  const provider = providerForAccount(ctx, row);
  try {
    await provider.verify();
    updateAccountRow(ctx.db, id, { status: "ok", last_verified_at: new Date().toISOString(), last_error: null });
  } catch (error) {
    const message = error instanceof ProviderError ? error.message : String(error);
    updateAccountRow(ctx.db, id, { status: "invalid", last_error: message });
    if (error instanceof ProviderError) throw error.toHttp();
    throw error;
  }
  return summarise(ctx, getAccountRow(ctx.db, id)!);
}

export function assertWritable(ctx: AppContext, account: AccountRow): void {
  if (ctx.config.readOnly) throw new HttpError(403, "READONLY_MODE", "当前处于只读模式（DNSIT_READONLY=1）");
  if (account.is_readonly) throw new HttpError(403, "ACCOUNT_READONLY", `账号「${account.name}」被标记为只读`);
}
