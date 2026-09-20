import { Question, defineQuestions } from "system1";

/** One definition, reused by both the Promise and Effect flows. */
export const triage = defineQuestions({
  urgent: Question.boolean({
    instructions: "Does this need urgent attention?",
    criteria: { true: "Time-sensitive harm or an ongoing outage", false: "Routine request" },
  }),
  department: Question.choice({
    instructions: "Which department should handle this?",
    options: {
      billing: "Payments, refunds, invoices",
      technical: "Bugs, outages, integrations",
      sales: "Pricing and purchasing",
    },
  }),
  frustration: Question.ordinal({
    instructions: "How frustrated is the customer?",
    levels: ["Calm", "Frustrated", "Very angry"],
  }),
});

export const ticket = { message: "My payouts have failed for three days!" };
