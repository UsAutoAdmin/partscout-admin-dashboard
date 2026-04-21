export const STAGES = [
  "community",
  "emailed",
  "opened",
  "clicked",
  "signed_up",
  "trial",
  "paid",
] as const;

export type Stage = (typeof STAGES)[number];

export const STAGE_LABELS: Record<Stage, string> = {
  community: "Community",
  emailed: "Emailed",
  opened: "Opened",
  clicked: "Clicked",
  signed_up: "Signed up",
  trial: "Trial",
  paid: "Paid",
};

export const HEATMAP_DAYS = 84;

export interface CrmUserRow {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  created_at: string | null;
  last_sign_in_at: string | null;
  clerk_plan_slug: string | null;
  clerk_subscription_status: string | null;
  clerk_period_end: string | null;
  clerk_cancel_at_period_end: boolean | null;
  stripe_subscription_status: string | null;
  stripe_trial_end: string | null;
  stripe_cancel_at_period_end: boolean | null;
  stripe_current_period_end: string | null;
  ebay_connected_at: string | null;
}

export interface PipelineRow {
  rowKey: string;
  contactId: string | null;
  email: string;
  firstName: string | null;
  lastName: string | null;
  zip: string | null;
  phone: string | null;
  contactCreatedAt: string | null;
  contactLastActivityAt: string | null;

  emailCount: number;
  openCount: number;
  clickCount: number;
  firstSentAt: string | null;
  lastSentAt: string | null;
  firstOpenedAt: string | null;
  firstClickedAt: string | null;

  userId: string | null;
  userCreatedAt: string | null;
  lastSignInAt: string | null;
  clerkPlanSlug: string | null;
  clerkSubscriptionStatus: string | null;
  stripeSubscriptionStatus: string | null;
  stripeTrialEnd: string | null;
  ebayConnectedAt: string | null;

  pickSheetCount: number;
  pickSheets30dCount: number;
  pickSheetsByDay: number[];
  lastPickSheetAt: string | null;

  isPaid: boolean;
  isTrial: boolean;
  isDirect: boolean;
  stage: Stage;
}

export interface PipelineFunnel {
  total: number;
  directSignups: number;
  stages: Array<{
    stage: Stage;
    label: string;
    count: number;
    pctOfTotal: number;
    dropFromPrev: number;
  }>;
}

export interface ContactTimelineEvent {
  type:
    | "email_sent"
    | "email_opened"
    | "email_clicked"
    | "user_created"
    | "subscription_started"
    | "trial_started"
    | "ebay_connected"
    | "pick_sheet_created"
    | "last_sign_in";
  at: string;
  label: string;
  detail: string | null;
  href: string | null;
}

export interface ContactDetailMessage {
  id: string;
  subject: string;
  sentAt: string;
  yardName: string | null;
  yardCity: string | null;
  yardState: string | null;
  sharePath: string | null;
  trackingToken: string;
  deliveryMethod: string | null;
  opens: { id: string; at: string; userAgent: string | null }[];
  clicks: { id: string; at: string; userAgent: string | null; targetUrl: string | null }[];
}

export interface ContactDetail {
  contact: {
    id: string | null;
    email: string;
    firstName: string | null;
    lastName: string | null;
    zip: string | null;
    phone: string | null;
    createdAt: string | null;
    lastActivityAt: string | null;
  };
  user: CrmUserRow | null;
  messages: ContactDetailMessage[];
  pickSheets: { id: string; name: string | null; createdAt: string }[];
  pickSheetHeatmap: number[];
  isPaid: boolean;
  isTrial: boolean;
  isDirect: boolean;
  stage: Stage;
  timeline: ContactTimelineEvent[];
}
