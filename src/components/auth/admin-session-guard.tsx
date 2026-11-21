"use client";
import { AdminNotice as Alert } from "@/components/patterns/admin-notice";
import {
  Button,
  Modal,
  PasswordInput,
  Stack,
  Text,
  TextInput,
} from "@mantine/core";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { adminRequest } from "@/client/admin-api/client";

export function AdminSessionGuard() {
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [restored, setRestored] = useState(false);
  const expiredRef = useRef(false);
  useEffect(() => {
    let lastAttempt = -Infinity;
    const expire = () => {
      expiredRef.current = true;
      setExpired(true);
      setRestored(false);
    };
    const activity = () => {
      if (
        expiredRef.current ||
        document.visibilityState === "hidden" ||
        Date.now() - lastAttempt < 60000
      )
        return;
      lastAttempt = Date.now();
      void adminRequest("/api/admin/v1/auth/session", { method: "POST" }).catch(
        () => {},
      );
    };
    window.addEventListener("forman:session-expired", expire);
    const events = ["pointerdown", "keydown", "input", "wheel"] as const;
    for (const event of events)
      document.addEventListener(event, activity, { passive: true });
    return () => {
      window.removeEventListener("forman:session-expired", expire);
      for (const event of events) document.removeEventListener(event, activity);
    };
  }, []);
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setBusy(true);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/v1/auth/login", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" },
        body: new FormData(form),
      });
      if (response.status !== 204) {
        setError(
          response.status === 401
            ? "The username or password is invalid."
            : "Sign-in failed. Please try again.",
        );
        return;
      }
      form.reset();
      expiredRef.current = false;
      setExpired(false);
      setRestored(true);
    } catch {
      setError("Could not connect. Please try again.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {restored ? (
        <Alert
          withCloseButton
          closeButtonLabel="Dismiss sign-in notice"
          onClose={() => setRestored(false)}
          role="status"
        >
          Signed in again. Your edits are still here. Please retry the action
          that failed.
        </Alert>
      ) : null}
      <Modal
        opened={expired}
        onClose={() => {}}
        withCloseButton={false}
        closeOnClickOutside={false}
        closeOnEscape={false}
        title="Sign in to continue"
        centered
        zIndex={500}
      >
        <form onSubmit={login}>
          <Stack>
            <Text size="sm">
              Your session has expired. Your unsaved edits will stay on this
              page while you sign in again. Keep this tab open.
            </Text>
            {error ? (
              <Alert color="red" role="alert">
                {error}
              </Alert>
            ) : null}
            <TextInput
              label="Username"
              name="username"
              autoComplete="username"
              defaultValue="forman"
              required
            />
            <PasswordInput
              label="Password"
              name="password"
              autoComplete="current-password"
              required
              data-autofocus
            />
            <Button type="submit" loading={busy}>
              Sign in
            </Button>
          </Stack>
        </form>
      </Modal>
    </>
  );
}
