import nodemailer from "nodemailer";
import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("nodemailer", () => ({ default: { createTransport: vi.fn() } }));

import { runMigrations } from "@/server/db/migrate";
import { globalSettings } from "@/server/db/schema";
import { getCompleteSmtpSettings, getSmtpSettings, removeSmtpPassword, saveSmtpSettings, sendSmtpTestEmail } from "@/server/config/smtp-settings";
import { createTestDatabase } from "../../../helpers/database";

const values = { authentication: true, from: "forman@example.test", host: "smtp.example.test", password: "secret-password", port: 587, encryption: "starttls", username: "forman" };

describe("SMTP settings", () => {
  afterEach(() => { vi.clearAllMocks(); });

  test("stores the password directly and returns only redacted admin settings", async () => {
    const database = createTestDatabase();
    try {
      runMigrations(database.db);
      await saveSmtpSettings(database.db, values);
      const stored = await database.db.select({ configuration: globalSettings.configuration }).from(globalSettings).get();
      expect(stored?.configuration.smtpPassword).toBe(values.password);
      expect(await getCompleteSmtpSettings(database.db)).toEqual(values);
      expect(await getSmtpSettings(database.db)).toEqual({ authentication: true, fromName: null, from: values.from, host: values.host, passwordConfigured: true, port: values.port, encryption: "starttls", status: "ready", username: values.username });
    } finally { database.dispose(); }
  });

  test("reports an incomplete transport without exposing a password", async () => {
    const database = createTestDatabase();
    try {
      runMigrations(database.db);
      expect(await getSmtpSettings(database.db)).toEqual({ authentication: true, fromName: null, from: null, host: null, passwordConfigured: false, port: null, encryption: "tls", status: "not-configured", username: null });
    } finally { database.dispose(); }
  });

  test("allows a test email to reuse the saved password only for the saved transport", async () => {
    const database = createTestDatabase();
    const sendMail = vi.fn().mockResolvedValue(undefined);
    vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
    try {
      runMigrations(database.db);
      await saveSmtpSettings(database.db, values);

      const savedTransport = { from: values.from, host: values.host, port: values.port, encryption: values.encryption, username: values.username };
      await sendSmtpTestEmail(database.db, { smtp: savedTransport, to: "recipient@example.test" });

      expect(nodemailer.createTransport).toHaveBeenCalledWith(expect.objectContaining({ host: values.host }));
      expect(sendMail).toHaveBeenCalledWith({ from: "forman@example.test", subject: "Forman SMTP test email", text: "This is a test email sent by Forman.", to: "recipient@example.test" });
    } finally { database.dispose(); }
  });

  test("requires the password again before testing a changed SMTP host", async () => {
    const database = createTestDatabase();
    try {
      runMigrations(database.db);
      await saveSmtpSettings(database.db, values);
      const savedTransport = { from: values.from, host: values.host, port: values.port, encryption: values.encryption, username: values.username };

      await expect(sendSmtpTestEmail(database.db, {
        smtp: { ...savedTransport, host: "smtp.untrusted.test" },
        to: "recipient@example.test",
      })).rejects.toThrow("Enter the SMTP password before testing changed connection settings");

      expect(nodemailer.createTransport).not.toHaveBeenCalled();
    } finally { database.dispose(); }
  });

  test("removes the SMTP password from the current Pipeline-only model", async () => {
    const database = createTestDatabase();
    try {
      runMigrations(database.db);
      await saveSmtpSettings(database.db, values);
      await removeSmtpPassword(database.db);
      expect(await getCompleteSmtpSettings(database.db)).toBeNull();
    } finally { database.dispose(); }
  });
});
test.each([
 ["tls",true,false,false], ["starttls",false,true,false], ["none",false,false,true],
] as const)("test delivery uses explicit %s transport options",async(encryption,secure,requireTLS,ignoreTLS)=>{
 const database=createTestDatabase();
 const sendMail=vi.fn().mockResolvedValue(undefined);
 vi.mocked(nodemailer.createTransport).mockReturnValue({sendMail} as never);
 try {
  await sendSmtpTestEmail(database.db,{smtp:{...values,encryption},to:"recipient@example.test"});
  expect(nodemailer.createTransport).toHaveBeenLastCalledWith(expect.objectContaining({secure,requireTLS,ignoreTLS}));
 } finally {database.dispose();}
});


test("stores, tests and clears the sender name independently of the saved password", async () => {
  const database = createTestDatabase();
  const sendMail = vi.fn().mockResolvedValue(undefined);
  vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
  try {
    await saveSmtpSettings(database.db, { ...values, fromName: 'Telag "Podpora"' });
    expect(await getCompleteSmtpSettings(database.db)).toEqual({ ...values, fromName: 'Telag "Podpora"' });
    const smtp = { from: values.from, host: values.host, port: values.port, encryption: values.encryption, username: values.username };
    await sendSmtpTestEmail(database.db, { smtp: { ...smtp, fromName: "Jiný název" }, to: "recipient@example.test" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ from: { name: "Jiný název", address: values.from } }));
    await saveSmtpSettings(database.db, { ...smtp, fromName: "" });
    expect((await getSmtpSettings(database.db)).fromName).toBeNull();
    expect((await getCompleteSmtpSettings(database.db))?.password).toBe(values.password);
    await expect(saveSmtpSettings(database.db, { ...smtp, fromName: "Name\r\nBcc: other@example.test" })).rejects.toThrow();
  } finally { database.dispose(); }
});

test("unauthenticated SMTP omits auth even when a saved password exists", async () => {
 const database = createTestDatabase();
 const sendMail = vi.fn().mockResolvedValue(undefined);
 vi.mocked(nodemailer.createTransport).mockReturnValue({ sendMail } as never);
 try {
  await saveSmtpSettings(database.db, values);
  const smtp = { from: values.from, host: "localhost", port: 1025, encryption: "none", authentication: false };
  await saveSmtpSettings(database.db, smtp);
  expect((await getSmtpSettings(database.db)).status).toBe("ready");
  expect((await getCompleteSmtpSettings(database.db))?.password).toBeUndefined();
  await sendSmtpTestEmail(database.db, { smtp, to: "recipient@example.test" });
  expect(nodemailer.createTransport).toHaveBeenLastCalledWith({ host: "localhost", port: 1025, secure: false, requireTLS: false, ignoreTLS: true });
 } finally { database.dispose(); }
});
test("unauthenticated SMTP needs no username or password on a new installation", async () => {
 const database = createTestDatabase();
 try {
  await saveSmtpSettings(database.db, { from: values.from, host: "localhost", port: 1025, encryption: "none", authentication: false });
  expect((await getSmtpSettings(database.db)).status).toBe("ready");
  await expect(saveSmtpSettings(database.db, { from: values.from, host: "localhost", port: 1025, encryption: "none", authentication: true })).rejects.toThrow();
 } finally { database.dispose(); }
});
