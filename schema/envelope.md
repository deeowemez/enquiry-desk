# The envelope

One canonical shape. Every intake channel normalises to this; every later step reads only this.
This is the only contract you commit to up front.

```json
{
  "id":           "uuid",
  "source":       "form | email",
  "external_key": "email Message-ID, or sha256(form payload + received_at)",
  "received_at":  "2026-10-05T09:14:22Z",
  "from":         { "name": null, "email": "parent@example.com" },
  "subject":      "Question about A-Level Biology",
  "body":         "plain text, HTML stripped",
  "locale_hint":  null,
  "attachments":  []
}
```

**Rules**

- `external_key` is unique. It is what makes a re-delivered email a no-op instead of a second reply.
  (Project 02 enforces it with a DB constraint; in Project 01 just carry it.)
- `body` is plain text. Strip HTML at the adapter, not downstream.
- Nothing after the adapter is allowed to know which channel the enquiry came from.
