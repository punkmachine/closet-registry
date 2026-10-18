import type { DataSource } from "typeorm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as UsersRepository from "../../src/auth/repository/users.js";

const repo = vi.hoisted(() => ({
  countActiveAdmins: vi.fn(),
  createUser: vi.fn(),
  writeAuditEntry: vi.fn(),
}));

vi.mock("../../src/auth/repository/users.js", async () => {
  const actual = await vi.importActual<typeof UsersRepository>("../../src/auth/repository/users.js");
  return { ...actual, countActiveAdmins: repo.countActiveAdmins, createUser: repo.createUser };
});

vi.mock("../../src/auth/repository/audit.js", () => ({ writeAuditEntry: repo.writeAuditEntry }));

import { BootstrapAdminError, bootstrapAdmin } from "../../src/auth/bootstrap-admin.js";
import { verifyPassword } from "../../src/auth/password.js";
import { UsernameTakenError } from "../../src/auth/repository/users.js";

const dataSource = {} as DataSource;
const validEnv = { ADMIN_USERNAME: "admin", ADMIN_PASSWORD: "s3cret-pass!" };

beforeEach(() => {
  vi.resetAllMocks();
  repo.countActiveAdmins.mockResolvedValue(0);
  repo.createUser.mockResolvedValue({ id: "1", username: "admin" });
});

describe("bootstrapAdmin", () => {
  it("если admin уже есть — ничего не делает и не читает переменные", async () => {
    repo.countActiveAdmins.mockResolvedValue(1);
    await expect(bootstrapAdmin(dataSource, {})).resolves.toBe(false);
    expect(repo.createUser).not.toHaveBeenCalled();
  });

  it("создаёт admin с хешем пароля и пишет аудит", async () => {
    await expect(bootstrapAdmin(dataSource, validEnv)).resolves.toBe(true);

    const input = repo.createUser.mock.calls[0]?.[1] as { username: string; role: string; passwordHash: string };
    expect(input.username).toBe("admin");
    expect(input.role).toBe("admin");
    expect(input.passwordHash).not.toContain("s3cret-pass!");
    expect(await verifyPassword("s3cret-pass!", input.passwordHash)).toBe(true);
    expect(repo.writeAuditEntry).toHaveBeenCalledWith(
      dataSource,
      expect.objectContaining({ action: "user.bootstrap", actorId: null }),
    );
  });

  it("падает с понятной ошибкой, если переменные не заданы", async () => {
    await expect(bootstrapAdmin(dataSource, {})).rejects.toThrow(/ADMIN_USERNAME и ADMIN_PASSWORD/);
    await expect(bootstrapAdmin(dataSource, { ADMIN_USERNAME: "admin" })).rejects.toBeInstanceOf(BootstrapAdminError);
  });

  it("валидирует логин и пароль схемами контракта", async () => {
    await expect(bootstrapAdmin(dataSource, { ...validEnv, ADMIN_USERNAME: "Bad Name" })).rejects.toThrow(
      /ADMIN_USERNAME/,
    );
    await expect(bootstrapAdmin(dataSource, { ...validEnv, ADMIN_PASSWORD: "nospecialchars1" })).rejects.toThrow(
      /ADMIN_PASSWORD/,
    );
    expect(repo.createUser).not.toHaveBeenCalled();
  });

  it("занятый логин (не admin) — понятная ошибка", async () => {
    repo.createUser.mockRejectedValue(new UsernameTakenError("admin"));
    await expect(bootstrapAdmin(dataSource, validEnv)).rejects.toThrow(/уже существует/);
  });

  it("прочие ошибки пробрасывает как есть", async () => {
    const failure = new Error("db down");
    repo.createUser.mockRejectedValue(failure);
    await expect(bootstrapAdmin(dataSource, validEnv)).rejects.toBe(failure);
  });
});
