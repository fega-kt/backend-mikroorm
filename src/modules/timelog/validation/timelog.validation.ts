import { TimeLogStatus } from "../entity/timelog.entity";
import { z } from "zod";

export const createTimeLogValidation = z.object({
  task: z.string().trim().min(1, "Task is required"),
  date: z.coerce.date(),
  hours: z.number().positive().max(24, "Cannot log more than 24 hours per day"),
  note: z.string().trim().max(500).optional(),
});

export const updateTimeLogValidation = z.object({
  date: z.coerce.date().optional(),
  hours: z.number().positive().max(24).optional(),
  note: z.string().trim().max(500).optional(),
});

export const reviewTimeLogValidation = z.object({
  status: z.enum([TimeLogStatus.APPROVED, TimeLogStatus.REJECTED]),
  rejectReason: z.string().trim().max(500).optional(),
});

export const timelogFilterValidation = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  status: z.nativeEnum(TimeLogStatus).optional(),
  user: z.string().trim().optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});
