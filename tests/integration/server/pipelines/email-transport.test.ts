import { createServer, type Socket } from "node:net";
import { once } from "node:events";
import nodemailer from "nodemailer";
import { expect, test } from "vitest";
import { sendPipelineEmail } from "@/server/pipelines/email-action";
import { smtpSender, smtpTransportOptions } from "@/server/config/smtp-settings";

// Local SMTP sink: exercise actual MIME serialization and transport, without sending external mail.
test.each(["formatted", "json"] as const)("delivers %s mail through a real local SMTP connection", async (contentFormat) => {
  const messages: string[] = [];
  const recipients: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer(socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    socket.write("220 localhost ESMTP test\r\n");
    let buffer = "";
    let data = false;
    let message = "";
    socket.on("data", chunk => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            messages.push(message); message = ""; data = false;
            socket.write("250 queued\r\n");
          } else message += line.replace(/^\.\./, ".") + "\r\n";
        } else if (/^(EHLO|HELO) /i.test(line)) socket.write("250 localhost\r\n");
        else if (/^RCPT TO:/i.test(line)) { recipients.push(line); socket.write("250 accepted\r\n"); }
        else if (line === "DATA") { data = true; socket.write("354 send data\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 OK\r\n");
      }
    });
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing SMTP listener");
  const smtp = { authentication: false, host: "127.0.0.1", port: address.port, encryption: "none" as const,
    from: "sender@example.test", fromName: "Forman Example" };
  const transport = nodemailer.createTransport(smtpTransportOptions(smtp));
  try {
    await sendPipelineEmail({
      from: smtpSender(smtp), payloadJson: '{"name":"Alex Example"}',
      subject: "Example submission", recipients: ["recipient@example.test"], contentFormat,
      sendMail: message => transport.sendMail(message),
    });
    expect(recipients).toEqual(["RCPT TO:<recipient@example.test>"]);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain("From: Forman Example <sender@example.test>");
    expect(messages[0]).toContain("Subject: Example submission");
    expect(messages[0]).toContain("Content-Type: multipart/alternative;");
    expect(messages[0]).toContain("Alex Example");
    expect(messages[0]).toContain(contentFormat === "formatted" ? "name: Alex Example" : '"name": "Alex Example"');
  } finally {
    transport.close();
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
