import { z } from 'zod';

// The shape the intake workflow relies on (validate claims reads prices, deadlines and lesson slots by path; select facts picks
// whole sections by name). An edit that breaks it would crash production, so the console validates before saving. Sections and
// objects may gain extra scalar facts (e.g. lesson_schedule.timezone_note); unknown TOP-LEVEL sections are rejected because no topic
// would ever be shown them.
const text = z.string().min(1).max(600);
const extra = z.union([z.string().max(600), z.number(), z.boolean(), z.array(z.string().max(600))]);
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, 'a time like 18:00');
const money = z.number().min(0).max(100_000);
const obj = <T extends z.ZodRawShape>(shape: T) => z.object(shape).catchall(extra);
const item = <T extends z.ZodRawShape>(shape: T) => z.object(shape).catchall(extra);

export const factsDoc = z.object({
  company: obj({ name: text, fictional: z.boolean(), contact_email: text }),
  support_hours: obj({ days: text, open_utc: hhmm, close_utc: hhmm, note: text }),
  booking: obj({ how: text, channels: text, scope: text }),
  pricing: obj({
    currency: text,
    subscription_per_subject_per_month: money,
    dropin_single_lesson: money,
    trial: obj({ price: money, applies_to: text, includes: z.array(text).max(20) }),
    discounts: z.array(text).max(20),
    refund_policy_summary: text,
  }),
  subjects: z.array(item({ id: text, name: text, level: text, available: z.boolean() })).max(60),
  admissions_support: z.array(item({ id: text, name: text, price: money })).max(60),
  lesson_schedule: obj({
    timezone: text,
    slots: z.array(item({ subject: text, day: text, start: hhmm, end: hhmm })).max(100),
  }),
  deadlines: z.array(item({ name: text, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'a date like 2026-10-15'), time_uk: hhmm, verified: z.boolean() })).max(100),
  policies: obj({ guarantees: text, minimum_age: z.number().int().min(0).max(120), safeguarding: text }),
}).strict();

export type FactsDoc = z.infer<typeof factsDoc>;
export const SECTIONS = Object.keys(factsDoc.shape);
export const validateDoc = (doc: unknown) => factsDoc.safeParse(doc);
