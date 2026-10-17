"use client";

import { useState } from "react";
import { BookOpen, Search, User } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StaffContactPanel } from "@/components/chat/staff-contact-panel";
import type { ChatContact } from "@/components/chat/chat-shell";

/**
 * Who you can start a conversation with: staff and support in a compact picker, and the (possibly
 * long) list of course groups, classmates or students behind a search box.
 */
export function NewConversationPanel({
  contacts,
  showContactSupport,
  allowStaffSearch,
  onSelectContact,
  onContactSupport,
  onSelectUser,
}: {
  contacts: ChatContact[];
  showContactSupport: boolean;
  allowStaffSearch: boolean;
  onSelectContact: (contact: ChatContact) => void;
  onContactSupport: () => void;
  onSelectUser: (userId: string) => void;
}) {
  const [query, setQuery] = useState("");
  const dropdown = contacts.filter((c) => c.dropdown);
  const needle = query.trim().toLowerCase();
  const listed = contacts.filter((c) => !c.dropdown && (!needle || c.label.toLowerCase().includes(needle)));
  const groups = new Map<string, ChatContact[]>();
  for (const contact of listed) groups.set(contact.group ?? "", [...(groups.get(contact.group ?? "") ?? []), contact]);

  return (
    <div className="space-y-3 border-b px-3 pb-3">
      {(dropdown.length > 0 || showContactSupport || allowStaffSearch) && (
        <StaffContactPanel
          dropdownContacts={dropdown}
          showContactSupport={showContactSupport}
          allowStaffSearch={allowStaffSearch}
          onSelectContact={onSelectContact}
          onContactSupport={onContactSupport}
          onSelectUser={onSelectUser}
        />
      )}
      {contacts.some((c) => !c.dropdown) && (
        <div className="space-y-2">
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find a person or course group"
              aria-label="Find a person or course group"
              className="pl-8"
            />
          </div>
          <div className="max-h-64 space-y-3 overflow-y-auto">
            {listed.length === 0 && <p className="py-2 text-center text-xs text-muted-foreground">Nobody matches.</p>}
            {[...groups].map(([group, items]) => (
              <div key={group || "_"}>
                {group && <p className="mb-1 px-1 text-xs font-medium text-muted-foreground">{group}</p>}
                <ul>
                  {items.map((contact) => {
                    const Icon = contact.kind === "course_group" ? BookOpen : User;
                    return (
                      <li key={`${contact.kind}-${contact.id}`}>
                        <button
                          type="button"
                          onClick={() => onSelectContact(contact)}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted"
                        >
                          <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                          <span className="truncate">{contact.label}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
