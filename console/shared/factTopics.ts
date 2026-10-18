// Which topics (the classifier's categories) are shown which facts. This MIRRORS the `select facts` node of the intake workflow;
// a test (server/facts.test.ts) parses the workflow export and fails if the two drift apart.
export const TOPICS = ['pricing', 'trial_booking', 'scheduling', 'deadlines', 'course_content', 'access'] as const;
export type Topic = (typeof TOPICS)[number];

const SECTION_TOPICS: Record<string, Topic[]> = {
  pricing: ['pricing'],
  admissions_support: ['pricing'],
  booking: ['pricing', 'trial_booking', 'scheduling', 'course_content', 'access'],
  subjects: ['trial_booking', 'course_content'],
  lesson_schedule: ['trial_booking', 'scheduling'],
  support_hours: ['scheduling'],
  deadlines: ['deadlines'],            // only the verified ones ever ship
  company: ['access'],
  policies: [],                        // not picked by any topic: reference only, never shown to the model today
};
const TRIAL_TOPICS: Topic[] = ['pricing', 'trial_booking', 'course_content', 'access'];   // pricing.trial.* is also picked on its own

export function topicsFor(path: string): Topic[] {
  const section = path.split(/[.[]/)[0] ?? '';
  if (path === 'pricing.trial' || path.startsWith('pricing.trial.')) return TRIAL_TOPICS;
  return SECTION_TOPICS[section] ?? [];
}
export const sectionTopics = SECTION_TOPICS;
export const TOPIC_NAMES: Record<Topic, string> = {
  pricing: 'Pricing', trial_booking: 'Trial booking', scheduling: 'Scheduling', deadlines: 'Deadlines', course_content: 'Course content', access: 'Access',
};
