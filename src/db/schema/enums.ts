import { pgEnum } from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["owner", "broker", "analyst", "viewer"]);

// Deals don't carry a phase/status field — workflow phase is implicit in the
// checklist (each item lives in a phase). Matches the prototype, which only
// modeled name/location/priority on the deal entity itself.

// Matches the prototype's two-state priority model. If we ever need a third
// tier ("low"/"deferred"), Chris will tell us — keeping the surface tight.
export const dealPriorityEnum = pgEnum("deal_priority", ["normal", "high"]);

export const builderClassificationEnum = pgEnum("builder_classification", ["private", "public"]);

export const buyerTierEnum = pgEnum("buyer_tier", ["green", "yellow", "red", "not_selected"]);

export const checklistPhaseEnum = pgEnum("checklist_phase", [
  "phase_1",
  "phase_2",
  "phase_3",
  "phase_4",
]);

export const issueStatusEnum = pgEnum("issue_status", ["open", "in_progress", "resolved"]);

export const issuePriorityEnum = pgEnum("issue_priority", ["low", "medium", "high", "urgent"]);

export const consultantSideEnum = pgEnum("consultant_side", ["buyer", "seller"]);

export const consultantRoleEnum = pgEnum("consultant_role", [
  "landscape_architect",
  "civil_engineer",
  "soils_engineer",
  "cost_to_complete",
  "hoa",
  "dry_utility",
  "phase_1_environmental",
  "land_use",
  "biologist",
  "architect",
  "psa_attorney",
]);

export const documentStatusEnum = pgEnum("document_status", ["draft", "final"]);

export const feedbackSeverityEnum = pgEnum("feedback_severity", [
  "nit",
  "suggestion",
  "bug",
  "blocker",
]);

export const feedbackStatusEnum = pgEnum("feedback_status", [
  "new",
  "reviewed",
  "actioned",
  "wontfix",
]);
