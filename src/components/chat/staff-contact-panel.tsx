"use client";

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import type { ChatContact } from "@/components/chat/chat-shell";
import { searchUsersToMessageAction } from "@/components/chat/actions";
import type { ChatUserSearchResult } from "@/server/services/chat-service";

/** The compact "message staff" selector: a fixed dropdown of known contacts (admin/sub-
 * instructor/support), plus - for moderators only - a live search across every account
 * ("chat with anyone"). Kept separate from ChatShell so its search state doesn't bleed into the
 * main conversation view's state. */
export function StaffContactPanel({
  dropdownContacts,
  showContactSupport,
  allowStaffSearch,
  onSelectContact,
  onContactSupport,
  onSelectUser,
}: {
  dropdownContacts: ChatContact[];
  showContactSupport: boolean;
  allowStaffSearch: boolean;
  onSelectContact: (contact: ChatContact) => void;
  onContactSupport: () => void;
  onSelectUser: (userId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ChatUserSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!allowStaffSearch || query.trim().length < 2) {
      // Deferred one tick: setState must not be called synchronously from inside an effect body.
      queueMicrotask(() => setResults([]));
      return;
    }
    const handle = setTimeout(async () => {
      setSearching(true);
      const result = await searchUsersToMessageAction(query);
      setSearching(false);
      if ("ok" in result) setResults(result.results);
    }, 300);
    return () => clearTimeout(handle);
  }, [query, allowStaffSearch]);

  return (
    <div className="space-y-2 rounded-lg border p-3">
      <p className="text-xs font-medium text-muted-foreground">Message staff</p>
      {(dropdownContacts.length > 0 || showContactSupport) && (
        <select
          className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
          defaultValue=""
          onChange={(e) => {
            const value = e.target.value;
            e.target.value = "";
            if (!value) return;
            if (value === "__support__") return onContactSupport();
            const [kind, id] = value.split(":");
            const contact = dropdownContacts.find((c) => c.kind === kind && c.id === id);
            if (contact) onSelectContact(contact);
          }}
        >
          <option value="" disabled>
            Select a contact...
          </option>
          {showContactSupport && <option value="__support__">Customer support</option>}
          {dropdownContacts.map((contact) => (
            <option key={`${contact.kind}-${contact.id}`} value={`${contact.kind}:${contact.id}`}>
              {contact.label}
              {contact.group ? ` (${contact.group})` : ""}
            </option>
          ))}
        </select>
      )}

      {allowStaffSearch && (
        <div className="space-y-1.5">
          <Input
            placeholder="Search anyone by name or email..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching && <p className="text-xs text-muted-foreground">Searching...</p>}
          {results.length > 0 && (
            <div className="max-h-40 space-y-1 overflow-y-auto">
              {results.map((r) => (
                <button
                  key={r.id}
                  className="block w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    onSelectUser(r.id);
                    setQuery("");
                    setResults([]);
                  }}
                >
                  <span className="font-medium">{r.name ?? r.email}</span>{" "}
                  <span className="text-xs text-muted-foreground">
                    {r.roles.map((x) => x.role.name).join(", ")}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
