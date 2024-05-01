import fs from "fs";
import { simpleParser } from "mailparser";

import { updateOrCreateMail } from "../src/server/queries";

console.log("Running email watcher...");

type MailEvent = {
  eventType: string;
  filename: string | null;
};

// Path to the mailbox file
const mailboxPath = "/var/mail/root";
let processing = false;
const eventQueue: MailEvent[] = []; // Queue to store pending change events

// Watching for changes in the mailbox file
fs.watch(mailboxPath, (eventType, filename) => {
  eventQueue.push({ eventType, filename });
  processNextEvent();
});

// Process the next event in the queue
function processNextEvent() {
  if (!processing && eventQueue.length > 0) {
    const { eventType, filename } = eventQueue.shift()!;
    if (eventType === "change" && filename) {
      processing = true;
      const stream = fs.createReadStream(mailboxPath, { encoding: "utf8" });

      // Parse each email message from the stream
      simpleParser(stream)
        .then((parsedEmail) => {
          let toEmail: string | undefined;
          if (Array.isArray(parsedEmail.to)) {
            toEmail = parsedEmail.to[0]?.text ?? undefined;
          } else {
            toEmail = parsedEmail.to?.text ?? undefined;
          }
          if (toEmail) {
            updateOrCreateMail(toEmail, {
              subject: parsedEmail.subject ?? "No subject",
              content: parsedEmail.textAsHtml
                ? parsedEmail.textAsHtml
                : parsedEmail.text ?? "No content",
              senderEmail: parsedEmail.from?.text ?? "No sender",
              senderName: parsedEmail.from?.text ?? "No sender",
              html: parsedEmail.html || "No html",
            }).catch((error) => {
              console.error("Error updating or creating mail:", error);
            });
          }
          console.log("Parsed Email:", parsedEmail);
          truncateMailbox();
          processing = false;
          processNextEvent(); // Process next event in the queue
        })
        .catch((error) => {
          console.error("Error parsing email:", error);
          processing = false;
          processNextEvent(); // Process next event in the queue
        });
    }
  }
}

// Truncate the mailbox file
function truncateMailbox() {
  fs.truncate(mailboxPath, 0, (err) => {
    if (err) {
      console.error("Error truncating mailbox file:", err);
    } else {
      console.log("Mailbox file truncated successfully.");
    }
  });
}
