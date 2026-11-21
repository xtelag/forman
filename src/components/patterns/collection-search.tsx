"use client";
import { ActionIcon, TextInput } from "@mantine/core";
import { Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Acknowledgements never replace newer text while a query is in flight. */
export function CollectionSearch({
  value,
  onChange,
  placeholder = "Search",
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(value);
  const [composing, setComposing] = useState(false);
  const sent = useRef(new Set<string>());
  const callback = useRef(onChange);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    callback.current = onChange;
  }, [onChange]);
  useEffect(() => {
    if (!sent.current.delete(value)) setDraft(value);
  }, [value]);
  useEffect(() => {
    if (disabled || composing || draft.trim() === value) return;
    const timer = setTimeout(() => {
      sent.current.add(draft.trim());
      callback.current(draft.trim());
    }, 300);
    return () => clearTimeout(timer);
  }, [draft, value, composing, disabled]);
  function apply(text: string) {
    sent.current.add(text);
    callback.current(text);
  }
  return (
    <TextInput
      ref={input}
      aria-label="Search"
      placeholder={placeholder}
      w="100%"
      disabled={disabled}
      leftSection={<Search size={16} />}
      value={draft}
      onChange={(event) => setDraft(event.currentTarget.value)}
      onCompositionStart={() => setComposing(true)}
      onCompositionEnd={(event) => {
        setDraft(event.currentTarget.value);
        setComposing(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && !composing) {
          event.preventDefault();
          apply(draft.trim());
        }
      }}
      rightSection={
        draft ? (
          <ActionIcon
            variant="subtle"
            color="gray"
            aria-label="Clear search"
            onClick={() => {
              setDraft("");
              apply("");
              input.current?.focus();
            }}
          >
            <X size={16} />
          </ActionIcon>
        ) : null
      }
    />
  );
}
